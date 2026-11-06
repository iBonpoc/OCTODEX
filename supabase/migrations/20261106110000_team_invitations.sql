-- Wave 7-2 «Команда и приглашение» (story map S21; docs/specs/13 §3.13, 19 §2 п.3–4).
-- Before: memberships.status was invited / active / suspended and user_id is required — a person who has no account yet
-- could not be invited, and there was no way to join (only an active owner/admin may write memberships).
-- Now:
-- * memberships.status: invited / active / disabled / deleted («suspended» → «disabled»; «deleted» — S22, wave 7а-2);
-- * public.invitations: an invitation by email, before the person has an account; only a hash of the link token is kept;
-- * public.invite_member / resend_invitation / revoke_invitation — owner and admin; the link token comes back once;
-- * public.accept_invitation(token) — the signed-in person whose email is the invited one joins with the invited role;
-- * public.set_member_status — owner and admin disable or bring back a person (not themselves, not the owner unless owner).
-- An invited person sees nothing of the company until they accept (is_member = active only); a disabled one — nothing again.

-- ---- 1. Membership statuses ----
alter table public.memberships drop constraint if exists memberships_status_check;
update public.memberships set status = 'disabled' where status = 'suspended';
alter table public.memberships add constraint memberships_status_check check (status in ('invited', 'active', 'disabled', 'deleted'));

