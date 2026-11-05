-- Visit and Plan, wave П2 (docs/specs/03 §4.1, §7.4; story map S4a, S9a).
-- * public.cancel_visit: one server function for the handoffs S4a / S9a. The office of the visit's company cancels a
--   visit that has not reached the site, with a reason; in the same transaction the lead goes back from "inspection
--   scheduled" to "contacted" when this was its last open inspection, and the job from "scheduled" to "draft"
--   ("waits for a date") when this was its last open visit. Only the visit's own lead / job is touched. A repeat on an
--   already cancelled visit changes nothing (offline queue replay).
-- * The status journal for the old inspection jobs moved by 20261105280000 (that move ran with triggers off).

create or replace function public.cancel_visit(p_visit_id uuid, p_reason text, p_text text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.visits;
  v_company uuid;
  v_lead uuid;
  v_job uuid;
begin
  -- rights first, without a lock and with one answer for "not found" and "not yours" (no existence oracle);
  -- the office of the visit's company: owner, admin, office (docs/specs/03 §8.1; sales does not plan)
  select company_id into v_company from public.visits where id = p_visit_id and deleted_at is null;
  if v_company is null or auth.uid() is null or not app.has_role(v_company, array['owner', 'admin', 'office']) then
    raise exception 'only the office cancels a visit' using errcode = '42501';
  end if;
  select * into v from public.visits where id = p_visit_id and company_id = v_company and deleted_at is null for update;
  -- two cancels at once of the two last visits of one lead / job: lock the parent first, so the second waits and then
  -- sees the first one cancelled (otherwise neither rolls back and the lead stays "inspection scheduled" forever)
  if v.lead_id is not null then
    perform 1 from public.leads where id = v.lead_id and company_id = v.company_id for update;
  end if;
  if v.job_id is not null then
    perform 1 from public.jobs where id = v.job_id and company_id = v.company_id for update;
  end if;
  if v.status in ('cancelled', 'no_show') then
    return jsonb_build_object('status', v.status, 'lead_back', null, 'job_back', null, 'repeat', true);
  end if;
  if v.status not in ('scheduled', 'en_route') then
    raise exception 'a visit on site or finished is not cancelled (status %)', v.status using errcode = 'check_violation';
  end if;
  if p_reason is null or p_reason not in ('client_cancelled', 'no_show', 'reschedule_later', 'we_cancelled', 'other') then
    raise exception 'unknown cancel reason' using errcode = '22023';
  end if;
  if p_reason = 'other' and coalesce(btrim(p_text), '') = '' then
    raise exception 'the reason "other" needs a text' using errcode = '22023';
  end if;

  perform set_config('app.status_reason', p_reason, true);
  update public.visits
     set status = case when p_reason = 'no_show' then 'no_show' else 'cancelled' end,
         cancel_reason = p_reason, cancel_reason_text = nullif(btrim(p_text), '')
   where id = v.id;

  -- S4a: the visit's own lead, only when no other open visit of that lead is left
  if v.lead_id is not null then
    update public.leads l set status = 'contacted'
     where l.id = v.lead_id and l.company_id = v.company_id and l.status = 'inspection_scheduled' and l.deleted_at is null
       and not exists (select 1 from public.visits o
                        where o.lead_id = l.id and o.id <> v.id and o.deleted_at is null
                          and o.status in ('scheduled', 'en_route', 'on_site'))
    returning l.id into v_lead;
  end if;
  -- S9a: the visit's own job, only when no other open visit of that job is left
  if v.job_id is not null then
    update public.jobs j set status = 'draft'
     where j.id = v.job_id and j.company_id = v.company_id and j.status = 'scheduled' and j.deleted_at is null
       and not exists (select 1 from public.visits o
                        where o.job_id = j.id and o.id <> v.id and o.deleted_at is null
                          and o.status in ('scheduled', 'en_route', 'on_site'))
    returning j.id into v_job;
  end if;
  perform set_config('app.status_reason', '', true);

  return jsonb_build_object('status', case when p_reason = 'no_show' then 'no_show' else 'cancelled' end,
                            'lead_back', v_lead, 'job_back', v_job, 'repeat', false);
end;
$$;
revoke all on function public.cancel_visit(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cancel_visit(uuid, text, text) to authenticated;

-- ---- the status journal of the inspection jobs moved by 20261105280000 -----------------------
insert into public.status_events (company_id, entity_type, entity_id, from_status, to_status, actor_type, reason)
select j.company_id, 'job', j.id, j.status, 'deleted', 'system', 'inspection moved to its visit (migration 20261105280000)'
  from public.jobs j
 where j.deleted_at is not null
   -- only the entry the migration wrote itself (same company, no person), once per job
   and exists (select 1 from public.activities a
                where a.subject_type = 'job' and a.subject_id = j.id and a.company_id = j.company_id
                  and a.actor_id is null and a.meta ->> 'event' = 'inspection_job_moved')
   and not exists (select 1 from public.status_events e
                    where e.entity_type = 'job' and e.entity_id = j.id and e.to_status = 'deleted'
                      and e.reason = 'inspection moved to its visit (migration 20261105280000)');

-- ---- «Клиенту сообщили» is the office's, and the time is the server's -------------------------
-- the tech guard of 20261105280000 again, now also refusing customer_notified_at (security check of П2)
create or replace function app.tg_visit_tech_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or app.is_staff(old.company_id) then return new; end if;
  if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
     or new.job_id is distinct from old.job_id or new.lead_id is distinct from old.lead_id
     or new.property_id is distinct from old.property_id
     or new.company_id is distinct from old.company_id or new.kind is distinct from old.kind
     or new.deleted_at is distinct from old.deleted_at
     or new.arrival_window_start is distinct from old.arrival_window_start or new.arrival_window_end is distinct from old.arrival_window_end
     or new.notify_customer is distinct from old.notify_customer or new.customer_notified_at is distinct from old.customer_notified_at
     or new.crew_id is distinct from old.crew_id
     or new.subcontractor_assignment_id is distinct from old.subcontractor_assignment_id or new.schedule_mode is distinct from old.schedule_mode
     or new.flex_week_start is distinct from old.flex_week_start or new.sequence_in_route is distinct from old.sequence_in_route
     or new.cancel_reason is distinct from old.cancel_reason or new.cancel_reason_text is distinct from old.cancel_reason_text
     or new.cancelled_at is distinct from old.cancelled_at or new.cancelled_by is distinct from old.cancelled_by
     or new.legacy_no_property is distinct from old.legacy_no_property then
    raise exception 'only the office changes the time, job or place of a visit' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and new.status in ('cancelled', 'no_show') then
    raise exception 'only the office cancels a visit' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_visit_tech_guard() from public, anon, authenticated;

-- a sent time is ignored: "told the client" is stamped now (a phone clock can be wrong or faked)
create or replace function app.tg_visit_notified_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.customer_notified_at is distinct from old.customer_notified_at and new.customer_notified_at is not null and auth.uid() is not null then
    new.customer_notified_at := now();
  end if;
  return new;
end;
$$;
revoke all on function app.tg_visit_notified_stamp() from public, anon, authenticated;
drop trigger if exists t07_visit_notified_stamp on public.visits;
create trigger t07_visit_notified_stamp before update of customer_notified_at on public.visits
  for each row execute function app.tg_visit_notified_stamp();
