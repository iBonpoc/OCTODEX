-- #1646: what a subcontractor attaches. A subcontractor adds photos of a visit of theirs (not cancelled or no-show,
-- today, ahead or in the last 14 days), tied at most to that visit's own job; a photo of their own with nothing
-- attached (a profile picture); a receipt of their own expense. Never a file of a client or of a measurement, never
-- another kind, and a file once added is not moved. The app sends a visit photo as {kind photo, visit_id, job_id of
-- the visit} (cloud/ops.ts photo.add), so it keeps working. Other roles as before (20261115120000, 20261107190000).
-- Rule 16: nothing renamed or dropped.

-- a file row a subcontractor may hold. p_window: a new photo needs a visit of theirs that is not removed, cancelled or
-- no-show and is dated today, ahead or within the last 14 days (the window of app.tech_visit_counts; the job's status
-- is not asked, so a photo taken on the spot and sent later after the office closed the job is not lost). A change of
-- a row (the queue marks a photo uploaded, maybe days later) needs the visit to be still theirs; what a row is tied to
-- does not change at all (t11_sub_attach_fixed below). A receipt of their own expense: not of a client or a visit, at
-- most of a job they work on (as expenses_insert lets them add the expense).
create or replace function app.sub_file_ok(p_kind text, p_customer_id uuid, p_job_id uuid, p_visit_id uuid, p_measurement_id uuid,
                                           p_window boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_customer_id is null and p_measurement_id is null
     and ((p_kind = 'receipt' and p_visit_id is null and (p_job_id is null or app.is_job_assignee(p_job_id)))
          or (p_kind = 'photo'
              and ((p_visit_id is null and p_job_id is null)
                   or (p_visit_id is not null
                       and (case when p_window
                                 then exists (
                                   select 1
                                     from public.visits v
                                     join public.companies co on co.id = v.company_id
                                     join public.visit_assignees a on a.visit_id = v.id and a.deleted_at is null and a.user_id = auth.uid()
                                    where v.id = p_visit_id
                                      and v.deleted_at is null
                                      and v.status not in ('cancelled', 'no_show')
                                      and coalesce((v.starts_at at time zone coalesce(nullif(co.timezone, ''), 'America/Los_Angeles'))::date,
                                                   v.flex_week_start + 6,
                                                   (v.created_at at time zone coalesce(nullif(co.timezone, ''), 'America/Los_Angeles'))::date)
                                          >= (now() at time zone coalesce(nullif(co.timezone, ''), 'America/Los_Angeles'))::date - 14)
                                 else app.is_visit_assignee(p_visit_id) end)
                       and (p_job_id is null
                            or exists (select 1 from public.visits v where v.id = p_visit_id and v.job_id = p_job_id))))));
$$;
revoke all on function app.sub_file_ok(text, uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function app.sub_file_ok(text, uuid, uuid, uuid, uuid, boolean) to authenticated;

-- a subcontractor's file stays tied to what it was added to (the app never moves a file): a photo of their own is
-- not put on an old or cancelled visit afterwards, a visit's photo is not carried to another visit
-- (not security definer: current_user is the caller)
create or replace function app.tg_files_sub_attach_fixed()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.visit_id is distinct from old.visit_id or new.job_id is distinct from old.job_id
          or new.customer_id is distinct from old.customer_id)
     and app.has_role(new.company_id, array['subcontractor']) then
    raise exception 'a subcontractor''s file stays where it was added' using errcode = '42501';
  end if;
  return new;
end;
$$;
-- rule 18 (T52): a trigger function; nobody calls it
revoke all on function app.tg_files_sub_attach_fixed() from public, anon, authenticated;
drop trigger if exists t11_sub_attach_fixed on public.files;
create trigger t11_sub_attach_fixed before update of visit_id, job_id, customer_id on public.files
  for each row execute function app.tg_files_sub_attach_fixed();

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
