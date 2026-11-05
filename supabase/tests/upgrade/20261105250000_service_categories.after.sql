-- After T1: trades[] moved in order without blanks or duplicates; junk cleared without touching versions.
do $$
declare v text;
begin
  select string_agg(coalesce(seed_key, '-') || '/' || coalesce(name, '-') || '/' || position, ',' order by position) into v
    from public.service_categories where company_id = 'cf900000-0000-0000-0000-000000000001';
  if v is distinct from 'gutters/-/0,roofing/-/1,-/Pressure washing/2' then raise exception 'upgrade: directions moved in order, got %', v; end if;
  if (select count(*) from public.service_categories where company_id = 'cf900000-0000-0000-0000-000000000002') <> 0 then
    raise exception 'upgrade: no directions out of nothing (primary_trade is not moved)'; end if;
  if (select service_category_id from public.estimates where id = 'cf930000-0000-0000-0000-000000000001') is not null
     or (select service_category_id from public.jobs where id = 'cf940000-0000-0000-0000-000000000001') is not null then
    raise exception 'upgrade: junk directions cleared'; end if;
  if (select updated_at from public.estimates where id = 'cf930000-0000-0000-0000-000000000001') <> '2026-03-01T00:00:00Z'
     or (select row_version from public.estimates where id = 'cf930000-0000-0000-0000-000000000001') <> 1
     or (select updated_at from public.jobs where id = 'cf940000-0000-0000-0000-000000000001') <> '2026-03-01T00:00:00Z' then
    raise exception 'upgrade: clearing did not bump versions'; end if;
  if (select count(*) from public.companies where id::text like 'cf900000%' and updated_at = '2026-03-01T00:00:00Z') <> 2 then
    raise exception 'upgrade: companies untouched'; end if;
  if (select count(*) from pg_constraint where conname in ('leads_service_category_fk', 'estimates_service_category_fk', 'jobs_service_category_fk')) <> 3 then
    raise exception 'upgrade: company-safe keys exist'; end if;
  if (select trades from public.companies where id = 'cf900000-0000-0000-0000-000000000001') is null then
    raise exception 'upgrade: trades column kept for now'; end if;
end $$;
\echo 'upgrade 20261105250000_service_categories ok'
