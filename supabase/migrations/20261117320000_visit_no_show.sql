-- #2066 «Клиента нет дома»: the visit's own tech marks it at the door (docs/specs/03 §4.1, story map §5).
-- Before: only the office could set no_show (public.cancel_visit, owner / admin / office, from scheduled / en_route) —
-- the tech standing at a locked door (on_site) had no way to close the visit, and the office learned it by phone.
-- Now public.visit_no_show: the visit's assignee (a tech, or sales on their own inspection) or the office, from
-- scheduled / en_route / on_site before the work started; the same roll-backs as a cancel (S4a lead, S9a job).
-- Who and when: cancelled_by / cancelled_at, stamped by t06_visit_cancel_stamp as for any cancel. Nothing is dropped
-- or renamed (rule 16): public.cancel_visit stays as it is; the two guards learn the marker this function sets.

-- ---- the transition ------------------------------------------------------------------------------------------------
-- on_site → no_show: the tech came, the door stayed shut. in_progress → draft: reaching «on site» started the job
-- (20261106045000); a no-show of the job's only visit, before any work, puts the job back to «waits for a date» (S9a).
insert into app.status_transitions (entity_type, from_status, to_status) values
  ('visit', 'on_site', 'no_show'),
  ('job', 'in_progress', 'draft')
on conflict do nothing;

-- ---- the function --------------------------------------------------------------------------------------------------
create or replace function public.visit_no_show(p_visit_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.visits;
  v_company uuid;
  v_lead uuid;
  v_job uuid;
begin
  -- rights first, without a lock, with one answer for "not found" and "not yours" (no existence oracle):
  -- the office of the visit's company, or a person on this very visit (tech; sales on an inspection they are on)
  select company_id into v_company from public.visits where id = p_visit_id and deleted_at is null;
  if v_company is null or auth.uid() is null
     or not (app.has_role(v_company, array['owner', 'admin', 'office'])
             or (app.has_role(v_company, array['tech', 'sales']) and app.is_visit_assignee(p_visit_id))) then
    raise exception 'visit not found' using errcode = 'P0002';
  end if;
  select * into v from public.visits where id = p_visit_id and company_id = v_company and deleted_at is null for update;
  -- the parent first, as in cancel_visit: two last visits closed at once must both see the other one
  if v.lead_id is not null then
    perform 1 from public.leads where id = v.lead_id and company_id = v.company_id for update;
  end if;
  if v.job_id is not null then
    perform 1 from public.jobs where id = v.job_id and company_id = v.company_id for update;
  end if;
  -- a repeat from the offline queue (or the office cancelled it meanwhile): answered, nothing changes
  if v.status in ('cancelled', 'no_show') then
    return jsonb_build_object('status', v.status, 'lead_back', null, 'job_back', null, 'repeat', true);
  end if;
  -- at the door: before the work started, before a signature (after that the client was there)
  if v.status not in ('scheduled', 'en_route', 'on_site') or v.work_started_at is not null or v.signed_at is not null then
    raise exception 'the client was there: a visit at work or finished is not a no-show (status %)', v.status using errcode = 'check_violation';
  end if;

  perform set_config('app.status_reason', 'no_show', true);
  perform set_config('app.cancelling_visit', v.id::text, true);
  update public.visits
     set status = 'no_show', cancel_reason = 'no_show', cancel_reason_text = nullif(left(btrim(coalesce(p_note, '')), 2000), '')
   where id = v.id;
  perform set_config('app.cancelling_visit', '', true);

  -- S4a: the visit's own lead, only when no other open visit of that lead is left
  if v.lead_id is not null then
    update public.leads l set status = 'contacted'
     where l.id = v.lead_id and l.company_id = v.company_id and l.status = 'inspection_scheduled' and l.deleted_at is null
       and not exists (select 1 from public.visits o
                        where o.lead_id = l.id and o.id <> v.id and o.deleted_at is null
                          and o.status in ('scheduled', 'en_route', 'on_site'))
    returning l.id into v_lead;
  end if;
  -- S9a: the visit's own job, only when no other open visit of that job is left. «In progress» only because this visit
  -- reached «on site»: back too, unless another visit of the job was worked or finished (a multi-day job keeps going)
  if v.job_id is not null then
    update public.jobs j set status = 'draft'
     where j.id = v.job_id and j.company_id = v.company_id and j.deleted_at is null
       and (j.status = 'scheduled'
            or (j.status = 'in_progress'
                and not exists (select 1 from public.visits w
                                 where w.job_id = j.id and w.id <> v.id and w.deleted_at is null
                                   and (w.status = 'completed' or w.work_started_at is not null or w.signed_at is not null))))
       and not exists (select 1 from public.visits o
                        where o.job_id = j.id and o.id <> v.id and o.deleted_at is null
                          and o.status in ('scheduled', 'en_route', 'on_site'))
    returning j.id into v_job;
  end if;
  perform set_config('app.status_reason', '', true);

  return jsonb_build_object('status', 'no_show', 'lead_back', v_lead, 'job_back', v_job, 'repeat', false);
end;
$$;
revoke all on function public.visit_no_show(uuid, text) from public, anon, authenticated;
grant execute on function public.visit_no_show(uuid, text) to authenticated;

-- ---- the tech guard: the marker of a server function lets the no-show through ---------------------------------------
-- As in 20261108140000, plus the first check: inside public.cancel_visit / public.visit_no_show (they run as their owner,
-- never as authenticated / anon, and mark this very visit) the status, the reason and the stamps are the function's.
-- A direct update by a tech still meets every check below.
create or replace function app.tg_visit_tech_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or app.is_staff(old.company_id) then return new; end if;
  if current_user not in ('authenticated', 'anon') and coalesce(current_setting('app.cancelling_visit', true), '') = new.id::text
     and new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at
     and new.job_id is not distinct from old.job_id and new.lead_id is not distinct from old.lead_id
     and new.property_id is not distinct from old.property_id and new.company_id is not distinct from old.company_id
     and new.kind is not distinct from old.kind and new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;
  if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
     or new.all_day is distinct from old.all_day
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
     or new.legacy_no_property is distinct from old.legacy_no_property
     or new.checklist_reviewed_at is distinct from old.checklist_reviewed_at
     or new.checklist_reviewed_by is distinct from old.checklist_reviewed_by then
    raise exception 'only the office changes the time, job or place of a visit' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and new.status in ('cancelled', 'no_show') then
    raise exception 'only the office cancels a visit' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_visit_tech_guard() from public, anon, authenticated;
