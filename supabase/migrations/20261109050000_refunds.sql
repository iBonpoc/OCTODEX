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
  if p_amount is null or p_amount <= 0 or p_amount > app.refund_available(p.id) then
    raise exception 'refund_above_available' using errcode = 'check_violation';
  end if;
  return p;
end;
$$;
revoke all on function app.refund_guard(uuid, uuid, bigint, text, text, text) from public, anon, authenticated;

-- the answer of a door: no Stripe ids, no other company's anything
create or replace function app.refund_json(r public.refunds)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'payment_id', r.payment_id, 'amount_cents', r.amount_cents, 'status', r.status,
                            'tax_cents', r.tax_cents, 'net_cents', r.net_cents, 'failure_reason', r.failure_reason);
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
  p := app.refund_guard(v_user, p_payment_id, p_amount_cents, p_reason_kind, p_reason, p_key);
  if p.method in ('card', 'ach', 'tap_to_pay') then
    raise exception 'refund_through_stripe' using errcode = 'check_violation';
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
  if r.id is null then
    -- a refund of this payment that never reached Stripe (a timeout, a closed tab): resume it, never a second one beside it
    -- (its amount is already held back, so it is looked for before the amount check)
    perform 1 from public.payments where id = p_payment_id for update;
    select * into r from public.refunds
     where payment_id = p_payment_id and status = 'pending' and stripe_refund_id is null and idempotency_key like 'octo:%'
     order by created_at limit 1;
    if r.id is not null and r.amount_cents <> p_amount_cents then
      raise exception 'refund_in_progress' using errcode = 'check_violation';
    end if;
  end if;
  if r.id is null then
    p := app.refund_guard(p_user_id, p_payment_id, p_amount_cents, p_reason_kind, p_reason, p_key);
    if p.method not in ('card', 'ach', 'tap_to_pay') or p.stripe_payment_intent_id is null then
      raise exception 'refund_not_stripe' using errcode = 'check_violation';
    end if;
    v_tax := app.refund_tax_part(p.invoice_id, p_amount_cents);
    insert into public.refunds (company_id, payment_id, amount_cents, reason_kind, reason, status, idempotency_key, created_by,
                                method, tax_cents, net_cents)
    values (p.company_id, p.id, p_amount_cents, p_reason_kind, nullif(btrim(p_reason), ''), 'pending', 'octo:' || p_key, p_user_id,
            p.method, v_tax, p_amount_cents - v_tax)
    returning * into r;
  else
    select * into p from public.payments where id = r.payment_id for update;
    if not app.refund_role_ok(p_user_id, p.company_id) then
      raise exception 'only owner/admin can refund' using errcode = '42501';
    end if;
  end if;
  select s.account_id into v_acct from public.stripe_accounts s where s.company_id = p.company_id;
  if v_acct is null then
    raise exception 'refund_not_stripe' using errcode = 'check_violation';
  end if;
  return app.refund_json(r) || jsonb_build_object(
    'account_id', v_acct, 'payment_intent', p.stripe_payment_intent_id, 'company_id', p.company_id,
    'stripe_refund_id', r.stripe_refund_id, 'fee_cents', p.fee_cents, 'platform_fee_cents', p.platform_fee_cents,
    -- one refund row = one Stripe refund, whoever retries and when (Stripe keeps a key 24 h; the webhook ties it sooner)
    'idempotency_key', 'octodex-refund-' || r.id);
end;
$$;
revoke all on function public.stripe_refund_open(uuid, uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.stripe_refund_open(uuid, uuid, bigint, text, text, text) to service_role;

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
    if r.status = 'pending' and r.stripe_refund_id is null then
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
         status = case when status in ('succeeded', 'failed', 'canceled') then status else v_st end,
         failure_reason = coalesce(failure_reason, left(p_stripe ->> 'failure_reason', 100)),
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
       set stripe_refund_id = o ->> 'id', updated_at = now()
     where r.id = v_ours::uuid and r.stripe_refund_id is null and r.idempotency_key like 'octo:%'
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
