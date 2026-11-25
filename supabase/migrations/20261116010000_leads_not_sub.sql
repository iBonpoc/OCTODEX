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
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id or new.subject_type is distinct from old.subject_type or new.subject_id is distinct from old.subject_id)
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
create trigger t13_lead_task_not_sub before insert or update of assignee_id, subject_type, subject_id on public.tasks
  for each row execute function app.tg_lead_task_not_sub();

-- 4 ------------------------------------------------------------------------------------------------
-- the bin's functions run as their owner (the lead's read rule does not stop them): a subcontractor neither lists nor
-- brings back nor removes for good a lead of his, nor a lead's task (his task on a property — as before). The rest as in
-- 20261111030000 word for word.
create or replace function app.trash_own_ok(p_kind text, p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'estimate' then app.is_staff(p_company) or app.has_role(p_company, array['tech'])
    when 'expense' then app.is_staff(p_company) or app.has_role(p_company, array['tech'])
    when 'customer' then app.is_staff(p_company)
    when 'lead' then app.is_member(p_company) and not app.has_role(p_company, array['subcontractor'])
    when 'task' then app.is_member(p_company)
    else false
  end;
$$;
revoke all on function app.trash_own_ok(text, uuid) from public, anon, authenticated;

create or replace function app.trash_reason(p_kind text, p_id uuid, p_deleting boolean)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_company  uuid;
  v_by       uuid;
  v_del      timestamptz;
  v_status   text;
  v_sent     uuid;
  v_customer uuid;
  v_lead     uuid;
  v_job      uuid;
  v_subj_t   text;
  v_subj     uuid;
  v_all      boolean;
  v_entry    timestamptz;
  v_entry_by uuid;
begin
  if v_uid is null or p_id is null then return 'noRight'; end if;
  case p_kind
    when 'estimate' then
      select company_id, created_by, deleted_at, status, sent_version_id, customer_id, lead_id
        into v_company, v_by, v_del, v_status, v_sent, v_customer, v_lead from public.estimates where id = p_id;
    when 'task' then
      select company_id, created_by, deleted_at, subject_type, subject_id
        into v_company, v_by, v_del, v_subj_t, v_subj from public.tasks where id = p_id;
    when 'expense' then
      select company_id, created_by, deleted_at, customer_id, job_id
        into v_company, v_by, v_del, v_customer, v_job from public.expenses where id = p_id;
    when 'catalog_item' then
      select company_id, created_by, deleted_at into v_company, v_by, v_del from public.catalog_items where id = p_id;
    when 'customer' then
      select company_id, created_by, deleted_at into v_company, v_by, v_del from public.customers where id = p_id;
    when 'lead' then
      select company_id, created_by, deleted_at, customer_id into v_company, v_by, v_del, v_customer from public.leads where id = p_id;
    else
      return 'noRight';
  end case;
  if v_company is null or not app.is_member(v_company) then return 'noRight'; end if;
  v_all := app.has_role(v_company, array['owner', 'admin', 'office']);
  -- чужое — владелец, админ, офис; остальные — только своё, которое видят и могут менять сейчас (основатель 11.11).
  -- notYours — тому, кто видит всю компанию (продажи); мастер и субподрядчик чужого не видят: им один ответ noRight
  if not v_all and (v_by is distinct from v_uid or not app.trash_own_ok(p_kind, v_company)) then
    return case when app.is_staff(v_company) and app.trash_own_ok(p_kind, v_company) then 'notYours' else 'noRight' end;
  end if;
  -- #1637: a lead's task is not a subcontractor's to remove or bring back (his task on a property is, as before)
  if not v_all and p_kind = 'task' and v_subj_t = 'lead' and app.has_role(v_company, array['subcontractor']) then
    return 'noRight';
  end if;

  if p_deleting then
    -- уже удалённое: повтор своего удаления (запись Корзины есть) — можно; удалённое сервером (отмена импорта, склейка)
    -- «удалить ещё раз» нельзя — иначе появилась бы запись Корзины и «Вернуть» обошло бы сервер (security-check PR-1 №1)
    if v_del is not null then
      return case when exists (select 1 from public.trash_entries t where t.company_id = v_company and t.kind = p_kind
                                  and t.object_id = p_id and t.restored_at is null) then null else 'noRight' end;
    end if;
    if p_kind = 'estimate' then
      if v_status in ('awaiting_countersign', 'approved') then return 'signed'; end if;
      -- черновик — это ни разу не отправленная смета: правка после отправки тоже draft (ход sent → draft)
      if v_status <> 'draft' or v_sent is not null then return 'sentOnce'; end if;
    elsif p_kind = 'customer' then
      if exists (select 1 from public.leads x where x.company_id = v_company and x.customer_id = p_id and x.deleted_at is null)
         or exists (select 1 from public.estimates x where x.company_id = v_company and x.customer_id = p_id and x.deleted_at is null)
         or exists (select 1 from public.jobs x where x.company_id = v_company and x.customer_id = p_id and x.deleted_at is null)
         or exists (select 1 from public.invoices x where x.company_id = v_company and x.customer_id = p_id)
         or exists (select 1 from public.payments x where x.company_id = v_company and x.customer_id = p_id) then
        return 'hasDocs';
      end if;
    elsif p_kind = 'lead' then
      if exists (select 1 from public.estimates x where x.company_id = v_company and x.lead_id = p_id and x.deleted_at is null)
         or exists (select 1 from public.visits x where x.company_id = v_company and x.lead_id = p_id and x.deleted_at is null) then
        return 'hasDocs';
      end if;
    end if;
    return null;
  end if;

  -- вернуть: только то, что лежит в Корзине (удалено человеком, не отменой импорта или склейкой), не старше 30 дней;
  -- не владелец, админ, офис — только то, что удалил сам (спека §6.2; проверка руководителя #752 №1).
  -- Каталог — исключение: «добавить снова» удалённую позицию было и до Корзины (ops.ts catalog.save), без срока.
  if v_del is null then return null; end if;
  if p_kind = 'catalog_item' then return null; end if;
  select t.deleted_at, t.deleted_by into v_entry, v_entry_by from public.trash_entries t
   where t.company_id = v_company and t.kind = p_kind and t.object_id = p_id and t.restored_at is null;
  if v_entry is null then return 'noRight'; end if;
  if not v_all and v_entry_by is distinct from v_uid then
    return case when app.is_staff(v_company) then 'notYours' else 'noRight' end;
  end if;
  if v_entry < now() - make_interval(days => app.trash_days()) then return 'expired'; end if;
  -- родитель в Корзине или удалён — сначала родитель
  if (v_customer is not null and exists (select 1 from public.customers c where c.id = v_customer and c.deleted_at is not null))
     or (v_lead is not null and exists (select 1 from public.leads l where l.id = v_lead and l.deleted_at is not null))
     or (v_job is not null and exists (select 1 from public.jobs j where j.id = v_job and j.deleted_at is not null))
     or (v_subj_t = 'customer' and exists (select 1 from public.customers c where c.id = v_subj and c.deleted_at is not null))
     or (v_subj_t = 'lead' and exists (select 1 from public.leads l where l.id = v_subj and l.deleted_at is not null))
     or (v_subj_t = 'job' and exists (select 1 from public.jobs j where j.id = v_subj and j.deleted_at is not null))
     or (v_subj_t = 'property' and exists (select 1 from public.properties p where p.id = v_subj and p.deleted_at is not null)) then
    return 'parentDeleted';
  end if;
  return null;
end;
$$;
revoke all on function app.trash_reason(text, uuid, boolean) from public, anon;
grant execute on function app.trash_reason(text, uuid, boolean) to authenticated;

create or replace function public.trash_list(p_company uuid)
returns table (kind text, object_id uuid, label text, deleted_by uuid, deleted_by_name text, deleted_at timestamptz, days_left int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_all boolean;
begin
  if auth.uid() is null or not app.is_member(p_company) then return; end if;
  v_all := app.has_role(p_company, array['owner', 'admin', 'office']);
  return query
    select t.kind, t.object_id,
           case t.kind
             when 'estimate' then (select coalesce(nullif(concat_ws(' · ', e.number, e.title), ''), e.number) from public.estimates e where e.id = t.object_id and e.deleted_at is not null and (v_all or (e.created_by = auth.uid() and app.trash_own_ok('estimate', p_company))))
             when 'task' then (select k.title from public.tasks k where k.id = t.object_id and k.deleted_at is not null and (v_all or (k.created_by = auth.uid() and app.trash_own_ok('task', p_company)
                                   and not (k.subject_type = 'lead' and app.has_role(p_company, array['subcontractor'])))))
             when 'expense' then (select concat_ws(' · ', x.vendor, x.category) from public.expenses x where x.id = t.object_id and x.deleted_at is not null and (v_all or (x.created_by = auth.uid() and app.trash_own_ok('expense', p_company))))
             when 'catalog_item' then (select c.name from public.catalog_items c where c.id = t.object_id and c.deleted_at is not null and (v_all or (c.created_by = auth.uid() and app.trash_own_ok('catalog_item', p_company))))
             when 'customer' then (select c.display_name from public.customers c where c.id = t.object_id and c.deleted_at is not null and (v_all or (c.created_by = auth.uid() and app.trash_own_ok('customer', p_company))))
             when 'lead' then (select coalesce(l.contact_name, l.number) from public.leads l where l.id = t.object_id and l.deleted_at is not null and (v_all or (l.created_by = auth.uid() and app.trash_own_ok('lead', p_company))))
           end,
           t.deleted_by, u.full_name, t.deleted_at,
           greatest(0, app.trash_days() - extract(day from now() - t.deleted_at)::int)
      from public.trash_entries t
      left join public.users u on u.id = t.deleted_by
     where t.company_id = p_company and t.restored_at is null
       and t.deleted_at >= now() - make_interval(days => app.trash_days())
       and (v_all or t.deleted_by = auth.uid())
     order by t.deleted_at desc;
end;
$$;
revoke all on function public.trash_list(uuid) from public, anon;
grant execute on function public.trash_list(uuid) to authenticated;
