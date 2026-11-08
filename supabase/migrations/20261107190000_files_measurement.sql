-- M5d (docs/specs/33-gutters-screens.md П21.10; spec 33 §3, П19.2 №7): photos of a measurement and of its element.
--   files.measurement_id  the measurement a photo belongs to (the module Gutters)
--   files.element_id      the drawn element (a run, a downspout) of that same measurement
-- Rule 16, step 1: two nullable columns are added; nothing is renamed or dropped. Older phones never send them and
-- read files as before. files is a BIG table: the keys and checks are added NOT VALID (no long lock of the phones'
-- writes) here and validated in 20261107190200 (its own transaction: SHARE UPDATE EXCLUSIVE, the phones write on —
-- review security-check M5d №4); the indexes are built concurrently in 20261107190100.
-- Rights (П21.10 «RLS как у замера»): a measurement's photo is seen by whoever sees the measurement
-- (app.gutter_sees_measurement: the office, a tech — his own, on his leads, on the properties of his visits; a
-- subcontractor — none); it is written only by such a person AND only while the module is active (founder О2: after
-- the trial nothing is saved, the office included). The Storage object follows its files row (can_read_file_object).
-- At most 300 photos per measurement (a loop must not fill the database; like the element limit).

revoke all on public.files from anon, authenticated;
grant select, insert, update on public.files to authenticated;

alter table public.files add column if not exists measurement_id uuid;
alter table public.files add column if not exists element_id uuid;

-- an element is pointed at with its measurement and company: a photo can never sit on another measurement's element
alter table public.gutter_measurement_elements
  add constraint gutter_measurement_elements_id_measurement_company_key unique (id, measurement_id, company_id);

alter table public.files add constraint files_measurement_fk
  foreign key (measurement_id, company_id) references public.gutter_measurements (id, company_id) not valid;
alter table public.files add constraint files_element_fk
  foreign key (element_id, measurement_id, company_id)
  references public.gutter_measurement_elements (id, measurement_id, company_id) not valid;
-- an element's photo names its measurement too; a measurement holds photos only, and only its own: a photo of a
-- visit, a job or a client is never also a measurement's (it would reach whoever sees the measurement — review №1)
alter table public.files add constraint files_measurement_shape_check
  check ((element_id is null or measurement_id is not null)
         and (measurement_id is null or (kind = 'photo' and visit_id is null and job_id is null and customer_id is null))) not valid;

-- the measurement and the element of a photo are set when it is made and never change (review №2: no moving a photo
-- to another measurement, no unpinning it after the trial); the server's own roles too
create or replace function app.tg_files_measurement_fixed()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.measurement_id is distinct from old.measurement_id or new.element_id is distinct from old.element_id then
    raise exception 'a photo''s measurement is set once' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_files_measurement_fixed() from public, anon, authenticated;
create trigger t06_measurement_fixed before update of measurement_id, element_id on public.files
  for each row execute function app.tg_files_measurement_fixed();

-- at most 300 live photos per measurement (counted by the measurement_id index of 20261107190100): a new one or one
-- brought back (undo of a removal). Counted within the row's company: a stranger learns nothing of another company's
-- measurement (review №5б). P0001 — a refusal the queue does not repeat (54000 would be retried — review №5в).
create or replace function app.tg_files_measurement_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if new.measurement_id is null or new.deleted_at is not null
     or (tg_op = 'UPDATE' and old.deleted_at is null) then
    return new;
  end if;
  select count(*) into n from public.files
   where measurement_id = new.measurement_id and company_id = new.company_id and deleted_at is null;
  if n >= 300 then
    raise exception 'a measurement has at most 300 photos' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
-- rule 18 (T52): a trigger function; nobody calls it
revoke all on function app.tg_files_measurement_limit() from public, anon, authenticated;
create trigger t07_measurement_limit before insert or update of deleted_at on public.files
  for each row execute function app.tg_files_measurement_limit();

-- who sees a file: as before, and a tech also the photos of a measurement he sees
drop policy if exists files_select on public.files;
create policy files_select on public.files for select to authenticated
  using (app.is_staff(company_id) or (app.has_role(company_id, array['tech'])
         and (created_by = (select auth.uid())
              or (visit_id is not null and app.is_visit_assignee(visit_id))
              or (measurement_id is not null and app.gutter_sees_measurement(measurement_id)))));

-- writing: as before, and a measurement's photo only on a measurement the person sees while the module is active
drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated
  with check ((app.is_staff(company_id)
               or (app.is_member(company_id)
                   and (customer_id is null or app.is_customer_assignee(customer_id))
                   and (job_id is null or app.is_job_assignee(job_id))
                   and (visit_id is null or app.is_visit_assignee(visit_id))))
              and (measurement_id is null
                   or (app.gutter_sees_measurement(measurement_id) and app.module_active(company_id, 'gutters'))));
drop policy if exists files_update on public.files;
create policy files_update on public.files for update to authenticated
  using (app.is_staff(company_id) or (app.is_member(company_id) and created_by = (select auth.uid())))
  with check ((app.is_staff(company_id)
               or (app.is_member(company_id) and created_by = (select auth.uid())
                   and (customer_id is null or app.is_customer_assignee(customer_id))
                   and (job_id is null or app.is_job_assignee(job_id))
                   and (visit_id is null or app.is_visit_assignee(visit_id))))
              and (measurement_id is null
                   or (app.gutter_sees_measurement(measurement_id) and app.module_active(company_id, 'gutters'))));

-- the Storage object of a measurement's photo is read by whoever sees the measurement (writing is unchanged:
-- the author until the upload is recorded, can_write_file_object)
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
                          and (f.created_by = auth.uid()
                               or (f.visit_id is not null and app.is_visit_assignee(f.visit_id))
                               or (f.measurement_id is not null and app.gutter_sees_measurement(f.measurement_id))))
                         -- any member reads back what he uploaded himself (Storage selects the row after an upload)
                         or (app.is_member(f.company_id) and f.created_by = auth.uid())));
end;
$$;
revoke all on function app.can_read_file_object(text) from public, anon;
grant execute on function app.can_read_file_object(text) to authenticated;

-- the bytes of a measurement's photo go up only while the module is active (founder О2; review №3: a row made in the
-- trial, its upload after it). Otherwise as before (20261106100000).
create or replace function app.can_write_file_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare p record;
begin
  p := app.file_object_parts(p_name);
  if p.company_id is null then return false; end if;
  -- a measurement's photo: nobody uploads while the module is not active, the office included
  if exists (select 1 from public.files f where f.id = p.file_id and f.company_id = p.company_id and f.measurement_id is not null)
     and not app.module_active(p.company_id, 'gutters') then
    return false;
  end if;
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
revoke all on function app.can_write_file_object(text) from public, anon;
grant execute on function app.can_write_file_object(text) to authenticated;
