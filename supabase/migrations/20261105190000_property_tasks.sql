-- Property tabs (C2b, docs/specs/04 §7.3): tasks of a property. Whoever sees the property (properties RLS: the office,
-- a tech of a visit there) sees and adds its tasks; the gate code keeps its own rule (property_secrets).
alter table public.tasks drop constraint if exists tasks_subject_type_check;
alter table public.tasks add constraint tasks_subject_type_check check (subject_type in ('lead', 'customer', 'job', 'estimate', 'property'));

-- runs as the caller: properties RLS decides who sees the property
create or replace function app.can_see_property(p_property_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.properties p where p.id = p_property_id and p.deleted_at is null);
$$;
revoke execute on function app.can_see_property(uuid) from public, anon;
grant execute on function app.can_see_property(uuid) to authenticated;

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (app.is_staff(company_id) or assignee_id = (select auth.uid()) or created_by = (select auth.uid())
         or (subject_type = 'lead' and app.can_see_lead(subject_id))
         or (subject_type = 'property' and app.can_see_property(subject_id)));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (app.is_staff(company_id)
              or (app.is_member(company_id) and subject_type = 'lead' and app.can_see_lead(subject_id))
              or (app.is_member(company_id) and subject_type = 'property' and app.can_see_property(subject_id)));
