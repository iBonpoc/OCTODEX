-- Spec 50 §3.2, PR 50-2 (K1, epic #1940, stage 1): the part of the erasure that must not be able to roll the deletion back.
--   * app.erase_queue — one row per erased person (their id and the ids of their memberships); app.erase_account writes it (one insert).
--   * app.erase_queue_run() — the job (service_role / pg_cron later, 50-6): for each waiting person, in its own subtransaction,
--       1. the audit journal rows ABOUT the person's memberships lose the personal fields (title, HIS number, colour) in before/after:
--          chosen by entity (audit_log.entity_type = 'memberships' and the id), never by matching text; ids and codes stay;
--       2. catalog_price_history.by and catalog_cost_history.by that point at the person become null (#1176);
--       3. a check «nothing of the person is left in these rows»; only then done_at is set — otherwise a warning and a repeat next run.
--   * the journal stays append-only for everybody: an update of audit_log passes only inside the job (app.erasing_journal = 'on'), for
--     a role other than authenticated/anon, and only when nothing but before/after changes.
-- Not here (on purpose, found while writing): public.email_outbox holds only signed-copy mails to CLIENTS (no service mails to people),
-- there are no AI tables yet, and the profile picture guard already exists (20261115160000, #1603); the storage objects are PR 50-3.
-- Rule 16: nothing is renamed or dropped; delete_account and erase_account keep their signatures and results.
-- Rule 18: app.erase_queue is touched by nobody from the API; erase_queue_run is for service_role only.

create table if not exists app.erase_queue (
  user_id        uuid primary key,
  membership_ids uuid[] not null default '{}',
  at             timestamptz not null default now(),
  done_at        timestamptz,
  tries          int not null default 0   -- failed runs only; the job leaves a row after 5 (50-6 raises an alarm on such rows)
);
revoke all on app.erase_queue from public, anon, authenticated;
-- not served by the API (the schema is not published), and still closed in itself: if a grant ever appears, the rows stay shut
alter table app.erase_queue enable row level security;
alter table app.erase_queue force row level security;

create or replace function app.erase_account(p_uid uuid, p_close_companies uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := p_uid;
  v_gone text;
  v_last uuid[];
  v_c uuid;
  v_mids uuid[];
begin
  -- lock, in one order (by id), every owner of my companies and every row of mine: two owners leaving at once, or a
  -- transfer meanwhile, cannot leave a company without an owner (security-check 7а-2 №5)
  perform 1 from public.memberships m
   where m.company_id in (select x.company_id from public.memberships x where x.user_id = v_me)
     and (m.role = 'owner' or m.user_id = v_me)
   order by m.id for update;
  -- 50-2: my membership ids, before anything is written (the journal job redacts the person's rows by them)
  select coalesce(array_agg(m.id), '{}') into v_mids from public.memberships m where m.user_id = v_me;
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
  insert into app.erase_queue (user_id, membership_ids) values (v_me, v_mids) on conflict (user_id) do nothing;
  return jsonb_build_object('deleted', true, 'repeat', false, 'closed_companies', to_jsonb(v_last));
end;
$$;
revoke all on function app.erase_account(uuid, uuid[]) from public, anon, authenticated;

-- the journal: still append-only; the job (and only its owner role) may redact before/after of a row, nothing else of it
create or replace function app.tg_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and tg_table_name = 'audit_log'
     and current_setting('app.erasing_journal', true) = 'on'
     -- the flag is not a secret (set_config is open to everyone): the caller must BE the owner of the job, whoever sets the flag
     and current_user = (select r.rolname from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid = p.proowner
                          where p.oid = 'app.erase_queue_run()'::pg_catalog.regprocedure)
     and (to_jsonb(new) - 'before' - 'after') = (to_jsonb(old) - 'before' - 'after') then
    return new;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

-- the personal keys of a membership row, set to null where they exist (ids and codes stay)
create or replace function app.redact_person_json(p_json jsonb, p_keys text[])
returns jsonb language sql immutable set search_path = '' as $$
  select case when p_json is null then null
              else (select coalesce(jsonb_object_agg(e.key, case when e.key = any (p_keys) then 'null'::jsonb else e.value end), '{}'::jsonb)
                      from jsonb_each(p_json) e) end;
$$;
revoke all on function app.redact_person_json(jsonb, text[]) from public, anon, authenticated;

create or replace function app.erase_queue_run()
returns int language plpgsql security definer set search_path = '' as $$
declare
  q record;
  v_done int := 0;
  v_keys constant text[] := array['title', 'his_registration_number', 'color'];
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
      -- nothing of the person is left in what this job owns
      if exists (select 1 from public.audit_log a
                  where a.entity_type = 'memberships' and a.entity_id = any (q.membership_ids)
                    and (coalesce((a.before ->> 'title'), (a.before ->> 'his_registration_number'), (a.before ->> 'color'),
                                  (a.after ->> 'title'), (a.after ->> 'his_registration_number'), (a.after ->> 'color')) is not null))
         or exists (select 1 from public.catalog_price_history where by = q.user_id)
         or exists (select 1 from public.catalog_cost_history where by = q.user_id) then
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
