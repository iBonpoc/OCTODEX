-- Пуши П4а (docs/specs/27-push.md §4.7): the kinds without a feed row and the switches by kind.
-- 1. push_outbox: source_id (the visit or the lead of the push) and «one waiting push per (person, kind, source)»;
--    two new kinds: estimate.viewed (the author, off by default) and lead.assigned («a lead is yours now», 14 §9).
-- 2. public.push_prefs — a person's switch of one group of kinds in one company; written only by public.set_push_kind.
--    Checked twice: when queued (not queued) and when sent (push_claim → skipped 'off').
-- 3. Triggers (no HTTP, any error caught — a visit or a lead is never rolled back by a push):
--    visit_assignees (a person put on a visit, or put back) → visit.assigned; visits (the time moved) → visit.rescheduled
--    to everyone on it; leads (a new lead → owner, admin, office and its assignee; assigned_to changed → lead.assigned). The person who did it gets nothing.
-- 4. app.push_still_recipient — the checks at sending time for the new kinds (a subcontractor gets «visits» of his own
--    visits only: director 07.11, §4.7 №3); push_claim — the 'off' check; erase_personal_rows — the switches go too.
-- Nothing is renamed or dropped (rule 16): the kind check is widened (only the server reads the queue).

-- ---- 1. The queue ------------------------------------------------------------------------------------------------------
alter table public.push_outbox add column if not exists source_id uuid;
alter table public.push_outbox drop constraint if exists push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('estimate.client_signed', 'payment.received', 'visit.assigned', 'visit.rescheduled', 'lead.new', 'lead.assigned', 'estimate.viewed'));
-- rule16: small (push_outbox keeps 30 days of rows; the new column is null in all of them)
create unique index if not exists push_outbox_waiting_once on public.push_outbox (user_id, kind, source_id)
  where source_id is not null and status in ('pending', 'sending');

-- ---- 2. The switches ----------------------------------------------------------------------------------------------------
-- groups on the screen: signed · payment · visits (assigned + rescheduled) · leads (new + assigned) · viewed
create or replace function app.push_group(p_kind text)
returns text language sql immutable set search_path = '' as $$
  select case p_kind
    when 'estimate.client_signed' then 'signed'
    when 'payment.received' then 'payment'
    when 'visit.assigned' then 'visits'
    when 'visit.rescheduled' then 'visits'
    when 'lead.new' then 'leads'
    when 'lead.assigned' then 'leads'
    when 'estimate.viewed' then 'viewed'
  end;
$$;
revoke all on function app.push_group(text) from public, anon, authenticated;

create table public.push_prefs (
  company_id  uuid not null,
  user_id     uuid not null,
  kind        text not null check (kind in ('signed', 'payment', 'visits', 'leads', 'viewed')),
  enabled     boolean not null,
  updated_at  timestamptz not null default now(),
  primary key (company_id, user_id, kind),
  foreign key (company_id, user_id) references public.memberships (company_id, user_id) on delete cascade
);
create index push_prefs_user_idx on public.push_prefs (user_id);
-- a switch never moves to another company (T59)
create trigger t11_company_id_immutable before update on public.push_prefs
  for each row execute function app.tg_company_id_immutable();
alter table public.push_prefs enable row level security;
alter table public.push_prefs force row level security;
revoke all on table public.push_prefs from public, anon, authenticated;
grant select (company_id, user_id, kind, enabled, updated_at) on public.push_prefs to authenticated;
create policy push_prefs_select_own on public.push_prefs for select to authenticated
  using (user_id = (select auth.uid()));
-- the functions below run as postgres: under force RLS they work even without BYPASSRLS (as push_devices)
create policy push_prefs_select_server on public.push_prefs for select to postgres
  using (current_user not in ('authenticated', 'anon'));
create policy push_prefs_insert_server on public.push_prefs for insert to postgres
  with check (current_user not in ('authenticated', 'anon'));
create policy push_prefs_update_server on public.push_prefs for update to postgres
  using (current_user not in ('authenticated', 'anon')) with check (current_user not in ('authenticated', 'anon'));
