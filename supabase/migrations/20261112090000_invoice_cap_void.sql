-- #865 В1-4б + #1107 В1-5 (audit 2026-11-11 X-03, П-07, П-09; main-path spec §3.3, §5.2): a contract's invoices never more
-- than the contract, and a wrong invoice can be voided — the two go together (without voiding the refusal is a dead end).
-- 1) app.invoice_tax_split (the same signature, the same lock of the job, the same count of its sent deposit / progress /
--    final invoices — a void one, a draft, a standalone one do not count): Σ + this one > jobs.contract_total_cents →
--    23514, hint invoice_over_contract (the app's own words, outboxRejected.ts), no amounts in the text. Every contract
--    invoice is checked, one with a discount of its own too (its amounts stay its own). A job with no contract amount is
--    not checked. Someone outside the company / a tech not on the job: null as before — nothing read, RLS refuses.
-- 2) record_visit_payment (the same signature; rule 18 — the same revoke / grant): the visit sends the office's draft
--    final; a draft above the rest of the contract is billed as that rest, not refused with the money in hand; nothing
--    left — 22023, the tech's «hand it to the office» card (security-check of #1197, finding 2).
-- 3) tg_invoice_guard (the same body): its two refusals of a void carry hints the app explains — invoice_void_forbidden
--    (only owner / admin), invoice_has_payments (refund first). Who may void and when is as before: owner / admin, a sent
--    invoice with no payment, the reason required (check), once — a void invoice never changes again.
-- Old app versions: an invoice above the contract is now refused for good (it went through before); the phone of this
--    version never sends one (engine canIssue). Rule 16: only replaced bodies, nothing renamed or dropped.
-- 4) A void's reason is text (1–500 characters, not blank); an invoice is never born removed nor brought back from
--    removed (either would pass the contract check — security-check of #1203).
-- Tests: supabase/tests/core_rls.sql T197.

create or replace function app.invoice_tax_split(p_company uuid, p_job uuid, p_invoice uuid, p_total bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare j public.jobs; v_inv bigint; v_tax bigint; v_ctax bigint; v_left bigint; v_share bigint; v_before boolean;
begin
  -- the office side of the company; a tech only on a job of his (a visit of his — as invoices_select lets him read it):
  -- another job's contract, tax and billed sum are not his to learn (security-check of #1197)
  if auth.uid() is not null and not (app.has_role(p_company, array['owner', 'admin', 'office', 'sales'])
                                     or (app.has_role(p_company, array['tech']) and app.is_job_assignee(p_job))) then
    return null;
  end if;
  if p_job is null or not (p_total > 0) then return null; end if;
  select * into j from public.jobs where id = p_job and company_id = p_company for no key update;
  -- a job with no contract amount: nothing to check against, nothing to split
  if j.id is null or j.contract_total_cents is null then return null; end if;
  v_ctax := case when j.contract_total_cents > 0 then app.job_contract_tax(j.id) else 0 end;
  select coalesce(sum(i.total_cents), 0), coalesce(sum(i.tax_cents), 0),
         coalesce(bool_or(i.tax_cents = 0 and v_ctax > 0 and floor(i.total_cents::numeric * v_ctax / nullif(j.contract_total_cents, 0) + 0.5) > 0), false)
    into v_inv, v_tax, v_before
    from public.invoices i
   where i.company_id = p_company and i.job_id = p_job and i.kind in ('deposit', 'progress', 'final')
     and i.status = 'sent' and i.deleted_at is null and i.id <> p_invoice;
  -- В1-4б: never more than the contract (X-03). No amounts in the text: whoever tried reads it
  if v_inv + p_total > j.contract_total_cents then
    raise exception 'the job''s invoices would be more than its contract' using errcode = 'check_violation', hint = 'invoice_over_contract';
  end if;
  if not (j.contract_total_cents > 0) then return 0; end if;
  v_left := greatest(0, v_ctax - v_tax);
  -- the invoice that bills the rest takes the rest of the tax — unless an invoice issued before the split (no tax although
  -- its share is not 0) is among them: then each takes its own share (director's decision 12.11, З4; engine the same)
  if v_inv + p_total >= j.contract_total_cents and not v_before then
    v_share := v_left;
  else
    v_share := floor(p_total::numeric * v_ctax / j.contract_total_cents + 0.5)::bigint;
  end if;
  return greatest(0, least(v_share, v_left, p_total));
end;
$$;
revoke all on function app.invoice_tax_split(uuid, uuid, uuid, bigint) from public, anon;
-- the trigger runs as the person who writes the invoice (security invoker): they call this one
grant execute on function app.invoice_tax_split(uuid, uuid, uuid, bigint) to authenticated;

-- security invoker: current_user is the person writing (authenticated) — or the owner of a server function
-- (execute_estimate, record_visit_payment), which bills for its own caller
create or replace function app.tg_invoice_contract()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_share bigint;
begin
  -- someone who may not bill this company: nothing is counted (the row's RLS check refuses it after this trigger)
  if current_user in ('authenticated', 'anon') and not app.has_role(new.company_id, array['owner', 'admin', 'office', 'sales']) then
    return new;
  end if;
  -- only the contract's invoices (deposit / progress / final); a standalone or recurring one is outside the contract
  if new.job_id is null or new.kind not in ('deposit', 'progress', 'final') or new.status <> 'sent' or new.deleted_at is not null then
    return new;
  end if;
  -- split once, as it is sent (inserted sent, or a draft sent now); a sent invoice keeps its amounts (tg_invoice_guard)
  if tg_op = 'UPDATE' and old.status <> 'draft' then return new; end if;
  v_share := app.invoice_tax_split(new.company_id, new.job_id, new.id, new.total_cents);
  -- an invoice with a discount of its own keeps its own amounts (it is checked against the contract all the same)
  if v_share is not null and coalesce(new.discount_cents, 0) = 0 then
    new.tax_cents := v_share;
    new.subtotal_cents := new.total_cents - v_share;
    new.tax_enabled := v_share > 0;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_invoice_contract() from public, anon, authenticated;


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
      select coalesce(sum(i.total_cents), 0) into v_invoiced from public.invoices i
       where i.company_id = j.company_id and i.job_id = j.id and i.kind in ('deposit', 'progress', 'final')
         and i.status = 'sent' and i.deleted_at is null;
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

create or replace function app.tg_invoice_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_recalc boolean := coalesce(current_setting('app.invoice_recalc', true), '') = 'on'
                      and current_user not in ('authenticated', 'anon');
  v_merge boolean := false;
begin
  if tg_op = 'INSERT' then
    -- an invoice is never removed (t05), so never born removed: such a row would pass every check and come back later
    -- (security-check of #1203, finding 1)
    if new.deleted_at is not null then
      raise exception 'invoice cannot be created removed' using errcode = 'check_violation';
    end if;
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

  -- and never brought back from removed: the contract check and the tax split saw it as gone (finding 1)
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'a removed invoice does not come back' using errcode = 'check_violation';
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
      raise exception 'only owner/admin can void an invoice' using errcode = '42501', hint = 'invoice_void_forbidden';
    end if;
    if old.paid_cents <> 0 or exists (
         select 1 from public.payments p
         where p.invoice_id = old.id and p.status in ('pending', 'succeeded', 'partially_refunded')
           and p.amount_cents - p.refunded_cents > 0) then
      raise exception 'invoice % has payments; refund or move to credit before void', old.number
        using errcode = 'check_violation', hint = 'invoice_has_payments';
    end if;
    new.voided_at := coalesce(new.voided_at, now());
    new.voided_by := coalesce(auth.uid(), new.voided_by);
  end if;
  return new;
end;
$$;
revoke all on function app.tg_invoice_guard() from public, anon, authenticated;

-- 4) the reason of a void: written, not a whole book (security-check of #1203, finding 3). NOT VALID — the rows of
-- before stay as they are (rule 16: no rewrite of old data), every new void and every change of a row is checked.
alter table public.invoices add constraint invoices_void_reason_text
  check (status <> 'void' or length(btrim(void_reason)) between 1 and 500) not valid;
