-- Wave 6-4 PR-2б (docs/specs/20 §6-4, §10 в5): the technician adds a task to his own job — the job of a live visit of his
-- (app.tech_visit_counts: he is assigned and not taken off, the visit is not cancelled or a no-show, not older than
-- 14 days; the job is not cancelled or closed),
-- the same window as his calls and messages on a job (activities_insert, 20261106010000).
-- Only tasks_insert changes: he sees and changes the tasks he wrote through the author branch of tasks_select /
-- tasks_update (20261106200000 — only while he is on the team); he does not see the office's tasks on that job.
-- Rule 16: only adds a branch, old app versions are not affected. No new function (rule 18).
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (app.task_subject_in_company(subject_type, subject_id, company_id)
              and (app.is_staff(company_id)
                   or (app.is_member(company_id) and subject_type = 'lead' and app.can_see_lead(subject_id))
                   or (app.is_member(company_id) and subject_type = 'property' and app.can_see_property(subject_id, company_id))
                   or (app.is_member(company_id) and subject_type = 'job' and app.tech_sees_activity_subject(company_id, 'job', subject_id))));
