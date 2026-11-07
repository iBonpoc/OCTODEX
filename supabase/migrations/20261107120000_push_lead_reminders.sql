-- Пуши П4, напоминания о лиде без ответа (docs/specs/27-push.md §4.9; 14 §9, Р3; основатель 07.11: «вариант 3»).
-- * lead.reminder — the assignee, 15 min after the lead came and still no answer; lead.escalation — the owner, after
--   60 min, when someone else (or nobody) holds it. Not to the person who added the lead. Once per (lead, kind, person).
-- * Only in the company's working hours (companies.business_hours in companies.timezone; missing — Mon–Sat 8:00–18:00,
--   as the app): a lead at 17:55 reminds at 8:00 next working day (director 07.11, §4.9 №4).
-- * No new schedule: push_claim (woken by pg_cron every minute) calls app.push_lead_reminders(now()) first. The time is a
--   parameter, so tests never depend on the real hour (CHECKS §9 №1).
-- * The kind check of push_outbox is widened (rule 16: only the server reads the queue); the group «leads» covers both.

alter table public.push_outbox drop constraint if exists push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('estimate.client_signed', 'payment.received', 'visit.assigned', 'visit.rescheduled', 'lead.new', 'lead.assigned',
                  'estimate.viewed', 'lead.reminder', 'lead.escalation'));

-- the groups on the screen (body of 20261107110000 plus the two kinds)
create or replace function app.push_group(p_kind text)
returns text language sql immutable set search_path = '' as $$
  select case p_kind
    when 'estimate.client_signed' then 'signed'
    when 'payment.received' then 'payment'
    when 'visit.assigned' then 'visits'
    when 'visit.rescheduled' then 'visits'
    when 'lead.new' then 'leads'
    when 'lead.assigned' then 'leads'
    when 'lead.reminder' then 'leads'
    when 'lead.escalation' then 'leads'
    when 'estimate.viewed' then 'viewed'
  end;
$$;
revoke all on function app.push_group(text) from public, anon, authenticated;

-- «Without an answer»: still new, nobody wrote or called (first_response_at — tg_lead_first_response), open
create or replace function app.push_lead_unanswered(p public.leads)
returns boolean language sql immutable set search_path = '' as $$
  select p.status = 'new' and p.first_response_at is null and p.archived_at is null and p.deleted_at is null;
$$;
revoke all on function app.push_lead_unanswered(public.leads) from public, anon, authenticated;

-- Is p_at inside the company's working hours? {"mon": [480, 1080], …, "sun": null}: minutes from midnight, [start, end);
-- null for a day — closed; a missing day or the whole column — the default of the app (Mon–Sat 8:00–18:00, Sun closed).
create or replace function app.push_in_hours(p_company uuid, p_at timestamptz)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz    text;
  v_hours jsonb;
  v_local timestamp;
  v_key   text;
  v_day   jsonb;
  v_min   integer;
begin
  select c.timezone, c.business_hours into v_tz, v_hours from public.companies c where c.id = p_company;
  begin
    v_local := p_at at time zone coalesce(v_tz, 'America/Los_Angeles');
  exception when others then
    v_local := p_at at time zone 'America/Los_Angeles';
  end;
  v_key := (array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])[extract(dow from v_local)::int + 1];
  if v_hours is not null and v_hours ? v_key then
    v_day := v_hours -> v_key;
  else
    v_day := case when v_key = 'sun' then 'null'::jsonb else '[480, 1080]'::jsonb end;
  end if;
  if v_day is null or jsonb_typeof(v_day) <> 'array' then
    return false;
  end if;
  v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  return v_min >= (v_day ->> 0)::int and v_min < (v_day ->> 1)::int;
end;
$$;
revoke all on function app.push_in_hours(uuid, timestamptz) from public, anon, authenticated;

-- Put the due reminders in the queue. Returns how many rows went in. Leads older than 24 h are left alone (the queue
-- would skip them as expired anyway).
create or replace function app.push_lead_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare
  l     public.leads;
  r     uuid;
  n     integer := 0;
  v_cnt integer;
