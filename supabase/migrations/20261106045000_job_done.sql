-- Wave 3c «Работа выполнена» (docs/specs/17-job.md §4; 13 §3.4.1; story map S10, changed 06.11).
-- Before: the job moved only inside the visit payment (ops visit.pay → in_progress → completed), and that update ran as
-- the technician, whom jobs_update does not let in — so in the cloud the job of a paid visit stayed «scheduled», while
-- the phone showed «done». Now:
-- * a job visit reaching «on site» starts its job (scheduled → in_progress), on the server, whoever moves the visit;
-- * paying does not touch the job;
-- * public.complete_job: only the office (owner, admin, office) closes a job — «Да, выполнена» / «Завершить работу»;
--   not while a visit of the job is still open; a repeat on a closed job changes nothing (offline queue replay).

create or replace function app.tg_visit_starts_job()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.job_id is not null and new.status = 'on_site' and old.status is distinct from 'on_site' then
    update public.jobs set status = 'in_progress'
     where id = new.job_id and company_id = new.company_id and status = 'scheduled' and deleted_at is null;
  end if;
  return null;
end;
$$;
revoke all on function app.tg_visit_starts_job() from public, anon, authenticated;
create trigger t85_visit_starts_job after update of status on public.visits
  for each row execute function app.tg_visit_starts_job();

create or replace function public.complete_job(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  j public.jobs;
begin
  -- rights first, one answer for "not found" and "not yours"
  select company_id into v_company from public.jobs where id = p_job_id and deleted_at is null;
  if v_company is null or auth.uid() is null or not app.has_role(v_company, array['owner', 'admin', 'office']) then
    raise exception 'only the office closes a job' using errcode = '42501';
  end if;
  select * into j from public.jobs where id = p_job_id and company_id = v_company for update;
  if j.status in ('completed', 'closed') then
    return jsonb_build_object('status', j.status, 'repeat', true);
  end if;
  if j.status not in ('scheduled', 'in_progress') then
    raise exception 'a job that waits for a date or is cancelled is not closed (status %)', j.status using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.visits v where v.job_id = j.id and v.company_id = v_company and v.deleted_at is null
              and v.status in ('scheduled', 'en_route', 'on_site')) then
    raise exception 'finish or cancel the open visits of the job first' using errcode = 'check_violation';
  end if;
  -- the status path goes through «in progress» (status_transitions)
  if j.status = 'scheduled' then
    update public.jobs set status = 'in_progress' where id = j.id;
  end if;
  update public.jobs set status = 'completed', completed_at = now() where id = j.id;
  return jsonb_build_object('status', 'completed', 'repeat', false);
end;
$$;
revoke all on function public.complete_job(uuid) from public, anon, authenticated;
grant execute on function public.complete_job(uuid) to authenticated;
