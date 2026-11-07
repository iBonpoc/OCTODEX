-- Пуши П4, напоминания о лиде без ответа (docs/specs/27-push.md §4.9–4.10; 14 §9, Р3; основатель 07.11: «вариант 3»).
-- * lead.reminder — the assignee, 15 min after the lead came (or after it was given to him) and still no answer;
--   lead.escalation — the owner, after 60 min, when someone else (or nobody) holds it. Not to the person who added the
--   lead. Once per (lead, kind, person). Leads older than 24 h are left alone.
-- * Only in the company's working hours (companies.business_hours in companies.timezone; missing — Mon–Sat 8:00–18:00,
--   as the app): a lead at 17:55 reminds at 8:00 next working day (director 07.11, §4.9 №4); checked again at sending.
-- * Its own pg_cron job «push-lead-reminders» every minute (spec §4.9 variant Б, security-check #305 №3): its own
--   transaction and statement_timeout, so a slow or broken reminder never stops push_claim (payments, signatures); every
--   lead in its own sub-transaction, so one bad lead never stops the others. The time is a parameter (CHECKS §9 №1).
-- * The candidates are chosen in SQL: only leads that still have something to send, at most 20 per company and 500 in all
--   per minute, newest first (security-check #305 №1). Indexes — 20261107120100 (concurrently, rule 16).
-- * The kind check of push_outbox is widened (rule 16: only the server reads the queue): not valid, then validate.

alter table public.push_outbox drop constraint if exists push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('estimate.client_signed', 'payment.received', 'visit.assigned', 'visit.rescheduled', 'lead.new', 'lead.assigned',
                  'estimate.viewed', 'lead.reminder', 'lead.escalation')) not valid;
alter table public.push_outbox validate constraint push_outbox_kind_check;

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

-- Put the due reminders in the queue; returns how many candidates it looked at. Run by pg_cron (its own job), as postgres.
create or replace function app.push_lead_reminders(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = '' set statement_timeout = '10s' as $$
declare
  c record;
  n integer := 0;
begin
  for c in
    with due as (
      -- 15 min: the assignee — not the author, not a subcontractor, not given to him less than 15 min ago
      select l.id, l.company_id, l.received_at, l.assigned_to as user_id, 'lead.reminder'::text as kind
        from public.leads l
       where l.status = 'new' and l.first_response_at is null and l.deleted_at is null and l.archived_at is null
         and l.received_at <= p_now - interval '15 minutes' and l.received_at > p_now - interval '24 hours'
         and l.assigned_to is not null and l.assigned_to is distinct from l.created_by
         and not exists (select 1 from public.push_outbox o where o.source_id = l.id and o.kind = 'lead.reminder' and o.user_id = l.assigned_to)
         and not exists (select 1 from public.push_outbox o where o.source_id = l.id and o.kind = 'lead.assigned' and o.user_id = l.assigned_to
                           and o.created_at > p_now - interval '15 minutes')
      union all
      -- 60 min: every owner, when someone else (or nobody) holds it and he did not add it himself
      select l.id, l.company_id, l.received_at, m.user_id, 'lead.escalation'
        from public.leads l
        join public.memberships m on m.company_id = l.company_id and m.role = 'owner' and m.status = 'active' and m.deleted_at is null
       where l.status = 'new' and l.first_response_at is null and l.deleted_at is null and l.archived_at is null
         and l.received_at <= p_now - interval '60 minutes' and l.received_at > p_now - interval '24 hours'
         and m.user_id is distinct from l.assigned_to and m.user_id is distinct from l.created_by
         and not exists (select 1 from public.push_outbox o where o.source_id = l.id and o.kind = 'lead.escalation' and o.user_id = m.user_id)
    ), open_now as (
      select d.*, row_number() over (partition by d.company_id order by d.received_at desc) as k
        from due d
       where app.push_in_hours(d.company_id, p_now)
    )
    select * from open_now where k <= 20 order by received_at desc limit 500
  loop
    n := n + 1;
    begin
      if app.push_role(c.company_id, c.user_id) is distinct from 'subcontractor' then
        perform app.push_enqueue(c.company_id, c.user_id, c.kind, '/lead/' || c.id::text, c.id);
      end if;
    exception when others then
      -- one bad lead never stops the others; the reason goes to the server log (sqlstate only)
      raise warning 'push reminder: %', sqlstate;
    end;
  end loop;
  return n;
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
    if v_lead.id is null or not app.push_lead_unanswered(v_lead) or not app.push_in_hours(p_row.company_id, now()) then
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

-- Its own schedule, only where pg_cron exists (not in the local test database); a repeat makes no second one
do $$
begin
  if to_regnamespace('cron') is not null then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = $1' using 'push-lead-reminders';
    execute $q$select cron.schedule('push-lead-reminders', '* * * * *', 'select app.push_lead_reminders()')$q$;
  end if;
end;
$$;