begin
  for l in
    select * from public.leads x
     where x.status = 'new' and x.first_response_at is null and x.deleted_at is null and x.archived_at is null
       and x.received_at <= p_now - interval '15 minutes' and x.received_at > p_now - interval '24 hours'
     order by x.received_at
     limit 500
  loop
    if not app.push_lead_unanswered(l) or not app.push_in_hours(l.company_id, p_now) then
      continue;
    end if;
    -- 15 min: the assignee, unless he added it himself (a lead written down after a call is not «without an answer»)
    if l.assigned_to is not null and l.assigned_to is distinct from l.created_by
       and app.push_role(l.company_id, l.assigned_to) is distinct from 'subcontractor'
       and not exists (select 1 from public.push_outbox o where o.user_id = l.assigned_to and o.kind = 'lead.reminder' and o.source_id = l.id) then
      select count(*) into v_cnt from public.push_outbox where source_id = l.id;
      perform app.push_enqueue(l.company_id, l.assigned_to, 'lead.reminder', '/lead/' || l.id::text, l.id);
      n := n + (select count(*) from public.push_outbox where source_id = l.id) - v_cnt;
    end if;
    -- 60 min: the owner, when someone else (or nobody) holds it and he did not add it himself
    if l.received_at <= p_now - interval '60 minutes' then
      for r in select m.user_id from public.memberships m
                where m.company_id = l.company_id and m.role = 'owner' and m.status = 'active' and m.deleted_at is null loop
        if r is distinct from l.assigned_to and r is distinct from l.created_by
           and not exists (select 1 from public.push_outbox o where o.user_id = r and o.kind = 'lead.escalation' and o.source_id = l.id) then
          select count(*) into v_cnt from public.push_outbox where source_id = l.id;
          perform app.push_enqueue(l.company_id, r, 'lead.escalation', '/lead/' || l.id::text, l.id);
          n := n + (select count(*) from public.push_outbox where source_id = l.id) - v_cnt;
        end if;
      end loop;
    end if;
  end loop;
  return n;
exception when others then
  -- a reminder never stops the sending of the queue (what this call put in is rolled back with it)
  raise warning 'push reminders: %', sqlstate;
  return 0;
end;
$$;
revoke all on function app.push_lead_reminders(timestamptz) from public, anon, authenticated;

-- at sending time (body of 20261107110000 plus the two kinds)
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
    -- still on the visit, and the visit still ahead; not a subcontractor (he cannot open the visit yet, §4.8)
    return app.push_member(p_row.company_id, p_row.user_id)
       and app.push_role(p_row.company_id, p_row.user_id) is distinct from 'subcontractor'
       and exists (select 1 from public.visit_assignees a join public.visits v on v.id = a.visit_id and v.company_id = a.company_id
                    where a.visit_id = p_row.source_id and a.user_id = p_row.user_id and a.company_id = p_row.company_id
                      and a.deleted_at is null and v.deleted_at is null and v.status in ('scheduled', 'en_route'));
  elsif p_row.kind in ('lead.reminder', 'lead.escalation') then
    -- still without an answer; the reminder — still the assignee's; the escalation — an owner, and someone else holds it
    v_role := app.push_role(p_row.company_id, p_row.user_id);
    if v_role is null or v_role = 'subcontractor' or not app.push_member(p_row.company_id, p_row.user_id) then
      return false;
    end if;
    select * into v_lead from public.leads l where l.id = p_row.source_id and l.company_id = p_row.company_id;
    if v_lead.id is null or not app.push_lead_unanswered(v_lead) then
      return false;
    end if;
    return case when p_row.kind = 'lead.reminder' then v_lead.assigned_to = p_row.user_id
                else v_role = 'owner' and v_lead.assigned_to is distinct from p_row.user_id end;
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

-- push_claim: the body of 20261107110000 plus the reminders first
create or replace function public.push_claim(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r       public.push_outbox;
  v_dev   jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  -- Пуши П4 §4.9: reminders of leads without an answer are put in the queue first (the same pg_cron minute)
  perform app.push_lead_reminders(now());
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
