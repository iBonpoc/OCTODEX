-- #1557: a file object, once its files row records the upload, is not written again by anyone (the office included).
-- Before the mark the upload may be repeated as before (the queue resends with upsert: true). An old build that resends
-- after the mark (the answer of the «uploaded» update was lost) is refused by Storage and then marks the row 'failed':
-- the trigger below keeps a recorded upload as it is, so the photo stays «uploaded» on every phone (rule 16: old builds
-- keep working, nothing renamed or dropped).
-- A lost object behind a recorded row is put back by the server only (service_role bypasses the policies; the trigger
-- keeps nothing for them). The app always sets storage_key and 'uploaded' together (cloud/ops.ts uploadPhoto); the lock
-- and the trigger both take either of them as «recorded».

-- 1 ------------------------------------------------------------------------------------------------
-- the same as 20261107190000, plus the first check: a recorded upload is final for everyone
create or replace function app.can_write_file_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare p record;
begin
  p := app.file_object_parts(p_name);
  if p.company_id is null then return false; end if;
  -- a stored file is not replaced by anyone (a «before / after» photo, a signed estimate's photo is evidence)
  if exists (select 1 from public.files f
              where f.id = p.file_id and f.company_id = p.company_id
                and (f.storage_key is not null or f.upload_status = 'uploaded')) then
    return false;
  end if;
  -- a measurement's photo: nobody uploads while the module is not active, the office included
  if exists (select 1 from public.files f where f.id = p.file_id and f.company_id = p.company_id and f.measurement_id is not null)
     and not app.module_active(p.company_id, 'gutters') then
    return false;
  end if;
  -- the office, or the author while the row is live (the mark is checked above for both; the grouping as before)
  return app.is_staff(p.company_id)
      or exists (select 1 from public.files f
                  where f.id = p.file_id and f.company_id = p.company_id and f.deleted_at is null
                    and app.is_member(f.company_id) and f.created_by = auth.uid())
         -- one row, one object: no second object of the same file under another extension
         and not exists (select 1 from storage.objects o
                          where o.bucket_id = 'files' and o.name <> p_name
                            and o.name like p.company_id::text || '/' || p.file_id::text || '.%');
end;
$$;
revoke all on function app.can_write_file_object(text) from public, anon, authenticated;
grant execute on function app.can_write_file_object(text) to authenticated;

-- 2 ------------------------------------------------------------------------------------------------
-- a recorded upload stays recorded: an old build's late «failed» (or any other change of the mark or the key) is
-- ignored, not refused — a refusal would keep the op in the queue for nothing
-- (not security definer: current_user is the caller; the server's roles may still fix a row — they bypass the policies
-- anyway, and a path move must not be silently ignored)
create or replace function app.tg_files_upload_kept()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- the same «recorded» as the lock above (either mark): clearing one of them does not open the object again
  if current_user in ('authenticated', 'anon') and (old.upload_status = 'uploaded' or old.storage_key is not null) then
    new.upload_status := old.upload_status;
    new.storage_key := old.storage_key;
  end if;
  return new;
end;
$$;
-- rule 18 (T52): a trigger function; nobody calls it
revoke all on function app.tg_files_upload_kept() from public, anon, authenticated;
drop trigger if exists t08_upload_kept on public.files;
create trigger t08_upload_kept before update of upload_status, storage_key on public.files
  for each row execute function app.tg_files_upload_kept();
