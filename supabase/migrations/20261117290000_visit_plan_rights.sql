-- #2016: planning a job (an install visit, the job «scheduled») is the office's: owner, admin, office. Sales book only
-- inspections (lead.visit, visit.inspection); the tech walks the steps of his own visits (visits_update_tech, unchanged).
-- Before: visits_insert / visits_update_staff let every staff role in, sales too — a sales phone on «Назначить выезд»
-- wrote the visit and moved the job to «scheduled», and only the people (assign_visit, T35) were refused: half a write.
--   * visits_insert, visits_update_staff — alter policy (no drop): what sales write is an inspection only (WITH CHECK);
--   * app.tg_job_schedule_guard — a job moves to 'scheduled' only by owner / admin / office (a server function with no person
--     behind it — auth.uid() is null — is not checked, as the other guards).
-- Rule 16: nothing renamed or dropped; an old sales phone gets «Сервер отказал» for such an op instead of half a write.
-- Rule 18: the new function is revoked from everyone (a trigger needs no grant).

alter policy visits_insert on public.visits
  with check (app.is_staff(company_id)
              and (kind = 'inspection' or app.has_role(company_id, array['owner', 'admin', 'office'])));

-- USING stays as it was (every staff role sees the row to update it): the limit is in WITH CHECK, so a sales phone that
-- changes an install visit gets a refusal («Сервер отказал»), never a silent «0 rows» its queue would take for done
alter policy visits_update_staff on public.visits
  with check (app.is_staff(company_id)
              and (kind = 'inspection' or app.has_role(company_id, array['owner', 'admin', 'office'])));

create or replace function app.tg_job_schedule_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;               -- server functions, the service role, cron
  if new.status = 'scheduled' and old.status is distinct from 'scheduled'
     and not app.has_role(new.company_id, array['owner', 'admin', 'office']) then
    raise exception 'only the office schedules a job' using errcode = '42501', hint = 'job_schedule_office';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_job_schedule_guard() from public, anon, authenticated;

drop trigger if exists t15_job_schedule_guard on public.jobs;
create trigger t15_job_schedule_guard before update of status on public.jobs
  for each row execute function app.tg_job_schedule_guard();
