-- only the object is carried over, switched off, with no trial; the empty and the array are skipped (no failure)
do $$
begin
  if (select count(*) from public.company_modules where company_id::text like 'c9000000-%') <> 1
     or not exists (select 1 from public.company_modules where company_id = 'c9000000-0000-4000-8000-000000000001'
                      and module_key = 'gutters' and not enabled and trial_ends_at is null and settings->>'coilWastePct' = '0.07') then
    raise exception 'FAILED: C1 upgrade carries over only object gutter_settings, switched off';
  end if;
end $$;
delete from public.company_modules where company_id::text like 'c9000000-%';
\echo 'C1 upgrade: gutter_settings carried over (objects only) ok'
