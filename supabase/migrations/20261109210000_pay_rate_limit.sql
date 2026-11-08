-- Security before live (docs/specs/35-stripe.md §4д, «Деньги и отчёты» №7). Test mode only. Everything is added (rule 16).
-- 1. Rate limits of the Edge functions stripe-pay (anonymous, the /p/ token is the key) and stripe-refund (owner/admin):
--    app.rate_hits keeps one row per allowed request — key = scope + sha256 of the token / HMAC of the IP / the invoice or the
--    person; no plain token or IP. A refused request writes nothing (a flood does not grow the table); every key of a request
--    is checked first, then all are written (a refusal on the IP does not spend the token's turn).
-- 2. Retention of app.stripe_events: the payload is emptied after 30 days (it may hold a client's details), the row lives
--    180 days — longer than Stripe's 30 days of manual resend, so a resent event is still a «duplicate».
-- 3. app.stripe_event_apply: an older account.updated never overwrites a newer one (by the events' own «created»); a second event about
--    the same failed refund does not raise needs_review again; types we do not apply are kept without their payload.

-- ---- 1. Rate limits ---------------------------------------------------------------------------------------------------
create table app.rate_hits (
  key text not null check (char_length(key) between 3 and 120),
  at  timestamptz not null default now()
);
create index rate_hits_key_at_idx on app.rate_hits (key, at);
create index rate_hits_at_idx on app.rate_hits (at);
revoke all on app.rate_hits from public, anon, authenticated;

-- null = allowed (one hit written per key); n = refused, try again in n seconds (nothing written)
create or replace function app.rate_take(p_keys text[], p_limits int[], p_window interval)
returns int language plpgsql security definer set search_path = '' as $$
declare
  k      text;
  i      int;
  v_n    int;
  v_at   timestamptz;
  v_wait int;
begin
  if p_keys is null or p_limits is null or cardinality(p_keys) = 0 or cardinality(p_keys) <> cardinality(p_limits)
     or p_window is null or p_window <= interval '0' or array_position(p_keys, null) is not null
     or array_position(p_limits, null) is not null or exists (select 1 from unnest(p_limits) l where l < 1) then
    raise exception 'rate_take: bad arguments' using errcode = '22023';
  end if;
  -- one request of a key at a time; always the same order of locks (no deadlock between two requests of two keys)
  for k in select distinct x from unnest(p_keys) x order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended('rate:' || k, 0));
  end loop;
  for i in 1 .. cardinality(p_keys) loop
    select count(*) into v_n from app.rate_hits where key = p_keys[i] and at > now() - p_window;
    if v_n >= p_limits[i] then
      -- the hit that has to leave the window before one more fits
      select at into v_at from app.rate_hits where key = p_keys[i] and at > now() - p_window
       order by at offset v_n - p_limits[i] limit 1;
      v_wait := greatest(coalesce(v_wait, 0), ceil(extract(epoch from (v_at + p_window - now())))::int, 1);
    end if;
  end loop;
  if v_wait is not null then
    return v_wait;
  end if;
  insert into app.rate_hits (key) select distinct x from unnest(p_keys) x;
  return null;
end;
$$;
revoke all on function app.rate_take(text[], int[], interval) from public, anon, authenticated;

-- stripe-pay before the /p/ link is looked at: 10 per 10 min per token, 30 per IP (an IPv6 /64), 100 per IPv6 /48.
-- No IP (no secret, no Cloudflare header): one ceiling for the whole function, 300 per 10 min — never «no limit».
create or replace function public.pay_rate_take(p_token_hash text, p_ip_hash text default null, p_net_hash text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_keys   text[] := array['pay_token:' || p_token_hash];
  v_limits int[]  := array[10];
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$') or (p_net_hash is not null and p_net_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'pay_rate_take: a hash is 64 hex' using errcode = '22023';
  end if;
  if p_ip_hash is null then
    v_keys := v_keys || 'pay_all:all'::text; v_limits := v_limits || 300;
  else
    v_keys := v_keys || ('pay_ip:' || p_ip_hash); v_limits := v_limits || 30;
    if p_net_hash is not null then
      v_keys := v_keys || ('pay_net:' || p_net_hash); v_limits := v_limits || 100;
    end if;
  end if;
  return app.rate_take(v_keys, v_limits, interval '10 minutes');
end;
$$;
revoke all on function public.pay_rate_take(text, text, text) from public, anon, authenticated;
grant execute on function public.pay_rate_take(text, text, text) to service_role;

-- stripe-pay after the link is checked: the expensive step (cancel / create a PaymentIntent) — 20 per 10 min per invoice,
-- whatever token or address it comes from
create or replace function public.pay_invoice_rate_take(p_invoice_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
begin
  if p_invoice_id is null then
    raise exception 'pay_invoice_rate_take: no invoice' using errcode = '22023';
  end if;
  return app.rate_take(array['pay_invoice:' || p_invoice_id::text], array[20], interval '10 minutes');
end;
$$;
revoke all on function public.pay_invoice_rate_take(uuid) from public, anon, authenticated;
grant execute on function public.pay_invoice_rate_take(uuid) to service_role;

-- stripe-refund: 20 per 10 min per person (the uid comes only from the JWT, in the function)
create or replace function public.refund_rate_take(p_user_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null then
    raise exception 'refund_rate_take: no person' using errcode = '22023';
  end if;
  return app.rate_take(array['refund_user:' || p_user_id::text], array[20], interval '10 minutes');
end;
$$;
revoke all on function public.refund_rate_take(uuid) from public, anon, authenticated;
grant execute on function public.refund_rate_take(uuid) to service_role;

-- ---- 2. The journal of Stripe events: what is kept, how long ------------------------------------------------------------
-- rule16: small (app.stripe_events grows with online payments only; the purge below keeps it at 180 days)
create index stripe_events_received_idx on app.stripe_events (received_at);

-- what the journal keeps of an event: an applied type without the client's details; any other type — only its id and type
create or replace function app.stripe_event_journal(p_event jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case
    when p_event ->> 'type' in ('account.updated', 'payment_intent.processing', 'payment_intent.succeeded',
                                'payment_intent.payment_failed', 'payment_intent.canceled', 'charge.refunded', 'refund.created',
                                'refund.updated', 'refund.failed', 'charge.refund.updated', 'charge.dispute.created',
                                'charge.dispute.closed')
         and jsonb_typeof(p_event -> 'data' -> 'object') = 'object' then
      jsonb_set(p_event #- '{data,previous_attributes}', '{data,object}',
                (p_event -> 'data' -> 'object') - array['billing_details', 'payment_method_details', 'shipping', 'receipt_email',
                  'customer_details', 'evidence', 'description', 'last_payment_error',
                  -- older API versions nest the charges (with their billing details) in a payment intent; an open receipt link
                  'charges', 'receipt_url', 'destination_details',
                  -- an account: its owner's person, email, business profile, bank accounts
                  'email', 'individual', 'company', 'business_profile', 'external_accounts', 'settings', 'tos_acceptance',
                  -- a customer: name, phone, address
                  'name', 'phone', 'address'])
    else jsonb_strip_nulls(jsonb_build_object('id', p_event ->> 'id', 'type', p_event ->> 'type', 'account', p_event ->> 'account',
                                              'livemode', p_event -> 'livemode', 'created', p_event -> 'created'))
  end;
$$;
revoke all on function app.stripe_event_journal(jsonb) from public, anon, authenticated;

-- the payload after 30 days, the row after 180 (a resent event within Stripe's 30 days is still found: «duplicate»);
-- the rate hits after a day (the longest window is 10 minutes)
create or replace function app.purge_pay_security()
returns void language sql security definer set search_path = '' as $$
  delete from app.rate_hits where at < now() - interval '1 day';
  update app.stripe_events set payload = '{}'::jsonb where payload <> '{}'::jsonb and received_at < now() - interval '30 days';
  delete from app.stripe_events where received_at < now() - interval '180 days';
$$;
revoke all on function app.purge_pay_security() from public, anon, authenticated;

do $$
begin
  if to_regnamespace('cron') is not null then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = $1' using 'pay-security-purge';
    execute $q$select cron.schedule('pay-security-purge', '53 4 * * *', 'select app.purge_pay_security()')$q$;
  end if;
end;
$$;

-- ---- 3. Applying events: order of account pictures, one flag per failed refund ------------------------------------------
-- the «created» of the last account.updated applied (Stripe's clock, whole seconds). Only events set it: our own read in
-- stripe-connect (another clock, a moment between its GET and its save) is never compared with an event — review of §4д
alter table public.stripe_accounts add column if not exists last_event_at timestamptz;

create or replace function app.stripe_event_apply(p_event jsonb, p_method text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_id      text := p_event ->> 'id';
  v_type    text := p_event ->> 'type';
  v_account text := p_event ->> 'account';
  o         jsonb := p_event -> 'data' -> 'object';
  v_company uuid;
  p         public.payments;
  v_reason  text;
  v_n       int;
  v_ours    boolean;
  v_prev    text;
  v_last    timestamptz;
  -- when Stripe made the event (its «created», seconds); null in an event without it
  v_created timestamptz := case when p_event ->> 'created' ~ '^[0-9]{1,12}$' then to_timestamp((p_event ->> 'created')::bigint) end;
begin
  if v_id is null or v_id !~ '^evt_[A-Za-z0-9]{1,64}$' or v_type is null or jsonb_typeof(o) <> 'object' then
    raise exception 'not a Stripe event' using errcode = '22023';
  end if;
  insert into app.stripe_events (event_id, type, account_id, livemode, payload)
  values (v_id, left(v_type, 100), v_account, coalesce((p_event ->> 'livemode')::boolean, false),
          -- the journal keeps no client's name, email, phone, address or card details (spec 35 §3, §4д)
          app.stripe_event_journal(p_event))
  on conflict (event_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return 'duplicate';
  end if;

  if v_type = 'account.updated' then
    select company_id into v_company from public.stripe_accounts where account_id = o ->> 'id' and account_id = v_account;
    if v_company is null then
      v_reason := 'unknown_account';
    else
      -- the row locked first: two events of one account at once are applied one after the other, never older-last
      select s.last_event_at into v_last from public.stripe_accounts s where s.company_id = v_company for update;
      if v_created is not null and v_created < v_last then
        v_reason := 'stale';               -- an older picture of the account (a resend, a late retry) never overwrites a newer one
      else
        perform app.stripe_account_sync(v_company, o);
        if v_created is not null then
          update public.stripe_accounts set last_event_at = greatest(v_created, coalesce(last_event_at, v_created)) where company_id = v_company;
        end if;
      end if;
    end if;

  elsif v_type in ('payment_intent.processing', 'payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled') then
    v_reason := app.stripe_apply_intent(v_type, v_account, coalesce((p_event ->> 'livemode')::boolean, false), o, p_method);

  elsif v_type = 'charge.refunded' then
    p := app.stripe_payment_of(v_account, o ->> 'payment_intent');
    if p.id is null then
      perform app.stripe_retry_if_ours(v_account, o ->> 'payment_intent');
      v_reason := 'unknown_payment';
    else
      v_reason := app.stripe_apply_refunded(p.id, (o ->> 'amount_refunded')::bigint);
    end if;

  elsif v_type in ('refund.created', 'refund.updated', 'refund.failed', 'charge.refund.updated') then
    p := app.stripe_payment_of(v_account, o ->> 'payment_intent');
    if p.id is null then
      perform app.stripe_retry_if_ours(v_account, o ->> 'payment_intent');
    end if;
    if p.id is null or (o ->> 'amount')::bigint is null or (o ->> 'amount')::bigint <= 0 then
      v_reason := 'unknown_payment';
    else
      select r.status into v_prev from public.refunds r where r.stripe_refund_id = o ->> 'id' for update;
      insert into public.refunds as r (company_id, payment_id, amount_cents, status, stripe_refund_id, idempotency_key, reason)
      values (p.company_id, p.id, (o ->> 'amount')::bigint,
              case o ->> 'status' when 'succeeded' then 'succeeded' when 'failed' then 'failed' when 'canceled' then 'canceled' else 'pending' end,
              o ->> 'id', 'stripe:' || (o ->> 'id'), left(o ->> 'reason', 500))
      on conflict (stripe_refund_id) do update
         -- final states stay, except an ACH refund that fails after «succeeded» (the bank sent it back)
         set status = case when r.status = 'succeeded' and excluded.status = 'failed' then 'failed'
                           when r.status in ('succeeded', 'failed', 'canceled') then r.status else excluded.status end,
             updated_at = now();
      -- a refund that failed after it lowered the balance: refunded_cents never goes down by itself — the owner looks
      -- only when THIS event turns the row into «failed»: another event about the same failure (refund.updated, then
      -- refund.failed, a resend) does not raise the flag again after the owner looked (§4д)
      if (o ->> 'status') = 'failed' and p.refunded_cents > 0 and v_prev is distinct from 'failed' then
        update public.payments set needs_review = true where id = p.id;
      end if;
    end if;

  elsif v_type in ('charge.dispute.created', 'charge.dispute.closed') then
    p := app.stripe_payment_of(v_account, o ->> 'payment_intent');
    if p.id is null then
      perform app.stripe_retry_if_ours(v_account, o ->> 'payment_intent');
      v_reason := 'unknown_payment';
    elsif v_type = 'charge.dispute.created' then
      if p.dispute_status = 'none' then
        update public.payments set dispute_status = 'open' where id = p.id;
      else
        v_reason := 'stale';
      end if;
    else
      -- won and warning_closed (an inquiry closed without a chargeback) keep the money; a lost dispute takes it —
      -- paid_cents stays (the founder's call, spec 35 §2 п.13), the owner sees «lost»
      update public.payments set dispute_status = case when o ->> 'status' in ('won', 'warning_closed') then 'won' else 'lost' end
       where id = p.id and dispute_status in ('none', 'open');
    end if;

  else
    v_reason := 'type';
  end if;

  update app.stripe_events set status = case when v_reason is null then 'processed' else 'ignored' end,
         reason = v_reason, processed_at = now()
   where event_id = v_id;
  return case when v_reason is null then 'processed' else 'ignored' end;
end;
$$;

-- public.stripe_webhook_apply of 20261109150000 (#452) as it is, only the journal's payload through app.stripe_event_journal
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
              app.stripe_event_journal(p_event),
              'ignored', case when v_company is null then 'unknown_account' else 'company_mismatch' end, now())
      on conflict (event_id) do nothing;
      return 'ignored';
    end if;
  end if;

  -- 20д debts: the row of this Stripe refund as it was before the event (counted = succeeded, or pending with its id)
  if v_refund and o ->> 'id' ~ '^(re|pyr)_[A-Za-z0-9]{1,64}$' then
    -- by Stripe's id, or by our id in metadata (stripe-refund may be tying it right now: we wait for its transaction and
    -- read the row as it committed — director's review of #449 №1)
    select * into v_was from public.refunds
     where stripe_refund_id = o ->> 'id'
        or (v_ours ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and id = v_ours::uuid
            and idempotency_key like 'octo:%')
     order by (stripe_refund_id = o ->> 'id') desc nulls last limit 1
       for update;
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
    if v_now.status in ('failed', 'canceled') and (v_was.id is null or v_was.status not in ('failed', 'canceled')) then
      -- this event made it failed: surely counted when it was succeeded / pending with its id before; else maybe (above)
      perform app.refund_unwind(v_now.id, v_was.id is not null and v_was.stripe_refund_id is not null
                                          and v_was.status in ('succeeded', 'pending'));
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
