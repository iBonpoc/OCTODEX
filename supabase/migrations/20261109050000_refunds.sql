-- Step 20д: refunds (docs/specs/35-stripe.md §4в). Test mode only. Everything is added (rule 16).
-- Only an active owner/admin of the payment's company refunds. tg_payment_guard checks the role only when auth.uid() is set —
-- service_role has none — so every door below checks the person itself.
-- * public.refund_record(payment, amount, kind, reason, key) — the app (authenticated): cash / check / Zelle / financing / other.
--   The money did not go through Stripe: the refund is a record, «succeeded» at once.
-- * public.stripe_refund_open(user, payment, amount, kind, reason, key) — the Edge Function stripe-refund (service_role):
--   a card / ACH payment; a «pending» row BEFORE Stripe is called, its id is the Idempotency-Key and metadata.octo_refund_id.
-- * public.stripe_refund_settle(refund, stripe refund | error) — what Stripe answered.
-- * public.stripe_webhook_apply — refund.* with metadata.octo_refund_id finds OUR row (Stripe may tell before it answers).
-- Never more than paid − refunded − refunds on their way; the payment row is locked (two tabs, a double tap).
-- Tax and revenue of a refund by the document's mode (19 §7.9) — the same formula as refundAllocation of the engine (T133).

-- ---- 0. The payment guard: + Stripe fields and refunds only through the doors (create or replace of core's) -------------
create or replace function app.tg_payment_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
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
      if not app.merging_customer(old.customer_id, new.customer_id) then
        raise exception 'payment % is immutable except status (use void/refund)', old.id using errcode = '42501';
      end if;
    end if;
    if auth.uid() is not null and (new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
       or new.stripe_charge_id is distinct from old.stripe_charge_id or new.dispute_status is distinct from old.dispute_status
       or new.fee_cents is distinct from old.fee_cents or new.platform_fee_cents is distinct from old.platform_fee_cents) then
      raise exception 'Stripe fields are written by Stripe' using errcode = '42501';
    end if;
    -- 20д: a refund is a refunds row with its tax part. A person cannot write refunds rows (only the doors do), so a person's
    -- change of refunded_cents or of a refund status must equal what the refunds rows say — public.refund_record writes its
    -- row first; a direct UPDATE has none. (Inside this SECURITY DEFINER trigger current_user is the owner, and a setting
    -- can be set by anyone: neither tells a door from a person.) Stripe's own changes come without a person (service_role).
    if auth.uid() is not null
       and (new.refunded_cents is distinct from old.refunded_cents
            or (new.status in ('partially_refunded', 'refunded') and new.status is distinct from old.status))
       and (case when new.status = 'refunded' then new.amount_cents else new.refunded_cents end)
           is distinct from (select coalesce(sum(r.amount_cents), 0) from public.refunds r
                              where r.payment_id = new.id and r.status = 'succeeded') then
      raise exception 'refunds go through refund_record' using errcode = '42501';
    end if;
    if new.refunded_cents < old.refunded_cents then
      raise exception 'refunded_cents can only grow' using errcode = 'check_violation';
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

-- ---- 1. The refund's own fields ------------------------------------------------------------------------------------
alter table public.refunds
  add column method            text check (method in ('card', 'ach', 'tap_to_pay', 'cash', 'check', 'zelle', 'financing', 'other')),
  add column tax_cents         bigint check (tax_cents >= 0),
  add column net_cents         bigint check (net_cents >= 0),
  add column allocation_method text not null default 'proportional' check (allocation_method in ('proportional', 'by_line', 'manual')),
  add column failure_reason    text check (char_length(failure_reason) <= 100);
grant select (method, tax_cents, net_cents, allocation_method, failure_reason) on public.refunds to authenticated;

create trigger t90_audit after insert or update on public.refunds
  for each row execute function app.tg_audit();

-- ---- 2. Steps (nobody calls them from outside) -------------------------------------------------------------------
-- tax part of a refund by the document's mode: proportional for added_on_top / tax_inclusive_display, 0 for
-- included_in_price / exempt / no invoice (an advance); half up, like roundCents of the engine
create or replace function app.refund_tax_part(p_invoice_id uuid, p_amount bigint)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case when i.total_cents <= 0 or i.tax_cents <= 0
                  or coalesce(i.tax_mode, 'added_on_top') in ('included_in_price', 'exempt') then 0
                else least(p_amount, round(p_amount::numeric * i.tax_cents / i.total_cents)::bigint) end
      from public.invoices i where i.id = p_invoice_id), 0);
