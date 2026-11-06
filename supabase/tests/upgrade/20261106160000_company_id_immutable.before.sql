-- before 20261106160000: an old company_secrets row and a second company (two companies of one owner)
insert into public.companies (id, name) values
  ('c1600000-0000-4000-8000-000000000001', 'Upgrade 160000 A'), ('c1600000-0000-4000-8000-000000000002', 'Upgrade 160000 B');
insert into public.company_secrets (company_id, ein) values ('c1600000-0000-4000-8000-000000000001', '11-1111111');
