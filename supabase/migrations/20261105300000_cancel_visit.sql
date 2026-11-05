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
  v_lead uuid;
  v_job uuid;
begin
  select * into v from public.visits where id = p_visit_id and deleted_at is null for update;
  if not found then
    raise exception 'visit not found' using errcode = 'no_data_found';
  end if;
  if auth.uid() is null or not app.is_staff(v.company_id) then
    raise exception 'only the office cancels a visit' using errcode = '42501';
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
     where l.id = v.lead_id and l.company_id = v.company_id and l.status = 'inspection_scheduled'
       and not exists (select 1 from public.visits o
                        where o.lead_id = l.id and o.id <> v.id and o.deleted_at is null
                          and o.status in ('scheduled', 'en_route', 'on_site'))
    returning l.id into v_lead;
  end if;
  -- S9a: the visit's own job, only when no other open visit of that job is left
  if v.job_id is not null then
    update public.jobs j set status = 'draft'
     where j.id = v.job_id and j.company_id = v.company_id and j.status = 'scheduled'
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
  join public.activities a on a.subject_type = 'job' and a.subject_id = j.id and a.meta ->> 'event' = 'inspection_job_moved'
 where j.deleted_at is not null
   and not exists (select 1 from public.status_events e
                    where e.entity_type = 'job' and e.entity_id = j.id and e.to_status = 'deleted'
                      and e.reason = 'inspection moved to its visit (migration 20261105280000)');
