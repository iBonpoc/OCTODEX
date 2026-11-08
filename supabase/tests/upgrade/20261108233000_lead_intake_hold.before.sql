-- Lead intake hardening (spec 34 §3д) on a database that already has a way in and its journal (rule 15)
insert into public.companies (id, name) values ('c1250000-0000-4000-8000-000000000001', 'T125 upgrade co');
insert into public.lead_sources (id, company_id, name, kind) values
  ('c1250000-0000-4000-8000-0000000000a1', 'c1250000-0000-4000-8000-000000000001', 'Website (test)', 'own');
insert into public.intake_endpoints (id, company_id, kind, token_hash, public_token, token_hint, source_id) values
  ('c1250000-0000-4000-8000-0000000000e1', 'c1250000-0000-4000-8000-000000000001', 'form', repeat('c', 64), 'f' || repeat('c', 32), 'cccc', 'c1250000-0000-4000-8000-0000000000a1');
insert into public.intake_events (company_id, endpoint_id, event_key, payload_hash, status) values
  ('c1250000-0000-4000-8000-000000000001', 'c1250000-0000-4000-8000-0000000000e1', 'old-ev', repeat('d', 64), 'accepted');
