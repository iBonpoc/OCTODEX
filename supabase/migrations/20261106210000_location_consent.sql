-- Wave 7б-2 (docs/specs/03 §12): the person's consent to share their location, and points sent only during their own visit
-- (en route / on site), only while the app is open. LEG-19, CCPA notice, AB 1331 (Ch. 851, 2026).
-- * memberships.location_notice_ack_at — when the person read the notice and said «I agree» (only together with switching on).
-- * app.company_flags.location_sharing — off for every company until the lawyer's answer on AB 1331; the operator switches it on:
--     insert into app.company_flags (company_id, location_sharing) values ('<company id>', true)
--       on conflict (company_id) do update set location_sharing = true, updated_at = now();
-- * public.set_location_consent — only for yourself; public.stop_member_location — the owner/admin switches someone's off.
-- * public.set_share_location (110000) switched sharing on without the notice: it now only switches off (rule 16 — the
--   function goes away in a second step; the app has never called it).
-- * Sharing goes off by itself for a subcontractor, a disabled / deleted member; going off removes the person's points there.
-- * public.user_locations — insert only, by the person on their own open visit; no audit (the journal would keep the
--   coordinates forever), no realtime; kept 30 days (app.purge_user_locations).

-- ---- 1. Columns and the company flag ----
alter table public.memberships add column if not exists location_notice_ack_at timestamptz;
alter table app.company_flags add column if not exists location_sharing boolean not null default false;

-- before: share_location could be on without the notice (set_share_location) — it goes off until the person agrees again
update public.memberships set share_location = false where share_location and location_notice_ack_at is null;

create or replace function app.company_shares_location(p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select f.location_sharing from app.company_flags f where f.company_id = p_company), false);
$$;
revoke all on function app.company_shares_location(uuid) from public, anon, authenticated;

