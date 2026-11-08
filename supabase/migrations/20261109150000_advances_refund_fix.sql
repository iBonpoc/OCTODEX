-- Step 20д, debts (docs/specs/35-stripe.md §4г). Test mode only. Everything is added (rule 16).
-- 1) The client's advance: a payment without an invoice (an online payment above the balance, needs_review) is applied to
--    an invoice of the same client. The rules live in a trigger on payments, so a direct UPDATE of invoice_id is as safe as
--    the door: before this, tg_payment_guard let an owner move invoice_id from null to any invoice of the company — another
--    client's, above its balance (t05_not_above_balance checks only an insert).

-- ---- 1. Applying an advance: the rules (any way it is written) --------------------------------------------------------
create or replace function app.tg_advance_apply()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  inv   public.invoices;
  v_net bigint;
begin
  if old.invoice_id is not null or new.invoice_id is null then
    return new;                                         -- not an advance being applied (tg_payment_guard keeps the rest)
  end if;
  if auth.uid() is not null and not app.has_role(new.company_id, array['owner', 'admin']) then
    raise exception 'only owner/admin can apply an advance' using errcode = '42501';
  end if;
  if exists (select 1 from public.companies c where c.id = new.company_id and c.closed_at is not null) then
    raise exception 'the company is closed' using errcode = '42501';
  end if;
  -- an advance is Stripe's money kept without an invoice (stripe_apply_intent); a payment recorded by hand without an
  -- invoice is not one (security review of this PR №3)
  if not app.refund_is_stripe(new) then
    raise exception 'advance_not_applicable' using errcode = 'check_violation';
  end if;
  select * into inv from public.invoices where id = new.invoice_id and deleted_at is null for update;
  if inv.id is null or inv.company_id <> new.company_id or inv.customer_id <> new.customer_id then
    raise exception 'advance_other_client' using errcode = 'check_violation';
  end if;
  if inv.status <> 'sent' then
    raise exception 'advance_invoice_not_open' using errcode = 'check_violation';
  end if;
  -- only money that is there (not ACH on its way, not a failed one), applied as it is, in an update of its own
  if old.status not in ('succeeded', 'partially_refunded') or new.status is distinct from old.status
     or new.refunded_cents is distinct from old.refunded_cents then
    raise exception 'advance_not_applicable' using errcode = 'check_violation';
  end if;
  if new.dispute_status in ('open', 'lost') then
    raise exception 'advance_disputed' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.refunds r where r.payment_id = new.id and r.status = 'pending') then
    raise exception 'advance_refund_in_progress' using errcode = 'check_violation';
  end if;
  -- the whole advance or nothing: a payment is never split (its amount is immutable); the rest is refunded first
  v_net := new.amount_cents - new.refunded_cents;
  if v_net <= 0 or v_net > app.invoice_online_balance(inv.id) then
    raise exception 'advance_above_balance' using errcode = 'check_violation';
  end if;
  new.needs_review := false;                            -- the owner looked at it and decided
  return new;
end;
$$;
revoke all on function app.tg_advance_apply() from public, anon, authenticated;

-- after t40_payment_guard (names run in order): the guard refuses any other change of invoice_id first
create trigger t41_advance_apply before update on public.payments
  for each row execute function app.tg_advance_apply();

