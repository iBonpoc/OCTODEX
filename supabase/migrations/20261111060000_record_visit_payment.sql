-- Оплата на выезде — одной функцией сервера (аудит 11.11 B-02, B-05, A-17; #757; S10 → S12).
--
-- Было: телефон (cloud/ops.ts visit.pay) сам вставлял счёт final и платёж. Политика invoices_insert не пускает мастера
-- (owner/admin/office/sales) — вставка счёта отклонялась, операция выбрасывалась, а на телефоне оставалось «оплачено»
-- (B-02). Если у работы уже был живой final-счёт, вставка второго падала на invoices_one_deposit_final_idx — оплата
-- терялась (B-05). Сумму брал телефон: contract_total работы, без уже выставленного аванса (A-17).
-- Стало: public.record_visit_payment(выезд, id счёта, id платежа, способ) — security definer, одна на стык:
--   * кто: мастер, назначенный на выезд, или владелец / админ / офис / продажи;
--   * сумму считает сервер (как движок: @octo/estimating-engine visitPayment): живой final-счёт работы с остатком — платёж
--     идёт в него на остаток; final-счёта нет — создаётся на «ещё не выставлено» (контракт − все живые счета работы);
--     платить нечего — платежа нет, выезд просто завершается;
--   * повтор с тем же id платежа ничего не меняет (очередь телефона);
--   * выезд → completed (если он на месте).
-- Срок нового счёта — день компании, когда телефон принял оплату (p_due_date; не будущий и не старше 30 дней).
-- Ответ: {status: paid | nothing | replay, invoice_id, payment_id, amount_cents}. Правило 16: новая функция, ничего не
-- удалено; старые телефоны с visit.pay в очереди после обновления шлют ту же операцию в эту функцию (ops.ts).
-- Правило 18: revoke all from public, anon; grant execute to authenticated.
set local lock_timeout = '5s';

create or replace function public.record_visit_payment(p_visit_id uuid, p_invoice_id uuid, p_payment_id uuid, p_method text,
                                                       p_due_date date default null)
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
  if p_method is null or p_method not in ('cash', 'check', 'zelle', 'financing', 'other', 'card', 'ach') then
    raise exception 'visit payment: method % is not taken on a visit', p_method using errcode = '22023';
  end if;
  select * into v from public.visits where id = p_visit_id;
  -- не видно, чужая компания, нет права — один ответ
  if v.id is null or v.deleted_at is not null
     or not (app.is_visit_assignee(v.id) or app.has_role(v.company_id, array['owner', 'admin', 'office', 'sales'])) then
    raise exception 'visit payment: no such visit' using errcode = '42501';
  end if;
  if v.job_id is null then
    raise exception 'visit payment: an inspection takes no payment' using errcode = '22023';
  end if;

  -- повтор: платёж с этим id уже есть (очередь отправила второй раз)
  select * into p from public.payments where id = p_payment_id;
  if p.id is not null then
    if p.company_id <> v.company_id or p.visit_id is distinct from v.id then
      raise exception 'visit payment: no such visit' using errcode = '42501';
    end if;
    return jsonb_build_object('status', 'replay', 'invoice_id', p.invoice_id, 'payment_id', p.id, 'amount_cents', p.amount_cents);
  end if;

  -- работа под блокировкой: две оплаты одного выезда (два телефона) идут по очереди
  select * into j from public.jobs where id = v.job_id and company_id = v.company_id for update;
  if j.id is null or j.deleted_at is not null then
    raise exception 'visit payment: no such visit' using errcode = '42501';
  end if;
  select * into inv from public.invoices
   where company_id = j.company_id and job_id = j.id and kind = 'final' and status <> 'void'
   for update;
  if inv.id is not null then
    v_amount := greatest(0, inv.total_cents - inv.paid_cents);
  else
    select coalesce(sum(i.total_cents), 0) into v_invoiced
      from public.invoices i where i.company_id = j.company_id and i.job_id = j.id and i.status <> 'void';
    v_amount := greatest(0, coalesce(j.contract_total_cents, 0) - v_invoiced);
    if v_amount > 0 then
      -- the due date is the company's day the phone took the payment (made offline at 11:50 PM, sent after midnight —
      -- still that day); never a future day, never older than 30 days
      v_today := (now() at time zone coalesce((select c.timezone from public.companies c where c.id = j.company_id), 'UTC'))::date;
      insert into public.invoices (id, company_id, customer_id, job_id, kind, status, subtotal_cents, total_cents, due_date, sent_at)
      values (p_invoice_id, j.company_id, j.customer_id, j.id, 'final', 'sent', v_amount, v_amount,
              case when p_due_date between v_today - 30 and v_today then p_due_date else v_today end, now())
      returning * into inv;
    end if;
  end if;

  if v_amount > 0 then
    insert into public.payments (id, company_id, invoice_id, customer_id, visit_id, method, amount_cents, status, idempotency_key, received_by)
    values (p_payment_id, j.company_id, inv.id, j.customer_id, v.id, p_method, v_amount, 'succeeded', p_payment_id::text, v_uid);
  end if;
  if v.status = 'on_site' then
    update public.visits set status = 'completed' where id = v.id;
  end if;
  return jsonb_build_object('status', case when v_amount > 0 then 'paid' else 'nothing' end,
                            'invoice_id', inv.id, 'payment_id', case when v_amount > 0 then p_payment_id end, 'amount_cents', v_amount);
end;
$$;
revoke all on function public.record_visit_payment(uuid, uuid, uuid, text, date) from public, anon;
grant execute on function public.record_visit_payment(uuid, uuid, uuid, text, date) to authenticated;