create policy push_prefs_delete_server on public.push_prefs for delete to postgres
  using (current_user not in ('authenticated', 'anon'));

-- Is this kind on for the person in the company? No row → the default: on, except «the client opened the estimate».
create or replace function app.push_enabled(p_company uuid, p_user uuid, p_kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.enabled from public.push_prefs p
                    where p.company_id = p_company and p.user_id = p_user and p.kind = app.push_group(p_kind)),
                  app.push_group(p_kind) is distinct from 'viewed');
$$;
revoke all on function app.push_enabled(uuid, uuid, text) from public, anon, authenticated;

-- An active member of the company (any role: a subcontractor too — the callers decide who), not deleted, the company
-- not closed.
create or replace function app.push_member(p_company uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not app.company_closed(p_company)
     and exists (select 1 from public.memberships m join public.users u on u.id = m.user_id and u.deleted_at is null
                  where m.company_id = p_company and m.user_id = p_user and m.status = 'active' and m.deleted_at is null);
$$;
revoke all on function app.push_member(uuid, uuid) from public, anon, authenticated;

-- A switch of my own, in a company where I am an active member. Returns the group as stored.
create or replace function public.set_push_kind(p_company_id uuid, p_kind text, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  -- app.push_member (security definer) reads memberships past their RLS: the check holds even without BYPASSRLS (T85)
  if v_uid is null or p_company_id is null or not app.push_member(p_company_id, v_uid) then
    raise exception 'only a member sets their own notifications' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('signed', 'payment', 'visits', 'leads', 'viewed') or p_enabled is null then
    raise exception 'unknown notification kind' using errcode = '22023';
  end if;
  insert into public.push_prefs (company_id, user_id, kind, enabled)
  values (p_company_id, v_uid, p_kind, p_enabled)
  on conflict (company_id, user_id, kind) do update set enabled = excluded.enabled, updated_at = now();
  return jsonb_build_object('kind', p_kind, 'enabled', p_enabled);
end;
$$;
revoke all on function public.set_push_kind(uuid, text, boolean) from public, anon;
grant execute on function public.set_push_kind(uuid, text, boolean) to authenticated;

-- ---- 3. Putting a push in the queue -------------------------------------------------------------------------------------
-- Into the queue: an active member (app.push_member), not the person who did it, the kind switched on.

create or replace function app.push_enqueue(p_company uuid, p_user uuid, p_kind text, p_route text, p_source uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_user = auth.uid() or not app.push_member(p_company, p_user) or not app.push_enabled(p_company, p_user, p_kind) then
    return;
  end if;
  insert into public.push_outbox (company_id, user_id, kind, route, source_id)
  values (p_company, p_user, p_kind, p_route, p_source)
  on conflict (user_id, kind, source_id) where source_id is not null and status in ('pending', 'sending') do nothing;
end;
$$;
revoke all on function app.push_enqueue(uuid, uuid, text, text, uuid) from public, anon, authenticated;

-- the role of a person in the company (null — not an active member)
create or replace function app.push_role(p_company uuid, p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
   where m.company_id = p_company and m.user_id = p_user and m.status = 'active' and m.deleted_at is null limit 1;
$$;
revoke all on function app.push_role(uuid, uuid) from public, anon, authenticated;

-- 3а. Visits: a person put on a visit (a new row, or put back: deleted_at → null — assign_visit does that by update)
create or replace function app.tg_visit_assignee_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v public.visits;
begin
  begin
    if new.deleted_at is not null or (tg_op = 'UPDATE' and old.deleted_at is null) then
      return null;
    end if;
    select * into v from public.visits where id = new.visit_id and company_id = new.company_id;
    if v.id is null or v.deleted_at is not null or v.status not in ('scheduled', 'en_route') then
      return null;
    end if;
    perform app.push_enqueue(new.company_id, new.user_id, 'visit.assigned', '/visit/' || v.id::text, v.id);
  exception when others then
    raise warning 'push queue: % %', sqlstate, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function app.tg_visit_assignee_push() from public, anon, authenticated;
create trigger t90_visit_assignee_push after insert or update of deleted_at on public.visit_assignees
  for each row execute function app.tg_visit_assignee_push();

-- 3б. Visits: the time moved (after update: t03 sets all_day right before). A repeat with the same values (an offline
-- queue) changes nothing → no push. Nobody already waiting for «visit assigned» of it gets a second push.
create or replace function app.tg_visit_time_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  begin
    if new.deleted_at is not null or new.status not in ('scheduled', 'en_route') then
      return null;
    end if;
    if new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at
       and new.all_day is not distinct from old.all_day and new.schedule_mode is not distinct from old.schedule_mode
       and new.flex_week_start is not distinct from old.flex_week_start
       and new.arrival_window_start is not distinct from old.arrival_window_start
       and new.arrival_window_end is not distinct from old.arrival_window_end then
      return null;
    end if;
    for r in select a.user_id from public.visit_assignees a
              where a.visit_id = new.id and a.company_id = new.company_id and a.deleted_at is null loop
      if not exists (select 1 from public.push_outbox o
                      where o.user_id = r.user_id and o.kind = 'visit.assigned' and o.source_id = new.id
                        and o.status in ('pending', 'sending')) then
        perform app.push_enqueue(new.company_id, r.user_id, 'visit.rescheduled', '/visit/' || new.id::text, new.id);
      end if;
    end loop;
  exception when others then
    raise warning 'push queue: % %', sqlstate, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function app.tg_visit_time_push() from public, anon, authenticated;
create trigger t90_visit_time_push after update on public.visits
  for each row execute function app.tg_visit_time_push();

-- 3в. Leads. Open: not won / lost / declined / archived, not archived or deleted.
create or replace function app.push_lead_open(p public.leads)
returns boolean language sql immutable set search_path = '' as $$
  select p.status in ('new', 'contacted', 'qualified', 'inspection_scheduled', 'estimate_sent')
     and p.archived_at is null and p.deleted_at is null;
$$;
revoke all on function app.push_lead_open(public.leads) from public, anon, authenticated;

create or replace function app.tg_lead_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r uuid;
begin
  begin
    if not app.push_lead_open(new) then
      return null;
    end if;
    if tg_op = 'INSERT' then
      -- everyone who handles the flow (owner, admin, office) and the assignee — not only a busy owner (director 07.11,
      -- §4.7 variant 2: the speed of the answer matters most, 14 §9); each switches «leads» off for himself if too much.
      -- The app gives a new lead to the owner (founder 04.11): the assignment itself does not change here.
      for r in select app.push_recipients(new.company_id, array['owner', 'admin', 'office'],
                                          case when app.push_role(new.company_id, new.assigned_to) is distinct from 'subcontractor'
                                               then new.assigned_to end) loop
        perform app.push_enqueue(new.company_id, r, 'lead.new', '/lead/' || new.id::text, new.id);
      end loop;
    elsif new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null
          and app.push_role(new.company_id, new.assigned_to) is distinct from 'subcontractor' then
      perform app.push_enqueue(new.company_id, new.assigned_to, 'lead.assigned', '/lead/' || new.id::text, new.id);
    end if;
  exception when others then
    raise warning 'push queue: % %', sqlstate, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function app.tg_lead_push() from public, anon, authenticated;
create trigger t90_lead_push after insert or update of assigned_to on public.leads
  for each row execute function app.tg_lead_push();

-- 3г. The feed rows (body of 20261107090000) plus: the switches, and «the client opened the estimate» → its author
create or replace function app.tg_notification_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_kind   text;
  v_route  text;
  v_author uuid;
  v_roles  text[] := array['owner', 'admin'];
begin
  begin
    if new.kind in ('estimate.client_signed', 'estimate.viewed') and new.estimate_id is not null then
      v_kind := new.kind;
      v_route := '/estimate/' || new.estimate_id::text;
      select e.owner_user_id into v_author from public.estimates e where e.id = new.estimate_id and e.company_id = new.company_id;
      if new.kind = 'estimate.viewed' then
        -- only the author, and only if they switched it on (off by default, §4.7 №7)
        v_roles := array[]::text[];
        if v_author is null then
          return null;
        end if;
      end if;
    elsif new.kind in ('deposit.paid', 'invoice.paid') then
      v_kind := 'payment.received';
      v_route := case when new.invoice_id is not null then '/invoice/' || new.invoice_id::text
                      when new.estimate_id is not null then '/estimate/' || new.estimate_id::text
                      else '/notifications' end;
    else
      -- estimate.approved is the office's own act
      return null;
    end if;
    insert into public.push_outbox (company_id, user_id, notification_id, kind, route)
    select new.company_id, r, new.id, v_kind, v_route
      from app.push_recipients(new.company_id, v_roles, v_author) r
     where app.push_enabled(new.company_id, r, v_kind)
    on conflict (notification_id, user_id) do nothing;
  exception when others then
    -- the push never rolls back what happened (a signature, a payment); the reason goes to the server log only
    raise warning 'push queue: % %', sqlstate, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function app.tg_notification_push() from public, anon, authenticated;

-- ---- 4. At sending time ------------------------------------------------------------------------------------------------
-- The body of 20261107100000 plus the kinds of П4. A subcontractor gets «visits» of the visits he is on — never leads,
-- signatures or money (app.push_recipients excludes him for those).
create or replace function app.push_still_recipient(p_row public.push_outbox)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_author uuid;
  v_lead   public.leads;
  v_role   text;
begin
  if app.company_closed(p_row.company_id) then
    return false;
  end if;
  if p_row.kind in ('estimate.client_signed', 'estimate.viewed') then
    select e.owner_user_id into v_author
      from public.notifications n join public.estimates e on e.id = n.estimate_id and e.company_id = n.company_id
     where n.id = p_row.notification_id;
    return p_row.user_id in (select app.push_recipients(p_row.company_id,
             case when p_row.kind = 'estimate.viewed' then array[]::text[] else array['owner', 'admin'] end, v_author));
  elsif p_row.kind = 'payment.received' then
    return p_row.user_id in (select app.push_recipients(p_row.company_id, array['owner', 'admin'], null));
  elsif p_row.kind in ('visit.assigned', 'visit.rescheduled') then
    -- still on the visit, and the visit still ahead
    return app.push_member(p_row.company_id, p_row.user_id)
       and exists (select 1 from public.visit_assignees a join public.visits v on v.id = a.visit_id and v.company_id = a.company_id
                    where a.visit_id = p_row.source_id and a.user_id = p_row.user_id and a.company_id = p_row.company_id
                      and a.deleted_at is null and v.deleted_at is null and v.status in ('scheduled', 'en_route'));
  elsif p_row.kind in ('lead.new', 'lead.assigned') then
    v_role := app.push_role(p_row.company_id, p_row.user_id);
    if v_role is null or v_role = 'subcontractor' or not app.push_member(p_row.company_id, p_row.user_id) then
      return false;
    end if;
    select * into v_lead from public.leads l where l.id = p_row.source_id and l.company_id = p_row.company_id;
    if v_lead.id is null or not app.push_lead_open(v_lead) then
      return false;
    end if;
    -- «assigned to you»: still theirs; «new lead»: still theirs, or they handle the flow (owner, admin, office)
    return v_lead.assigned_to = p_row.user_id or (p_row.kind = 'lead.new' and v_role in ('owner', 'admin', 'office'));
  end if;
  return false;
end;
$$;
revoke all on function app.push_still_recipient(public.push_outbox) from public, anon, authenticated;

-- push_claim: the body of 20261107100000 plus the switch (skipped 'off')
create or replace function public.push_claim(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r       public.push_outbox;
  v_dev   jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  -- stuck in «sending» (the function died): back to the queue; with no tries left — failed
  update public.push_outbox
     set status = case when tries >= app.push_max_tries() then 'failed' else 'pending' end,
         error = case when tries >= app.push_max_tries() then 'stuck' else error end,
         next_try_at = now()
   where status = 'sending' and next_try_at < now() - interval '10 minutes';
  -- yesterday's payment is noise: a row older than 24 h is not sent
  update public.push_outbox set status = 'skipped', error = 'expired'
   where status = 'pending' and created_at < now() - interval '24 hours';

  for r in
    select * from public.push_outbox
     where status = 'pending' and next_try_at <= now()
     order by next_try_at, id
     limit v_limit
     for update skip locked
  loop
    -- the person switched this kind off after it was queued (П4)
    if not app.push_enabled(r.company_id, r.user_id, r.kind) then
      update public.push_outbox set status = 'skipped', error = 'off' where id = r.id;
      continue;
    end if;
    if not app.push_still_recipient(r) then
      update public.push_outbox set status = 'skipped', error = 'not_member' where id = r.id;
      continue;
    end if;
    -- the phones NOW: after a phone was handed over, the old owner's pushes never reach it
    select jsonb_agg(jsonb_build_object('device_id', d.id, 'token', d.expo_token, 'lang', d.lang) order by d.last_seen_at desc)
      into v_dev
      from public.push_devices d
     where d.user_id = r.user_id and d.revoked_at is null
       -- a retry goes only to the phones it did not reach (security-check #287 №3): a phone with a ticket of this row
       -- already got it
       and not exists (select 1 from public.push_tickets t where t.outbox_id = r.id and t.device_id = d.id);
    if v_dev is null then
      if exists (select 1 from public.push_tickets t where t.outbox_id = r.id) then
        -- every live phone got it on an earlier try
        update public.push_outbox
           set status = 'sent', sent_at = now(), error = null,
               ticket_ids = (select array_agg(ticket_id order by ticket_id) from public.push_tickets where outbox_id = r.id)
         where id = r.id;
      else
        update public.push_outbox set status = 'skipped', error = 'no_device' where id = r.id;
      end if;
      continue;
    end if;
    update public.push_outbox set status = 'sending', tries = tries + 1, next_try_at = now(), error = null where id = r.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', r.id, 'kind', r.kind, 'route', r.route, 'devices', v_dev));
  end loop;
  return v_out;
end;
$$;
revoke all on function public.push_claim(integer) from public, anon, authenticated;
grant execute on function public.push_claim(integer) to service_role;

-- ---- 5. Account deletion (S22): the body of 20261107090000 plus the switches -----------------------------------------
create or replace function app.erase_personal_rows(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.member_prefs where user_id = p_user;
  delete from public.user_locations where user_id = p_user;
  -- Пуши П1: no phone of a deleted person gets anything again; queued pushes to them go too
  -- the lock of register_push_device: a registration running now finishes first, a later one sees the account deleted
  perform pg_advisory_xact_lock(hashtext('push_devices:' || p_user::text));
  delete from public.push_devices where user_id = p_user;
  delete from public.push_outbox where user_id = p_user;
  -- Пуши П4: the person's switches go too
  delete from public.push_prefs where user_id = p_user;
  -- the deletion must really have erased them (security-check П1 №2): else the whole account deletion rolls back
  if exists (select 1 from public.push_devices where user_id = p_user) or exists (select 1 from public.push_outbox where user_id = p_user)
     or exists (select 1 from public.push_prefs where user_id = p_user) then
    raise exception 'push rows of the person were not erased' using errcode = '42501';
  end if;
  -- the owner guard (110000) checks a switched-off owner row as if the role changed; this is the system erasing the
  -- person's own mark, as delete_account's own memberships update does (security-check 7б-2: else the deletion rolls back)
  perform set_config('app.accepting_invite', 'on', true);
  update public.memberships set location_notice_ack_at = null where user_id = p_user and location_notice_ack_at is not null;
  perform set_config('app.accepting_invite', '', true);
end;
$$;
revoke all on function app.erase_personal_rows(uuid) from public, anon, authenticated;
