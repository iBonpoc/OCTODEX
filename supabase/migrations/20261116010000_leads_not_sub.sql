-- #1637: a subcontractor has no leads (docs/14-leads-spec.md §8; docs/04-domain-model.md: «только адрес и доступ по своим
-- нарядам»). He does not see a lead or anything shown through it, does not make one, and a lead is not given to him.
-- A subcontractor's inspection of a lead's property shows him the address and the access only, through the visit and the
-- property — never the lead.
-- Leads already given to a subcontractor stay as they are (the director, 16.11): the owner and the office see them as
-- before; he no longer does — the role cuts it at once. The same for a tech made a subcontractor later.
-- Rule 16: nothing renamed or dropped (functions replaced with the same signatures, policies altered in place).
-- Rule 18: the new trigger functions — for nobody.

-- 1 ------------------------------------------------------------------------------------------------
-- who sees a lead (activities, tasks, contacts, people, notes of a lead go through this)
create or replace function app.can_see_lead(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.leads l
     where l.id = p_lead_id and l.deleted_at is null
       and (app.is_staff(l.company_id)
            or (app.is_member(l.company_id) and not app.has_role(l.company_id, array['subcontractor'])
                and (l.assigned_to = auth.uid() or l.created_by = auth.uid())))
  );
$$;

alter policy leads_select on public.leads
  using (app.is_staff(company_id)
         or (app.is_member(company_id) and not app.has_role(company_id, array['subcontractor']) and deleted_at is null
             and (assigned_to = (select auth.uid()) or created_by = (select auth.uid()))));
alter policy leads_update on public.leads
  using (app.is_staff(company_id)
         or (app.is_member(company_id) and not app.has_role(company_id, array['subcontractor']) and deleted_at is null
             and (assigned_to = (select auth.uid()) or created_by = (select auth.uid()))));
alter policy leads_insert on public.leads
  with check (app.is_member(company_id) and not app.has_role(company_id, array['subcontractor']));

-- 2 ------------------------------------------------------------------------------------------------
-- a lead is not given to a subcontractor (checked only when the assignee changes: an old lead of his is still edited)
create or replace function app.tg_lead_assignee_not_sub()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- the app's role only (the server and definer functions pass, as everywhere)
  if current_user in ('authenticated', 'anon') and new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and exists (select 1 from public.memberships m
                  where m.company_id = new.company_id and m.user_id = new.assigned_to and m.role = 'subcontractor'
                    and m.deleted_at is null) then
    raise exception 'a lead is not given to a subcontractor' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_lead_assignee_not_sub() from public, anon, authenticated;
drop trigger if exists t13_lead_assignee_not_sub on public.leads;
create trigger t13_lead_assignee_not_sub before insert or update of assigned_to on public.leads
  for each row execute function app.tg_lead_assignee_not_sub();

-- 3 ------------------------------------------------------------------------------------------------
-- tasks: the assignee / author way in is not a subcontractor's for a lead's task (its title may carry the client's name
-- or phone); and a lead's task is not given to a subcontractor. The rest as in 20261106200000.
alter policy tasks_select on public.tasks
  using (app.is_staff(company_id)
         or ((assignee_id = (select auth.uid()) or created_by = (select auth.uid())) and app.is_member(company_id)
             and not (subject_type = 'lead' and app.has_role(company_id, array['subcontractor'])))
         or (subject_type = 'lead' and app.task_subject_in_company('lead', subject_id, company_id) and app.can_see_lead(subject_id))
         or (subject_type = 'property' and app.can_see_property(subject_id, company_id)));
alter policy tasks_update on public.tasks
  using (app.is_staff(company_id)
         or ((assignee_id = (select auth.uid()) or created_by = (select auth.uid())) and app.is_member(company_id)
             and not (subject_type = 'lead' and app.has_role(company_id, array['subcontractor'])))
         or (subject_type = 'property' and app.can_see_property(subject_id, company_id)))
  with check (app.is_member(company_id) and app.task_subject_in_company(subject_type, subject_id, company_id));

create or replace function app.tg_lead_task_not_sub()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and new.subject_type = 'lead' and new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id or new.subject_type is distinct from old.subject_type)
     and exists (select 1 from public.memberships m
                  where m.company_id = new.company_id and m.user_id = new.assignee_id and m.role = 'subcontractor'
                    and m.deleted_at is null) then
    raise exception 'a lead''s task is not given to a subcontractor' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_lead_task_not_sub() from public, anon, authenticated;
drop trigger if exists t13_lead_task_not_sub on public.tasks;
create trigger t13_lead_task_not_sub before insert or update of assignee_id, subject_type on public.tasks
  for each row execute function app.tg_lead_task_not_sub();

-- 4 ------------------------------------------------------------------------------------------------
-- the bin's functions run as their owner (the lead's read rule does not stop them): a subcontractor neither lists nor
-- brings back nor removes for good a lead or a task of his. The rest as in 20261111030000.
create or replace function app.trash_own_ok(p_kind text, p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'estimate' then app.is_staff(p_company) or app.has_role(p_company, array['tech'])
    when 'expense' then app.is_staff(p_company) or app.has_role(p_company, array['tech'])
    when 'customer' then app.is_staff(p_company)
    when 'lead' then app.is_member(p_company) and not app.has_role(p_company, array['subcontractor'])
    when 'task' then app.is_member(p_company) and not app.has_role(p_company, array['subcontractor'])
    else false
  end;
$$;
revoke all on function app.trash_own_ok(text, uuid) from public, anon, authenticated;
