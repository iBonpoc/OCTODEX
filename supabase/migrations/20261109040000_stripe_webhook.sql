-- Step 20г: Stripe's webhook → the database (docs/specs/35-stripe.md §4–5). Test mode only.
-- The Edge Function stripe-webhook (verify_jwt = false) checks Stripe's signature over the RAW body first — app.stripe_event_apply
-- trusts the event's «account» field, so nothing unsigned ever reaches it — then calls, as service_role:
-- * public.stripe_webhook_apply(event, method, fee) —
--   1) an object whose metadata.company_id is not the company of the event's account is ours by no right: written to the
--      journal as «ignored» (company_mismatch), nothing else changes;
--   2) app.stripe_event_apply(event, method) — the journal (a repeat is «duplicate»), the payment, the attempt;
--   3) the payment's Stripe fee (fee_cents) from the charge's balance transaction, when Stripe already knows it.
--   A refusal with SQLSTATE 55000 («not recorded yet; retry later») rolls everything back: the Edge Function answers 500 and
--   Stripe sends the event again.
-- PostgREST shows only public: this is the door, app.* stays closed (rule 18, T52).

create or replace function public.stripe_webhook_apply(p_event jsonb, p_method text default null, p_fee_cents bigint default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  o         jsonb := p_event -> 'data' -> 'object';
  v_meta    text := p_event -> 'data' -> 'object' -> 'metadata' ->> 'company_id';
  v_company uuid;
  v_r       text;
  v_pi      text;
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
      insert into app.stripe_events (event_id, type, account_id, livemode, payload, status, reason, processed_at)
      values (p_event ->> 'id', left(p_event ->> 'type', 100), p_event ->> 'account', coalesce((p_event ->> 'livemode')::boolean, false),
              -- the journal keeps no client's details (as app.stripe_event_apply)
              jsonb_set(p_event, '{data,object}', o - array['billing_details', 'payment_method_details', 'shipping', 'receipt_email',
                                                           'customer_details', 'evidence', 'description', 'last_payment_error']),
              'ignored', 'company_mismatch', now())
      on conflict (event_id) do nothing;
      return 'ignored';
    end if;
  end if;

  v_r := app.stripe_event_apply(p_event, p_method);

  -- Stripe's fee of this payment (not our application fee): only grows from unknown to known, never for someone else's payment
  v_pi := case when p_event ->> 'type' like 'payment_intent.%' then o ->> 'id' else o ->> 'payment_intent' end;
  if v_r = 'processed' and p_fee_cents is not null and p_fee_cents >= 0 and v_pi ~ '^pi_[A-Za-z0-9]{1,64}$' then
    update public.payments set fee_cents = p_fee_cents
     where idempotency_key = 'stripe:' || v_pi and stripe_payment_intent_id = v_pi
       and fee_cents is distinct from p_fee_cents
       and company_id = (select s.company_id from public.stripe_accounts s where s.account_id = p_event ->> 'account');
  end if;
  return v_r;
end;
$$;
revoke all on function public.stripe_webhook_apply(jsonb, text, bigint) from public, anon, authenticated;
grant execute on function public.stripe_webhook_apply(jsonb, text, bigint) to service_role;
