-- Пуши П1 (docs/specs/27-push.md §4): the database side of push notifications. Nothing leaves the database here:
-- rows wait in public.push_outbox; the edge function send-push, push_claim / push_finish and pg_cron are П3.
-- 1. public.push_devices — the phones of a person (Expo push tokens). Read: only your own rows. Write: only through
--    public.register_push_device / public.forget_push_device (security definer, only for yourself).
-- 2. public.push_outbox — one row per (notification, person); only the server reads or writes it. No text, sums, names
--    or addresses in a row (docs/specs/14-app-store п.6, Apple 4.5.4): send-push builds the words from kind and lang.
-- 3. A trigger on public.notifications puts the first kinds in the queue (§4.3): estimate.client_signed → owner, admin and
--    the author of the estimate; deposit.paid / invoice.paid → owner, admin. Any error of the queue is caught: a
--    signature or a payment is never rolled back by a push (as the mail, docs/specs/07-email §9.3).
-- 4. Account deletion (S22): app.erase_personal_rows also deletes the person's devices and queue rows.
-- The feed (public.notifications) does not change: old app versions read it as before (rule 16, nothing renamed).

-- ---- 1. Devices ------------------------------------------------------------------------------------------------------
create table public.push_devices (
  id              uuid primary key default public.uuid_generate_v7(),
  user_id         uuid not null references public.users (id) on delete cascade,
  expo_token      text not null unique
                  check (length(expo_token) <= 255 and expo_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$'),
  platform        text not null check (platform in ('ios', 'android')),
  lang            text not null default 'en' check (lang in ('en', 'es', 'ru')),
  app_version     text check (app_version is null or length(app_version) <= 32),
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  revoked_at      timestamptz,
  revoked_reason  text check (revoked_reason in ('signed_out', 'not_registered', 'account_deleted', 'too_many')),
  check ((revoked_at is null) = (revoked_reason is null))
);
create index push_devices_user_idx on public.push_devices (user_id);

alter table public.push_devices enable row level security;
alter table public.push_devices force row level security;
revoke all on table public.push_devices from public, anon, authenticated;
grant select on public.push_devices to authenticated;
create policy push_devices_select_own on public.push_devices for select to authenticated
  using (user_id = (select auth.uid()));

-- How many live phones one person may have; the oldest goes off when a new one comes (§4.1)
create or replace function app.push_devices_max()
returns integer language sql immutable set search_path = '' as $$ select 10 $$;
revoke all on function app.push_devices_max() from public, anon, authenticated;

-- Register this phone for the person signed in. The same token of another person moves to the one signed in now:
-- a phone gets only the pushes of who is signed in on it. Errors never echo the token (it reaches the error log).
create or replace function public.register_push_device(p_token text, p_platform text, p_lang text, p_app_version text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) > 255 or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$' then
    raise exception 'not a push token' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'unknown platform' using errcode = '22023';
  end if;
  if p_app_version is not null and length(p_app_version) > 32 then
    raise exception 'app version too long' using errcode = '22023';
  end if;
  insert into public.push_devices as d (user_id, expo_token, platform, lang, app_version)
  values (v_uid, p_token, p_platform, case when p_lang in ('en', 'es', 'ru') then p_lang else 'en' end, p_app_version)
  on conflict (expo_token) do update
    set user_id = excluded.user_id, platform = excluded.platform, lang = excluded.lang, app_version = excluded.app_version,
        last_seen_at = now(), revoked_at = null, revoked_reason = null,
        created_at = case when d.user_id = excluded.user_id then d.created_at else now() end;
  -- not more than app.push_devices_max() live phones: the ones seen longest ago go off
  update public.push_devices set revoked_at = now(), revoked_reason = 'too_many'
   where id in (select id from public.push_devices
                 where user_id = v_uid and revoked_at is null
                 order by last_seen_at desc, created_at desc
                 offset app.push_devices_max());
end;
$$;
revoke all on function public.register_push_device(text, text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text, text) to authenticated;

-- Sign out on this phone: only your own token goes off; another's or an unknown one — the same silence (no hint)
create or replace function public.forget_push_device(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.push_devices set revoked_at = now(), revoked_reason = 'signed_out'
   where expo_token = p_token and user_id = auth.uid() and revoked_at is null;
end;
$$;
revoke all on function public.forget_push_device(text) from public, anon;
grant execute on function public.forget_push_device(text) to authenticated;

-- ---- 2. The queue ----------------------------------------------------------------------------------------------------
create table public.push_outbox (
  id               uuid primary key default public.uuid_generate_v7(),
  company_id       uuid not null references public.companies (id),
  user_id          uuid not null references public.users (id) on delete cascade,
  notification_id  uuid references public.notifications (id) on delete cascade,
  kind             text not null check (kind in ('estimate.client_signed', 'payment.received', 'visit.assigned', 'visit.rescheduled', 'lead.new')),
  route            text not null check (length(route) <= 200 and route ~ '^/[A-Za-z0-9/_-]*$'),
  status           text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  tries            integer not null default 0 check (tries >= 0),
  next_try_at      timestamptz not null default now(),
  ticket_ids       text[],
  error            text check (error is null or length(error) <= 200),
  created_at       timestamptz not null default now(),
  sent_at          timestamptz,
  unique (notification_id, user_id)
);
-- send-push takes the due rows; the purge goes by age
create index push_outbox_due_idx on public.push_outbox (next_try_at) where status in ('pending', 'sending');
create index push_outbox_age_idx on public.push_outbox (created_at);
create index push_outbox_user_idx on public.push_outbox (user_id);
create index push_outbox_company_idx on public.push_outbox (company_id);

alter table public.push_outbox enable row level security;
alter table public.push_outbox force row level security;
-- the server only (service_role / postgres): no rules for the app's roles, no rights
revoke all on table public.push_outbox from public, anon, authenticated;
-- a queued push never moves to another company (T59)
create trigger t11_company_id_immutable before update on public.push_outbox
  for each row execute function app.tg_company_id_immutable();

-- Who gets the push of a feed row (§4.3). Only active members of the company who are not subcontractors.
create or replace function app.push_recipients(p_company uuid, p_roles text[], p_also uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct m.user_id
    from public.memberships m
   where m.company_id = p_company and m.status = 'active' and m.deleted_at is null and m.role <> 'subcontractor'
     and (m.role = any (p_roles) or m.user_id = p_also);
$$;
revoke all on function app.push_recipients(uuid, text[], uuid) from public, anon, authenticated;

create or replace function app.tg_notification_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_kind   text;
  v_route  text;
  v_author uuid;
begin
  begin
    if new.kind = 'estimate.client_signed' and new.estimate_id is not null then
      v_kind := 'estimate.client_signed';
      v_route := '/estimate/' || new.estimate_id::text;
      select e.owner_user_id into v_author from public.estimates e where e.id = new.estimate_id and e.company_id = new.company_id;
    elsif new.kind in ('deposit.paid', 'invoice.paid') then
      v_kind := 'payment.received';
      v_route := case when new.invoice_id is not null then '/invoice/' || new.invoice_id::text
                      when new.estimate_id is not null then '/estimate/' || new.estimate_id::text
                      else '/notifications' end;
    else
      -- estimate.viewed is off by default (decision 07.11) and waits for the switches (П4); estimate.approved is the
      -- office's own act
      return null;
    end if;
    insert into public.push_outbox (company_id, user_id, notification_id, kind, route)
    select new.company_id, r, new.id, v_kind, v_route
      from app.push_recipients(new.company_id, array['owner', 'admin'], v_author) r
    on conflict (notification_id, user_id) do nothing;
  exception when others then
    -- the push never rolls back what happened (a signature, a payment); the reason goes to the server log only
    raise warning 'push queue: % %', sqlstate, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function app.tg_notification_push() from public, anon, authenticated;
create trigger t90_notification_push after insert on public.notifications
  for each row execute function app.tg_notification_push();

-- Keeping 30 days (pg_cron calls it with П3; until then the operator)
create or replace function app.purge_push_outbox()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.push_outbox where created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function app.purge_push_outbox() from public, anon, authenticated;

-- ---- 3. Account deletion (S22): the body of 20261106210000 plus the person's phones and pushes -----------------------
create or replace function app.erase_personal_rows(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.member_prefs where user_id = p_user;
  delete from public.user_locations where user_id = p_user;
  -- Пуши П1: no phone of a deleted person gets anything again; queued pushes to them go too
  delete from public.push_devices where user_id = p_user;
  delete from public.push_outbox where user_id = p_user;
  -- the owner guard (110000) checks a switched-off owner row as if the role changed; this is the system erasing the
  -- person's own mark, as delete_account's own memberships update does (security-check 7б-2: else the deletion rolls back)
  perform set_config('app.accepting_invite', 'on', true);
  update public.memberships set location_notice_ack_at = null where user_id = p_user and location_notice_ack_at is not null;
  perform set_config('app.accepting_invite', '', true);
end;
$$;
revoke all on function app.erase_personal_rows(uuid) from public, anon, authenticated;
