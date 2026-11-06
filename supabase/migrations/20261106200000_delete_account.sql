-- Wave 7а-2a «Удаление аккаунта» (story map S22; docs/specs/19 §6, §6.6–§6.8; Apple 5.1.1(v)).
-- The app calls the edge function delete-account (supabase/functions/delete-account): it calls public.delete_account
-- AS THE PERSON (this file: checks, erasing, one transaction), then auth.admin.deleteUser(uid, shouldSoftDelete) under
-- service_role — the sign-in is closed by Supabase Auth itself, never by writing auth.* from SQL (director 06.11).
-- Now:
-- * app.account_alive() — the signed-in person's account is not deleted: a still-valid token (up to an hour) of a deleted
--   person writes nothing (consent, company, team, own profile, tasks, expenses);
-- * public.delete_account(confirm, close_companies) — a fresh sign-in (≤ 10 min, from the signed token), the word, never
--   the last active owner of a company (unless that company is closed with the account); memberships → deleted, the
--   person's rows wiped or unlinked, the profile anonymised; business records stay (docs/specs/19 §6.7);
-- * public.transfer_ownership(company, to) — the owner hands the company to an active admin;
-- * companies.closed_at — a company closed with its last owner's account (its data is kept for app.retention_years());
-- * companies_select: the creator sees the company only before any membership (a deleted or disabled creator — no more).
-- Rule 16: nothing renamed or dropped; policies changed with alter policy; functions replaced with the same signature.

-- ---- 0. Retention of business records after an account / a company is gone (founder adjusts; erasing by it — 7а-3) ----
create or replace function app.retention_years()
returns int language sql immutable set search_path = '' as $$ select 7 $$;
revoke all on function app.retention_years() from public, anon, authenticated;

-- ---- 1. A company closed with its last owner's account ----
alter table public.companies add column if not exists closed_at timestamptz;

-- closed only by delete_account (7а-3 erases by it): an owner or admin neither sets nor clears it (security-check №5)
create or replace function app.tg_company_closed_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.closed_at is distinct from old.closed_at
     and not (current_setting('app.accepting_invite', true) = 'on' and current_user <> 'authenticated') then
    raise exception 'a company is closed only with its last owner''s account' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger t06_company_closed_guard before update on public.companies
  for each row execute function app.tg_company_closed_guard();
revoke all on function app.tg_company_closed_guard() from public, anon, authenticated;

-- ---- 2. The account is alive ----
create or replace function app.account_alive()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from public.users u where u.id = auth.uid() and u.deleted_at is null);
$$;
revoke all on function app.account_alive() from public, anon;
grant execute on function app.account_alive() to authenticated;

-- the consent of a deleted account does not count: no company, no team by a still-valid token (140000 + account_alive)
create or replace function app.has_current_legal()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and not app.is_anonymous_user() and app.account_alive()
     and exists (select 1 from public.legal_acceptance a where a.user_id = auth.uid() and a.company_id is null
                   and a.doc = 'terms' and a.version = app.legal_current_version('terms'))
     and exists (select 1 from public.legal_acceptance a where a.user_id = auth.uid() and a.company_id is null
                   and a.doc = 'privacy' and a.version = app.legal_current_version('privacy'));
$$;
revoke all on function app.has_current_legal() from public, anon;
grant execute on function app.has_current_legal() to authenticated;

