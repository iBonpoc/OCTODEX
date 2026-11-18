-- #2075: what sales read of the company's money follows the roles decision (the founder's answer to В4, audit of roles
-- #2064: sales do not see the company's money — only the sums of their own estimates and leads).
-- «His deal» (app.sales_deal_*): an estimate he made (estimates.created_by) or an estimate of a lead he leads
-- (leads.assigned_to); its job (jobs.estimate_id); the invoices of that job or of that estimate's version.
--   * invoices_select — the office as before; the tech as before; sales — the invoices of his deals.
--   * payments_select — the office as before; the tech as before; sales — the payments he took himself (received_by) and
--     the payments of the invoices of his deals.
--   * refunds, payment_attempts, stripe_accounts — owner, admin, office (sales — none).
--   * notifications (select, mark read) — the office as before; sales — the notifications of his estimates only.
-- customer_balances is security_invoker: it follows invoices. An old phone of sales simply loads fewer rows.
--   * t00_sales_deal_guard (invoices insert/update, payments insert): what sales write stays inside their deals, refused
--     with 42501 before any check of a sum.
--   * estimate_links — sales get the client links of their deals only.
--   * record_estimate_deposit — sales take the deposit of their own deal only (the same body as 20261111140000, one
--     condition added to the rights check; the same signature and rights).
-- db T420–T424. Rule 16: policies altered in place, new functions; nothing renamed or dropped.
-- Rule 18: the new functions — revoke all from public, anon; execute to authenticated (the policies call them); the
-- trigger function — for nobody.

create or replace function app.sales_deal_estimate(p_estimate_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.estimates e
     where e.id = p_estimate_id
       and (e.created_by = auth.uid()
            or (e.lead_id is not null
                and exists (select 1 from public.leads l where l.id = e.lead_id and l.company_id = e.company_id
                                                           and l.assigned_to = auth.uid())))
  );
$$;
revoke all on function app.sales_deal_estimate(uuid) from public, anon;
grant execute on function app.sales_deal_estimate(uuid) to authenticated;

create or replace function app.sales_deal_invoice(p_invoice_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.invoices i
     where i.id = p_invoice_id
       and ((i.job_id is not null
             and exists (select 1 from public.jobs j where j.id = i.job_id and j.company_id = i.company_id
                                                     and j.estimate_id is not null and app.sales_deal_estimate(j.estimate_id)))
            or (i.source_estimate_version_id is not null
                and exists (select 1 from public.estimate_versions v where v.id = i.source_estimate_version_id
                                                                     and v.company_id = i.company_id
                                                                     and app.sales_deal_estimate(v.estimate_id))))
  );
$$;
revoke all on function app.sales_deal_invoice(uuid) from public, anon;
grant execute on function app.sales_deal_invoice(uuid) to authenticated;

alter policy invoices_select on public.invoices
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (app.has_role(company_id, array['sales']) and app.sales_deal_invoice(id))
         or (app.has_role(company_id, array['tech']) and job_id is not null and app.is_job_assignee(job_id)));

alter policy payments_select on public.payments
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (app.has_role(company_id, array['sales'])
             and (received_by = (select auth.uid()) or (invoice_id is not null and app.sales_deal_invoice(invoice_id))))
         or (app.has_role(company_id, array['tech'])
             and (received_by = (select auth.uid()) or (visit_id is not null and app.is_visit_assignee(visit_id)))));

alter policy refunds_select on public.refunds
  using (app.has_role(company_id, array['owner', 'admin', 'office']));
alter policy payment_attempts_select on public.payment_attempts
  using (app.has_role(company_id, array['owner', 'admin', 'office']));
alter policy stripe_accounts_select on public.stripe_accounts
  using (app.has_role(company_id, array['owner', 'admin', 'office']));

alter policy notifications_select on public.notifications
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (app.has_role(company_id, array['sales']) and estimate_id is not null and app.sales_deal_estimate(estimate_id)));
alter policy notifications_update on public.notifications
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (app.has_role(company_id, array['sales']) and estimate_id is not null and app.sales_deal_estimate(estimate_id)))
  with check (app.has_role(company_id, array['owner', 'admin', 'office'])
              or (app.has_role(company_id, array['sales']) and estimate_id is not null and app.sales_deal_estimate(estimate_id)));

