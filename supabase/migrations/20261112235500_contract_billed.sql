-- #1193 п.1 (review #1203 №4; the director's decision 12.11: a standalone invoice of a job is extra work outside the
-- contract — not in it, not capped by it, it never makes the contract's rest smaller; anyone who bills may issue one, as
-- before): what a contract has billed is counted one way everywhere — app.job_contract_billed: the job's deposit /
-- progress / final invoices, sent (paid or not), not removed; a draft, a void, a standalone or recurring one do not count.
-- * public.record_visit_payment: both ways — a draft final above the rest, and no final (it counted every sent invoice,
--   standalone and removed ones too, so a standalone invoice left part of the contract silently unbilled).
-- * app.tg_job_total_floor (t19): the contract may go down to what the contract has billed (a standalone invoice no
--   longer holds it up).
-- * app.invoice_tax_split (the cap and the tax) already counts so (20261112090000) — left as it is; T204 checks the two
--   agree. The phone the same: visitPayment takes the contract's invoices only (features/contractInvoice).
-- Rule 16: the same signatures, only bodies; a new function. Rule 18: app.job_contract_billed revoked from everyone (the
-- definer functions above call it).
-- Tests: supabase/tests/core_rls.sql T204, apps/mobile/test/contractBilled.test.ts.

create or replace function app.job_contract_billed(p_company uuid, p_job uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(i.total_cents), 0)::bigint from public.invoices i
   where i.company_id = p_company and i.job_id = p_job and i.kind in ('deposit', 'progress', 'final')
     and i.status = 'sent' and i.deleted_at is null
$$;
revoke all on function app.job_contract_billed(uuid, uuid) from public, anon, authenticated;

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
  v_hint     text;
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
    begin
      update public.invoices set status = 'sent', sent_at = coalesce(sent_at, now()) where id = inv.id returning * into inv;
    exception when check_violation then
      -- В1-4б: the draft is above what is left of the contract (app.invoice_tax_split refuses it) — billed as that rest,
      -- never a refusal that drops the money in hand (#857 С6); nothing left — the money goes to the office (below).
      -- Only that refusal: any other check stays a refusal (security-check of #1203, finding 2б)
      get stacked diagnostics v_hint = pg_exception_hint;
      if v_hint is distinct from 'invoice_over_contract' then raise; end if;
      v_invoiced := app.job_contract_billed(j.company_id, j.id);
      v_amount := greatest(0, coalesce(j.contract_total_cents, 0) - v_invoiced);
      if v_amount <= 0 or v_amount < inv.paid_cents then
        raise exception 'visit payment: more in hand than due' using errcode = '22023';
      end if;
      -- the rest as it is: no discount of the draft's own left on it, the tax split again as it is sent (t41; finding 2а)
      update public.invoices set subtotal_cents = v_amount, discount_cents = 0, tax_cents = 0, total_cents = v_amount, status = 'sent',
                                 sent_at = coalesce(sent_at, now())
       where id = inv.id returning * into inv;
    end;
  end if;
  if inv.id is not null then
    v_amount := greatest(0, inv.total_cents - inv.paid_cents);
  else
    -- #1193 п.1: what the contract has billed — its deposit / progress / final invoices sent and not removed; a
    -- standalone invoice of the job (extra work outside the contract) never eats the contract's rest
    v_invoiced := app.job_contract_billed(j.company_id, j.id);
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

create or replace function app.tg_job_total_floor()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_invoiced bigint;
begin
  if new.estimate_id is not null or new.contract_total_cents >= old.contract_total_cents then return new; end if;
  -- #1193 п.1: the contract's own invoices only — a standalone invoice (extra work) is outside the contract
  v_invoiced := app.job_contract_billed(new.company_id, new.id);
  if new.contract_total_cents < v_invoiced then
    raise exception 'the job total cannot go below what is invoiced' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_job_total_floor() from public, anon, authenticated;
