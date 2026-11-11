-- #868 (Q-42, audit 2026-11-11): what sales may do with the company's money — two holes in the database.
--   1) payments_insert_staff let sales write a payment straight into payments: «Принять оплату» on an invoice
--      (ops.ts payment.record, invoice.pay). Spec 13 §4: sales take no payments on invoices. The deposit at the
--      signing (public.record_estimate_deposit, spec 17, T73) and the payment on a visit (public.record_visit_payment)
--      are security-definer functions with their own role lists: not changed here (the second is founder's #1042).
--   2) expenses_select / expenses_update went by app.is_staff, which counts sales: sales read every expense of the
--      company (and the app shows «Прибыль» from them) and could change other people's. Now sales read and change only
--      their own, like the tech (founder's #1042: by default sales do not see the company's expenses and profit).
-- Only policies change (alter policy: the grants stay as they are). Rule 16 — nothing is renamed or dropped. An older
-- build signed in as sales that sends a payment gets the server's refusal (42501): the op goes to «отклонённые»
-- (outboxRejected), nothing is lost silently; an older sales build cannot record a deposit until it is updated. Test T191.

alter policy payments_insert_staff on public.payments
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));

alter policy expenses_select on public.expenses
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (app.has_role(company_id, array['tech', 'sales']) and deleted_at is null and created_by = (select auth.uid())));

alter policy expenses_update on public.expenses
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (created_by = (select auth.uid()) and app.is_member(company_id) and deleted_at is null))
  with check (app.has_role(company_id, array['owner', 'admin', 'office'])
              or (created_by = (select auth.uid()) and app.is_member(company_id)));

-- 3) security-check of #1061 (В-1): sales paid a deposit invoice of their own through record_estimate_deposit. The app never
-- inserts a deposit invoice (the signature makes it, countersign / execute_estimate; invoice.issue sends progress / final
-- only): sales may not insert one, and the function pays sales only the deposit the signature made. The function keeps its
-- signature (rule 16); rule 18 — revoke, then the same grant as before.
alter policy invoices_insert on public.invoices
  with check (app.has_role(company_id, array['owner', 'admin', 'office', 'sales'])
              and (kind <> 'deposit' or app.has_role(company_id, array['owner', 'admin', 'office'])));

create or replace function public.record_estimate_deposit(p_estimate_id uuid, p_payment_id uuid, p_method text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  e public.estimates;
  v_job uuid;
  i public.invoices;
  p public.payments;
begin
  -- rights first, one answer for «not found» and «not yours»
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null;
  if e.id is null or v_me is null or not app.has_role(e.company_id, array['owner', 'admin', 'office', 'sales']) then
    raise exception 'only the office takes a deposit' using errcode = '42501';
  end if;
  if p_payment_id is null then
    raise exception 'a payment needs its id' using errcode = '22023';
  end if;
  -- offline replay: the same payment again is the same payment — only a payment of THIS company on the deposit invoice of
  -- THIS estimate counts; an id taken elsewhere is refused (22023), never a silent «done», never a hint about another company
  select * into p from public.payments where company_id = e.company_id and (id = p_payment_id or idempotency_key = p_payment_id::text) limit 1;
  if p.id is not null then
    if not exists (select 1 from public.invoices i2 join public.jobs j2 on j2.id = i2.job_id
                    where i2.id = p.invoice_id and i2.kind = 'deposit' and j2.estimate_id = e.id) then
      raise exception 'this payment id is taken' using errcode = '22023';
    end if;
    return jsonb_build_object('payment_id', p.id, 'invoice_id', p.invoice_id, 'repeat', true, 'already_paid', false);
  end if;
  if exists (select 1 from public.payments where id = p_payment_id or idempotency_key = p_payment_id::text) then
    raise exception 'this payment id is taken' using errcode = '22023';   -- the same answer as above: nothing about whose
  end if;
  if p_method is null or p_method not in ('card', 'cash', 'check', 'zelle', 'ach', 'other') then
    raise exception 'unknown payment method' using errcode = '22023';
  end if;

  select id into v_job from public.jobs where estimate_id = e.id and deleted_at is null;
  if v_job is null then
    -- the signature makes the job, and its op is ahead in the same queue (the queue goes strictly in order): no job here
    -- means the signature never got through or the estimate was approved the old way: waiting will not make the job. A
    -- «later» (transient) is never dropped, so it would hold the whole queue forever; a refusal is counted (MAX_TRIES) and
    -- then dropped, the phone reloads the truth and the estimate shows its deposit as due again (review of #247)
    raise exception 'the deposit was not recorded: the estimate is not signed on the server' using errcode = 'P0001';
  end if;
  select * into i from public.invoices
   where job_id = v_job and kind = 'deposit' and status <> 'void' order by created_at limit 1 for update;
  if i.id is null then
    raise exception 'no deposit is due on this estimate' using errcode = '22023';
  end if;
  -- not the office (sales, 17 / T73): only the deposit the signature made — the estimate approved, the invoice of its
  -- signed version, for exactly the deposit the client signed. A deposit invoice sales put in themselves, or of any other
  -- sum, is refused (security-check of #1061 В-1: an own «deposit» of $99 999 was paid by this function)
  if not app.has_role(e.company_id, array['owner', 'admin', 'office'])
     and (e.status <> 'approved'
          or i.source_estimate_version_id is null
          or i.total_cents is distinct from (
               select (x.selection ->> 'deposit')::bigint from public.estimate_approvals x
                where x.estimate_id = e.id and x.party = 'customer' and x.decision = 'approved'
                order by x.signed_at desc limit 1)) then
    raise exception 'only the office takes this deposit' using errcode = '42501';
  end if;
  if i.balance_cents <= 0 then
    -- paid already (the client on the page, another phone): no second payment
    -- already_paid: the phone's own payment of this op is not on the server (the store drops it on refresh)
    return jsonb_build_object('payment_id', null, 'invoice_id', i.id, 'repeat', false, 'already_paid', true);
  end if;

  insert into public.payments (id, company_id, invoice_id, customer_id, method, amount_cents, status, idempotency_key, received_by)
  values (p_payment_id, i.company_id, i.id, i.customer_id, p_method, i.balance_cents, 'succeeded', p_payment_id::text, v_me);   -- the invoice's client
  return jsonb_build_object('payment_id', p_payment_id, 'invoice_id', i.id, 'repeat', false, 'already_paid', false);
end;
$$;
revoke all on function public.record_estimate_deposit(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_estimate_deposit(uuid, uuid, text) to authenticated;
