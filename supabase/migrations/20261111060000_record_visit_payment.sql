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
--   * сумма в руке — та, что показал телефон (p_expected_cents): меньше остатка — частичная оплата, больше — остаток в
--     счёт и лишнее отдельным платежом без счёта с needs_review (и когда остатка нет); мастер — только активный и на месте; отменённый выезд не платится;
--   * повтор с тем же id платежа ничего не меняет (очередь телефона);
--   * выезд → completed (если он на месте).
-- Срок нового счёта — день компании, когда телефон принял оплату (p_due_date; не будущий и не старше 30 дней).
-- Ответ: {status: paid | nothing | replay, invoice_id, payment_id, amount_cents}. Правило 16: новая функция, ничего не
-- удалено; старые телефоны с visit.pay в очереди после обновления шлют ту же операцию в эту функцию (ops.ts).
-- Правило 18: revoke all from public, anon; grant execute to authenticated.
set local lock_timeout = '5s';

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
  v_extra    bigint := 0;
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
             or app.has_role(v.company_id, array['owner', 'admin', 'office', 'sales'])) then
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
     or (not app.has_role(v.company_id, array['owner', 'admin', 'office', 'sales']) and v.status not in ('on_site', 'completed')) then
    raise exception 'visit payment: the visit is not on site' using errcode = '22023';
  end if;
  select * into inv from public.invoices
   where company_id = j.company_id and job_id = j.id and kind = 'final' and status <> 'void'
   for update;
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
  -- остатка — частичная оплата; больше (или остатка нет: офис закрыл счёт, пока мастер был без сети) — остаток в счёт, а
  -- лишнее — отдельным платежом без счёта с needs_review: деньги клиента у мастера, владелец решит (вернуть или зачесть).
  -- Молча другая сумма или «нечего брать» с деньгами на руках — никогда (ревью #857 №3)
  if p_expected_cents is not null and p_expected_cents > 0 then
    if p_expected_cents < v_amount then
      v_amount := p_expected_cents;
    elsif p_expected_cents > v_amount then
      v_extra := p_expected_cents - v_amount;
    end if;
  end if;
  if v_amount > 0 then
    insert into public.payments (id, company_id, invoice_id, customer_id, visit_id, method, amount_cents, status, idempotency_key, received_by)
    values (p_payment_id, j.company_id, inv.id, inv.customer_id, v.id, p_method, v_amount, 'succeeded', p_payment_id::text, v_uid);   -- the invoice's client (#857 С4)
  end if;
  if v_extra > 0 then
    -- the first payment of the call carries p_payment_id (a replay finds it); the extra one with nothing due takes it too
    insert into public.payments (id, company_id, invoice_id, customer_id, visit_id, method, amount_cents, status, idempotency_key, received_by, needs_review)
    values (case when v_amount > 0 then public.uuid_generate_v7() else p_payment_id end, j.company_id, null, j.customer_id, v.id,
            p_method, v_extra, 'succeeded', p_payment_id::text || case when v_amount > 0 then ':extra' else '' end, v_uid, true);
  end if;
  if v.status = 'on_site' then
    update public.visits set status = 'completed' where id = v.id;
  end if;
  return jsonb_build_object('status', case when v_amount > 0 or v_extra > 0 then 'paid' else 'nothing' end,
                            'invoice_id', case when v_amount > 0 then inv.id end, 'payment_id', case when v_amount > 0 or v_extra > 0 then p_payment_id end,
                            'amount_cents', v_amount, 'extra_cents', v_extra);
end;
$$;
revoke all on function public.record_visit_payment(uuid, uuid, uuid, text, date, bigint) from public, anon;
grant execute on function public.record_visit_payment(uuid, uuid, uuid, text, date, bigint) to authenticated;
