-- S26 «кто» в задаче (docs/specs/23 §5, «Лиды и клиенты» №9, задача 5; ревью #237).
-- Outside the office (tech, subcontractor) a task is assigned only to oneself or to nobody, on every branch of
-- tasks_insert / tasks_update (lead, property, job — 20261107010000) at once; «done by» is always set by the server.
-- 1. assignee_id: a non-office member who inserts a task for someone else gets it assigned to himself; the author who
--    changes the assignee of his task to someone else keeps the old assignee; who is not the author never changes it
--    (the old one stays). Not a refusal: older app versions offered every member in «Кто», and «done» goes in the same
--    upsert — a refusal would drop the whole op (and the «done» mark) from the phone's queue after five tries
--    (rule 16, rule 6). The trigger is t04: before t05_task_guard, which refuses a non-author's change of the assignee
--    (security-check 07.11, M1) — here it is put back first, so marking an office task done is never refused.
-- 2. done_by: marked done → the person who marked it (auth.uid()); not done again → null; otherwise it never changes.
--    What the app sends is ignored (older versions send their own user id on every save).
-- An upsert (the app's task.save) first runs the insert trigger with the proposed row: a task that already exists is
-- left to the update branch (the person who marks an office task on his property done keeps its assignee).
-- Rule 16: only adds a trigger, no column or function is renamed or dropped. Rule 18: the trigger function is not
-- callable by anyone.
create or replace function app.tg_task_who()
returns trigger language plpgsql set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.tasks t where t.id = new.id) then
      return new; -- an upsert of an existing task: the update below decides
    end if;
    new.done_by := case when new.done_at is null then null else coalesce(me, new.done_by) end;
    if me is not null and not app.is_staff(new.company_id) and new.assignee_id is distinct from me and new.assignee_id is not null then
      new.assignee_id := me;
    end if;
    return new;
  end if;
  if new.done_at is distinct from old.done_at then
    new.done_by := case when new.done_at is null then null else coalesce(me, new.done_by) end;
  elsif me is not null then
    new.done_by := old.done_by; -- the server's own jobs (no signed-in person) may still set it
  end if;
  if me is not null and not app.is_staff(old.company_id) and new.assignee_id is distinct from old.assignee_id
     and (old.created_by is distinct from me or (new.assignee_id is not null and new.assignee_id is distinct from me)) then
    new.assignee_id := old.assignee_id;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_task_who() from public, anon, authenticated;

drop trigger if exists t04_task_who on public.tasks;
create trigger t04_task_who before insert or update on public.tasks
  for each row execute function app.tg_task_who();
