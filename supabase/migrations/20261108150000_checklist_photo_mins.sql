-- CH2 (docs/specs/08-checklists.md §11.7 №7): the photo minimums of a visit's templates, taken with the snapshot of its
-- items when the office makes the visit (S4, S9). The tech's phone does not read templates: without these it would
-- know only the company's minimum. Null — the company's (companies.visit_settings); a value raises it, never lowers it.
-- Who: only the office (owner, admin, office) sets them — on insert and on update; a tech and sales cannot (their
-- write is refused, not silently dropped). Two new nullable columns: no rewrite of visits; the range checks are added
-- «not valid» here and validated in 20261108150100 (its own transaction: the scan does not hold this file's lock).
-- Rule 16: nothing renamed or dropped.

set lock_timeout = '5s';
alter table public.visits add column if not exists checklist_min_photos_before smallint;
alter table public.visits add column if not exists checklist_min_photos_after smallint;

alter table public.visits drop constraint if exists visits_checklist_min_photos_before_range;
alter table public.visits add constraint visits_checklist_min_photos_before_range
  check (checklist_min_photos_before is null or checklist_min_photos_before between 1 and 20) not valid;
alter table public.visits drop constraint if exists visits_checklist_min_photos_after_range;
alter table public.visits add constraint visits_checklist_min_photos_after_range
  check (checklist_min_photos_after is null or checklist_min_photos_after between 1 and 20) not valid;

-- only the office writes the minimums (the tech's guard does not list these columns; this trigger covers every role)
create or replace function app.tg_visit_checklist_mins()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE'
     and new.checklist_min_photos_before is not distinct from old.checklist_min_photos_before
     and new.checklist_min_photos_after is not distinct from old.checklist_min_photos_after then
    return new;
  end if;
  if tg_op = 'INSERT' and new.checklist_min_photos_before is null and new.checklist_min_photos_after is null then
    return new;
  end if;
  if not app.has_role(new.company_id, array['owner', 'admin', 'office']) then
    raise exception 'only the office sets the photo minimums of a visit' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_visit_checklist_mins() from public, anon, authenticated;
drop trigger if exists t05_visit_checklist_mins on public.visits;
create trigger t05_visit_checklist_mins before insert or update on public.visits
  for each row execute function app.tg_visit_checklist_mins();
