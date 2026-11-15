-- #1646: what a subcontractor attaches. A subcontractor adds only photos: of a visit of theirs that counts
-- (app.tech_visit_counts: not cancelled or no-show, the work open, today, ahead or in the last 14 days), tied at most
-- to that visit's own job; or a photo of their own with nothing attached (a profile picture). Never a file of a
-- client or of a measurement, never another kind. The app sends a visit photo as {kind photo, visit_id, job_id of
-- the visit} (cloud/ops.ts photo.add), so it keeps working. Other roles as before (20261115120000, 20261107190000).
-- Rule 16: nothing renamed or dropped.

-- a file row a subcontractor may hold. p_window: a new row needs a visit inside its window; a change of a row
-- (the queue marks a photo uploaded, maybe days later) needs the visit to be theirs, not inside the window
create or replace function app.sub_file_ok(p_kind text, p_customer_id uuid, p_job_id uuid, p_visit_id uuid, p_measurement_id uuid,
                                           p_window boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_kind = 'photo' and p_customer_id is null and p_measurement_id is null
     and ((p_visit_id is null and p_job_id is null)
          or (p_visit_id is not null
              and (case when p_window then app.tech_visit_counts(p_visit_id) else app.is_visit_assignee(p_visit_id) end)
              and (p_job_id is null
                   or exists (select 1 from public.visits v where v.id = p_visit_id and v.job_id = p_job_id))));
$$;
revoke all on function app.sub_file_ok(text, uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function app.sub_file_ok(text, uuid, uuid, uuid, uuid, boolean) to authenticated;

drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated
  with check ((app.is_staff(company_id)
               or (app.is_member(company_id)
                   and (customer_id is null or app.is_customer_assignee(customer_id))
                   and (job_id is null or app.is_job_assignee(job_id))
                   and (visit_id is null or app.is_visit_assignee(visit_id))
                   and (not app.has_role(company_id, array['subcontractor'])
                        or app.sub_file_ok(kind, customer_id, job_id, visit_id, measurement_id, true))))
              and (measurement_id is null
                   or (app.gutter_sees_measurement(measurement_id) and app.module_active(company_id, 'gutters'))));

-- the same as 20261115120000, with the subcontractor's limit on what the row becomes
drop policy if exists files_update on public.files;
create policy files_update on public.files for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (app.is_member(company_id) and created_by = (select auth.uid()))
         or (kind <> 'receipt' and app.is_staff(company_id)))
  with check ((app.has_role(company_id, array['owner', 'admin', 'office'])
               or (kind <> 'receipt' and app.is_staff(company_id))
               or (app.is_member(company_id) and created_by = (select auth.uid())
                   and (customer_id is null or app.is_customer_assignee(customer_id))
                   and (job_id is null or app.is_job_assignee(job_id))
                   and (visit_id is null or app.is_visit_assignee(visit_id))
                   and (not app.has_role(company_id, array['subcontractor'])
                        or app.sub_file_ok(kind, customer_id, job_id, visit_id, measurement_id, false))))
              and (measurement_id is null
                   or (app.gutter_sees_measurement(measurement_id) and app.module_active(company_id, 'gutters'))));
