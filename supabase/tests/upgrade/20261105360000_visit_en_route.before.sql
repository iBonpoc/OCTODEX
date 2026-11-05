-- Old shape right before П3c: a visit already «on the way» has no left-at time (the column does not exist yet).
insert into public.companies (id, name) values ('cfb00000-0000-0000-0000-000000000001', 'Upgrade En Route Co');
insert into public.customers (id, company_id, display_name) values ('cfb10000-0000-0000-0000-000000000001', 'cfb00000-0000-0000-0000-000000000001', 'Upgrade en route client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('cfb20000-0000-0000-0000-000000000001', 'cfb00000-0000-0000-0000-000000000001', 'cfb10000-0000-0000-0000-000000000001', '1 On The Way St', 'Pasadena');
insert into public.jobs (id, company_id, number, title, customer_id, property_id) values ('cfb40000-0000-0000-0000-000000000001', 'cfb00000-0000-0000-0000-000000000001', '', 'Upgrade job', 'cfb10000-0000-0000-0000-000000000001', 'cfb20000-0000-0000-0000-000000000001');
insert into public.visits (id, company_id, job_id, starts_at) values ('cfb70000-0000-0000-0000-000000000001', 'cfb00000-0000-0000-0000-000000000001', 'cfb40000-0000-0000-0000-000000000001', now());
update public.visits set status = 'en_route' where id = 'cfb70000-0000-0000-0000-000000000001';