-- ---- 2. Invitations ----
create table public.invitations (
  id                  uuid primary key default public.uuid_generate_v7(),
  company_id          uuid not null references public.companies (id),
  email               text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name                text check (name is null or length(name) <= 200),
  role                text not null check (role in ('admin', 'office', 'sales', 'tech', 'subcontractor')),
  can_sign_contracts  boolean not null default false,
  token_hash          text not null unique,
  expires_at          timestamptz not null,
  status              text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by          uuid references public.users (id),
  accepted_by         uuid references public.users (id),
  accepted_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index invitations_one_pending on public.invitations (company_id, email) where status = 'pending';
create index invitations_company_idx on public.invitations (company_id, status);

alter table public.invitations enable row level security;
revoke all on table public.invitations from anon, authenticated;
-- the team screen lists them (owner, admin); writes go through the functions below only
grant select (id, company_id, email, name, role, can_sign_contracts, expires_at, status, invited_by, accepted_at, created_at, updated_at)
  on public.invitations to authenticated;
create policy invitations_select on public.invitations for select to authenticated
  using (app.has_role(company_id, array['owner', 'admin']));

create or replace function app.invite_token_hash(p_token text)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;
revoke all on function app.invite_token_hash(text) from public, anon, authenticated;

-- ---- 3. Invite, send again, cancel (owner, admin) ----
create or replace function public.invite_member(p_company_id uuid, p_email text, p_role text, p_name text default null, p_can_sign boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text;
  v_id uuid;
begin
  if not app.has_role(p_company_id, array['owner', 'admin']) then
    raise exception 'only the owner or an admin invites' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin', 'office', 'sales', 'tech', 'subcontractor') then
    raise exception 'role % cannot be invited', p_role using errcode = '22023';
  end if;
  -- the right to sign is the owner's to give (07 §2.2); a subcontractor never signs
  if p_can_sign and (p_role = 'subcontractor' or not app.has_role(p_company_id, array['owner'])) then
    raise exception 'only the owner gives the right to sign contracts' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.memberships m join public.users u on u.id = m.user_id
     where m.company_id = p_company_id and lower(u.email) = v_email and m.status in ('active', 'disabled') and m.deleted_at is null
  ) then
    raise exception 'already on the team' using errcode = '23505';
  end if;
  -- a new invitation replaces the pending one for the same email
  update public.invitations set status = 'revoked', updated_at = now()
   where company_id = p_company_id and email = v_email and status = 'pending';
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.invitations (company_id, email, name, role, can_sign_contracts, token_hash, expires_at, invited_by)
  values (p_company_id, v_email, nullif(btrim(coalesce(p_name, '')), ''), p_role, coalesce(p_can_sign, false),
          app.invite_token_hash(v_token), now() + interval '7 days', auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;

create or replace function public.resend_invitation(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  i public.invitations;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select * into i from public.invitations where id = p_id for update;
  if i.id is null or not app.has_role(i.company_id, array['owner', 'admin']) then
    raise exception 'no such invitation' using errcode = '42501';
  end if;
  if i.status not in ('pending', 'expired') then
    raise exception 'the invitation is %', i.status using errcode = '22023';
  end if;
  -- a new link: the old one stops working
  update public.invitations set token_hash = app.invite_token_hash(v_token), expires_at = now() + interval '7 days', status = 'pending', updated_at = now()
   where id = p_id;
  return jsonb_build_object('id', p_id, 'token', v_token);
end;
$$;

create or replace function public.revoke_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.invitations;
begin
  select * into i from public.invitations where id = p_id for update;
  if i.id is null or not app.has_role(i.company_id, array['owner', 'admin']) then
    raise exception 'no such invitation' using errcode = '42501';
  end if;
  if i.status = 'accepted' then
    raise exception 'already accepted' using errcode = '22023';
  end if;
  update public.invitations set status = 'revoked', updated_at = now() where id = p_id;
end;
$$;

-- ---- 4. Accept (the invited person, signed in) ----
-- tg_membership_guard refuses changing one's own role; accepting sets it on purpose, so it lets this one function through
create or replace function app.tg_membership_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1
     or (current_setting('app.accepting_invite', true) = 'on' and current_user <> 'authenticated') then
    return new;      -- system / onboarding (company trigger) / accept_invitation
  end if;
  if (new.role = 'owner' or (tg_op = 'UPDATE' and old.role = 'owner'))
     and not app.has_role(new.company_id, array['owner']) then
    raise exception 'only owner can grant or change the owner role' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.user_id = auth.uid() and new.role is distinct from old.role then
    raise exception 'cannot change your own role' using errcode = '42501';
  end if;
  -- review #193: a membership never moves to another person or company, and its status changes only in the functions
  -- (accept_invitation, set_member_status) — not by a direct update of an owner/admin
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.company_id is distinct from old.company_id
       or new.status is distinct from old.status or new.deleted_at is distinct from old.deleted_at) then
    raise exception 'membership status and owner change only through the team functions' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- the right to sign comes with the invitation the owner made; the person accepting is not the owner
create or replace function app.tg_membership_sign_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.role = 'subcontractor' then
    new.can_sign_contracts := false;                    -- a subcontractor never signs for the company
  end if;
  if tg_op = 'UPDATE' and new.can_sign_contracts is distinct from old.can_sign_contracts
     and auth.uid() is not null
     and not (current_setting('app.accepting_invite', true) = 'on' and current_user <> 'authenticated')
     and not app.has_role(new.company_id, array['owner']) then
    raise exception 'only the owner gives or takes the right to sign contracts' using errcode = '42501';
  end if;
  return new;
end;
$$;

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

-- ---- 5. Disable / bring back (owner, admin) ----
create or replace function public.set_member_status(p_company_id uuid, p_user_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  if p_status not in ('active', 'disabled') then
    raise exception 'status % is not set here', p_status using errcode = '22023';
  end if;
  if not app.has_role(p_company_id, array['owner', 'admin']) then
    raise exception 'only the owner or an admin' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'not yourself' using errcode = '42501';
  end if;
  select * into m from public.memberships where company_id = p_company_id and user_id = p_user_id and deleted_at is null for update;
  if m.id is null or m.status not in ('active', 'disabled') then
    raise exception 'no such person on the team' using errcode = '22023';
  end if;
  if m.role = 'owner' and not app.has_role(p_company_id, array['owner']) then
    raise exception 'only the owner disables an owner' using errcode = '42501';
  end if;
  -- the company always keeps an active owner: lock its owners, then count the others (two owners at once — review #193)
  if m.role = 'owner' and p_status = 'disabled' then
    perform 1 from public.memberships where company_id = p_company_id and role = 'owner' for update;
    if not exists (select 1 from public.memberships where company_id = p_company_id and role = 'owner' and status = 'active'
                    and deleted_at is null and id <> m.id) then
      raise exception 'the company keeps at least one active owner' using errcode = '42501';
    end if;
  end if;
  -- the person's records stay with the company; only the access changes
  perform set_config('app.accepting_invite', 'on', true);
  update public.memberships set status = p_status, suspended_at = case when p_status = 'disabled' then now() end
   where id = m.id;
  perform set_config('app.accepting_invite', '', true);
  -- a person switched off: the invitations they sent stop working too
  if p_status = 'disabled' then
    update public.invitations set status = 'revoked', updated_at = now()
     where company_id = p_company_id and invited_by = p_user_id and status = 'pending';
  end if;
end;
$$;

revoke all on function public.invite_member(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.resend_invitation(uuid) from public, anon;
revoke all on function public.revoke_invitation(uuid) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.set_member_status(uuid, uuid, text) from public, anon;
grant execute on function public.invite_member(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.resend_invitation(uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.set_member_status(uuid, uuid, text) to authenticated;

-- ---- 6. The sign-in email is not the person's to edit in public.users (it was: users_update + a table-wide grant) ----
revoke update on public.users from authenticated;
grant update (full_name, phone, locale, avatar_file_id, last_active_company_id) on public.users to authenticated;

-- ---- 7. A membership is born only by accepting an invitation (or the company's owner trigger) — audit №13 ----
-- before: memberships_insert let an owner/admin add ANY user_id to the company without that person's consent
drop policy if exists memberships_insert on public.memberships;
revoke insert on public.memberships from authenticated;

-- ---- 8. A direct update of memberships: only the fields the app edits (review #193) ----
-- before: a table-wide update grant — an admin could move a membership to another user_id or wake a deleted one
revoke update on public.memberships from authenticated;
grant update (role, title, his_registration_number, can_sign_contracts, color, share_location, permissions_override)
  on public.memberships to authenticated;
