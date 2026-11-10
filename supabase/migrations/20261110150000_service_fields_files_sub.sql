-- Two core fixes (issues #608, #610). No column, no table, no grant widening beyond what is written below.
--
-- #608. app.tg_service_fields on INSERT copied updated_at from created_at, and created_at comes from the phone
-- (a row made offline carries the hour it was made). A row inserted «in the past» then had an updated_at in the past
-- too: whatever reads changes by updated_at (another phone, a later sync, «last activity») would miss it. Now the
-- server stamps updated_at with its own now() on insert; the phone's created_at stays (the hour the thing was made).
-- Rows the server inserts itself are unchanged (created_at = now() there anyway). Test T163.
create or replace function app.tg_service_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at  := coalesce(new.created_at, now());
    new.created_by  := coalesce(auth.uid(), new.created_by);
    new.updated_at  := now();
    new.updated_by  := new.created_by;
    new.row_version := 1;
  else
    new.created_at  := old.created_at;
    new.created_by  := old.created_by;
    new.updated_at  := now();
    new.updated_by  := coalesce(auth.uid(), new.updated_by);
    new.row_version := old.row_version + 1;
  end if;
  return new;
end;
$$;
-- rule 18 (T52): a trigger function; nobody calls it
revoke all on function app.tg_service_fields() from public, anon, authenticated;

-- #610. files_select (and the Storage read rule) let in only the office and a «tech». A subcontractor (server role
-- subcontractor; in the app he works as a tech) did not see even the row of his own photo: the app's insert … select
-- came back empty, storage_key was never written, the photo hung «sending». Now any member sees the files he made
-- himself, and a tech or a subcontractor the files of a visit he is on. A measurement's photos: as before (a tech,
-- by the gutters module's rule). Test T164.
drop policy if exists files_select on public.files;
create policy files_select on public.files for select to authenticated
  using (app.is_staff(company_id)
         or (app.is_member(company_id) and created_by = (select auth.uid()))
         or (app.has_role(company_id, array['tech', 'subcontractor'])
             and visit_id is not null and app.is_visit_assignee(visit_id))
         or (app.has_role(company_id, array['tech'])
             and measurement_id is not null and app.gutter_sees_measurement(measurement_id)));

-- the Storage object: by the same rule as the row (20261107190000, plus the subcontractor on his visit)
create or replace function app.can_read_file_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare p record;
begin
  p := app.file_object_parts(p_name);
  if p.company_id is null then return false; end if;
  return app.is_staff(p.company_id)
      or exists (select 1 from public.files f
                  where f.id = p.file_id and f.company_id = p.company_id
                    and ((app.is_member(f.company_id) and f.created_by = auth.uid())
                         or (app.has_role(f.company_id, array['tech', 'subcontractor'])
                             and f.visit_id is not null and app.is_visit_assignee(f.visit_id))
                         or (app.has_role(f.company_id, array['tech'])
                             and f.measurement_id is not null and app.gutter_sees_measurement(f.measurement_id))));
end;
$$;
revoke all on function app.can_read_file_object(text) from public, anon;
grant execute on function app.can_read_file_object(text) to authenticated;
