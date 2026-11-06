-- Old shape before wave 4b-1: a client already marked «do not service» still has an open estimate link.
insert into public.companies (id, name) values ('cf440000-0000-0000-0000-000000000001', 'Upgrade DNS Co');
insert into public.customers (id, company_id, display_name, status, do_not_service_reason) values
  ('cf441000-0000-0000-0000-000000000001', 'cf440000-0000-0000-0000-000000000001', 'Upgrade closed client', 'do_not_service', 'old mark'),
  ('cf441000-0000-0000-0000-000000000002', 'cf440000-0000-0000-0000-000000000001', 'Upgrade open client', 'active', null);
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
  ('cf442000-0000-0000-0000-000000000001', 'cf440000-0000-0000-0000-000000000001', 'cf441000-0000-0000-0000-000000000001', '44 Upgrade St', 'Pasadena'),
  ('cf442000-0000-0000-0000-000000000002', 'cf440000-0000-0000-0000-000000000001', 'cf441000-0000-0000-0000-000000000002', '45 Upgrade St', 'Pasadena');
insert into public.estimates (id, company_id, customer_id, property_id, title) values
  ('cf443000-0000-0000-0000-000000000001', 'cf440000-0000-0000-0000-000000000001', 'cf441000-0000-0000-0000-000000000001', 'cf442000-0000-0000-0000-000000000001', 'Old link, closed client'),
  ('cf443000-0000-0000-0000-000000000002', 'cf440000-0000-0000-0000-000000000001', 'cf441000-0000-0000-0000-000000000002', 'cf442000-0000-0000-0000-000000000002', 'Old link, open client');
select set_config('app.signing_estimate', 'cf443000-0000-0000-0000-000000000001', false);
update public.estimates set status = 'sent', public_token = 'tok_upg44_closed_0123456789' where id = 'cf443000-0000-0000-0000-000000000001';
select set_config('app.signing_estimate', 'cf443000-0000-0000-0000-000000000002', false);
update public.estimates set status = 'sent', public_token = 'tok_upg44_open_0123456789ab' where id = 'cf443000-0000-0000-0000-000000000002';
select set_config('app.signing_estimate', '', false);
