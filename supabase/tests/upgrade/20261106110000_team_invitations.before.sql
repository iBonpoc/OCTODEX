-- Old shape before wave 7-2: a member switched off with the old status «suspended».
insert into auth.users (id, email, raw_user_meta_data) values ('cf480000-0000-0000-0000-0000000000aa', 'upgrade48@x.test', '{"full_name":"Upgrade Suspended"}');
insert into public.companies (id, name) values ('cf480000-0000-0000-0000-000000000001', 'Upgrade Team Co');
insert into public.memberships (company_id, user_id, role, status, suspended_at) values
  ('cf480000-0000-0000-0000-000000000001', 'cf480000-0000-0000-0000-0000000000aa', 'tech', 'suspended', now());
