-- After wave П-2a on a database with data: old clients pay tax as before, an old job keeps its total and gets no tax.
do $$
begin
  if (select tax_exempt from public.customers where id = 'cf411000-0000-0000-0000-000000000001') is distinct from false then
    raise exception 'FAILED upgrade 20261106020000: an old client became exempt';
  end if;
  if (select contract_total_cents from public.jobs where id = 'cf413000-0000-0000-0000-000000000001') <> 42000 then
    raise exception 'FAILED upgrade 20261106020000: an old job total changed';
  end if;
  if (select tax_enabled or tax_rate_bps <> 0 from public.jobs where id = 'cf413000-0000-0000-0000-000000000001') then
    raise exception 'FAILED upgrade 20261106020000: an old job got a tax';
  end if;
end $$;
-- a job with no lines of its own keeps the total the app writes (as before the migration)
update public.jobs set contract_total_cents = 43000 where id = 'cf413000-0000-0000-0000-000000000001';
do $$ begin
  if (select contract_total_cents from public.jobs where id = 'cf413000-0000-0000-0000-000000000001') <> 43000 then
    raise exception 'FAILED upgrade 20261106020000: a job without lines no longer takes the app total';
  end if;
end $$;
\echo 'upgrade 20261106020000 old clients and job totals ok'
