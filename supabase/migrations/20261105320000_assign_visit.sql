-- Visit and Plan, wave П3a (docs/specs/03 §7.4, §8.1; story map S9, S9b): several people on one visit.
-- * public.assign_visit(visit, user_ids[]): one server function for «Назначить» / «Снять всех». The office of the
--   visit's company (owner / admin / office) sets the whole list in one transaction, only before the visit is on site;
--   people taken off are marked deleted_at (nothing is deleted); everyone on the list is an active member of the same
--   company. A repeat with the same list changes nothing (offline queue replay).
-- * A guard on visit_assignees: the same rules for direct writes (visit_assignees_insert/update/delete let every staff
--   role in, sales too) — a person may not hard-delete a row, move it to another visit or person, or assign someone
--   who is not an active member; only the office writes; only before "on site".

create or replace function app.tg_visit_assignee_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  r public.visit_assignees;
  v_status text;
begin
  if auth.uid() is null then return coalesce(new, old); end if;   -- service role, cron
  r := coalesce(new, old);
  if not app.has_role(r.company_id, array['owner', 'admin', 'office']) then
    raise exception 'only the office assigns people to a visit' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'take a person off a visit with deleted_at (public.assign_visit)' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.visit_id is distinct from old.visit_id or new.user_id is distinct from old.user_id
                            or new.company_id is distinct from old.company_id) then
    raise exception 'an assignment does not move to another visit or person' using errcode = '42501';
  end if;
  select status into v_status from public.visits where id = r.visit_id and company_id = r.company_id;
  if v_status is null or v_status not in ('scheduled', 'en_route') then
    raise exception 'people change only before the visit is on site (status %)', v_status using errcode = 'check_violation';
  end if;
  if new.deleted_at is null and not exists (
       select 1 from public.memberships m
        where m.company_id = new.company_id and m.user_id = new.user_id and m.status = 'active') then
    raise exception 'only an active member of the company is assigned' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_visit_assignee_guard() from public, anon, authenticated;
drop trigger if exists t04_visit_assignee_guard on public.visit_assignees;
create trigger t04_visit_assignee_guard before insert or update or delete on public.visit_assignees
  for each row execute function app.tg_visit_assignee_guard();

create or replace function public.assign_visit(p_visit_id uuid, p_user_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.visits;
  v_company uuid;
  v_ids uuid[];
  v_added int := 0;
  v_removed int := 0;
  n int;
begin
  -- rights first, one answer for "not found" and "not yours" (as public.cancel_visit)
  select company_id into v_company from public.visits where id = p_visit_id and deleted_at is null;
  if v_company is null or auth.uid() is null or not app.has_role(v_company, array['owner', 'admin', 'office']) then
    raise exception 'only the office assigns people to a visit' using errcode = '42501';
  end if;
  select * into v from public.visits where id = p_visit_id and company_id = v_company and deleted_at is null for update;
  if v.status not in ('scheduled', 'en_route') then
    raise exception 'people change only before the visit is on site (status %)', v.status using errcode = 'check_violation';
  end if;
  select coalesce(array_agg(distinct u), '{}') into v_ids from unnest(coalesce(p_user_ids, '{}')) u where u is not null;
  if exists (select 1 from unnest(v_ids) u
              where not exists (select 1 from public.memberships m
                                 where m.company_id = v_company and m.user_id = u and m.status = 'active')) then
    raise exception 'only an active member of the company is assigned' using errcode = 'check_violation';
  end if;

  update public.visit_assignees a set deleted_at = now()
   where a.visit_id = v.id and a.company_id = v_company and a.deleted_at is null and not (a.user_id = any (v_ids));
  get diagnostics v_removed = row_count;
  update public.visit_assignees a set deleted_at = null
   where a.visit_id = v.id and a.company_id = v_company and a.deleted_at is not null and a.user_id = any (v_ids);
  get diagnostics n = row_count;
  insert into public.visit_assignees (company_id, visit_id, user_id)
  select v_company, v.id, u from unnest(v_ids) u
   where not exists (select 1 from public.visit_assignees a where a.visit_id = v.id and a.user_id = u);
  get diagnostics v_added = row_count;

  return jsonb_build_object('assignees', to_jsonb(v_ids), 'added', v_added + n, 'removed', v_removed);
end;
$$;
revoke all on function public.assign_visit(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.assign_visit(uuid, uuid[]) to authenticated;
