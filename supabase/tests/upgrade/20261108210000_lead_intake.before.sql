-- Lead intake (spec 34) on a database that already has leads and their feed (rule 15): an old lead, a call in its feed
insert into public.companies (id, name) values ('c1120000-0000-4000-8000-000000000001', 'T112 upgrade co');
insert into public.lead_sources (id, company_id, name, kind) values
  ('c1120000-0000-4000-8000-0000000000a1', 'c1120000-0000-4000-8000-000000000001', 'Website (test)', 'own');
insert into public.leads (id, company_id, source_id, contact_name, phone, language) values
  ('c1120000-0000-4000-8000-0000000000b1', 'c1120000-0000-4000-8000-000000000001', 'c1120000-0000-4000-8000-0000000000a1', 'Old Lead', '(626) 555-0112', 'es');
insert into public.activities (company_id, subject_type, subject_id, kind, direction) values
  ('c1120000-0000-4000-8000-000000000001', 'lead', 'c1120000-0000-4000-8000-0000000000b1', 'call', 'out');
