-- Before the guard on users.last_active_company_id (spec 42 §14, #1673): a value written by hand that points at a company
-- the person is not in (anyone could, only the FK checked it), and a right one (an accepted invitation).
insert into public.companies (id, name) values ('cacc0000-0000-4000-8000-000000000285', 'Upgrade Last Active Co');
insert into auth.users (id, email, raw_user_meta_data) values
  ('cacc0000-0000-4000-8000-0000000002a1', 'upg285-out@a.test', '{"full_name":"Out Sider"}'),
  ('cacc0000-0000-4000-8000-0000000002a2', 'upg285-in@a.test', '{"full_name":"In Sider"}');
insert into public.memberships (company_id, user_id, role, status) values
  ('cacc0000-0000-4000-8000-000000000285', 'cacc0000-0000-4000-8000-0000000002a2', 'tech', 'active');
update public.users set last_active_company_id = 'cacc0000-0000-4000-8000-000000000285'
 where id in ('cacc0000-0000-4000-8000-0000000002a1', 'cacc0000-0000-4000-8000-0000000002a2');
