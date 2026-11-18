-- #2050, docs/specs/38-deletion.md §12.1 (story map S37): «Вернуть работу» — a cancelled job comes back (the founder's word 18.11.2026).
-- Step 1 of rule 16 — only an addition: a function, four rows of transitions, a guard that learns one more rule.
--
-- public.restore_job(p_job): the office (owner, admin, office), one transaction:
--   * rights first, without a lock, one answer for «not found» / «not yours» / «no role» (42501, no existence oracle);
--   * a job that is not cancelled — `repeat: true`, nothing changes (the offline queue may replay);
--   * a client who is «do not service» — refused (23514, hint job_restore_no_service): t44_no_service_guard sits on insert and on
--     update of property_id / deleted_at, not on the status, so the function asks itself (app.no_service_among);
--   * the status before the cancel: the last move job → cancelled in status_events (the newest by id — uuid v7 set by the server;
--     the device's time is not used), its from_status: in_progress and on_hold come back as they were; draft, scheduled (an old
--     phone cancelled by a direct update with its visits still open) and «no record» → scheduled when the job has an open visit
--     (a draft with an open visit would break S9a), else draft;
--   * cancel_reason and cancelled_at are cleared with the status in one update («the time of a status moves with the status»).
-- NOT brought back: the cancelled visits and the voided invoices (they stay as they are; new ones are made the usual way).
-- Lock order as cancel_job / cancel_visit: the visits of the job (by id), then the job.
--
-- The guard t13_job_cancel_guard learns the way back: a phone (authenticated) may not move a job out of «cancelled» by a direct
-- update — the status guard (t30) would let it once the rows below are added, and the grant by columns still has status. Old
-- phones never restore, so nothing of theirs breaks; the function itself runs as its owner and passes.

insert into app.status_transitions (entity_type, from_status, to_status) values
  ('job', 'cancelled', 'draft'),
  ('job', 'cancelled', 'scheduled'),
  ('job', 'cancelled', 'in_progress'),
  ('job', 'cancelled', 'on_hold')
on conflict do nothing;

-- invoker (as before): current_user is the role of the session
create or replace function app.tg_job_cancel_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_why text;
begin
  if current_user <> 'authenticated' then return new; end if;
  -- the way back is the function's only (spec 38 §12.1)
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'job:restoreOnlyByFunction' using errcode = '42501';
  end if;
  if new.status <> 'cancelled' or old.status = 'cancelled' then return new; end if;
  v_why := app.job_cancel_reason(new.company_id, new.id);
  if v_why is not null then
    raise exception 'job:%', v_why using errcode = case when v_why = 'noRight' then '42501' else '23514' end;
  end if;
  return new;
end;
$$;

create or replace function public.restore_job(p_job uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  j public.jobs;
  v_from text;
  v_to text;
begin
  select company_id into v_company from public.jobs where id = p_job and deleted_at is null;
  if v_company is null or auth.uid() is null or not app.has_role(v_company, array['owner', 'admin', 'office']) then
    raise exception 'only the office restores a job' using errcode = '42501';
  end if;

  perform 1 from public.visits v
   where v.job_id = p_job and v.company_id = v_company and v.deleted_at is null order by v.id for update;
  select * into j from public.jobs where id = p_job and company_id = v_company and deleted_at is null for update;
  if j.id is null then
    raise exception 'only the office restores a job' using errcode = '42501';
  end if;
  if j.status <> 'cancelled' then
    return jsonb_build_object('status', j.status, 'repeat', true);
  end if;

  if cardinality(app.no_service_among(v_company, app.no_service_clients('jobs', v_company, j.customer_id, j.property_id, null, null))) > 0 then
    raise exception 'job:noService' using errcode = '23514', hint = 'job_restore_no_service';
  end if;

  select e.from_status into v_from from public.status_events e
   where e.company_id = v_company and e.entity_type = 'job' and e.entity_id = j.id and e.to_status = 'cancelled'
   order by e.id desc limit 1;
  v_to := case
    when v_from in ('in_progress', 'on_hold') then v_from
    when exists (select 1 from public.visits v where v.job_id = j.id and v.company_id = v_company and v.deleted_at is null
                   and v.status in ('scheduled', 'en_route', 'on_site')) then 'scheduled'
    else 'draft'
  end;

  perform set_config('app.status_reason', 'job_restored', true);
  update public.jobs set status = v_to, cancel_reason = null, cancelled_at = null
   where id = j.id and company_id = v_company;
  perform set_config('app.status_reason', '', true);

  return jsonb_build_object('status', v_to, 'repeat', false);
end;
$$;
revoke all on function public.restore_job(uuid) from public, anon;
grant execute on function public.restore_job(uuid) to authenticated;
