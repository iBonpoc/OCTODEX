-- Security re-check of #72/#74: notes_update let the author re-point their own note at any subject of the company
-- (subject_type / subject_id), around notes_insert (a member writes only on subjects they see). Outside the office
-- the subject and the company of a note never change. No user (service role, cron) or the office: as before.

create or replace function app.tg_note_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or app.is_staff(old.company_id) then return new; end if;
  if new.company_id is distinct from old.company_id or new.subject_type is distinct from old.subject_type
     or new.subject_id is distinct from old.subject_id then
    raise exception 'only the office moves a note to another subject' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_note_guard() from public, anon, authenticated;
drop trigger if exists t05_note_guard on public.notes;
create trigger t05_note_guard before update on public.notes
  for each row execute function app.tg_note_guard();
