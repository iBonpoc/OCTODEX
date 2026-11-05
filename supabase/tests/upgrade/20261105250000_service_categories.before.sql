-- Old shape right before T1: directions as text in companies.trades[]; estimates/jobs.service_category_id unused.
insert into public.companies (id, name, trades) values
  ('cf900000-0000-0000-0000-000000000001', 'Upgrade Directions Co', array['gutters', 'Roofing', ' Pressure washing ', '', null, 'gutters', 'pressure washing']),
  ('cf900000-0000-0000-0000-000000000002', 'Upgrade No Directions Co', '{}');
insert into public.customers (id, company_id, display_name) values ('cf910000-0000-0000-0000-000000000001', 'cf900000-0000-0000-0000-000000000001', 'Upgrade client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('cf920000-0000-0000-0000-000000000001', 'cf900000-0000-0000-0000-000000000001', 'cf910000-0000-0000-0000-000000000001', '1 Upgrade St', 'Pasadena');
insert into public.estimates (id, company_id, customer_id, property_id, title) values ('cf930000-0000-0000-0000-000000000001', 'cf900000-0000-0000-0000-000000000001', 'cf910000-0000-0000-0000-000000000001', 'cf920000-0000-0000-0000-000000000001', 'Upgrade estimate');
insert into public.jobs (id, company_id, title, customer_id, property_id) values ('cf940000-0000-0000-0000-000000000001', 'cf900000-0000-0000-0000-000000000001', 'Upgrade job', 'cf910000-0000-0000-0000-000000000001', 'cf920000-0000-0000-0000-000000000001');
-- junk in the never-used columns, and an old updated_at that must survive
alter table public.estimates disable trigger user;
update public.estimates set service_category_id = gen_random_uuid(), updated_at = '2026-03-01T00:00:00Z' where id = 'cf930000-0000-0000-0000-000000000001';
alter table public.estimates enable trigger user;
alter table public.jobs disable trigger user;
update public.jobs set service_category_id = gen_random_uuid(), updated_at = '2026-03-01T00:00:00Z' where id = 'cf940000-0000-0000-0000-000000000001';
alter table public.jobs enable trigger user;
alter table public.companies disable trigger user;
update public.companies set updated_at = '2026-03-01T00:00:00Z' where id::text like 'cf900000%';
alter table public.companies enable trigger user;
