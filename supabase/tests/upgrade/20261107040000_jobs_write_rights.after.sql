-- After 17-job §12.1: old jobs stay as they were; UPDATE is by columns, INSERT stays (step 1); the new deposit function is for
-- authenticated only; the old unpaid deposit invoice is still due (the deposit an old queue sends has its invoice).
do $$ begin
  if (select count(*) from public.jobs where company_id = 'cf740000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'upgrade: the old jobs must stay';
  end if;
  if has_column_privilege('authenticated', 'public.jobs', 'contract_total_cents', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.jobs', 'description', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.jobs', 'INSERT') then
    raise exception 'upgrade: jobs — update by columns, insert stays (rule 16 step 1)';
  end if;
  if has_function_privilege('anon', 'public.record_estimate_deposit(uuid, uuid, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.record_estimate_deposit(uuid, uuid, text)', 'EXECUTE') then
    raise exception 'upgrade: record_estimate_deposit — authenticated only (rule 18)';
  end if;
  if (select balance_cents from public.invoices where id = 'cf740000-0000-0000-0000-0000000000a1') <> 2500 then
    raise exception 'upgrade: the unpaid deposit is still due';
  end if;
end $$;
-- the rows stay (invoices are never deleted, t05); they live in their own company, no main test counts it
\echo 'upgrade 20261107040000_jobs_write_rights ok'
