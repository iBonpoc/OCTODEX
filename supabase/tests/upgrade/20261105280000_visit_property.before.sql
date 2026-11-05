-- Old shape right before П1a: visits find their property through the job; inspections stored as "Estimate visit" jobs.
insert into public.companies (id, name) values ('cfa00000-0000-0000-0000-000000000001', 'Upgrade Visits Co');
insert into public.customers (id, company_id, display_name) values ('cfa10000-0000-0000-0000-000000000001', 'cfa00000-0000-0000-0000-000000000001', 'Upgrade visit client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('cfa20000-0000-0000-0000-000000000001', 'cfa00000-0000-0000-0000-000000000001', 'cfa10000-0000-0000-0000-000000000001', '1 Old Visit St', 'Pasadena');
insert into public.leads (id, company_id, source_id, contact_name, phone, customer_id, property_id)
select 'cfa30000-0000-0000-0000-000000000001', 'cfa00000-0000-0000-0000-000000000001', s.id, 'Old inspection lead', '(818) 555-0901', 'cfa10000-0000-0000-0000-000000000001', 'cfa20000-0000-0000-0000-000000000001'
  from (select id from public.lead_sources where company_id = 'cfa00000-0000-0000-0000-000000000001' order by position, name limit 1) s;
-- 1: an old inspection job (moves to its visit); 2: the same shape but with an invoice (untouched);
-- 3: a real job with a visit (untouched, the visit gets the property); 4: inspection job with an estimate (untouched)
insert into public.jobs (id, company_id, number, title, type, customer_id, property_id) values
  ('cfa40000-0000-0000-0000-000000000001', 'cfa00000-0000-0000-0000-000000000001', '', 'Estimate visit', 'inspection', 'cfa10000-0000-0000-0000-000000000001', 'cfa20000-0000-0000-0000-000000000001'),
  ('cfa40000-0000-0000-0000-000000000002', 'cfa00000-0000-0000-0000-000000000001', '', 'Estimate visit', 'inspection', 'cfa10000-0000-0000-0000-000000000001', 'cfa20000-0000-0000-0000-000000000001'),
  ('cfa40000-0000-0000-0000-000000000003', 'cfa00000-0000-0000-0000-000000000001', '', 'Gutter install', 'install', 'cfa10000-0000-0000-0000-000000000001', 'cfa20000-0000-0000-0000-000000000001');
insert into public.estimates (id, company_id, customer_id, property_id, title) values ('cfa50000-0000-0000-0000-000000000001', 'cfa00000-0000-0000-0000-000000000001', 'cfa10000-0000-0000-0000-000000000001', 'cfa20000-0000-0000-0000-000000000001', 'Old estimate');
insert into public.jobs (id, company_id, number, title, type, customer_id, property_id, estimate_id) values
  ('cfa40000-0000-0000-0000-000000000004', 'cfa00000-0000-0000-0000-000000000001', '', 'Estimate visit', 'inspection', 'cfa10000-0000-0000-0000-000000000001', 'cfa20000-0000-0000-0000-000000000001', 'cfa50000-0000-0000-0000-000000000001');
insert into public.invoices (id, company_id, customer_id, job_id, kind, total_cents) values ('cfa60000-0000-0000-0000-000000000001', 'cfa00000-0000-0000-0000-000000000001', 'cfa10000-0000-0000-0000-000000000001', 'cfa40000-0000-0000-0000-000000000002', 'deposit', 1000);
insert into public.visits (id, company_id, job_id, lead_id, kind, starts_at) values
  ('cfa70000-0000-0000-0000-000000000001', 'cfa00000-0000-0000-0000-000000000001', 'cfa40000-0000-0000-0000-000000000001', 'cfa30000-0000-0000-0000-000000000001', 'inspection', now()),
  ('cfa70000-0000-0000-0000-000000000002', 'cfa00000-0000-0000-0000-000000000001', 'cfa40000-0000-0000-0000-000000000002', 'cfa30000-0000-0000-0000-000000000001', 'inspection', now()),
  ('cfa70000-0000-0000-0000-000000000003', 'cfa00000-0000-0000-0000-000000000001', 'cfa40000-0000-0000-0000-000000000003', null, 'install', now()),
  ('cfa70000-0000-0000-0000-000000000004', 'cfa00000-0000-0000-0000-000000000001', 'cfa40000-0000-0000-0000-000000000004', 'cfa30000-0000-0000-0000-000000000001', 'inspection', now());
-- 5: a real job that happens to be called "Estimate visit" (install, started) — untouched;
-- 6: a lead visit that knows no property at all — kept as legacy, still cancellable
insert into public.jobs (id, company_id, number, title, type, status, customer_id, property_id) values
  ('cfa40000-0000-0000-0000-000000000005', 'cfa00000-0000-0000-0000-000000000001', '', 'Estimate visit', 'install', 'draft', 'cfa10000-0000-0000-0000-000000000001', 'cfa20000-0000-0000-0000-000000000001');
insert into public.visits (id, company_id, job_id, kind, starts_at) values
  ('cfa70000-0000-0000-0000-000000000005', 'cfa00000-0000-0000-0000-000000000001', 'cfa40000-0000-0000-0000-000000000005', 'install', now());
insert into public.leads (id, company_id, source_id, contact_name, phone)
select 'cfa30000-0000-0000-0000-000000000002', 'cfa00000-0000-0000-0000-000000000001', s.id, 'No address lead', '(818) 555-0902'
  from (select id from public.lead_sources where company_id = 'cfa00000-0000-0000-0000-000000000001' order by position, name limit 1) s;
insert into public.visits (id, company_id, lead_id, kind, starts_at) values
  ('cfa70000-0000-0000-0000-000000000006', 'cfa00000-0000-0000-0000-000000000001', 'cfa30000-0000-0000-0000-000000000002', 'inspection', now());
-- 7–11: an old inspection job with a task / note / file / expense / call in its feed — each is kept as it is
insert into public.jobs (id, company_id, number, title, type, customer_id, property_id)
select ('cfa40000-0000-0000-0000-00000000000' || k)::uuid, 'cfa00000-0000-0000-0000-000000000001', '', 'Estimate visit', 'inspection', 'cfa10000-0000-0000-0000-000000000001', 'cfa20000-0000-0000-0000-000000000001'
  from generate_series(7, 9) k;
insert into public.jobs (id, company_id, number, title, type, customer_id, property_id) values
  ('cfa40000-0000-0000-0000-000000000010', 'cfa00000-0000-0000-0000-000000000001', '', 'Estimate visit', 'inspection', 'cfa10000-0000-0000-0000-000000000001', 'cfa20000-0000-0000-0000-000000000001'),
  ('cfa40000-0000-0000-0000-000000000011', 'cfa00000-0000-0000-0000-000000000001', '', 'Estimate visit', 'inspection', 'cfa10000-0000-0000-0000-000000000001', 'cfa20000-0000-0000-0000-000000000001');
insert into public.visits (id, company_id, job_id, lead_id, kind, starts_at)
select ('cfa70000-0000-0000-0000-0000000000' || lpad(k::text, 2, '0'))::uuid, 'cfa00000-0000-0000-0000-000000000001', ('cfa40000-0000-0000-0000-0000000000' || lpad(k::text, 2, '0'))::uuid,
       'cfa30000-0000-0000-0000-000000000001', 'inspection', now()
  from generate_series(7, 11) k;
insert into public.tasks (company_id, subject_type, subject_id, title) values ('cfa00000-0000-0000-0000-000000000001', 'job', 'cfa40000-0000-0000-0000-000000000007', 'Bring the ladder');
insert into public.notes (company_id, subject_type, subject_id, body) values ('cfa00000-0000-0000-0000-000000000001', 'job', 'cfa40000-0000-0000-0000-000000000008', 'Old note');
insert into public.files (company_id, kind, job_id) values ('cfa00000-0000-0000-0000-000000000001', 'photo', 'cfa40000-0000-0000-0000-000000000009');
insert into public.expenses (company_id, vendor, amount_cents, category, job_id) values ('cfa00000-0000-0000-0000-000000000001', 'Home Depot', 1000, 'materials', 'cfa40000-0000-0000-0000-000000000010');
insert into public.activities (company_id, subject_type, subject_id, kind) values ('cfa00000-0000-0000-0000-000000000001', 'job', 'cfa40000-0000-0000-0000-000000000011', 'call');
