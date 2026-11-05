-- Property tabs (C2b, docs/specs/04 §7.3): tasks of a property. Whoever sees the property (properties RLS: the office,
-- a tech of a visit there) sees and adds its tasks; the gate code keeps its own rule (property_secrets).
-- Security review of #67: the subject of a task must belong to the task's company (no task planted from another
-- company); a tech closes a task of a property they see, but never re-points it or rewrites someone else's task.
alter table public.tasks drop constraint if exists tasks_subject_type_check;
alter table public.tasks add constraint tasks_subject_type_check check (subject_type in ('lead', 'customer', 'job', 'estimate', 'property'));

-- runs as the caller: properties RLS decides who sees the property; the property must be of that company
create or replace function app.can_see_property(p_property_id uuid, p_company_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.properties p where p.id = p_property_id and p.company_id = p_company_id and p.deleted_at is null);
$$;
-- the subject exists in the same company (any caller; definer so it does not depend on what the caller sees)
create or replace function app.task_subject_in_company(p_type text, p_id uuid, p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'lead' then exists (select 1 from public.leads x where x.id = p_id and x.company_id = p_company_id)
    when 'customer' then exists (select 1 from public.customers x where x.id = p_id and x.company_id = p_company_id)
    when 'job' then exists (select 1 from public.jobs x where x.id = p_id and x.company_id = p_company_id)
    when 'estimate' then exists (select 1 from public.estimates x where x.id = p_id and x.company_id = p_company_id)
    when 'property' then exists (select 1 from public.properties x where x.id = p_id and x.company_id = p_company_id)
    else false end;
$$;
revoke execute on function app.can_see_property(uuid, uuid) from public, anon;
grant execute on function app.can_see_property(uuid, uuid) to authenticated;
revoke execute on function app.task_subject_in_company(text, uuid, uuid) from public, anon;
grant execute on function app.task_subject_in_company(text, uuid, uuid) to authenticated;

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (app.is_staff(company_id) or assignee_id = (select auth.uid()) or created_by = (select auth.uid())
         or (subject_type = 'lead' and app.task_subject_in_company('lead', subject_id, company_id) and app.can_see_lead(subject_id))
         or (subject_type = 'property' and app.can_see_property(subject_id, company_id)));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (app.task_subject_in_company(subject_type, subject_id, company_id)
              and (app.is_staff(company_id)
                   or (app.is_member(company_id) and subject_type = 'lead' and app.can_see_lead(subject_id))
                   or (app.is_member(company_id) and subject_type = 'property' and app.can_see_property(subject_id, company_id))));
create policy tasks_update on public.tasks for update to authenticated
  using (app.is_staff(company_id) or assignee_id = (select auth.uid()) or created_by = (select auth.uid())
         or (subject_type = 'property' and app.can_see_property(subject_id, company_id)))
  with check (app.is_member(company_id) and app.task_subject_in_company(subject_type, subject_id, company_id));

-- outside the office: the subject never moves; only the author changes the text, the assignee or the date;
-- anyone who may update (assignee, author, a tech of the property) marks it done or not done
create or replace function app.tg_task_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or app.is_staff(old.company_id) then return new; end if;
  if new.company_id is distinct from old.company_id or new.subject_type is distinct from old.subject_type or new.subject_id is distinct from old.subject_id then
    raise exception 'only the office moves a task to another subject' using errcode = '42501';
  end if;
  if old.created_by is distinct from auth.uid()
     and (new.title is distinct from old.title or new.assignee_id is distinct from old.assignee_id or new.due_at is distinct from old.due_at
          or new.deleted_at is distinct from old.deleted_at) then
    raise exception 'only the author or the office changes this task' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists t05_task_guard on public.tasks;
create trigger t05_task_guard before update on public.tasks
  for each row execute function app.tg_task_guard();
revoke execute on function app.tg_task_guard() from public;
