-- Old shape before the links moved out of the row (spec 35 §4е, step 2): three estimates of one company with a link in
-- estimates.public_token — an open one the office made, an open one a tech made (he could read its link), a signed one the
-- tech made (the client's copy keeps its link).
insert into auth.users (id, email, raw_user_meta_data) values ('cf147000-0000-0000-0000-0000000000aa', 'upgrade147@x.test', '{"full_name":"Upgrade Tech 147"}');
insert into public.companies (id, name) values ('cf147000-0000-0000-0000-000000000001', 'Upgrade Links Co');
insert into public.memberships (company_id, user_id, role, status) values ('cf147000-0000-0000-0000-000000000001', 'cf147000-0000-0000-0000-0000000000aa', 'tech', 'active');
insert into public.customers (id, company_id, display_name) values ('cf147100-0000-0000-0000-000000000001', 'cf147000-0000-0000-0000-000000000001', 'Upgrade links client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
  ('cf147200-0000-0000-0000-000000000001', 'cf147000-0000-0000-0000-000000000001', 'cf147100-0000-0000-0000-000000000001', '147 Upgrade St', 'Pasadena');
insert into public.estimates (id, company_id, customer_id, property_id, title, created_by) values
  ('cf147300-0000-0000-0000-000000000001', 'cf147000-0000-0000-0000-000000000001', 'cf147100-0000-0000-0000-000000000001', 'cf147200-0000-0000-0000-000000000001', 'Office, open', null),
  ('cf147300-0000-0000-0000-000000000002', 'cf147000-0000-0000-0000-000000000001', 'cf147100-0000-0000-0000-000000000001', 'cf147200-0000-0000-0000-000000000001', 'Tech, open', 'cf147000-0000-0000-0000-0000000000aa'),
  ('cf147300-0000-0000-0000-000000000003', 'cf147000-0000-0000-0000-000000000001', 'cf147100-0000-0000-0000-000000000001', 'cf147200-0000-0000-0000-000000000001', 'Tech, signed', 'cf147000-0000-0000-0000-0000000000aa');
select set_config('app.signing_estimate', 'cf147300-0000-0000-0000-000000000001', false);
update public.estimates set status = 'sent', public_token = 'tok_upg147_office_0123456789' where id = 'cf147300-0000-0000-0000-000000000001';
select set_config('app.signing_estimate', 'cf147300-0000-0000-0000-000000000002', false);
update public.estimates set status = 'sent', public_token = 'tok_upg147_techopen_012345678' where id = 'cf147300-0000-0000-0000-000000000002';
select set_config('app.signing_estimate', 'cf147300-0000-0000-0000-000000000003', false);
update public.estimates set status = 'sent', public_token = 'tok_upg147_techsigned_0123456' where id = 'cf147300-0000-0000-0000-000000000003';
update public.estimates set status = 'awaiting_countersign' where id = 'cf147300-0000-0000-0000-000000000003';
select set_config('app.signing_estimate', '', false);
