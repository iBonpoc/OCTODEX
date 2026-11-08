-- CH1a on a database that already has checklists (rule 15): old arrays in visits.checklist — a uuid item (ticked), a
-- non-uuid id, the same id in two visits, junk (no label, not an object)
insert into public.companies (id, name) values ('c1010000-0000-4000-8000-000000000001', 'T101 upgrade co');
insert into public.customers (id, company_id, display_name) values ('c1010000-0000-4000-8000-0000000000c1', 'c1010000-0000-4000-8000-000000000001', 'T101 Home');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
  ('c1010000-0000-4000-8000-0000000000d1', 'c1010000-0000-4000-8000-000000000001', 'c1010000-0000-4000-8000-0000000000c1', '101 Home St', 'Pasadena');
insert into public.jobs (id, company_id, title, customer_id, property_id, status) values
  ('c1010000-0000-4000-8000-0000000000e1', 'c1010000-0000-4000-8000-000000000001', 'T101 job', 'c1010000-0000-4000-8000-0000000000c1', 'c1010000-0000-4000-8000-0000000000d1', 'draft');
insert into public.visits (id, company_id, job_id, starts_at, checklist) values
  ('c1010000-0000-4000-8000-0000000000f1', 'c1010000-0000-4000-8000-000000000001', 'c1010000-0000-4000-8000-0000000000e1', now(),
   '[{"id":"c1010000-0000-4000-8000-0000000000a1","label":"Confirm scope","done":true},
     {"id":"v1-c1","label":"Clean up","done":false},
     {"id":"c1010000-0000-4000-8000-0000000000a3","label":"Walk through","done":false},
     {"label":""}, 7]'),
  ('c1010000-0000-4000-8000-0000000000f2', 'c1010000-0000-4000-8000-000000000001', 'c1010000-0000-4000-8000-0000000000e1', now() + interval '1 day',
   '[{"id":"c1010000-0000-4000-8000-0000000000a3","label":"Walk through","done":true}]'),
  ('c1010000-0000-4000-8000-0000000000f3', 'c1010000-0000-4000-8000-000000000001', 'c1010000-0000-4000-8000-0000000000e1', now() + interval '2 days', '[]');
