-- M5d on a database that already has files (rule 15): an old visit-less document and an old photo of a company
insert into public.companies (id, name) values ('c9400000-0000-4000-8000-000000000001', 'T94 upgrade co');
insert into public.files (id, company_id, kind, upload_status) values
  ('c9400000-0000-4000-8000-0000000000f1', 'c9400000-0000-4000-8000-000000000001', 'document', 'uploaded'),
  ('c9400000-0000-4000-8000-0000000000f2', 'c9400000-0000-4000-8000-000000000001', 'photo', 'local');
