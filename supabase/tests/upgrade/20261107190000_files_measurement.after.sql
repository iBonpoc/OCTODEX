-- After M5d: old files keep everything and get no measurement; the new keys and the check are validated (not left
-- NOT VALID); the rules of files are still there
do $$
begin
  if (select count(*) from public.files where company_id = 'c9400000-0000-4000-8000-000000000001'
        and measurement_id is null and element_id is null) <> 2
     or (select kind from public.files where id = 'c9400000-0000-4000-8000-0000000000f1') <> 'document'
     or (select upload_status from public.files where id = 'c9400000-0000-4000-8000-0000000000f2') <> 'local'
     or exists (select 1 from pg_constraint where conname in ('files_measurement_fk', 'files_element_fk', 'files_measurement_shape_check') and not convalidated)
     or (select count(*) from pg_constraint where conname in ('files_measurement_fk', 'files_element_fk', 'files_measurement_shape_check')) <> 3
     or (select count(*) from pg_policies where tablename = 'files' and policyname in ('files_select', 'files_insert', 'files_update')) <> 3 then
    raise exception 'FAILED: M5d upgrade — old files untouched, keys validated, rules in place';
  end if;
end $$;
delete from public.files where company_id = 'c9400000-0000-4000-8000-000000000001';
\echo 'M5d upgrade: old files untouched, measurement keys validated ok'
