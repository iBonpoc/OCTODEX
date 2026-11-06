-- After wave П-1 on a database with data: the old company has the five job types, the old job has no type,
-- a paid notice gets its invoice by payload.number; a number with no invoice and other kinds stay empty.
do $$
begin
  if (select array_agg(seed_key order by position) from public.job_types where company_id = 'cf390000-0000-0000-0000-000000000001')
     is distinct from array['install', 'repair', 'service', 'warranty', 'other'] then
    raise exception 'FAILED upgrade 20261106010000: the old company did not get the five job types';
  end if;
  if (select job_type_id from public.jobs where id = 'cf393000-0000-0000-0000-000000000001') is not null then
    raise exception 'FAILED upgrade 20261106010000: an old job got a type it never had';
  end if;
  if (select invoice_id from public.notifications where id = 'cf395000-0000-0000-0000-000000000001') is distinct from 'cf394000-0000-0000-0000-000000000001'::uuid then
    raise exception 'FAILED upgrade 20261106010000: a paid notice did not get its invoice from payload.number';
  end if;
  if (select invoice_id from public.notifications where id = 'cf395000-0000-0000-0000-000000000002') is not null then
    raise exception 'FAILED upgrade 20261106010000: an unknown number got an invoice';
  end if;
  if (select invoice_id from public.notifications where id = 'cf395000-0000-0000-0000-000000000003') is not null then
    raise exception 'FAILED upgrade 20261106010000: a notice that is not about a payment got an invoice';
  end if;
end $$;
\echo 'upgrade 20261106010000 job types and paid notices on old data ok'
-- the money rows of this check go again so later counts of the core tests stay as they were
delete from public.notifications where id::text like 'cf395000-%';
alter table public.invoices disable trigger user;
delete from public.invoices where id = 'cf394000-0000-0000-0000-000000000001';
alter table public.invoices enable trigger user;
