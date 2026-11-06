-- Old shape before wave 3c: a job whose visit was paid (visit completed) but the job stayed «scheduled» (the tech could
-- not move it); and a job whose visit is still ahead.
insert into public.companies (id, name) values ('cf460000-0000-0000-0000-000000000001', 'Upgrade Done Co');
insert into public.customers (id, company_id, display_name) values ('cf461000-0000-0000-0000-000000000001', 'cf460000-0000-0000-0000-000000000001', 'Upgrade done client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('cf462000-0000-0000-0000-000000000001', 'cf460000-0000-0000-0000-000000000001', 'cf461000-0000-0000-0000-000000000001', '46 Upgrade St', 'Pasadena');
insert into public.jobs (id, company_id, number, title, customer_id, property_id, status) values
  ('cf463000-0000-0000-0000-000000000001', 'cf460000-0000-0000-0000-000000000001', '', 'Paid visit, stuck job', 'cf461000-0000-0000-0000-000000000001', 'cf462000-0000-0000-0000-000000000001', 'draft'),
  ('cf463000-0000-0000-0000-000000000002', 'cf460000-0000-0000-0000-000000000001', '', 'Visit ahead', 'cf461000-0000-0000-0000-000000000001', 'cf462000-0000-0000-0000-000000000001', 'draft');
update public.jobs set status = 'scheduled' where id in ('cf463000-0000-0000-0000-000000000001', 'cf463000-0000-0000-0000-000000000002');
insert into public.visits (id, company_id, job_id, kind, starts_at, ends_at, status) values
  ('cf464000-0000-0000-0000-000000000001', 'cf460000-0000-0000-0000-000000000001', 'cf463000-0000-0000-0000-000000000001', 'install', now() - interval '1 day', now() - interval '23 hours', 'scheduled'),
  ('cf464000-0000-0000-0000-000000000002', 'cf460000-0000-0000-0000-000000000001', 'cf463000-0000-0000-0000-000000000002', 'install', now() + interval '1 day', now() + interval '25 hours', 'scheduled');
update public.visits set status = 'on_site' where id = 'cf464000-0000-0000-0000-000000000001';
update public.visits set status = 'completed' where id = 'cf464000-0000-0000-0000-000000000001';
