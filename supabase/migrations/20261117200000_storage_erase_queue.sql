-- Spec 50 §3.2, §6, §8, PR 50-3 (K1, epic #1940, stage 1): the objects in Storage.
-- A file object cannot be removed from SQL (Supabase: only through the Storage API), so the erasure keeps a queue and an edge function
-- (supabase/functions/erase-storage) removes the objects through the API.
--   * app.storage_erase_queue (bucket, path, tries, done_at): the paths wait here. Only <company uuid>/<name> paths of the bucket «files»
--     (a check refuses «..», an empty or a rooted path — a prefix of nothing is never queued).
--   * app.erase_queue.avatar_file_id (new, nullable): app.erase_account saves the profile picture's file id before it anonymises the
--     profile (it was cleared there); app.erase_queue_run queues THAT file's object and deletes its row — only if it is the person's own
--     photo linked to no job, visit, client or measurement (the guard's own definition). Work files are never touched (T239).
--   * public.storage_erase_claim / _done / _fail — the edge function's three calls, service_role only (rule 18).
-- Rule 16: a new table, a new nullable column, create or replace of two functions with the same signatures; nothing is renamed or dropped.

create table if not exists app.storage_erase_queue (
  id       uuid primary key default public.uuid_generate_v7(),
  bucket   text not null check (bucket = 'files'),
  path     text not null check (path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(/[A-Za-z0-9._-]+)+$' and path !~ '(^|/)\.\.(/|$)' and length(path) <= 512),
  at       timestamptz not null default now(),
  tries    int not null default 0,   -- failed removals only; a row is left after 5 (50-6 raises an alarm)
  done_at  timestamptz,
  unique (bucket, path)
);
revoke all on app.storage_erase_queue from public, anon, authenticated;
alter table app.storage_erase_queue enable row level security;
alter table app.storage_erase_queue force row level security;

-- rule16: small (a nullable column without a default on a table of the erased people — a few rows)
alter table app.erase_queue add column if not exists avatar_file_id uuid;

create or replace function app.erase_account(p_uid uuid, p_close_companies uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := p_uid;
  v_gone text;
  v_last uuid[];
  v_c uuid;
  v_mids uuid[];
  v_avatar uuid;
begin
  -- lock, in one order (by id), every owner of my companies and every row of mine: two owners leaving at once, or a
  -- transfer meanwhile, cannot leave a company without an owner (security-check 7а-2 №5)
  perform 1 from public.memberships m
   where m.company_id in (select x.company_id from public.memberships x where x.user_id = v_me)
     and (m.role = 'owner' or m.user_id = v_me)
   order by m.id for update;
  -- 50-2: my membership ids, before anything is written (the journal job redacts the person's rows by them)
  select coalesce(array_agg(m.id), '{}') into v_mids from public.memberships m where m.user_id = v_me;
  -- 50-3: the profile picture's file, before the profile is anonymised (the job queues the object for the Storage API)
  select u.avatar_file_id into v_avatar from public.users u where u.id = v_me;
  -- after the locks: the companies where I am the last active owner
  select coalesce(array_agg(mine.company_id), '{}') into v_last
    from public.memberships mine
   where mine.user_id = v_me and mine.role = 'owner' and mine.status = 'active' and mine.deleted_at is null
     and not exists (select 1 from public.memberships o where o.company_id = mine.company_id and o.role = 'owner'
                       and o.status = 'active' and o.deleted_at is null and o.user_id <> v_me);
  foreach v_c in array v_last loop
    -- an active admin is there: hand the company over first, it is never closed under them (review #214 №2)
    if exists (select 1 from public.memberships a join public.users u on u.id = a.user_id
                where a.company_id = v_c and a.role = 'admin' and a.status = 'active' and a.deleted_at is null
                  and u.deleted_at is null) then
      raise exception 'transfer the company first' using errcode = 'OD001', detail = v_c::text;
    end if;
    if not (v_c = any (coalesce(p_close_companies, '{}'))) then
      raise exception 'the company keeps at least one active owner' using errcode = 'OD001', detail = v_c::text;
    end if;
  end loop;
  v_gone := 'deleted+' || v_me::text || '@deleted.invalid';

  perform set_config('app.accepting_invite', 'on', true);
  -- the companies closed with the account: nobody works in them any more, their records are kept
  if cardinality(v_last) > 0 then
    update public.companies set closed_at = now() where id = any (v_last) and closed_at is null;
    update public.memberships set status = 'deleted', deleted_at = now(), share_location = false
     where company_id = any (v_last) and user_id <> v_me and status <> 'deleted';
    update public.invitations set status = 'revoked', updated_at = now()
     where company_id = any (v_last) and status = 'pending';
  end if;
  perform set_config('app.accepting_invite', '', true);

  -- invitations: the ones I sent and the ones to my email stop working; the accepted ones forget my email and name
  update public.invitations set status = 'revoked', updated_at = now()
   where status = 'pending' and invited_by = v_me;
  -- the ones TO me: revoked and they forget my email and name (security-check №6)
  update public.invitations set status = case when status = 'pending' then 'revoked' else status end,
         email = v_gone, name = null, updated_at = now()
   where email = (select lower(u.email) from auth.users u where u.id = v_me) and accepted_by is distinct from v_me;
  update public.invitations set email = v_gone, name = null, updated_at = now() where accepted_by = v_me;
  -- unlinked: the company keeps its contact row and its settings, not the link to me
  update public.company_contacts set user_id = null where user_id = v_me;
  update public.companies set lead_default_assignee_id = null where lead_default_assignee_id = v_me;
  -- my active signature is never put on a new document; the signed documents keep theirs (business record)
  update public.member_signatures set revoked_at = now() where user_id = v_me and revoked_at is null;
  -- my private notes: nobody else may read them, ever
  delete from public.notes where created_by = v_me and visibility = 'private';
  -- my own rows (member_prefs; 7б-2: user_locations)
  perform app.erase_personal_rows(v_me);
  -- the proof of the consent stays, without the IP
  perform set_config('app.erasing_user', 'on', true);
  update public.legal_acceptance set ip = null, ip_raw = null where user_id = v_me and (ip is not null or ip_raw is not null);
  perform set_config('app.erasing_user', '', true);
  -- my memberships: deleted; what was about me goes (last of the writes: until here I am still a member — the writes
  -- above never depend on BYPASSRLS ordering, security-check 7а-2a №3)
  perform set_config('app.accepting_invite', 'on', true);
  update public.memberships
     set status = 'deleted', deleted_at = now(), share_location = false, title = null, his_registration_number = null, color = null
   where user_id = v_me and status <> 'deleted';
  perform set_config('app.accepting_invite', '', true);
  -- the profile: anonymised (the business records point to it); the sign-in is closed by Auth (the edge function)
  update public.users
     set full_name = 'Deleted user', email = v_gone, phone = null, avatar_file_id = null, last_active_company_id = null,
         deleted_at = now()
   where id = v_me;

  -- postconditions: under FORCE RLS a write can pass with 0 rows — check, never trust (security-check 7а-2 №4)
  if exists (select 1 from public.memberships where user_id = v_me and status <> 'deleted')
     or exists (select 1 from public.member_prefs where user_id = v_me)
     or exists (select 1 from public.company_contacts where user_id = v_me)
     or exists (select 1 from public.companies where lead_default_assignee_id = v_me)
     or exists (select 1 from public.notes where created_by = v_me and visibility = 'private')
     or exists (select 1 from public.member_signatures where user_id = v_me and revoked_at is null)
     or exists (select 1 from public.legal_acceptance where user_id = v_me and (ip is not null or ip_raw is not null))
     or exists (select 1 from public.invitations where status = 'pending' and (invited_by = v_me or email = v_gone))
     or not exists (select 1 from public.users where id = v_me and deleted_at is not null and email = v_gone) then
    raise exception 'account deletion incomplete';
  end if;
  -- 50-2 (spec 50 §3.2, С1а): the rest of the erasure waits in a small queue and is done by app.erase_queue_run(); nothing in it
  -- can roll the deletion back (the row is the only new write here)
  insert into app.erase_queue (user_id, membership_ids, avatar_file_id) values (v_me, v_mids, v_avatar) on conflict (user_id) do nothing;
  return jsonb_build_object('deleted', true, 'repeat', false, 'closed_companies', to_jsonb(v_last));
end;
$$;
revoke all on function app.erase_account(uuid, uuid[]) from public, anon, authenticated;

create or replace function app.erase_queue_run()
returns int language plpgsql security definer set search_path = '' as $$
declare
  q record;
  v_done int := 0;
  v_keys constant text[] := array['title', 'his_registration_number', 'color'];
  f record;
begin
  for q in select * from app.erase_queue where done_at is null and tries < 5 order by at, user_id for update skip locked loop
    begin
      perform set_config('app.erasing_journal', 'on', true);
      update public.audit_log
         set before = app.redact_person_json(before, v_keys), after = app.redact_person_json(after, v_keys)
       where entity_type = 'memberships' and entity_id = any (q.membership_ids)
         and (coalesce(before ?| v_keys, false) or coalesce(after ?| v_keys, false));
      perform set_config('app.erasing_journal', '', true);
      update public.catalog_price_history set by = null where by = q.user_id;
      update public.catalog_cost_history set by = null where by = q.user_id;
      -- 50-3: the person's own profile picture — the object goes to the Storage queue (only the Storage API removes objects), the file row goes
      -- now. «Own» is what the guard of 20261115160000 lets a picture be: the person's own photo, linked to no job, visit, client or measurement.
      -- A file that is not such a photo is never touched, whatever the profile pointed at.
      if q.avatar_file_id is not null then
        select ff.id, ff.storage_key into f from public.files ff
         where ff.id = q.avatar_file_id and ff.created_by = q.user_id and ff.kind = 'photo'
           and ff.job_id is null and ff.visit_id is null and ff.customer_id is null and ff.measurement_id is null;
        if found then
          if f.storage_key is null then
            delete from public.files where id = f.id;     -- never uploaded: no object
          elsif f.storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(/[A-Za-z0-9._-]+)+$' and f.storage_key !~ '(^|/)\.\.(/|$)' and length(f.storage_key) <= 512 then
            insert into app.storage_erase_queue (bucket, path) values ('files', f.storage_key) on conflict (bucket, path) do nothing;
            delete from public.files where id = f.id;
          else
            -- a key of an odd shape (the app's own is <company>/<id>.<ext>): the queue refuses it and the rest of the erasure must not fail with
            -- it — the row stays (the object keeps its reference), the warning says so, a person looks at it
            raise warning 'erase_queue_run: a profile picture key of an odd shape was left for a person to look at';
          end if;
        end if;
      end if;
      -- nothing of the person is left in what this job owns
      if exists (select 1 from public.audit_log a
                  where a.entity_type = 'memberships' and a.entity_id = any (q.membership_ids)
                    and (coalesce((a.before ->> 'title'), (a.before ->> 'his_registration_number'), (a.before ->> 'color'),
                                  (a.after ->> 'title'), (a.after ->> 'his_registration_number'), (a.after ->> 'color')) is not null))
         or exists (select 1 from public.catalog_price_history where by = q.user_id)
         or exists (select 1 from public.catalog_cost_history where by = q.user_id)
         or (q.avatar_file_id is not null and exists (select 1 from public.files ff where ff.id = q.avatar_file_id and ff.created_by = q.user_id
                and ff.kind = 'photo' and ff.job_id is null and ff.visit_id is null and ff.customer_id is null and ff.measurement_id is null
                and (ff.storage_key is null or ff.storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(/[A-Za-z0-9._-]+)+$'))) then
        raise exception 'erasure by the queue incomplete';
      end if;
      update app.erase_queue set done_at = now() where user_id = q.user_id;
      v_done := v_done + 1;
    exception when others then
      perform set_config('app.erasing_journal', '', true);
      raise warning 'erase_queue_run failed for one person: % %', sqlstate, sqlerrm;
      update app.erase_queue set tries = tries + 1 where user_id = q.user_id;
    end;
  end loop;
  return v_done;
end;
$$;
revoke all on function app.erase_queue_run() from public, anon, authenticated;
grant execute on function app.erase_queue_run() to service_role;

-- the edge function's three calls (not for people: service_role only)
-- Two callers may claim the same rows at once: `for update skip locked` holds the rows only until this call (one RPC = one statement) ends, so
-- NOBODY may rely on it as a lock between claim and done. Harmless on purpose — removing an object twice is not an error for the Storage API —
-- the worst is a doubled count. Idempotent.
create or replace function public.storage_erase_claim(p_limit int default 50)
returns table (id uuid, bucket text, path text) language sql security definer set search_path = '' as $$
  select q.id, q.bucket, q.path from app.storage_erase_queue q
   where q.done_at is null and q.tries < 5 order by q.at, q.id limit greatest(1, least(coalesce(p_limit, 50), 200)) for update skip locked;
$$;
create or replace function public.storage_erase_done(p_ids uuid[])
returns int language sql security definer set search_path = '' as $$
  with u as (update app.storage_erase_queue set done_at = now() where id = any (coalesce(p_ids, '{}')) and done_at is null returning 1)
  select count(*)::int from u;
$$;
create or replace function public.storage_erase_fail(p_ids uuid[])
returns int language sql security definer set search_path = '' as $$
  with u as (update app.storage_erase_queue set tries = tries + 1 where id = any (coalesce(p_ids, '{}')) and done_at is null returning 1)
  select count(*)::int from u;
$$;
revoke all on function public.storage_erase_claim(int) from public, anon, authenticated;
revoke all on function public.storage_erase_done(uuid[]) from public, anon, authenticated;
revoke all on function public.storage_erase_fail(uuid[]) from public, anon, authenticated;
grant execute on function public.storage_erase_claim(int) to service_role;
grant execute on function public.storage_erase_done(uuid[]) to service_role;
grant execute on function public.storage_erase_fail(uuid[]) to service_role;