-- the app asks whether to show the location section; a stranger gets false, not an error (no hint about the company)
create or replace function public.company_location_sharing(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_member(p_company_id) and app.company_shares_location(p_company_id);
$$;
revoke all on function public.company_location_sharing(uuid) from public, anon;
grant execute on function public.company_location_sharing(uuid) to authenticated;

-- ---- 2. The consent guard on memberships (its own trigger: tg_membership_guard stays as it is) ----
create or replace function app.tg_membership_location()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- a subcontractor, a disabled or deleted member never shares (instead of failing the table check)
  if new.role = 'subcontractor' or new.status <> 'active' or new.deleted_at is not null then
    new.share_location := false;
  end if;
  -- the notice mark: only the person themselves (the operator and account deletion — auth.uid() is null — may clear it)
  if (case when tg_op = 'INSERT' then new.location_notice_ack_at is not null
           else new.location_notice_ack_at is distinct from old.location_notice_ack_at end)
     and auth.uid() is not null and auth.uid() is distinct from new.user_id then
    raise exception 'only the person answers the location notice' using errcode = '42501';
  end if;
  -- switching on: only the person, no bypass (not for triggers, not for the operator), and only with the notice read now
  if new.share_location and (tg_op = 'INSERT' or not old.share_location) then
    if auth.uid() is null or auth.uid() is distinct from new.user_id then
      raise exception 'only the person switches on sharing their location' using errcode = '42501';
    end if;
    if new.location_notice_ack_at is distinct from now() then
      raise exception 'sharing the location goes on only with the notice' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_membership_location() from public, anon, authenticated;
create trigger t19_membership_location before insert or update on public.memberships
  for each row execute function app.tg_membership_location();

-- ---- 3. Points ----
create table public.user_locations (
  id           uuid primary key default public.uuid_generate_v7(),
  company_id   uuid not null,
  user_id      uuid not null,
  visit_id     uuid not null,
  lat          double precision not null check (lat >= -90 and lat <= 90),
  lng          double precision not null check (lng >= -180 and lng <= 180),
  accuracy_m   real check (accuracy_m is null or (accuracy_m >= 0 and accuracy_m <= 5000)),
  source       text not null default 'foreground' check (source in ('status_change', 'foreground')),
  recorded_at  timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (user_id, visit_id, recorded_at),
  foreign key (company_id, visit_id) references public.visits (company_id, id) on delete cascade,
  foreign key (company_id, user_id) references public.memberships (company_id, user_id) on delete cascade
);
create index user_locations_visit_idx on public.user_locations (company_id, visit_id, recorded_at desc);
create index user_locations_user_idx on public.user_locations (company_id, user_id, recorded_at);
create index user_locations_age_idx on public.user_locations (recorded_at);

alter table public.user_locations enable row level security;
alter table public.user_locations force row level security;
revoke all on table public.user_locations from public, anon, authenticated;
grant select on public.user_locations to authenticated;
-- user_id and company_id come from the trigger, never from the phone
grant insert (visit_id, lat, lng, accuracy_m, source, recorded_at) on public.user_locations to authenticated;

-- Everything about a point is checked in the same transaction. Errors never print coordinates or ids (they reach the phone
-- and the error log). A stale point (older than 5 min, e.g. from an offline phone) and a point within 30 s of the
-- previous one are skipped silently: they are not an attack and must not stall anything.
create or replace function app.tg_user_location_fill()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v     public.visits;
begin
  if v_uid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v from public.visits where id = new.visit_id and deleted_at is null;
  if v.id is null or not exists (
       select 1 from public.visit_assignees a
        where a.company_id = v.company_id and a.visit_id = v.id and a.user_id = v_uid and a.deleted_at is null) then
    raise exception 'no such visit' using errcode = '42501';
  end if;
  if not exists (
       select 1 from public.memberships m
        where m.company_id = v.company_id and m.user_id = v_uid and m.status = 'active' and m.deleted_at is null
          and m.role <> 'subcontractor' and m.share_location and m.location_notice_ack_at is not null)
     or not app.company_shares_location(v.company_id) then
    raise exception 'location sharing is off' using errcode = '42501';
  end if;
  -- ranges here, with our own text: a failed table check would echo the whole row (ids, coordinates) to the phone
  if new.lat is null or new.lng is null or not (new.lat between -90 and 90) or not (new.lng between -180 and 180)
     or (new.accuracy_m is not null and not (new.accuracy_m between 0 and 5000)) then
    raise exception 'not a valid point' using errcode = '22023';
  end if;
  if v.status not in ('en_route', 'on_site') then
    raise exception 'the visit is not under way' using errcode = '22023';
  end if;
  new.recorded_at := coalesce(new.recorded_at, now());
  if new.recorded_at > now() + interval '1 minute' then
    raise exception 'the point is from the future' using errcode = '22023';
  end if;
  if new.recorded_at < now() - interval '5 minutes' then
    return null;
  end if;
  if exists (select 1 from public.user_locations p
              where p.user_id = v_uid and p.visit_id = v.id
                and p.recorded_at > new.recorded_at - interval '30 seconds'
                and p.recorded_at < new.recorded_at + interval '30 seconds') then
    return null;
  end if;
  new.id := public.uuid_generate_v7();
  new.user_id := v_uid;
  new.company_id := v.company_id;
  new.lat := round(new.lat::numeric, 5)::double precision;        -- about 1 m
  new.lng := round(new.lng::numeric, 5)::double precision;
  new.created_at := now();
  return new;
end;
$$;
revoke all on function app.tg_user_location_fill() from public, anon, authenticated;
create trigger t10_user_location_fill before insert on public.user_locations
  for each row execute function app.tg_user_location_fill();
-- a point never moves to another company (T59; nobody may update a point at all, this is the second lock)
create trigger t11_company_id_immutable before update on public.user_locations
  for each row execute function app.tg_company_id_immutable();

-- who reads a point: the person — their own; while they share and the company allows it: office — an open visit, the
-- last 12 hours; owner / admin — 30 days. A tech never sees someone else's points.
create or replace function app.can_read_location(p_company uuid, p_user uuid, p_visit uuid, p_at timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_user = auth.uid() then true
    when not app.company_shares_location(p_company) then false
    when not exists (select 1 from public.memberships m
                      where m.company_id = p_company and m.user_id = p_user and m.share_location
                        and m.status = 'active' and m.deleted_at is null) then false
    when app.has_role(p_company, array['owner', 'admin']) then p_at > now() - interval '30 days'
    when app.has_role(p_company, array['office']) then p_at > now() - interval '12 hours'
      and exists (select 1 from public.visits v where v.company_id = p_company and v.id = p_visit
                     and v.status in ('en_route', 'on_site') and v.deleted_at is null)
    else false
  end;
$$;
revoke all on function app.can_read_location(uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function app.can_read_location(uuid, uuid, uuid, timestamptz) to authenticated;

create policy user_locations_select on public.user_locations for select to authenticated
  using (app.can_read_location(company_id, user_id, visit_id, recorded_at));
create policy user_locations_insert_own on public.user_locations for insert to authenticated
  with check (user_id = (select auth.uid()));
-- the deletes of the functions below (forget on going off, purge from pg_cron, account deletion — often with no
-- auth.uid()) must pass force RLS even if their owner has no BYPASSRLS (supabase/README, not checked on staging);
-- no client has the delete right (T57), so the rule opens nothing to one
-- A delete with a WHERE needs a select rule too: inside these security definer functions current_user is their owner
-- (postgres; pg_cron runs as postgres too), so the server's own paths see and delete; the rules are only for postgres
-- (and roles it is granted to), never a client role
create policy user_locations_select_server on public.user_locations for select to postgres
  using (current_user not in ('authenticated', 'anon'));
create policy user_locations_delete_server on public.user_locations for delete to postgres
  using (current_user not in ('authenticated', 'anon'));
-- a third lock over t11 and the grants: the service role does not edit points either
revoke update on public.user_locations from service_role;

-- ---- 4. Going off removes the points (one path for: the person, the owner/admin, a role change, disabling) ----
create or replace function app.tg_membership_location_forget()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.share_location and not new.share_location then
    delete from public.user_locations where company_id = new.company_id and user_id = new.user_id;
  end if;
  return null;
end;
$$;
revoke all on function app.tg_membership_location_forget() from public, anon, authenticated;
create trigger t95_membership_location_forget after update on public.memberships
  for each row execute function app.tg_membership_location_forget();

-- ---- 5. Functions for the app ----
create or replace function public.set_location_consent(p_company_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_company_id is null or not app.is_member(p_company_id) then
    raise exception 'not on the team' using errcode = '42501';
  end if;
  if coalesce(p_on, false) then
    if not app.company_shares_location(p_company_id) then
      raise exception 'location sharing is off for this company' using errcode = '42501';
    end if;
    if app.has_role(p_company_id, array['subcontractor']) then
      raise exception 'a subcontractor does not share the location' using errcode = '42501';
    end if;
    update public.memberships set share_location = true, location_notice_ack_at = now()
     where company_id = p_company_id and user_id = auth.uid() and status = 'active' and deleted_at is null;
  else
    update public.memberships set share_location = false
     where company_id = p_company_id and user_id = auth.uid() and share_location;
  end if;
end;
$$;
revoke all on function public.set_location_consent(uuid, boolean) from public, anon;
grant execute on function public.set_location_consent(uuid, boolean) to authenticated;

-- 110000 switched sharing on without the notice; now it only switches off (an old build never called it)
create or replace function public.set_share_location(p_company_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(p_on, false) then
    raise exception 'switch on location sharing in the app, after the notice' using errcode = '42501';
  end if;
  perform public.set_location_consent(p_company_id, false);
end;
$$;
revoke all on function public.set_share_location(uuid, boolean) from public, anon;
grant execute on function public.set_share_location(uuid, boolean) to authenticated;

-- the owner / admin switches off someone's sharing (switching on stays the person's own choice); exactly this company
create or replace function public.stop_member_location(p_company_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_company_id is null or p_user_id is null or not app.has_role(p_company_id, array['owner', 'admin'])
     or not exists (select 1 from public.memberships m where m.company_id = p_company_id and m.user_id = p_user_id
                      and (m.role <> 'owner' or app.has_role(p_company_id, array['owner']))) then
    raise exception 'no such member' using errcode = '42501';
  end if;
  update public.memberships set share_location = false
   where company_id = p_company_id and user_id = p_user_id and share_location;
end;
$$;
revoke all on function public.stop_member_location(uuid, uuid) from public, anon;
grant execute on function public.stop_member_location(uuid, uuid) to authenticated;

-- ---- 6. Keeping 30 days (pg_cron calls it with П1b; until then the operator) ----
create or replace function app.purge_user_locations()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.user_locations where recorded_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function app.purge_user_locations() from public, anon, authenticated;

-- ---- 7. Account deletion (S22, «Каркас» 200000): the person's points go everywhere, the notice mark goes ----
-- (the memberships themselves go to «deleted» in delete_account, which switches sharing off by t19)
create or replace function app.erase_personal_rows(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.member_prefs where user_id = p_user;
  delete from public.user_locations where user_id = p_user;
  -- the owner guard (110000) checks a switched-off owner row as if the role changed; this is the system erasing the
  -- person's own mark, as delete_account's own memberships update does (security-check 7б-2: else the deletion rolls back)
  perform set_config('app.accepting_invite', 'on', true);
  update public.memberships set location_notice_ack_at = null where user_id = p_user and location_notice_ack_at is not null;
  perform set_config('app.accepting_invite', '', true);
end;
$$;
revoke all on function app.erase_personal_rows(uuid) from public, anon, authenticated;
