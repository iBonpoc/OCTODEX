-- #868 (Q-42, audit 2026-11-11): what sales may do with the company's money — two holes in the database.
--   1) payments_insert_staff let sales write a payment straight into payments: «Принять оплату» on an invoice
--      (ops.ts payment.record, invoice.pay). Spec 13 §4: sales take no payments on invoices. The deposit at the
--      signing (public.record_estimate_deposit, spec 17, T73) and the payment on a visit (public.record_visit_payment)
--      are security-definer functions: the deposit pays sales only the signature's deposit (3 below); record_visit_payment
--      no longer lets sales in (4 below: closed in #1061, whether to bring it back — founder's #1042).
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

-- 4) security-check of #1061 (В-2): the same $99 999 through record_visit_payment — sales put in a visit on any job and a
-- draft final of their own, and the function paid it (the on-site check is only for the tech). Sales leave its roles:
-- closed in #1061; whether sales take money on a visit (and how, safely: the server's invoice, their own visit only) is
-- the founder's #1042. The same signature; rule 18 — the same revoke / grant as before.
create or replace function public.record_visit_payment(p_visit_id uuid, p_invoice_id uuid, p_payment_id uuid, p_method text,
                                                       p_due_date date default null, p_expected_cents bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v          public.visits;
  j          public.jobs;
  inv        public.invoices;
  p          public.payments;
  v_amount   bigint;
  v_invoiced bigint;
  v_today    date;
begin
  if v_uid is null then raise exception 'visit payment: sign in' using errcode = '42501'; end if;
  if p_visit_id is null or p_invoice_id is null or p_payment_id is null then
    raise exception 'visit payment: visit, invoice and payment ids are needed' using errcode = '22023';
  end if;
  -- деньги в руке — обязательны: без суммы сервер не решает за мастера (проверка #857 С2)
  if p_expected_cents is null or p_expected_cents <= 0 then
    raise exception 'visit payment: the amount in hand is needed' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('cash', 'check', 'zelle', 'financing', 'other', 'card', 'ach') then
    raise exception 'visit payment: method % is not taken on a visit', p_method using errcode = '22023';
  end if;
  select * into v from public.visits where id = p_visit_id;
  -- не видно, чужая компания, нет права — один ответ
  -- мастер — только активный и только на своём выезде (как payments_insert_tech + tech_can_record_payment)
  if v.id is null or v.deleted_at is not null
     or not ((app.has_role(v.company_id, array['tech']) and app.is_visit_assignee(v.id))
             or app.has_role(v.company_id, array['owner', 'admin', 'office'])) then
    raise exception 'visit payment: no such visit' using errcode = '42501';
  end if;
  if v.job_id is null then
    raise exception 'visit payment: an inspection takes no payment' using errcode = '22023';
  end if;

  -- работа под блокировкой: две оплаты одного выезда (два телефона, повтор очереди) идут по очереди
  select * into j from public.jobs where id = v.job_id and company_id = v.company_id for update;
  if j.id is null or j.deleted_at is not null then
    raise exception 'visit payment: no such visit' using errcode = '42501';
  end if;
  -- выезд перечитан под блокировкой: отменённый, пока мы ждали работу, не платится (проверка #857 С3)
  select * into v from public.visits where id = p_visit_id for update;
  -- повтор: платёж с этим id уже есть (очередь отправила второй раз) — после блокировки, чтобы одновременный повтор
  -- ответил replay, а не «нечего брать»
  select * into p from public.payments where id = p_payment_id;
  if p.id is not null then
    if p.company_id <> v.company_id or p.visit_id is distinct from v.id then
      raise exception 'visit payment: no such visit' using errcode = '42501';
    end if;
    return jsonb_build_object('status', 'replay', 'invoice_id', p.invoice_id, 'payment_id', p.id, 'amount_cents', p.amount_cents);
  end if;
  -- оплата — на месте или после (мастер); отменённый или пропущенный выезд не платится никем
  if v.status in ('cancelled', 'no_show')
     or (not app.has_role(v.company_id, array['owner', 'admin', 'office']) and v.status not in ('on_site', 'completed')) then
    raise exception 'visit payment: the visit is not on site' using errcode = '22023';
  end if;
  select * into inv from public.invoices
   where company_id = j.company_id and job_id = j.id and kind = 'final' and status <> 'void'
   for update;
  if inv.id is not null and inv.status = 'draft' then
    -- a draft final the office has not sent: the visit bills it — sent now, so the app sees what was paid (#857 Ж1)
    update public.invoices set status = 'sent', sent_at = coalesce(sent_at, now()) where id = inv.id returning * into inv;
  end if;
  if inv.id is not null then
    v_amount := greatest(0, inv.total_cents - inv.paid_cents);
  else
    select coalesce(sum(i.total_cents), 0) into v_invoiced
      from public.invoices i where i.company_id = j.company_id and i.job_id = j.id and i.status = 'sent';   -- a draft is not billed (as the app reads them, repo.ts)
    v_amount := greatest(0, coalesce(j.contract_total_cents, 0) - v_invoiced);
    if v_amount > 0 then
      -- the due date is the company's day the phone took the payment (made offline at 11:50 PM, sent after midnight —
      -- still that day); never a future day, never older than 30 days
      v_today := (now() at time zone coalesce((select c.timezone from public.companies c where c.id = j.company_id), 'UTC'))::date;
      -- a final invoice made by the office at the same moment (invoices_one_deposit_final_idx), or the phone's id taken:
      -- never a refusal that drops the money in hand (#857 С6) — the office's final takes the payment, a taken id is
      -- replaced by a new one
      begin
        insert into public.invoices (id, company_id, customer_id, job_id, kind, status, subtotal_cents, total_cents, due_date, sent_at)
        values (case when exists (select 1 from public.invoices x where x.id = p_invoice_id) then public.uuid_generate_v7() else p_invoice_id end,
                j.company_id, j.customer_id, j.id, 'final', 'sent', v_amount, v_amount,
                case when p_due_date between v_today - 30 and v_today then p_due_date else v_today end, now())
        returning * into inv;
      exception when unique_violation then
        select * into inv from public.invoices
         where company_id = j.company_id and job_id = j.id and kind = 'final' and status <> 'void'
         for update;
        if inv.id is null then raise; end if;
        v_amount := greatest(0, inv.total_cents - inv.paid_cents);
      end;
    end if;
  end if;

  -- деньги в руке мастера — то, что показал телефон (p_expected_cents; движок visitPayment с expectedCents): меньше
  -- остатка — частичная оплата; больше (или остатка нет: офис закрыл счёт, пока мастер был без сети) — отказ: сервер не
  -- пишет другую сумму и не прячет лишнее (ревью #857 О1). Отказ — окончательный: у мастера в «Требует внимания»
  -- «Деньги в руке не записаны — передайте офису» (outboxRejected.ts), офис записывает оплату сам
  if p_expected_cents > v_amount then
    raise exception 'visit payment: more in hand than due (% > %)', p_expected_cents, v_amount using errcode = '22023';
  end if;
  v_amount := p_expected_cents;
  insert into public.payments (id, company_id, invoice_id, customer_id, visit_id, method, amount_cents, status, idempotency_key, received_by)
  values (p_payment_id, j.company_id, inv.id, inv.customer_id, v.id, p_method, v_amount, 'succeeded', p_payment_id::text, v_uid);   -- the invoice's client (#857 С4)
  if v.status = 'on_site' then
    update public.visits set status = 'completed' where id = v.id;
  end if;
  return jsonb_build_object('status', 'paid', 'invoice_id', inv.id, 'payment_id', p_payment_id, 'amount_cents', v_amount);
end;
$$;
revoke all on function public.record_visit_payment(uuid, uuid, uuid, text, date, bigint) from public, anon;
grant execute on function public.record_visit_payment(uuid, uuid, uuid, text, date, bigint) to authenticated;

-- 5) security-check of #1061 (С-1): the deposit insert was refused, but a draft progress invoice turned «deposit» by an
-- update (invoices_update does not look at kind; the guard froze kind / the version on a sent invoice only).
create or replace function app.tg_invoice_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_recalc boolean := coalesce(current_setting('app.invoice_recalc', true), '') = 'on'
                      and current_user not in ('authenticated', 'anon');
  v_merge boolean := false;
begin
  if tg_op = 'INSERT' then
    new.paid_cents := 0;
    new.payment_status := 'unpaid';
    if new.status = 'void' then
      raise exception 'invoice cannot be created void' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- the client merge (merge_customers): only customer_id B → A, only inside that function (S3d)
  if new.customer_id is distinct from old.customer_id and current_user not in ('authenticated', 'anon')
     and new.status is not distinct from old.status and new.deleted_at is not distinct from old.deleted_at then
    v_merge := app.merging_customer(old.customer_id, new.customer_id);
  end if;

  if not v_recalc then                    -- a direct change, not the recalc from payments
    new.paid_cents := old.paid_cents;
    new.payment_status := old.payment_status;
  end if;

  if old.status = 'void' and not v_merge then
    raise exception 'void invoice % is immutable', old.number using errcode = '42501';
  end if;
  -- what an invoice is (a deposit, the version it bills) is the office's to change, a draft too: sales made a draft progress
  -- invoice a «deposit» of the signed version and had it paid (security-check of #1061 С-1)
  if (new.kind is distinct from old.kind or new.source_estimate_version_id is distinct from old.source_estimate_version_id)
     and auth.uid() is not null and not app.has_role(new.company_id, array['owner', 'admin', 'office']) then
    raise exception 'only the office changes what an invoice is' using errcode = '42501';
  end if;

  if not v_recalc then
    if old.status <> 'draft' and (
         new.subtotal_cents is distinct from old.subtotal_cents
      or new.discount_cents is distinct from old.discount_cents
      or new.tax_cents      is distinct from old.tax_cents
      or new.total_cents    is distinct from old.total_cents
      or new.tax_enabled    is distinct from old.tax_enabled
      or new.tax_rate_id    is distinct from old.tax_rate_id
      or new.tax_rate_bps   is distinct from old.tax_rate_bps
      or new.tax_profile_id is distinct from old.tax_profile_id
      or new.tax_mode       is distinct from old.tax_mode
      or new.include_purchase_tax_in_cost is distinct from old.include_purchase_tax_in_cost
      or new.currency       is distinct from old.currency
      or (new.customer_id   is distinct from old.customer_id and not v_merge)
      or new.job_id         is distinct from old.job_id
      or new.kind           is distinct from old.kind
      or new.source_estimate_version_id is distinct from old.source_estimate_version_id
      or new.revision       is distinct from old.revision
      or (old.sent_at is not null and new.sent_at is distinct from old.sent_at)) then
      raise exception 'invoice % is sent: its amounts do not change (void it and issue a new one)', old.number
        using errcode = '42501';
    end if;
    if new.total_cents is distinct from old.total_cents and new.total_cents < old.paid_cents then
      raise exception 'invoice % total % is below what is paid %', old.number, new.total_cents, old.paid_cents
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status = 'void' and old.status <> 'void' then
    if auth.uid() is not null and not app.has_role(new.company_id, array['owner', 'admin']) then
      raise exception 'only owner/admin can void an invoice' using errcode = '42501';
    end if;
    if old.paid_cents <> 0 or exists (
         select 1 from public.payments p
         where p.invoice_id = old.id and p.status in ('pending', 'succeeded', 'partially_refunded')
           and p.amount_cents - p.refunded_cents > 0) then
      raise exception 'invoice % has payments; refund or move to credit before void', old.number
        using errcode = 'check_violation';
    end if;
    new.voided_at := coalesce(new.voided_at, now());
    new.voided_by := coalesce(auth.uid(), new.voided_by);
  end if;
  return new;
end;
$$;
