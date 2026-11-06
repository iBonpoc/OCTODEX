-- Security audit 06.11, items 3 and 12 (docs/specs/19-db-security.md §4).
--
-- 3. Storage: files_bucket_read let every member of a company (tech, subcontractor) list and read every file of
--    the company. Now an object <company_id>/<file_id>.<ext> is read by the staff of that company, or by someone
--    who sees its public.files row by the rule of files_select (a tech — his own file or one of his visit), and,
--    beyond files_select, any member reads back the object he uploaded himself (Storage returns the row after an
--    upload; a subcontractor does not see his own files rows, but must be able to upload).
--    The row is found by the id in the object NAME, never by files.storage_key: the author can change storage_key
--    of his own row and would point it at someone else's object.
--    Writing: the staff, or the author of the files row until the upload is recorded (the app inserts the row first,
--    then uploads, then writes storage_key, cloud/ops.ts photo.add). The app uploads with upsert: true — a repeat upload needs UPDATE on storage.objects, which had
--    no policy at all (a repeat upload failed).
-- 12. Functions of schema app had EXECUTE for PUBLIC when a later migration forgot to revoke it. Revoked for all;
--    the ones RLS policies of leads and contacts call get EXECUTE for authenticated back (no change for the app).

create or replace function app.file_object_parts(p_name text, out company_id uuid, out file_id uuid)
language plpgsql immutable set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
  base text;
begin
  if coalesce(array_length(parts, 1), 0) <> 2 then return; end if;
  -- exactly <company id>/<file id>.<ext>, lower case (as the app writes it: ids from the database / expo-crypto
  -- randomUUID are lower case), one known extension: one files row holds one object (no FID.jpg, fid.PDF, fid.html …)
  if parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|heic|webp|pdf)$' then
    return;
  end if;
  base := split_part(parts[2], '.', 1);
  if parts[1] = parts[1]::uuid::text and base = base::uuid::text then
    company_id := parts[1]::uuid;
    file_id := base::uuid;
  end if;
end;
$$;
revoke all on function app.file_object_parts(text) from public, anon, authenticated;

create or replace function app.can_read_file_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare p record;
begin
  p := app.file_object_parts(p_name);
  if p.company_id is null then return false; end if;
  return app.is_staff(p.company_id)
      or exists (select 1 from public.files f
                  where f.id = p.file_id and f.company_id = p.company_id
                    and ((app.has_role(f.company_id, array['tech'])
                          and (f.created_by = auth.uid() or (f.visit_id is not null and app.is_visit_assignee(f.visit_id))))
                         -- any member reads back what he uploaded himself (Storage selects the row after an upload)
                         or (app.is_member(f.company_id) and f.created_by = auth.uid())));
end;
$$;

create or replace function app.can_write_file_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare p record;
begin
  p := app.file_object_parts(p_name);
  if p.company_id is null then return false; end if;
  return app.is_staff(p.company_id)
      or exists (select 1 from public.files f
                  where f.id = p.file_id and f.company_id = p.company_id and f.deleted_at is null
                    and app.is_member(f.company_id) and f.created_by = auth.uid()
                    -- the author uploads until the row records the upload: a stored photo is not replaced
                    -- (a «before / after» photo is evidence); a failed upload can be repeated
                    and f.storage_key is null and f.upload_status is distinct from 'uploaded')
         -- one row, one object: no second object of the same file under another extension
         and not exists (select 1 from storage.objects o
                          where o.bucket_id = 'files' and o.name <> p_name
                            and o.name like p.company_id::text || '/' || p.file_id::text || '.%');
end;
$$;
revoke all on function app.can_read_file_object(text), app.can_write_file_object(text) from public, anon;
grant execute on function app.can_read_file_object(text), app.can_write_file_object(text) to authenticated;

drop policy if exists files_bucket_read on storage.objects;
drop policy if exists files_bucket_write on storage.objects;
drop policy if exists files_bucket_update on storage.objects;
create policy files_bucket_read on storage.objects for select to authenticated
  using (bucket_id = 'files' and app.can_read_file_object(name));
create policy files_bucket_write on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and app.can_write_file_object(name));
create policy files_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and app.can_write_file_object(name))
  with check (bucket_id = 'files' and app.can_write_file_object(name));

-- 12 ------------------------------------------------------------------------------------------------
-- new functions of role postgres in any schema: no EXECUTE for PUBLIC unless the migration grants it
-- (global on purpose: a per-schema default cannot take back the PUBLIC right, Postgres docs / T52)
alter default privileges for role postgres revoke execute on functions from public;
revoke execute on all functions in schema app from public;
revoke execute on all functions in schema app from anon;
-- called inside RLS policies of leads, contacts, phones and e-mails by the app's role (they had it through PUBLIC)
grant execute on function
  app.can_see_lead(uuid), app.can_see_contact(uuid), app.is_lead_contact(uuid)
to authenticated;