-- ---- 2. Applying an advance: the door of the app (owner/admin, online only — the server decides, as a refund) ---------
-- The same advance on the same invoice again (a double tap, no answer and a retry) is the same answer.
create or replace function public.advance_apply(p_payment_id uuid, p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  p      public.payments;
  inv    public.invoices;
  v_cust text;
  v_est  uuid;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if p.id is null or not app.refund_role_ok(v_user, p.company_id) then
    raise exception 'only owner/admin can apply an advance' using errcode = '42501';   -- no such payment looks the same
  end if;
  if p_invoice_id is null then
    raise exception 'advance_other_client' using errcode = 'check_violation';   -- no invoice, no «paid» notice
  end if;
  if p.invoice_id is not null and p.invoice_id = p_invoice_id and app.refund_is_stripe(p) then
    select * into inv from public.invoices where id = p.invoice_id;
    return jsonb_build_object('payment_id', p.id, 'invoice_id', inv.id, 'paid_cents', inv.paid_cents,
                              'balance_cents', greatest(inv.total_cents - inv.paid_cents, 0), 'repeat', true);
  end if;
  if p.invoice_id is not null then
    raise exception 'advance_already_applied' using errcode = 'check_violation';
  end if;
  update public.payments set invoice_id = p_invoice_id where id = p.id returning * into p;   -- t41_advance_apply checks it all
  select * into inv from public.invoices where id = p.invoice_id;
  -- the team hears «paid», as when the money comes online (app.stripe_apply_intent)
  select display_name into v_cust from public.customers where id = p.customer_id;
  select j.estimate_id into v_est from public.jobs j where j.id = inv.job_id;
  insert into public.notifications (company_id, kind, estimate_id, job_id, invoice_id, payload)
  values (p.company_id, case when inv.kind = 'deposit' then 'deposit.paid' else 'invoice.paid' end, v_est, inv.job_id, inv.id,
          jsonb_build_object('customer', v_cust, 'number', inv.number, 'deposit', p.amount_cents - p.refunded_cents,
                             'total', p.amount_cents - p.refunded_cents, 'method', p.method, 'advance', true));
  return jsonb_build_object('payment_id', p.id, 'invoice_id', inv.id, 'paid_cents', inv.paid_cents,
                            'balance_cents', greatest(inv.total_cents - inv.paid_cents, 0));
end;
$$;
revoke all on function public.advance_apply(uuid, uuid) from public, anon;
grant execute on function public.advance_apply(uuid, uuid) to authenticated;

-- 2) An ACH refund Stripe accepted and that failed later (the bank sent it back; Stripe: «refund.failed … Stripe adds it
--    back to your Stripe account balance», docs.stripe.com/refunds): the money goes back to what the payment brings and the
--    invoice owes it again. Only by Stripe's signed word (the webhook, stripe-refund's answer) — no person, no button.
--    Stripe's docs do not say what charge.amount_refunded does after a failure: from then on the refund rows decide.

-- ---- 3. Payment moves back (only app.refund_unwind makes them; tg_payment_guard refuses a person) --------------------
insert into app.status_transitions (entity_type, from_status, to_status) values
  ('payment', 'refunded',           'partially_refunded'),
  ('payment', 'refunded',           'succeeded'),
  ('payment', 'partially_refunded', 'succeeded')
on conflict do nothing;

-- ---- 4. The money the refund rows prove: manual records and Stripe refunds accepted (succeeded, or pending with its id) -
create or replace function app.refund_counted(p_payment_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(r.amount_cents), 0)::bigint from public.refunds r
   where r.payment_id = p_payment_id
     and (r.status = 'succeeded' or (r.status = 'pending' and r.stripe_refund_id is not null));
$$;
revoke all on function app.refund_counted(uuid) from public, anon, authenticated;

-- once per refund row: the row that already gave its money back (two events at once, a webhook and stripe-refund's answer
-- together — reviews of this PR) never takes it off a second time. Only the steps below write it; the app does not read it.
alter table public.refunds add column unwound_at timestamptz;

-- a counted refund failed: its amount comes off refunded_cents, never below what the other rows prove; once per row (the
-- row is locked and marked). p_counted: the row was in the money before (succeeded, or pending with its id), or it is a
-- Stripe-made refund (dashboard) whose charge.refunded may have raised the money before its row came — then only what the
-- rows do not explain comes off. The owner is asked to look (needs_review), the reason is kept.
create or replace function app.refund_unwind(p_refund_id uuid, p_counted boolean default true)
returns text language plpgsql security definer set search_path = '' as $$
declare
  r     public.refunds;
  p     public.payments;
  v_new bigint;
begin
  select * into r from public.refunds where id = p_refund_id for update;
  select * into p from public.payments where id = r.payment_id for update;
  if r.id is null or p.id is null or r.status not in ('failed', 'canceled') or r.unwound_at is not null or not p_counted then
    return 'stale';
  end if;
  update public.refunds set unwound_at = now() where id = r.id;
  v_new := greatest(app.refund_counted(p.id), p.refunded_cents - r.amount_cents, 0);
  if v_new >= p.refunded_cents then
    update public.payments set needs_review = true where id = p.id;
    return 'stale';
  end if;
  -- a voided invoice takes no money back (its guard refuses any change): the money stays marked for the owner, the
  -- event is applied all the same — never a webhook stuck on 500 for days (review of this PR №1)
  if exists (select 1 from public.invoices i where i.id = p.invoice_id and i.status = 'void') then
    update public.payments set needs_review = true where id = p.id;
    return 'invoice_void';
  end if;
  perform set_config('app.status_reason', 'refund_failed', true);   -- status_events: why the payment came back
  update public.payments
     set refunded_cents = v_new,
         status = case when v_new = 0 then 'succeeded' else 'partially_refunded' end,
         needs_review = true
   where id = p.id;
  perform set_config('app.status_reason', '', true);
  return null;
