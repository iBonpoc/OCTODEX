-- After the invoice money guard on a database with data: old invoices pass the new checks, payments still recalc.
do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.invoices'::regclass
              and conname in ('invoices_subtotal_not_negative', 'invoices_total_not_negative') and not convalidated)
     or (select count(*) from pg_constraint where conrelid = 'public.invoices'::regclass
          and conname in ('invoices_subtotal_not_negative', 'invoices_total_not_negative')) <> 2 then
    raise exception 'FAILED upgrade 20261106080000: the checks are not validated';
  end if;
  if (select paid_cents <> 2000 or payment_status <> 'partially_paid' from public.invoices where id = 'cf532000-0000-0000-0000-000000000001') then
    raise exception 'FAILED upgrade 20261106080000: an old invoice changed';
  end if;
  insert into public.payments (company_id, invoice_id, customer_id, method, amount_cents, status, idempotency_key) values
    ('cf530000-0000-0000-0000-000000000001', 'cf532000-0000-0000-0000-000000000001', 'cf531000-0000-0000-0000-000000000001', 'cash', 3000, 'succeeded', 'upgrade-t53-2');
  if (select paid_cents <> 5000 or payment_status <> 'paid' from public.invoices where id = 'cf532000-0000-0000-0000-000000000001') then
    raise exception 'FAILED upgrade 20261106080000: an old invoice does not take payments';
  end if;
end $$;
\echo 'upgrade 20261106080000 old invoices pass the money checks ok'
