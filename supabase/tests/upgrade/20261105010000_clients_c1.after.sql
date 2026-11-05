-- After C1: old clients numbered in creation order, their phone / email copied as primary, default tags, updated_at kept.
do $$
declare a text; b text;
begin
  select number into a from public.customers where id = 'cf210000-0000-0000-0000-000000000001';
  select number into b from public.customers where id = 'cf210000-0000-0000-0000-000000000002';
  if a is distinct from 'CLT-0001' or b is distinct from 'CLT-0002' then raise exception 'upgrade: old clients numbered in order, got % %', a, b; end if;
  if (select count(*) from public.contact_phones where contact_id in ('cf220000-0000-0000-0000-000000000001', 'cf220000-0000-0000-0000-000000000002') and is_primary) <> 2 then
    raise exception 'upgrade: old phones copied as primary'; end if;
  if (select count(*) from public.contact_emails where contact_id = 'cf220000-0000-0000-0000-000000000001' and address = 'older@example.com' and is_primary) <> 1 then
    raise exception 'upgrade: old email copied as primary'; end if;
  if (select count(*) from public.contact_emails where contact_id = 'cf220000-0000-0000-0000-000000000002') <> 0 then
    raise exception 'upgrade: no email, nothing copied'; end if;
  if (select count(*) from public.tags where company_id = 'cf200000-0000-0000-0000-000000000000') <> 4 then
    raise exception 'upgrade: existing company got default tags'; end if;
  if (select count(*) from public.customers where company_id = 'cf200000-0000-0000-0000-000000000000' and updated_at <> '2026-03-01T00:00:00Z') <> 0 then
    raise exception 'upgrade: numbering did not touch updated_at'; end if;
end $$;
delete from public.contact_phones where company_id = 'cf200000-0000-0000-0000-000000000000';
delete from public.contact_emails where company_id = 'cf200000-0000-0000-0000-000000000000';
delete from public.tags where company_id = 'cf200000-0000-0000-0000-000000000000';
update public.customers set primary_contact_id = null where company_id = 'cf200000-0000-0000-0000-000000000000';
delete from public.contacts where company_id = 'cf200000-0000-0000-0000-000000000000';
delete from public.customers where company_id = 'cf200000-0000-0000-0000-000000000000';
\echo 'upgrade 20261105010000_clients_c1 ok'
