-- Wave 7а-1 «Согласие с условиями» (clickwrap; docs/specs/19 §5, docs/legal/01-founder-protection.md §3.5, §8 п.13).
-- Before: anyone signed in could create a company (companies_insert: auth.uid() is not null) or accept an invitation;
-- nothing recorded that the person agreed to the Terms of Service and the Privacy Policy, nor which edition.
-- Now:
-- * public.legal_acceptance — a journal, appended to only: who, which document, which edition, when (server time), the
--   platform and app version (said by the client), the IP (from the proxy headers, best effort);
-- * app.legal_current_version(doc) — the current edition; a new edition = a new migration + LEGAL_VERSIONS in the app;
-- * public.accept_legal(versions, platform, app_version) — the signed-in person agrees to the editions the app showed;
-- * public.legal_status() — what is current and what this person has accepted (the app's «Условия изменились» gate);
-- * a company is created and an invitation is accepted only after the current Terms and Privacy are accepted.
-- People who are already in a company keep working (the server does not force them; the app's gate asks them).

-- ---- 1. The journal ----
create table public.legal_acceptance (
  id           uuid primary key default public.uuid_generate_v7(),
  user_id      uuid not null references public.users (id) on delete cascade,
  company_id   uuid references public.companies (id) on delete cascade,
  doc          text not null check (doc in ('terms', 'privacy', 'dpa')),
  version      date not null,
  accepted_at  timestamptz not null default now(),
  platform     text not null check (platform in ('ios', 'android', 'web')),
  app_version  text not null check (app_version ~ '^[0-9A-Za-z.+ _-]{1,40}$'),
  ip           inet,
  ip_raw       text check (ip_raw is null or length(ip_raw) <= 200),
  -- the DPA is accepted by a company's owner for that company (later, its own function)
  constraint legal_acceptance_dpa_company check (doc <> 'dpa' or company_id is not null)
);
create unique index legal_acceptance_once on public.legal_acceptance (user_id, doc, version) where company_id is null;
create unique index legal_acceptance_once_company on public.legal_acceptance (user_id, company_id, doc, version) where company_id is not null;

alter table public.legal_acceptance enable row level security;
alter table public.legal_acceptance force row level security;
revoke all on table public.legal_acceptance from anon, authenticated;
grant select on public.legal_acceptance to authenticated;
-- a person sees only their own rows; nobody writes directly (accept_legal below)
create policy legal_acceptance_select on public.legal_acceptance for select to authenticated
  using (user_id = (select auth.uid()));

-- appended to only: no edits; a row goes only with its person (the cascade from public.users — account erasure, S22)
create or replace function app.tg_legal_acceptance_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and (pg_trigger_depth() > 1 or current_setting('app.erasing_user', true) = 'on') then
    return old;
  end if;
  raise exception 'legal_acceptance is append-only' using errcode = '42501';
end;
$$;
create trigger legal_acceptance_append_only before update or delete on public.legal_acceptance
  for each row execute function app.tg_legal_acceptance_guard();
revoke all on function app.tg_legal_acceptance_guard() from public, anon, authenticated;

-- ---- 2. Current editions ----
-- stable, not immutable: a new edition replaces this function, and a cached plan must not keep the old date
create or replace function app.legal_current_version(p_doc text)
returns date language sql stable set search_path = '' as $$
  select case p_doc
    when 'terms' then date '2026-11-06'
    when 'privacy' then date '2026-11-06'
  end;
$$;
revoke all on function app.legal_current_version(text) from public, anon, authenticated;

-- an anonymous Supabase sign-in (if ever switched on) is «authenticated» too, but it agrees to nothing
create or replace function app.is_anonymous_user()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'is_anonymous', 'false') = 'true';
$$;
revoke all on function app.is_anonymous_user() from public, anon, authenticated;

-- the signed-in person has accepted the current Terms and Privacy (used by the companies policy and accept_invitation)
create or replace function app.has_current_legal()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and not app.is_anonymous_user()
     and exists (select 1 from public.legal_acceptance a where a.user_id = auth.uid() and a.company_id is null
                   and a.doc = 'terms' and a.version = app.legal_current_version('terms'))
     and exists (select 1 from public.legal_acceptance a where a.user_id = auth.uid() and a.company_id is null
                   and a.doc = 'privacy' and a.version = app.legal_current_version('privacy'));
$$;
revoke all on function app.has_current_legal() from public, anon;
grant execute on function app.has_current_legal() to authenticated;

-- ---- 3. Agree ----
-- p_versions: exactly {"terms": "YYYY-MM-DD", "privacy": "YYYY-MM-DD"} — the editions the app showed. An older edition
-- is refused («legal version outdated»: the app is old and showed an old text). Again with the same editions — no new rows.
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
  if v_me is null or app.is_anonymous_user() then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_versions is null or jsonb_typeof(p_versions) <> 'object'
     or (select count(*) from jsonb_object_keys(p_versions)) <> 2
     or not (p_versions ? 'terms' and p_versions ? 'privacy') then
    raise exception 'legal versions: terms and privacy' using errcode = '22023';
  end if;
  foreach v_doc in array array['terms', 'privacy'] loop
    if jsonb_typeof(p_versions -> v_doc) <> 'string'
       or (p_versions ->> v_doc) !~ '^\d{4}-\d{2}-\d{2}$'
       or (p_versions ->> v_doc)::date is distinct from app.legal_current_version(v_doc) then
      raise exception 'legal version outdated' using errcode = '22023';
    end if;
  end loop;
  if p_platform is null or p_platform not in ('ios', 'android', 'web') then
    raise exception 'unknown platform' using errcode = '22023';
  end if;
  if p_app_version is null or p_app_version !~ '^[0-9A-Za-z.+ _-]{1,40}$' then
    raise exception 'bad app version' using errcode = '22023';
  end if;
  -- the IP: the address the Cloudflare / Supabase proxy saw, else the right-most X-Forwarded-For entry (the one the
  -- trusted proxy added; the left ones the client can write itself). Best effort: a bad header never blocks the consent.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    v_raw := left(coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-forwarded-for'), 200);
    if v_raw is not null then
      v_ip := btrim(regexp_replace(v_raw, '^.*,', ''))::inet;
    end if;
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

-- what is current and whether this person has accepted it: {"terms": {"current": "…", "accepted": true}, …, "ok": true}
create or replace function public.legal_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_out jsonb := '{}'::jsonb;
  v_doc text;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  foreach v_doc in array array['terms', 'privacy'] loop
    v_out := v_out || jsonb_build_object(v_doc, jsonb_build_object(
      'current', app.legal_current_version(v_doc),
      'accepted', exists (select 1 from public.legal_acceptance a where a.user_id = v_me and a.company_id is null
                            and a.doc = v_doc and a.version = app.legal_current_version(v_doc)),
      'ever', exists (select 1 from public.legal_acceptance a where a.user_id = v_me and a.company_id is null and a.doc = v_doc)));
  end loop;
  return v_out || jsonb_build_object('ok', app.has_current_legal());
end;
$$;
revoke all on function public.accept_legal(jsonb, text, text) from public, anon;
revoke all on function public.legal_status() from public, anon;
grant execute on function public.accept_legal(jsonb, text, text) to authenticated;
grant execute on function public.legal_status() to authenticated;

-- ---- 4. No company without the consent ----
alter policy companies_insert on public.companies
  with check ((select auth.uid()) is not null and (select app.has_current_legal()));
-- the same with a clear error the app can recognise (an RLS failure names only the table)
create or replace function app.tg_company_needs_legal()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and current_user = 'authenticated' and not app.has_current_legal() then
    raise exception 'legal not accepted' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger t05_company_needs_legal before insert on public.companies
  for each row execute function app.tg_company_needs_legal();
revoke all on function app.tg_company_needs_legal() from public, anon, authenticated;

-- ---- 5. No joining a team without the consent ----
-- the body of 20261106110000 unchanged, plus the check right after «sign in first»; same signature and rights
create or replace function public.accept_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  i public.invitations;
  v_me uuid := auth.uid();
  v_email text;
  v_unconfirmed boolean;
  m public.memberships;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not app.has_current_legal() then
    raise exception 'legal not accepted' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) < 20 then
    raise exception 'no such invitation' using errcode = '22023';
  end if;
  select * into i from public.invitations where token_hash = app.invite_token_hash(p_token) for update;
  if i.id is null or i.status in ('revoked') then
    raise exception 'no such invitation' using errcode = '22023';
  end if;
  -- the sign-in email (auth.users), confirmed — never public.users.email, which is the person's own profile row
  select lower(u.email), (to_jsonb(u) ? 'email_confirmed_at') and (to_jsonb(u) ->> 'email_confirmed_at') is null
    into v_email, v_unconfirmed from auth.users u where u.id = v_me;
  if v_unconfirmed then
    raise exception 'confirm your email first' using errcode = '42501';
  end if;
  if v_email is distinct from i.email then
    raise exception 'this invitation is for another email' using errcode = '42501';
  end if;
  if i.status = 'accepted' then
    -- the same person opens the link again: nothing changes
    if i.accepted_by = v_me then
      return jsonb_build_object('company_id', i.company_id, 'role', i.role, 'repeat', true);
    end if;
    raise exception 'no such invitation' using errcode = '22023';
  end if;
  -- expired: the list shows it by expires_at (an error rolls back any mark); «Отправить ещё раз» gives a new link
  if i.status = 'expired' or i.expires_at < now() then
    raise exception 'the invitation has expired' using errcode = '22023';
  end if;
  -- the person who invited still may: an owner/admin (switched off or moved down — the link is dead); the right to sign — an owner
  if i.invited_by is null or not exists (
       select 1 from public.memberships x where x.company_id = i.company_id and x.user_id = i.invited_by and x.status = 'active'
          and x.deleted_at is null and x.role in ('owner', 'admin') and (not i.can_sign_contracts or x.role = 'owner')) then
    raise exception 'no such invitation' using errcode = '22023';
  end if;
  -- already on the team (active or switched off): an old link neither brings a person back nor changes the role
  select * into m from public.memberships where company_id = i.company_id and user_id = v_me and deleted_at is null and status in ('active', 'disabled');
  if m.id is not null then
    raise exception 'already on the team' using errcode = '23505';
  end if;
  perform set_config('app.accepting_invite', 'on', true);
  insert into public.memberships (company_id, user_id, role, status, can_sign_contracts, invited_by)
  values (i.company_id, v_me, i.role, 'active', i.can_sign_contracts, i.invited_by)
  on conflict (company_id, user_id) do update
    set role = excluded.role, status = 'active', can_sign_contracts = excluded.can_sign_contracts, suspended_at = null, deleted_at = null;
  perform set_config('app.accepting_invite', '', true);
  update public.invitations set status = 'accepted', accepted_by = v_me, accepted_at = now(), updated_at = now() where id = i.id;
  update public.users set last_active_company_id = i.company_id where id = v_me;
  return jsonb_build_object('company_id', i.company_id, 'role', i.role, 'repeat', false);
end;
$$;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