-- the body of 20261106140000 unchanged, plus «not app.account_alive()» in the first check
create or replace function public.accept_legal(p_versions jsonb, p_platform text, p_app_version text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_doc text;
  v_ver date;
  v_headers jsonb;
  v_raw text;
  v_ip inet;
begin
  if v_me is null or app.is_anonymous_user() or not app.account_alive() then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_versions is null or jsonb_typeof(p_versions) <> 'object'
     or (select count(*) from jsonb_object_keys(p_versions)) <> 2
     or not (p_versions ? 'terms' and p_versions ? 'privacy') then
    raise exception 'legal versions: terms and privacy' using errcode = '22023';
  end if;
  foreach v_doc in array array['terms', 'privacy'] loop
    if jsonb_typeof(p_versions -> v_doc) <> 'string' or (p_versions ->> v_doc) !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'legal version outdated' using errcode = '22023';
    end if;
    -- a date that does not exist (2026-02-30) is the same refusal, not a raw 22008
    begin
      v_ver := (p_versions ->> v_doc)::date;
    exception when others then
      raise exception 'legal version outdated' using errcode = '22023';
    end;
    if v_ver is distinct from app.legal_current_version(v_doc) then
      raise exception 'legal version outdated' using errcode = '22023';
    end if;
  end loop;
  if p_platform is null or p_platform not in ('ios', 'android', 'web') then
    raise exception 'unknown platform' using errcode = '22023';
  end if;
  if p_app_version is null or p_app_version !~ '^[0-9A-Za-z.+ _-]{1,40}$' then
    raise exception 'bad app version' using errcode = '22023';
  end if;
  -- the IP: only cf-connecting-ip (Cloudflare in front of Supabase sets it and overwrites what a client sends). Which
  -- X-Forwarded-For entry is the client depends on the proxies (not checked on staging yet), so it is never taken as the
  -- IP — it is kept raw in ip_raw for reference. Best effort: a bad header never blocks the consent.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    v_raw := left(concat_ws(' | ', 'cf=' || (v_headers ->> 'cf-connecting-ip'), 'xff=' || (v_headers ->> 'x-forwarded-for')), 200);
    if v_raw = '' then
      v_raw := null;
    end if;
    -- host(): an address only («1.2.3.4/0» → 1.2.3.4); trusted only while Cloudflare is in front (check on staging)
    v_ip := host(btrim(v_headers ->> 'cf-connecting-ip')::inet)::inet;
  exception when others then
    v_ip := null;
  end;
  foreach v_doc in array array['terms', 'privacy'] loop
    v_ver := app.legal_current_version(v_doc);
    insert into public.legal_acceptance (user_id, company_id, doc, version, accepted_at, platform, app_version, ip, ip_raw)
    values (v_me, null, v_doc, v_ver, now(), p_platform, p_app_version, v_ip, v_raw)
    on conflict (user_id, doc, version) where company_id is null do nothing;
  end loop;
  return public.legal_status();
end;
$$;

revoke all on function public.accept_legal(jsonb, text, text) from public, anon;
grant execute on function public.accept_legal(jsonb, text, text) to authenticated;

-- own profile: not after the account is deleted (an offline queue on a second phone must not write the name back)
alter policy users_update on public.users
  using (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()) and deleted_at is null);
create or replace function app.tg_user_erased_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.deleted_at is not null and current_user = 'authenticated' then
    raise exception 'this account is deleted' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger t05_user_erased_guard before update on public.users
  for each row execute function app.tg_user_erased_guard();
revoke all on function app.tg_user_erased_guard() from public, anon, authenticated;

-- tasks and expenses let the assignee / author in without a membership — only while they are still on the team
alter policy tasks_select on public.tasks
  using (app.is_staff(company_id)
         or (app.is_member(company_id) and (assignee_id = (select auth.uid()) or created_by = (select auth.uid())))
         or (subject_type = 'lead' and app.task_subject_in_company('lead', subject_id, company_id) and app.can_see_lead(subject_id))
         or (subject_type = 'property' and app.can_see_property(subject_id, company_id)));
alter policy tasks_update on public.tasks
  using (app.is_staff(company_id)
         or (app.is_member(company_id) and (assignee_id = (select auth.uid()) or created_by = (select auth.uid())))
         or (subject_type = 'property' and app.can_see_property(subject_id, company_id)))
  with check (app.is_member(company_id) and app.task_subject_in_company(subject_type, subject_id, company_id));
alter policy expenses_update on public.expenses
  using (app.is_staff(company_id) or (app.is_member(company_id) and created_by = (select auth.uid())))
  with check (app.is_staff(company_id) or (app.is_member(company_id) and created_by = (select auth.uid())));