$$;
revoke all on function app.refund_tax_part(uuid, bigint) from public, anon, authenticated;

-- what may still be refunded: what the payment brought − what is refunded or on its way back. A charge.refunded may come
-- before the refund rows, a manual refund has its row: the greater of the two counts.
create or replace function app.refund_available(p_payment_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select p.amount_cents - greatest(p.refunded_cents,
           coalesce((select sum(r.amount_cents) from public.refunds r
                      where r.payment_id = p.id and r.status in ('pending', 'succeeded')), 0))
    from public.payments p where p.id = p_payment_id;
$$;
revoke all on function app.refund_available(uuid) from public, anon, authenticated;

-- the person is an active owner/admin of the company (by id: service_role has no auth.uid())
create or replace function app.refund_role_ok(p_user uuid, p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (
    select 1 from public.memberships m
     where m.company_id = p_company_id and m.user_id = p_user and m.status = 'active' and m.deleted_at is null
       and m.role in ('owner', 'admin'));
$$;
revoke all on function app.refund_role_ok(uuid, uuid) from public, anon, authenticated;

-- the checks of every door; the payment row stays locked till the end of the transaction
create or replace function app.refund_guard(p_user uuid, p_payment_id uuid, p_amount bigint, p_kind text, p_reason text, p_key text)
returns public.payments language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9:_-]{8,100}$' then
    raise exception 'bad key' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('rescission', 'cancellation', 'goodwill', 'other') then
    raise exception 'bad reason' using errcode = '22023';
  end if;
  if char_length(p_reason) > 500 then
    raise exception 'reason too long' using errcode = '22023';
  end if;
  select * into p from public.payments where id = p_payment_id for update;
  if p.id is null or not app.refund_role_ok(p_user, p.company_id) then
    raise exception 'only owner/admin can refund' using errcode = '42501';   -- no such payment looks the same: nothing to learn
  end if;
  if exists (select 1 from public.companies c where c.id = p.company_id and c.closed_at is not null) then
    raise exception 'the company is closed' using errcode = '42501';
  end if;
  if p.status not in ('succeeded', 'partially_refunded') then
    raise exception 'refund_not_refundable' using errcode = 'check_violation';
  end if;
  if p.dispute_status in ('open', 'lost') then
    raise exception 'refund_disputed' using errcode = 'check_violation';   -- Stripe refuses it too (charge_disputed)
  end if;
  if p_amount is not null and (p_amount <= 0 or p_amount > app.refund_available(p.id)) then
    raise exception 'refund_above_available' using errcode = 'check_violation';
  end if;
  return p;
end;
$$;
revoke all on function app.refund_guard(uuid, uuid, bigint, text, text, text) from public, anon, authenticated;

-- a payment Stripe took (the webhook made it: its key is the intent) — not a card payment recorded by hand
create or replace function app.refund_is_stripe(p public.payments)
returns boolean language sql immutable set search_path = '' as $$
  select p.stripe_payment_intent_id is not null and p.idempotency_key = 'stripe:' || p.stripe_payment_intent_id;
$$;
revoke all on function app.refund_is_stripe(public.payments) from public, anon, authenticated;

-- the answer of a door: no Stripe ids, no other company's anything; age_s — seconds since its last try (updated_at), by the
-- database's clock: a row resumed for Stripe is touched, so «old» means no call to Stripe can be in flight (its timeout is 10 s)
create or replace function app.refund_json(r public.refunds)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'payment_id', r.payment_id, 'amount_cents', r.amount_cents, 'status', r.status,
                            'tax_cents', r.tax_cents, 'net_cents', r.net_cents, 'failure_reason', r.failure_reason,
                            'age_s', floor(extract(epoch from now() - r.updated_at))::bigint);
$$;
revoke all on function app.refund_json(public.refunds) from public, anon, authenticated;