-- what sales write to the money stays inside their deals, and is refused before any check of a sum (those checks run as
-- the caller's triggers before RLS, and their answers — over the contract, over the balance — would tell another deal's
-- sums). t00: before t05_not_above_balance, t20_number, t40/t41 (triggers fire by name). Server functions and the service
-- role pass (their own checks).
create or replace function app.tg_sales_deal_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if not app.has_role(case when tg_op = 'UPDATE' then old.company_id else new.company_id end, array['sales']) then
    return new;
  end if;
  if tg_table_name = 'invoices' then
    if (tg_op = 'UPDATE' and not app.sales_deal_invoice(old.id))
       or new.job_id is null
       or not exists (select 1 from public.jobs j where j.id = new.job_id and j.company_id = new.company_id
                                                    and j.estimate_id is not null and app.sales_deal_estimate(j.estimate_id)) then
      raise exception 'not a deal of yours' using errcode = '42501';
    end if;
  elsif new.invoice_id is not null and not app.sales_deal_invoice(new.invoice_id) then   -- payments
    raise exception 'not a deal of yours' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_sales_deal_guard() from public, anon, authenticated;
drop trigger if exists t00_sales_deal_guard on public.invoices;
create trigger t00_sales_deal_guard before insert or update on public.invoices
  for each row execute function app.tg_sales_deal_guard();
drop trigger if exists t00_sales_deal_guard on public.payments;
create trigger t00_sales_deal_guard before insert on public.payments
  for each row execute function app.tg_sales_deal_guard();

-- the client links the app loads (estimate_links): sales — of their deals only; a link opens the client's page with the
-- invoices of the deal (body as 20261110030000, one condition added; the same signature and rights)
create or replace function public.estimate_links(p_company_id uuid)
returns table (estimate_id uuid, token text) language sql stable security definer set search_path = '' as $$
  select k.estimate_id, (array_agg(k.token order by k.created_at desc, k.token))[1]
    from app.estimate_tokens k join public.estimates e on e.id = k.estimate_id
   where k.company_id = p_company_id and e.deleted_at is null and app.is_staff(p_company_id)
     and (not app.has_role(p_company_id, array['sales']) or app.sales_deal_estimate(k.estimate_id))
   group by k.estimate_id;
$$;
revoke all on function public.estimate_links(uuid) from public, anon;
grant execute on function public.estimate_links(uuid) to authenticated;

-- the deposit at the signature: sales — of his deal only (body as 20261111140000; one condition in the rights check)
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
  if e.id is null or v_me is null or not app.has_role(e.company_id, array['owner', 'admin', 'office', 'sales'])
     or (app.has_role(e.company_id, array['sales']) and not app.sales_deal_estimate(e.id)) then   -- #2075: sales — his deal only
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
  -- signed version (the client's last approval — security-check of #1061 С-1), for exactly the deposit the client signed. A deposit invoice sales put in themselves, or of any other
  -- sum, is refused (security-check of #1061 В-1: an own «deposit» of $99 999 was paid by this function)
  if not app.has_role(e.company_id, array['owner', 'admin', 'office'])
     and (e.status <> 'approved'
          or not exists (
               select 1 from (
                 select x.version_id, (x.selection ->> 'deposit')::bigint as dep from public.estimate_approvals x
                  where x.estimate_id = e.id and x.party = 'customer' and x.decision = 'approved'
                  order by x.signed_at desc limit 1) a
                where a.version_id = i.source_estimate_version_id and a.dep = i.total_cents)) then
    raise exception 'only the office takes this deposit' using errcode = '42501';
  end if;
  -- a payment of this invoice still on its way (the client's ACH on /p/): the balance is not lowered until it lands — a
  -- payment now would pay the deposit twice (code review of #1061 Б1); the phone shows it as on its way
  if exists (select 1 from public.payments where invoice_id = i.id and status = 'pending') then
    raise exception 'a payment of this deposit is on its way' using errcode = '22023';
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
