-- #1572: a files row points only at its own object, and an object is written only for a live files row.
-- (1) storage_key, set by the app, is `<company_id>/<id>.<ext>` of the row itself (cloud/ops.ts uploadPhoto writes
--     exactly that, old builds included; letter case is not held against an old build) — never another file's object.
--     Rows already stored are not checked again.
-- (2) «one row, one object» holds for the office too (before: only for the author).
-- (3) the office writes an object only for a live files row of the same id and company, like the author (the app always
--     makes the row first, then sends the bytes).
-- Rule 16: nothing renamed or dropped; the server's roles are not limited (they bypass the policies anyway).

-- 1 ------------------------------------------------------------------------------------------------
create or replace function app.tg_files_key_own()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and new.storage_key is not null
     and (tg_op = 'INSERT' or new.storage_key is distinct from old.storage_key)
     and new.storage_key !~* ('^' || new.company_id::text || '/' || new.id::text || '\.[a-z0-9]+$') then
    raise exception 'a file''s storage_key is its own object' using errcode = '42501';
  end if;
  return new;
end;
$$;
-- rule 18 (T52): a trigger function; nobody calls it
revoke all on function app.tg_files_key_own() from public, anon, authenticated;
drop trigger if exists t09_key_own on public.files;
create trigger t09_key_own before insert or update of storage_key on public.files
  for each row execute function app.tg_files_key_own();

-- 2, 3 ---------------------------------------------------------------------------------------------
-- the same as 20261115100000, with (2) and (3)
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
  -- a live row of this file: the office, or its author
  return exists (select 1 from public.files f
                  where f.id = p.file_id and f.company_id = p.company_id and f.deleted_at is null
                    and (app.is_staff(f.company_id) or (app.is_member(f.company_id) and f.created_by = auth.uid())))
         -- one row, one object: no second object of the same file under another extension (the office too)
         and not exists (select 1 from storage.objects o
                          where o.bucket_id = 'files' and o.name <> p_name
                            and o.name like p.company_id::text || '/' || p.file_id::text || '.%');
end;
$$;
revoke all on function app.can_write_file_object(text) from public, anon, authenticated;
grant execute on function app.can_write_file_object(text) to authenticated;
