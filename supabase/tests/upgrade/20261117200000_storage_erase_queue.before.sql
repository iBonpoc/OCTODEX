-- Before 50-3: a person with a profile picture (his own photo, not linked to any job), in a company.
insert into auth.users (id, email, raw_user_meta_data) values
  ('cf5a0000-0000-0000-0000-0000000000aa', 'upgrade503o@x.test', '{"full_name":"Upgrade Owner 503"}'),
  ('cf5a0000-0000-0000-0000-0000000000bb', 'upgrade503t@x.test', '{"full_name":"Upgrade Tech 503"}');
insert into public.companies (id, name) values ('cf5a0000-0000-0000-0000-000000000001', 'Upgrade Storage Co');
insert into public.memberships (company_id, user_id, role, status) values
  ('cf5a0000-0000-0000-0000-000000000001', 'cf5a0000-0000-0000-0000-0000000000aa', 'owner', 'active'),
  ('cf5a0000-0000-0000-0000-000000000001', 'cf5a0000-0000-0000-0000-0000000000bb', 'tech', 'active');
insert into public.files (id, company_id, kind, storage_key, created_by) values
  ('cf5a0000-0000-0000-0000-0000000000f1', 'cf5a0000-0000-0000-0000-000000000001', 'photo', 'cf5a0000-0000-0000-0000-000000000001/upgrade-avatar.jpg', 'cf5a0000-0000-0000-0000-0000000000bb');
update public.users set avatar_file_id = 'cf5a0000-0000-0000-0000-0000000000f1' where id = 'cf5a0000-0000-0000-0000-0000000000bb';