-- a key already used: the same refund again (a double tap, a retry) — only by the same person for the same payment
create or replace function app.refund_by_key(p_user uuid, p_payment_id uuid, p_key text)
returns public.refunds language plpgsql stable security definer set search_path = '' as $$
declare r public.refunds;
begin
  select * into r from public.refunds where idempotency_key = 'octo:' || p_key;
  if r.id is not null and (r.payment_id <> p_payment_id or r.created_by is distinct from p_user) then
    raise exception 'key used' using errcode = '23505';
  end if;
  return r;
end;
$$;
revoke all on function app.refund_by_key(uuid, uuid, text) from public, anon, authenticated;

-- ---- 3. Cash, check, Zelle, financing, other: a record -----------------------------------------------------------------
create or replace function public.refund_record(p_payment_id uuid, p_amount_cents bigint, p_reason_kind text,
                                                p_reason text, p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  p      public.payments;
  r      public.refunds;
  v_tax  bigint;
begin
  r := app.refund_by_key(v_user, p_payment_id, p_key);
  if r.id is not null then
    return app.refund_json(r);
  end if;
  if p_amount_cents is null then
    raise exception 'refund_above_available' using errcode = 'check_violation';
  end if;
  p := app.refund_guard(v_user, p_payment_id, p_amount_cents, p_reason_kind, p_reason, p_key);
  r := app.refund_by_key(v_user, p_payment_id, p_key);   -- a double tap that waited for the lock: the same refund
  if r.id is not null then
    return app.refund_json(r);
  end if;
  if app.refund_is_stripe(p) then
    raise exception 'refund_through_stripe' using errcode = 'check_violation';   -- a card taken by the contractor's own terminal: a record
  end if;
  v_tax := app.refund_tax_part(p.invoice_id, p_amount_cents);
  insert into public.refunds (company_id, payment_id, amount_cents, reason_kind, reason, status, idempotency_key, created_by,
                              method, tax_cents, net_cents)
  values (p.company_id, p.id, p_amount_cents, p_reason_kind, nullif(btrim(p_reason), ''), 'succeeded', 'octo:' || p_key, v_user,
          p.method, v_tax, p_amount_cents - v_tax)
  returning * into r;
  -- as the person: tg_payment_guard checks owner/admin once more; the invoice's balance is recalculated by its trigger
  update public.payments
     set refunded_cents = p.refunded_cents + p_amount_cents,
         status = case when p.refunded_cents + p_amount_cents >= p.amount_cents then 'refunded' else 'partially_refunded' end
   where id = p.id;
  return app.refund_json(r);
end;
$$;
revoke all on function public.refund_record(uuid, bigint, text, text, text) from public, anon;
grant execute on function public.refund_record(uuid, bigint, text, text, text) to authenticated;

-- ---- 4. Card / ACH: through Stripe (the Edge Function stripe-refund) -----------------------------------------------------
create or replace function public.stripe_refund_open(p_user_id uuid, p_payment_id uuid, p_amount_cents bigint,
                                                     p_reason_kind text, p_reason text, p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p      public.payments;
  r      public.refunds;
  v_acct text;
  v_tax  bigint;
begin
  r := app.refund_by_key(p_user_id, p_payment_id, p_key);
  if r.id is not null and (r.status <> 'pending' or r.stripe_refund_id is not null) then
    select * into p from public.payments where id = r.payment_id for update;   -- answered: the same answer, no Stripe call
    if not app.refund_role_ok(p_user_id, p.company_id) then
      raise exception 'only owner/admin can refund' using errcode = '42501';
    end if;
  else
    -- the person, the company, the dispute, the status — first; nothing about the payment is told to anyone else
    p := app.refund_guard(p_user_id, p_payment_id, null, coalesce(r.reason_kind, p_reason_kind), p_reason, p_key);
    if not app.refund_is_stripe(p) then
      raise exception 'refund_not_stripe' using errcode = 'check_violation';
    end if;
    if r.id is null then
      r := app.refund_by_key(p_user_id, p_payment_id, p_key);   -- the same key that waited for the lock
    end if;
    if r.id is null then
      -- one refund on its way per payment; only ITS key resumes it (another tab, another key: wait — the Edge Function asks
      -- Stripe about an old one first and frees it). Adopting it under another key would let that key make a second refund.
      if exists (select 1 from public.refunds where payment_id = p.id and status = 'pending' and stripe_refund_id is null
                                                  and idempotency_key like 'octo:%') then
        raise exception 'refund_in_progress' using errcode = 'check_violation';
      end if;
      if p_amount_cents is null then
        raise exception 'refund_above_available' using errcode = 'check_violation';
      end if;
      perform app.refund_guard(p_user_id, p.id, p_amount_cents, p_reason_kind, p_reason, p_key);   -- the limit
      v_tax := app.refund_tax_part(p.invoice_id, p_amount_cents);
      insert into public.refunds (company_id, payment_id, amount_cents, reason_kind, reason, status, idempotency_key, created_by,
                                  method, tax_cents, net_cents)
      values (p.company_id, p.id, p_amount_cents, p_reason_kind, nullif(btrim(p_reason), ''), 'pending', 'octo:' || p_key, p_user_id,
              p.method, v_tax, p_amount_cents - v_tax)
      returning * into r;
    else
      update public.refunds set updated_at = now() where id = r.id returning * into r;   -- this try: «not old» while it calls Stripe
    end if;
  end if;
  select s.account_id into v_acct from public.stripe_accounts s where s.company_id = p.company_id;
  if v_acct is null then
    raise exception 'refund_not_stripe' using errcode = 'check_violation';
  end if;
  return app.refund_json(r) || jsonb_build_object(
    'account_id', v_acct, 'payment_intent', p.stripe_payment_intent_id, 'company_id', p.company_id,
    'stripe_refund_id', r.stripe_refund_id, 'fee_cents', p.fee_cents, 'platform_fee_cents', p.platform_fee_cents,
    -- one refund row = one Stripe refund, whoever retries; after Stripe's 24 h the Edge Function asks Stripe first
    'idempotency_key', 'octodex-refund-' || r.id);
end;
$$;
revoke all on function public.stripe_refund_open(uuid, uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.stripe_refund_open(uuid, uuid, bigint, text, text, text) to service_role;

-- the refund of this payment that has not reached Stripe yet (or null) — for the Edge Function to ask Stripe about it
-- before anything else (a timeout long ago: did Stripe make it?). Owner/admin only, as every door.
create or replace function public.stripe_refund_inflight(p_user_id uuid, p_payment_id uuid, p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  r public.refunds;
begin
  select * into p from public.payments where id = p_payment_id;
  if p.id is null or not app.refund_role_ok(p_user_id, p.company_id) then
    raise exception 'only owner/admin can refund' using errcode = '42501';
  end if;
  select * into r from public.refunds
   where payment_id = p.id and status = 'pending' and stripe_refund_id is null and idempotency_key like 'octo:%'
   order by created_at limit 1;
  if r.id is null then
    return null;
  end if;
  return app.refund_json(r) || jsonb_build_object('account_id', (select s.account_id from public.stripe_accounts s where s.company_id = p.company_id),
                                                  'payment_intent', p.stripe_payment_intent_id,
                                                  -- the asker's own try (its key): resumed, never freed under it
                                                  'own', r.idempotency_key = 'octo:' || p_key);
end;
$$;
revoke all on function public.stripe_refund_inflight(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.stripe_refund_inflight(uuid, uuid, text) to service_role;

-- the money of a payment after its Stripe refunds: Stripe accepted them (pending with an id, or succeeded) — only grows
create or replace function app.refund_sync_money(p_payment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.stripe_apply_refunded(p_payment_id, (
    select coalesce(sum(r.amount_cents), 0)::bigint from public.refunds r
     where r.payment_id = p_payment_id
       and (r.status = 'succeeded' or (r.status = 'pending' and r.stripe_refund_id is not null))));
end;
$$;
revoke all on function app.refund_sync_money(uuid) from public, anon, authenticated;

-- p_stripe: Stripe's Refund object, or {"error": "<code>"} when Stripe said no (nothing was refunded)
create or replace function public.stripe_refund_settle(p_refund_id uuid, p_stripe jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r      public.refunds;
  p      public.payments;
  v_st   text;
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
  perform app.refund_sync_money(p.id);
  return app.refund_json(r);
end;
$$;
revoke all on function public.stripe_refund_settle(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.stripe_refund_settle(uuid, jsonb) to service_role;

-- ---- 5. The webhook: a refund.* about OUR refund row ties to it --------------------------------------------------------
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
revoke all on function public.stripe_webhook_apply(jsonb, text, bigint) from public, anon, authenticated;
grant execute on function public.stripe_webhook_apply(jsonb, text, bigint) to service_role;
