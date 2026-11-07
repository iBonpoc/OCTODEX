-- A job is made only by the server (docs/specs/17-job.md §12.1, rule 16 step 1; security check of 07.11).
-- Before: authenticated had `select, insert, update` on public.jobs (core §14); the app inserted jobs itself in three ops
-- (cloud/ops.ts lead.book, lead.visit — old queues only; estimate.deposit — still queued). From this build the app inserts
-- no job: lead.book / lead.visit make an inspection without a job (as visit.inspection, 20261105280000), and the deposit of
-- a signed estimate goes through public.record_estimate_deposit below.
--
-- 1. public.record_estimate_deposit — the office takes the deposit of a signed estimate. The job and the deposit invoice
--    are made by the signature (app.execute_estimate); here only the payment is written, for the balance of that invoice as
--    the server knows it (never a sum from the phone). A repeat with the same payment id (offline queue replay) changes
--    nothing. No job of the estimate on the server → P0001, a refusal (the phone reloads, the deposit is due again);
--    no deposit invoice (no deposit is due) → 22023; a paid deposit (the client paid on the page) → no second payment
--    (already_paid; two phones replaying the same id at once: the second may get already_paid instead of repeat — no money moves).
-- 2. UPDATE by columns: only what the app writes (status, description, job_type_id, tax_enabled, tax_rate_bps,
--    service_category_id — every build of ops.ts wrote only these, git log 07.11) and the name (title: plain text, no
--    guard depends on it; T44 edits it, renaming a job is the next screen). The total, the client, the estimate,
--    the address, the number, the times of the status and the deletion change only in server functions and triggers.
-- INSERT stays for now: old builds on phones still insert jobs. Step 2 (revoke insert, drop policy jobs_insert) — a
-- separate PR once a minimal app build exists and those builds are below it (decision of the director 07.11).

-- ---- 1. The deposit of a signed estimate -------------------------------------------------------------------------------
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

-- ---- 2. UPDATE of a job by columns -------------------------------------------------------------------------------------
-- only UPDATE is taken back: `revoke all` would also take SELECT (the app reads jobs) and INSERT (old builds still insert
-- jobs until step 2). A column grant is not added on top of a table grant, so the table-wide UPDATE goes first.
revoke update on public.jobs from anon, authenticated;
grant update (status, title, description, job_type_id, tax_enabled, tax_rate_bps, service_category_id) on public.jobs to authenticated;