end;
$$;
revoke all on function app.refund_unwind(uuid, boolean) from public, anon, authenticated;

-- ---- 4а. The invoice's recalculation (create or replace of 20261106080000's, its recalc mark kept): a voided invoice is never written (its guard refuses
-- any change, so any update of its payment — needs_review of a failed refund too — used to fail the whole Stripe event
-- with 500 for days, review of this PR №1), and an update that changes nothing is not made.
create or replace function app.recalc_invoice_payment(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_paid      bigint;
  v_refunded  boolean;
begin
  if p_invoice_id is null then return; end if;
  select coalesce(sum(p.amount_cents - p.refunded_cents) filter (where p.status in ('succeeded', 'partially_refunded', 'refunded')), 0),
         coalesce(bool_or(p.refunded_cents > 0), false)
    into v_paid, v_refunded
    from public.payments p where p.invoice_id = p_invoice_id;

  perform set_config('app.invoice_recalc', 'on', true);
  begin
    update public.invoices i
       set paid_cents = v_paid,
           payment_status = case
             when v_paid > 0 and v_paid >= i.total_cents then 'paid'
             when v_paid > 0 then 'partially_paid'
             when v_refunded then 'refunded'
             else 'unpaid' end
     where i.id = p_invoice_id
       and i.status <> 'void'                                  -- 20д debts: a voided invoice is never written
       and (i.paid_cents, i.payment_status) is distinct from (v_paid, case
             when v_paid > 0 and v_paid >= i.total_cents then 'paid'
             when v_paid > 0 then 'partially_paid'
             when v_refunded then 'refunded'
             else 'unpaid' end);
  exception when others then
    perform set_config('app.invoice_recalc', '', true);   -- a caught error must not leave the mark on
    raise;
  end;
  perform set_config('app.invoice_recalc', '', true);
end;
$$;
revoke all on function app.recalc_invoice_payment(uuid) from public, anon, authenticated;

-- ---- 5. charge.refunded after a failure: amount_refunded no longer decides (create or replace of 20а's) -------------
create or replace function app.stripe_apply_refunded(p_payment_id uuid, p_refunded bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_payment_id for update;
  -- a Stripe refund of this payment failed: a late charge.refunded with the old amount_refunded never lifts it back
  if exists (select 1 from public.refunds r where r.payment_id = p_payment_id and r.stripe_refund_id is not null
                                              and r.status in ('failed', 'canceled')) then
    p_refunded := least(p_refunded, app.refund_counted(p_payment_id));
  end if;
  if p.status not in ('succeeded', 'partially_refunded') or p_refunded is null or p_refunded <= p.refunded_cents then
    return 'stale';                                    -- an older event, or nothing new: refunded_cents only grows here
  end if;
  update public.payments
     set refunded_cents = least(p_refunded, p.amount_cents),
         status = case when p_refunded >= p.amount_cents then 'refunded' else 'partially_refunded' end
   where id = p.id;
  return null;
end;
$$;
revoke all on function app.stripe_apply_refunded(uuid, bigint) from public, anon, authenticated;

-- ---- 6. The payment guard, stripe_refund_settle, stripe_webhook_apply (create or replace of 20д's, changes marked «20д debts»)
create or replace function app.tg_payment_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_merge boolean;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('pending', 'succeeded') then
      raise exception 'payment must be created as pending or succeeded' using errcode = 'check_violation';
    end if;
    if new.refunded_cents <> 0 then
      raise exception 'new payment cannot be refunded' using errcode = 'check_violation';
    end if;
    new.received_by := coalesce(new.received_by, auth.uid());
    -- 20д: a person never writes what only Stripe says (a borrowed PaymentIntent would let a refund land on another payment)
    if auth.uid() is not null and (new.stripe_payment_intent_id is not null or new.stripe_charge_id is not null
       or new.idempotency_key like 'stripe:%' or new.dispute_status <> 'none' or new.fee_cents <> 0 or new.platform_fee_cents <> 0) then
      raise exception 'Stripe fields are written by Stripe' using errcode = '42501';
    end if;
  else
    if new.amount_cents is distinct from old.amount_cents
       or new.method is distinct from old.method
       or new.currency is distinct from old.currency
       or new.invoice_id is distinct from old.invoice_id and old.invoice_id is not null
       or new.visit_id is distinct from old.visit_id
       or new.idempotency_key is distinct from old.idempotency_key
       or new.received_by is distinct from old.received_by
       or new.received_at is distinct from old.received_at
       or new.receipt_number is distinct from old.receipt_number and old.receipt_number is not null then
      raise exception 'payment % is immutable except status (use void/refund)', old.id using errcode = '42501';
    end if;
    -- the client of a payment changes only when two client cards are merged (public.merge_customers, «Лиды и клиенты»,
    -- migration 20261109120000 brings app.merging_customer); until then — and for a person ever — refused as before
    if new.customer_id is distinct from old.customer_id then
      -- to_regprocedure: before that migration the answer is the same refusal as ever, not «function does not exist»
      v_merge := false;
      if to_regprocedure('app.merging_customer(uuid,uuid)') is not null then
        execute 'select app.merging_customer($1, $2)' into v_merge using old.customer_id, new.customer_id;   -- not parsed before it exists
      end if;
      if not coalesce(v_merge, false) then
        raise exception 'payment % is immutable except status (use void/refund)', old.id using errcode = '42501';
      end if;
    end if;
    if auth.uid() is not null and (new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
       or new.stripe_charge_id is distinct from old.stripe_charge_id or new.dispute_status is distinct from old.dispute_status
       or new.fee_cents is distinct from old.fee_cents or new.platform_fee_cents is distinct from old.platform_fee_cents) then
      raise exception 'Stripe fields are written by Stripe' using errcode = '42501';
    end if;
    -- 20д: a refund is a refunds row with its tax part. A person cannot write refunds rows (only the doors do), so what a
    -- person adds to refunded_cents must be exactly the refunds rows made in THIS transaction (created_at = now(), the
    -- transaction's start) — public.refund_record writes its row first; a direct UPDATE has none. A refund status only with
    -- money that grew. Old payments refunded before 20д (no rows) still take a new refund: only the growth is compared.
    -- (Inside this SECURITY DEFINER trigger current_user is the owner, and a setting can be set by anyone: neither tells a
    -- door from a person.) Stripe's own changes come without a person (service_role).
    if auth.uid() is not null
       and (new.refunded_cents is distinct from old.refunded_cents
            or (new.status in ('partially_refunded', 'refunded') and new.status is distinct from old.status))
       and ((case when new.status = 'refunded' then new.amount_cents else new.refunded_cents end) - old.refunded_cents <= 0
            or (case when new.status = 'refunded' then new.amount_cents else new.refunded_cents end) - old.refunded_cents
               is distinct from (select coalesce(sum(r.amount_cents), 0) from public.refunds r
                                  where r.payment_id = new.id and r.status = 'succeeded' and r.created_at = now())) then
      raise exception 'refunds go through refund_record' using errcode = '42501';
    end if;
    -- 20д debts: refunded_cents goes down only when Stripe said a refund it accepted failed (app.refund_unwind, the signed
    -- webhook, no person) and never below the Stripe refunds still accepted; a person never lowers it (T136)
    if new.refunded_cents < old.refunded_cents and (auth.uid() is not null or new.refunded_cents < app.refund_counted(new.id)) then
      raise exception 'refunded_cents can only grow' using errcode = 'check_violation';
    end if;
    if old.status in ('partially_refunded', 'refunded') and new.status in ('succeeded', 'partially_refunded')
       and new.status is distinct from old.status and (auth.uid() is not null or new.refunded_cents >= old.refunded_cents) then
      raise exception 'a refund is undone only when Stripe says it failed' using errcode = '42501';
    end if;
    if new.status = 'voided' and old.status <> 'voided' then
      if auth.uid() is not null and not app.has_role(new.company_id, array['owner', 'admin']) then
        raise exception 'only owner/admin can void a payment' using errcode = '42501';
      end if;
      if old.method in ('card', 'ach', 'tap_to_pay') then
        raise exception 'processor payments are refunded, not voided' using errcode = 'check_violation';
      end if;
      new.voided_at := coalesce(new.voided_at, now());
      new.voided_by := coalesce(auth.uid(), new.voided_by);
    end if;
    if new.status in ('partially_refunded', 'refunded') and new.status is distinct from old.status
       and auth.uid() is not null and not app.has_role(new.company_id, array['owner', 'admin']) then
      raise exception 'only owner/admin can refund' using errcode = '42501';
    end if;
    if new.status = 'refunded' then
      new.refunded_cents := new.amount_cents;
    end if;
  end if;

  -- Квитанция RCT-0001 — сервер при succeeded (§6 Payment.receipt_number)
  if new.status = 'succeeded' and new.receipt_number is null then
    new.receipt_number := app.next_document_number(new.company_id, 'receipt', 'RCT');
  end if;
  return new;
end;
$$;

create or replace function public.stripe_refund_settle(p_refund_id uuid, p_stripe jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r      public.refunds;
  p      public.payments;
  v_st   text;
  v_was  boolean;
begin
  select * into r from public.refunds where id = p_refund_id for update;
  if r.id is null or r.idempotency_key not like 'octo:%' then
    raise exception 'no such refund' using errcode = '22023';
  end if;
  select * into p from public.payments where id = r.payment_id for update;
  if p_stripe ? 'error' then
    -- «not_sent» (Stripe's list has no such refund) only for a row nobody is sending right now
    if r.status = 'pending' and r.stripe_refund_id is null
       and (p_stripe ->> 'error' <> 'not_sent' or r.updated_at < now() - interval '100 seconds') then
      update public.refunds set status = 'failed', failure_reason = left(coalesce(p_stripe ->> 'error', 'stripe'), 100), updated_at = now()
       where id = r.id returning * into r;
    end if;
    return app.refund_json(r);
  end if;
  if p_stripe ->> 'id' is null or p_stripe ->> 'id' !~ '^(re|pyr)_[A-Za-z0-9]{1,64}$'
     or p_stripe ->> 'payment_intent' is distinct from p.stripe_payment_intent_id
     or (p_stripe ->> 'amount')::bigint is distinct from r.amount_cents
     or (r.stripe_refund_id is not null and r.stripe_refund_id <> p_stripe ->> 'id') then
    raise exception 'not this refund' using errcode = '22023';
  end if;
  v_was := r.status = 'succeeded' or (r.status = 'pending' and r.stripe_refund_id is not null);   -- already in the money
  v_st := case p_stripe ->> 'status' when 'succeeded' then 'succeeded' when 'failed' then 'failed'
                                     when 'canceled' then 'canceled' else 'pending' end;
  update public.refunds
     set stripe_refund_id = p_stripe ->> 'id',
         -- final states stay (the webhook may have been first); an ACH refund that fails after succeeded — the webhook says
         -- a row never tied to Stripe takes Stripe's word, even one marked «not_sent» by a check that came too early
         status = case when stripe_refund_id is null then v_st when status in ('succeeded', 'failed', 'canceled') then status else v_st end,
         failure_reason = case when v_st in ('failed', 'canceled') then left(coalesce(p_stripe ->> 'failure_reason', 'stripe'), 100)
                               when stripe_refund_id is null then null else failure_reason end,
         updated_at = now()
   where id = r.id returning * into r;
  if v_was and r.status in ('failed', 'canceled') then
    perform app.refund_unwind(r.id);
  end if;
  perform app.refund_sync_money(p.id);
  return app.refund_json(r);
end;
$$;

create or replace function public.stripe_webhook_apply(p_event jsonb, p_method text default null, p_fee_cents bigint default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  o         jsonb := p_event -> 'data' -> 'object';
  v_meta    text := p_event -> 'data' -> 'object' -> 'metadata' ->> 'company_id';
  v_ours    text := p_event -> 'data' -> 'object' -> 'metadata' ->> 'octo_refund_id';
  v_company uuid;
  v_r       text;
  v_pi      text;
  v_rid     uuid;
  v_was     public.refunds;
  v_now     public.refunds;
  v_refund  boolean := p_event ->> 'type' in ('refund.created', 'refund.updated', 'refund.failed', 'charge.refund.updated');
begin
  if p_event ->> 'id' is null or p_event ->> 'id' !~ '^evt_[A-Za-z0-9]{1,64}$' or jsonb_typeof(o) <> 'object' then
    raise exception 'not a Stripe event' using errcode = '22023';
  end if;
  if p_method is not null and p_method not in ('card', 'ach') then
    p_method := null;                                   -- another kind of method: the event's own types decide
  end if;
  if v_meta is not null then
    select s.company_id into v_company from public.stripe_accounts s where s.account_id = p_event ->> 'account';
    if v_company is null or v_company::text <> lower(v_meta) then
      if exists (select 1 from app.stripe_events where event_id = p_event ->> 'id') then
        return 'duplicate';
      end if;
      insert into app.stripe_events (event_id, type, account_id, livemode, payload, status, reason, processed_at)
      values (p_event ->> 'id', left(p_event ->> 'type', 100), p_event ->> 'account', coalesce((p_event ->> 'livemode')::boolean, false),
              -- the journal keeps no client's details (as app.stripe_event_apply)
              jsonb_set(p_event, '{data,object}', o - array['billing_details', 'payment_method_details', 'shipping', 'receipt_email',
                                                           'customer_details', 'evidence', 'description', 'last_payment_error']),
              'ignored', case when v_company is null then 'unknown_account' else 'company_mismatch' end, now())
      on conflict (event_id) do nothing;
      return 'ignored';
    end if;
  end if;

  -- 20д debts: the row of this Stripe refund as it was before the event (counted = succeeded, or pending with its id)
  if v_refund and o ->> 'id' ~ '^(re|pyr)_[A-Za-z0-9]{1,64}$' then
    select * into v_was from public.refunds where stripe_refund_id = o ->> 'id' for update;   -- the second event waits
  end if;

  -- 20д: Stripe may tell about our refund before stripe-refund keeps its answer. The row is found by its id in metadata —
  -- only a row of this very payment (the intent of the event's own account) that has no Stripe id yet; then the general
  -- refund.* step below meets it by stripe_refund_id instead of adding a second row.
  if p_event ->> 'type' in ('refund.created', 'refund.updated', 'refund.failed', 'charge.refund.updated')
     and v_ours ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and o ->> 'id' ~ '^(re|pyr)_[A-Za-z0-9]{1,64}$' then
    update public.refunds r
       set stripe_refund_id = o ->> 'id', updated_at = now(),
           status = 'pending', failure_reason = null          -- the step below sets Stripe's status of it
     where r.id = v_ours::uuid and r.stripe_refund_id is null and r.idempotency_key like 'octo:%'
       and (r.status = 'pending' or (r.status = 'failed' and r.failure_reason = 'not_sent'))
       and r.amount_cents = (o ->> 'amount')::bigint
       and r.payment_id = (select p.id from public.payments p join public.stripe_accounts s on s.company_id = p.company_id
                            where p.idempotency_key = 'stripe:' || (o ->> 'payment_intent') and s.account_id = p_event ->> 'account')
       and not exists (select 1 from public.refunds x where x.stripe_refund_id = o ->> 'id')
    returning r.payment_id into v_rid;
  end if;

  v_r := app.stripe_event_apply(p_event, p_method);

  if v_rid is not null then
    perform app.refund_sync_money(v_rid);              -- Stripe accepted it: the money as if stripe-refund kept the answer
  end if;

  -- 20д debts: an accepted refund that failed later (ACH: the bank sent it back) gives the money back to the invoice, once —
  -- by the change of the row (a repeat of the event finds it failed already). Any other refund.* of a known payment: the
  -- money follows the rows (a refund made in Stripe's dashboard after a failure — charge.refunded no longer decides).
  if v_refund and v_r = 'processed' and o ->> 'id' ~ '^(re|pyr)_[A-Za-z0-9]{1,64}$' then
    select * into v_now from public.refunds where stripe_refund_id = o ->> 'id';
    if v_now.status in ('failed', 'canceled') then
      -- counted before this event, or Stripe's own refund met first as failed (refund.created late): its money may be in
      -- refunded_cents through charge.refunded — once per row, never below what the rows prove
      perform app.refund_unwind(v_now.id, (v_was.id is not null and v_was.status in ('succeeded', 'pending'))
                                          or (v_was.id is null and v_now.idempotency_key like 'stripe:%'));
      perform app.refund_sync_money(v_now.payment_id);
    elsif v_now.id is not null then
      perform app.refund_sync_money(v_now.payment_id);
    end if;
  end if;

  -- Stripe's fee of this payment (not our application fee): only from unknown (0) to known — a repeat of the event may bring
  -- it when the first delivery could not (ACH: processing has none, succeeded has); never lowered, never someone else's payment
  v_pi := case when p_event ->> 'type' like 'payment_intent.%' then o ->> 'id' else o ->> 'payment_intent' end;
  if v_r in ('processed', 'duplicate') and p_fee_cents is not null and p_fee_cents > 0 and v_pi ~ '^pi_[A-Za-z0-9]{1,64}$' then
    update public.payments set fee_cents = p_fee_cents
     where idempotency_key = 'stripe:' || v_pi and stripe_payment_intent_id = v_pi and fee_cents = 0
       and company_id = (select s.company_id from public.stripe_accounts s where s.account_id = p_event ->> 'account');
  end if;
  return v_r;
end;
$$;
