-- Old-shape leads right before L2 part 2: phone / phone2 / email on the lead row, extra people in lead_contacts.
insert into public.companies (id, name) values ('cf400000-0000-0000-0000-000000000000', 'Upgrade Lead People Co');
-- an open lead: two phones and an email on the row, a tenant in lead_contacts
insert into public.leads (id, company_id, source_id, contact_name, phone, phone2, phone2_label, email)
select 'cf410000-0000-0000-0000-000000000001', 'cf400000-0000-0000-0000-000000000000', s.id, 'Open lead', '(818) 555-0501', '(818) 555-0502', 'work', 'open@example.com'
  from (select id from public.lead_sources where company_id = 'cf400000-0000-0000-0000-000000000000' order by position, name limit 1) s;
insert into public.lead_contacts (company_id, lead_id, name, role, phone)
values ('cf400000-0000-0000-0000-000000000000', 'cf410000-0000-0000-0000-000000000001', 'Tina Tenant', 'tenant', '(818) 555-0503');
-- a lead that already became a client: the client's person has the same phone; a spouse only in lead_contacts
insert into public.customers (id, company_id, display_name) values ('cf420000-0000-0000-0000-000000000001', 'cf400000-0000-0000-0000-000000000000', 'Won lead');
insert into public.contacts (id, company_id, customer_id, name, phone, is_primary)
values ('cf430000-0000-0000-0000-000000000001', 'cf400000-0000-0000-0000-000000000000', 'cf420000-0000-0000-0000-000000000001', 'Won lead', '(818) 555-0511', true);
insert into public.contact_phones (company_id, contact_id, number, is_primary)
values ('cf400000-0000-0000-0000-000000000000', 'cf430000-0000-0000-0000-000000000001', '(818) 555-0511', true);
update public.customers set primary_contact_id = 'cf430000-0000-0000-0000-000000000001' where id = 'cf420000-0000-0000-0000-000000000001';
insert into public.leads (id, company_id, source_id, contact_name, phone, phone2, customer_id)
select 'cf410000-0000-0000-0000-000000000002', 'cf400000-0000-0000-0000-000000000000', s.id, 'Won lead', '818-555-0511', '(818) 555-0512', 'cf420000-0000-0000-0000-000000000001'
  from (select id from public.lead_sources where company_id = 'cf400000-0000-0000-0000-000000000000' order by position, name limit 1) s;
insert into public.lead_contacts (company_id, lead_id, name, role, phone)
values ('cf400000-0000-0000-0000-000000000000', 'cf410000-0000-0000-0000-000000000002', 'Sam Spouse', 'spouse', '(818) 555-0513');
alter table public.leads disable trigger user;
update public.leads set updated_at = '2026-03-01T00:00:00Z' where company_id = 'cf400000-0000-0000-0000-000000000000';
alter table public.leads enable trigger user;