-- ---- 3. The creator of a company sees it only before any membership (the moment of creating) ----
create or replace function app.is_creator_without_membership(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.companies c where c.id = p_company_id and c.created_by = auth.uid())
     and not exists (select 1 from public.memberships m where m.company_id = p_company_id and m.user_id = auth.uid());
$$;
revoke all on function app.is_creator_without_membership(uuid) from public, anon;
grant execute on function app.is_creator_without_membership(uuid) to authenticated;
alter policy companies_select on public.companies
  using (app.is_member(id) or app.is_creator_without_membership(id));

-- ---- 4. A fresh sign-in: from the signed token of THIS session (amr), not the account-wide last_sign_in_at ----
-- ≤ 10 minutes. No claims / no amr → refused (fail closed). Anonymous (claim or auth.users.is_anonymous) → refused.
create or replace function app.signed_in_recently(p_seconds int default 600)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_claims jsonb;
  v_at bigint;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return false;
  end;
  if v_claims is null or jsonb_typeof(v_claims -> 'amr') <> 'array' or app.is_anonymous_user() then
    return false;
  end if;
  if exists (select 1 from auth.users u where u.id = auth.uid() and (to_jsonb(u) ->> 'is_anonymous') = 'true') then
    return false;
  end if;
  -- a token refresh is not a sign-in (security-check 7а-2a №7)
  select max((e ->> 'timestamp')::bigint) into v_at
    from jsonb_array_elements(v_claims -> 'amr') e
   where jsonb_typeof(e -> 'timestamp') = 'number' and coalesce(e ->> 'method', '') <> 'token_refresh';
  -- the session of this token is still alive (a signed-out session's token does not delete)
  if v_claims ? 'session_id' and to_regclass('auth.sessions') is not null then
    if not exists (select 1 from auth.sessions s where s.id::text = v_claims ->> 'session_id') then
      return false;
    end if;
  end if;
  return v_at is not null and v_at >= extract(epoch from now())::bigint - p_seconds and v_at <= extract(epoch from now())::bigint + 60;
end;
$$;
revoke all on function app.signed_in_recently(int) from public, anon, authenticated;

-- ---- 5. The person's own rows: an extension point (7б-2 «Работы» adds user_locations here, 20261106210000) ----
create or replace function app.erase_personal_rows(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.member_prefs where user_id = p_user;
end;
$$;
revoke all on function app.erase_personal_rows(uuid) from public, anon, authenticated;

-- ---- 6. The consent journal: on erasure only the IP goes (the proof of the consent stays — docs/specs/19 §6.7) ----
create or replace function app.tg_legal_acceptance_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('app.erasing_user', true) = 'on' and current_user <> 'authenticated' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    if new.ip is null and new.ip_raw is null
       and (new.id, new.user_id, new.company_id, new.doc, new.version, new.accepted_at, new.platform, new.app_version)
           is not distinct from (old.id, old.user_id, old.company_id, old.doc, old.version, old.accepted_at, old.platform, old.app_version) then
      return new;
    end if;
  end if;
  -- the cascade from public.users (the person erased by Supabase Auth) takes the rows with them
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'legal_acceptance is append-only' using errcode = '42501';
end;
$$;
revoke all on function app.tg_legal_acceptance_guard() from public, anon, authenticated;

-- ---- 7. Delete my account ----
-- p_confirm: exactly DELETE / УДАЛИТЬ / ELIMINAR (the app upper-cases). p_close_companies: the companies where the person is
-- the last active owner and agreed to close them with the account («Закрыть компанию и удалить аккаунт»).
-- Our refusals carry SQLSTATE OD001 and go to the app as they are; anything else → «account deletion failed» (no
-- internals on screen); a lock conflict → «try again».
create or replace function public.delete_account(p_confirm text, p_close_companies uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_gone text;
  v_last uuid[];
  v_c uuid;

begin
  begin
    if v_me is null or app.is_anonymous_user() then
      raise exception 'sign in first' using errcode = 'OD001';
    end if;
    -- a lock wait never hangs until the statement timeout (→ «try again»)
    perform set_config('lock_timeout', '5s', true);
    -- my profile row first: two taps at once — the second waits here and then sees the first one's result
    perform 1 from public.users u where u.id = v_me for update;
    -- again (the answer was lost, or the sign-in is closed by Auth later): nothing changes, it is a success
    if exists (select 1 from public.users u where u.id = v_me and u.deleted_at is not null) then
      return jsonb_build_object('deleted', true, 'repeat', true);
    end if;
    if btrim(coalesce(p_confirm, '')) not in ('DELETE', 'УДАЛИТЬ', 'ELIMINAR') then
      raise exception 'type the word to confirm' using errcode = 'OD001';
    end if;
    if not app.signed_in_recently() then
      raise exception 'sign in again first' using errcode = 'OD001';
    end if;
    -- lock, in one order (by id), every owner of my companies and every row of mine: two owners leaving at once, or a
    -- transfer meanwhile, cannot leave a company without an owner (security-check 7а-2 №5)
    perform 1 from public.memberships m
     where m.company_id in (select x.company_id from public.memberships x where x.user_id = v_me)
       and (m.role = 'owner' or m.user_id = v_me)
     order by m.id for update;
    -- after the locks: the companies where I am the last active owner
    select coalesce(array_agg(mine.company_id), '{}') into v_last
      from public.memberships mine
     where mine.user_id = v_me and mine.role = 'owner' and mine.status = 'active' and mine.deleted_at is null
       and not exists (select 1 from public.memberships o where o.company_id = mine.company_id and o.role = 'owner'
                         and o.status = 'active' and o.deleted_at is null and o.user_id <> v_me);
    foreach v_c in array v_last loop
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
    return jsonb_build_object('deleted', true, 'repeat', false, 'closed_companies', to_jsonb(v_last));
  exception
    when sqlstate 'OD001' then
      raise;
    when deadlock_detected or serialization_failure or lock_not_available or query_canceled then
      raise exception 'try again' using errcode = 'OD001';
    when others then
      -- SQLSTATE and the message (no DETAIL: it may hold values) — enough to read a staging failure
      raise warning 'delete_account failed: % %', sqlstate, sqlerrm;
      raise exception 'account deletion failed' using errcode = 'OD002';
  end;
end;
$$;
revoke all on function public.delete_account(text, uuid[]) from public, anon;
grant execute on function public.delete_account(text, uuid[]) to authenticated;

-- ---- 8. Hand the company to an admin (before deleting, or any time) ----
-- The same fresh sign-in (a stolen session must not give the company away). One error for an unknown company or person.
create or replace function public.transfer_ownership(p_company_id uuid, p_to_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not app.account_alive() or not app.signed_in_recently() then
    raise exception 'sign in again first' using errcode = 'OD001';
  end if;
  if p_to_user is null or p_to_user = v_me then
    raise exception 'no such person on the team' using errcode = 'OD001';
  end if;
  -- the same set and order as delete_account: the owners, me and the target, by id
  perform 1 from public.memberships m
   where m.company_id = p_company_id and (m.role = 'owner' or m.user_id in (v_me, p_to_user))
   order by m.id for update;
  if not exists (select 1 from public.memberships m where m.company_id = p_company_id and m.user_id = v_me
                   and m.role = 'owner' and m.status = 'active' and m.deleted_at is null)
     or not exists (select 1 from public.memberships m join public.users u on u.id = m.user_id
                     where m.company_id = p_company_id and m.user_id = p_to_user and m.role = 'admin'
                       and m.status = 'active' and m.deleted_at is null and u.deleted_at is null) then
    raise exception 'no such person on the team' using errcode = 'OD001';
  end if;
  perform set_config('app.accepting_invite', 'on', true);
  update public.memberships set role = 'owner', can_sign_contracts = true where company_id = p_company_id and user_id = p_to_user;
  update public.memberships set role = 'admin' where company_id = p_company_id and user_id = v_me;
  perform set_config('app.accepting_invite', '', true);
  return jsonb_build_object('company_id', p_company_id, 'owner', p_to_user);
end;
$$;
revoke all on function public.transfer_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
