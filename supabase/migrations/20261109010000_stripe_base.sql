-- Step 20a: the database for Stripe online payments (docs/specs/35-stripe.md §4). Test mode only until the founder says.
-- * public.stripe_accounts — the company's connected account and what Stripe allows it (charges, payouts).
-- * public.payment_attempts — one key per (invoice, amount, attempt №): a double tap or a retry gets the same
--   PaymentIntent (Stripe idempotency); a failed / cancelled attempt opens the next number.
-- * public.refunds — refunds of processor payments as Stripe reports them (manual refunds — 20d).
-- * app.stripe_events — the journal of Stripe events, one row per event id: a repeat changes nothing.
-- * app.stripe_event_apply — the only way a Stripe event touches money. The status only goes forward, refunded_cents
--   only grows, an event of another account is ignored, money above the balance is still recorded (no invoice,
--   needs_review) — it is real money of the client.
-- All writes: service_role only (Edge Functions stripe-connect / stripe-pay / stripe-webhook, 20b–20d; rule 18).
-- Rule 16: everything is added; payments already has the Stripe columns, statuses and methods (core).

-- ---- 1. The connected account ------------------------------------------------------------------------
create table public.stripe_accounts (
  company_id         uuid primary key references public.companies (id),
  account_id         text not null unique check (account_id ~ '^acct_[A-Za-z0-9]{1,64}$'),
  charges_enabled    boolean not null default false,
  payouts_enabled    boolean not null default false,
  details_submitted  boolean not null default false,
  requirements_due   int not null default 0 check (requirements_due >= 0),
  disabled_reason    text check (char_length(disabled_reason) <= 200),
  livemode           boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.stripe_accounts enable row level security;
alter table public.stripe_accounts force row level security;
create policy stripe_accounts_select on public.stripe_accounts for select to authenticated
  using (app.is_staff(company_id));
revoke all on public.stripe_accounts from anon, authenticated;
grant select (company_id, charges_enabled, payouts_enabled, details_submitted, requirements_due, disabled_reason, livemode, updated_at)
  on public.stripe_accounts to authenticated;

-- ---- 2. Payment attempts -----------------------------------------------------------------------------
create table public.payment_attempts (
  id                        uuid primary key default public.uuid_generate_v7(),
  company_id                uuid not null references public.companies (id),
  invoice_id                uuid not null,
  customer_id               uuid not null,
  amount_cents              bigint not null check (amount_cents > 0),
  attempt_no                int not null check (attempt_no >= 1),
  idempotency_key           text not null unique,
  stripe_account_id         text not null,
  stripe_payment_intent_id  text unique check (stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]{1,64}$'),
  status                    text not null default 'open' check (status in ('open', 'processing', 'succeeded', 'failed', 'canceled')),
  payment_id                uuid references public.payments (id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (invoice_id, amount_cents, attempt_no),
  foreign key (company_id, invoice_id) references public.invoices (company_id, id)
);
create index payment_attempts_invoice_idx on public.payment_attempts (company_id, invoice_id);
create index payment_attempts_payment_idx on public.payment_attempts (payment_id);
alter table public.payment_attempts enable row level security;
alter table public.payment_attempts force row level security;
create policy payment_attempts_select on public.payment_attempts for select to authenticated
  using (app.is_staff(company_id));
revoke all on public.payment_attempts from anon, authenticated;
grant select (id, company_id, invoice_id, amount_cents, attempt_no, status, payment_id, created_at, updated_at)
  on public.payment_attempts to authenticated;

-- ---- 3. Refunds ----------------------------------------------------------------------------------------
create table public.refunds (
  id                uuid primary key default public.uuid_generate_v7(),
  company_id        uuid not null references public.companies (id),
  payment_id        uuid not null references public.payments (id),
  amount_cents      bigint not null check (amount_cents > 0),
  reason_kind       text not null default 'other' check (reason_kind in ('rescission', 'cancellation', 'goodwill', 'other')),
  reason            text check (char_length(reason) <= 500),
  status            text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'canceled')),
  stripe_refund_id  text unique check (stripe_refund_id ~ '^(re|pyr)_[A-Za-z0-9]{1,64}$'),
  idempotency_key   text not null unique,
  created_by        uuid references public.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index refunds_payment_idx on public.refunds (payment_id);
create index refunds_company_idx on public.refunds (company_id);
create index refunds_created_by_idx on public.refunds (created_by);
alter table public.refunds enable row level security;
alter table public.refunds force row level security;
create policy refunds_select on public.refunds for select to authenticated
  using (app.is_staff(company_id));
revoke all on public.refunds from anon, authenticated;
grant select (id, company_id, payment_id, amount_cents, reason_kind, reason, status, created_by, created_at, updated_at)
  on public.refunds to authenticated;

-- ---- 4. The journal of Stripe events (no access for the app) ------------------------------------------------
create table app.stripe_events (
  event_id      text primary key check (event_id ~ '^evt_[A-Za-z0-9]{1,64}$'),
  type          text not null check (char_length(type) <= 100),
  account_id    text,
  livemode      boolean not null default false,
  payload       jsonb not null,
  status        text not null default 'received' check (status in ('received', 'processed', 'ignored')),
  reason        text,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz
);
revoke all on app.stripe_events from public, anon, authenticated;

-- company_id never changes (T57 guard)
create trigger t11_company_id_immutable before update on public.stripe_accounts
  for each row execute function app.tg_company_id_immutable();
create trigger t11_company_id_immutable before update on public.payment_attempts
  for each row execute function app.tg_company_id_immutable();
create trigger t11_company_id_immutable before update on public.refunds
  for each row execute function app.tg_company_id_immutable();

-- ---- 5. The account: from Stripe's Account object ---------------------------------------------------------------
create or replace function app.stripe_account_sync(p_company_id uuid, p_account jsonb)
returns public.stripe_accounts language plpgsql security definer set search_path = '' as $$
declare
  v_id  text := p_account ->> 'id';
  r     public.stripe_accounts;
begin
  if v_id is null or v_id !~ '^acct_[A-Za-z0-9]{1,64}$' then
    raise exception 'not a Stripe account' using errcode = '22023';
  end if;
  select * into r from public.stripe_accounts where company_id = p_company_id for update;
  if found and r.account_id <> v_id then
    raise exception 'the company already has another Stripe account' using errcode = '23505';
  end if;
  insert into public.stripe_accounts as s (company_id, account_id, charges_enabled, payouts_enabled, details_submitted,
                                           requirements_due, disabled_reason, livemode, updated_at)
  values (p_company_id, v_id,
          coalesce((p_account ->> 'charges_enabled')::boolean, false),
          coalesce((p_account ->> 'payouts_enabled')::boolean, false),
          coalesce((p_account ->> 'details_submitted')::boolean, false),
          coalesce(jsonb_array_length(case when jsonb_typeof(p_account -> 'requirements' -> 'currently_due') = 'array'
                                           then p_account -> 'requirements' -> 'currently_due' end), 0),
          left(p_account -> 'requirements' ->> 'disabled_reason', 200),
          coalesce((p_account ->> 'livemode')::boolean, false),
          now())
  on conflict (company_id) do update
     set charges_enabled = excluded.charges_enabled, payouts_enabled = excluded.payouts_enabled,
         details_submitted = excluded.details_submitted, requirements_due = excluded.requirements_due,
         disabled_reason = excluded.disabled_reason, livemode = excluded.livemode, updated_at = now()
  returning * into r;
  return r;
end;
$$;
revoke all on function app.stripe_account_sync(uuid, jsonb) from public, anon, authenticated;
grant execute on function app.stripe_account_sync(uuid, jsonb) to service_role;

-- ---- 6. Attempts ----------------------------------------------------------------------------------------------
-- What the client may still pay online: the balance minus online payments already on their way (ACH pending).
create or replace function app.invoice_online_balance(p_invoice_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select i.total_cents - i.paid_cents
         - coalesce((select sum(p.amount_cents) from public.payments p where p.invoice_id = i.id and p.status = 'pending'), 0)
    from public.invoices i where i.id = p_invoice_id;
$$;
revoke all on function app.invoice_online_balance(uuid) from public, anon, authenticated;

create or replace function app.payment_attempt_open(p_invoice_id uuid, p_amount_cents bigint)
returns public.payment_attempts language plpgsql security definer set search_path = '' as $$
declare
  inv  public.invoices;
  acc  public.stripe_accounts;
  a    public.payment_attempts;
  n    int;
begin
  select * into inv from public.invoices where id = p_invoice_id and deleted_at is null for update;
  if not found or inv.status <> 'sent' then
    raise exception 'invoice is not open for payment' using errcode = '22023';
  end if;
  select * into acc from public.stripe_accounts where company_id = inv.company_id;
  if not found or not acc.charges_enabled then
    raise exception 'online payments are not connected' using errcode = '55000';
  end if;
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > app.invoice_online_balance(inv.id) then
    raise exception 'amount % is outside 1…balance', p_amount_cents using errcode = '22023';
  end if;
  select * into a from public.payment_attempts
   where invoice_id = inv.id and amount_cents = p_amount_cents and status = 'open' and stripe_account_id = acc.account_id
   order by attempt_no desc limit 1;
  if found then
    return a;
  end if;
  select coalesce(max(attempt_no), 0) + 1 into n from public.payment_attempts where invoice_id = inv.id and amount_cents = p_amount_cents;
  insert into public.payment_attempts (company_id, invoice_id, customer_id, amount_cents, attempt_no, idempotency_key, stripe_account_id)
  values (inv.company_id, inv.id, inv.customer_id, p_amount_cents, n, 'pa:' || inv.id || ':' || p_amount_cents || ':' || n, acc.account_id)
  returning * into a;
  return a;
end;
$$;
revoke all on function app.payment_attempt_open(uuid, bigint) from public, anon, authenticated;
grant execute on function app.payment_attempt_open(uuid, bigint) to service_role;

create or replace function app.payment_attempt_set_intent(p_attempt_id uuid, p_intent_id text)
returns public.payment_attempts language plpgsql security definer set search_path = '' as $$
declare a public.payment_attempts;
begin
  update public.payment_attempts set stripe_payment_intent_id = p_intent_id, updated_at = now()
   where id = p_attempt_id and (stripe_payment_intent_id is null or stripe_payment_intent_id = p_intent_id)
  returning * into a;
  if not found then
    raise exception 'attempt is unknown or has another PaymentIntent' using errcode = '22023';
  end if;
  return a;
end;
$$;
revoke all on function app.payment_attempt_set_intent(uuid, text) from public, anon, authenticated;
grant execute on function app.payment_attempt_set_intent(uuid, text) to service_role;

-- ---- 7. A PaymentIntent event → the payment ----------------------------------------------------------------------
-- Returns the reason the event changed nothing, or null when it did.
create or replace function app.stripe_apply_intent(p_type text, p_account text, p_livemode boolean, p_pi jsonb, p_method text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  a        public.payment_attempts;
  p        public.payments;
  inv      public.invoices;
  v_pi     text := p_pi ->> 'id';
  v_amt    bigint;
  v_method text;
  v_inv    uuid;
  v_review boolean := false;
  v_cust   text;
  v_est    uuid;
  v_meta   text;
begin
  v_meta := p_pi -> 'metadata' ->> 'attempt_id';
  if v_meta !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_meta := null;                                    -- a broken value is not ours, and never a poison event
  end if;
  select * into a from public.payment_attempts where stripe_payment_intent_id = v_pi for update;
  if not found and v_meta is not null then
    -- the event came before the Edge Function wrote the intent id: the attempt is in the metadata. Only an attempt of
    -- this very account and mode, with no other intent: an event of another account never takes someone's attempt.
    select * into a from public.payment_attempts
     where id = v_meta::uuid and stripe_account_id = p_account for update;
    if not found then
      return 'wrong_account';
    end if;
    if a.stripe_payment_intent_id is not null and a.stripe_payment_intent_id <> v_pi then
      return 'other_intent';
    end if;
  end if;
  if a.id is null then
    return 'unknown_intent';                           -- not our payment (the contractor's own Stripe sale)
  end if;
  if p_account is distinct from a.stripe_account_id then
    return 'wrong_account';
  end if;
  if p_livemode is distinct from (select s.livemode from public.stripe_accounts s where s.company_id = a.company_id) then
    return 'livemode';                                 -- a test payment never pays a real invoice
  end if;
  if lower(coalesce(p_pi ->> 'currency', '')) <> 'usd' then
    return 'currency';
  end if;
  if a.stripe_payment_intent_id is null then
    update public.payment_attempts set stripe_payment_intent_id = v_pi where id = a.id returning * into a;
  end if;

  select * into p from public.payments where idempotency_key = 'stripe:' || v_pi for update;

  if p_type in ('payment_intent.payment_failed', 'payment_intent.canceled') then
    if p.id is not null and p.status = 'pending' then
      update public.payments set status = 'failed' where id = p.id;
    elsif p.id is not null then
      return 'stale';
    end if;
    update public.payment_attempts
       set status = case when p_type = 'payment_intent.canceled' then 'canceled' else 'failed' end, updated_at = now()
     where id = a.id and status in ('open', 'processing');
    return null;
  end if;
  if p_type = 'payment_intent.processing' and (p.id is not null or a.status in ('failed', 'canceled', 'succeeded')) then
    return 'stale';                                    -- a late processing never brings back a payment on its way
  end if;

  -- processing / succeeded
  if p.id is not null then
    if p_type = 'payment_intent.succeeded' and p.status = 'pending' then
      select * into inv from public.invoices where id = p.invoice_id for update;
      -- ACH on its way and a cash payment recorded meanwhile: the money is real, the invoice is overpaid —
      -- marked for the owner to refund (spec 35 §2 п.7); the amount Stripe received must be the pending one
      update public.payments set status = 'succeeded',
             needs_review = needs_review or (inv.id is not null and p.amount_cents > inv.total_cents - inv.paid_cents)
                            or (p_pi ->> 'amount_received')::bigint is distinct from p.amount_cents
       where id = p.id returning * into p;
    else
      return 'stale';
    end if;
  else
    v_amt := case when p_type = 'payment_intent.succeeded' then (p_pi ->> 'amount_received')::bigint else (p_pi ->> 'amount')::bigint end;
    if v_amt is null or v_amt <= 0 then
      return 'no_amount';
    end if;
    v_method := case
      when p_method in ('card', 'ach') then p_method
      when p_type = 'payment_intent.processing' then 'ach'
      when p_pi -> 'payment_method_types' = '["us_bank_account"]'::jsonb then 'ach'
      else 'card' end;
    select * into inv from public.invoices where id = a.invoice_id for update;
    v_inv := inv.id;
    -- money above what may still be paid (a cash payment came meanwhile, the invoice was voided, the amount differs):
    -- kept as the client's money without an invoice, for the owner to refund or apply
    if inv.status <> 'sent' or v_amt <> a.amount_cents or v_amt > app.invoice_online_balance(inv.id) then
      v_inv := null;
      v_review := true;
    end if;
    insert into public.payments (company_id, invoice_id, customer_id, method, amount_cents, platform_fee_cents, status,
                                 stripe_payment_intent_id, stripe_charge_id, idempotency_key, reference, needs_review)
    values (a.company_id, v_inv, a.customer_id, v_method, v_amt, greatest(coalesce((p_pi ->> 'application_fee_amount')::bigint, 0), 0),
            case when p_type = 'payment_intent.succeeded' then 'succeeded' else 'pending' end,
            v_pi, p_pi ->> 'latest_charge', 'stripe:' || v_pi, v_pi, v_review)
    returning * into p;
  end if;

  update public.payment_attempts
     set status = case when p.status = 'succeeded' then 'succeeded' else 'processing' end, payment_id = p.id, updated_at = now()
   where id = a.id and status <> 'succeeded';

  if p.status = 'succeeded' and p.invoice_id is not null then   -- money kept for review is not «the invoice is paid»
    select display_name into v_cust from public.customers where id = p.customer_id;
    select j.estimate_id into v_est from public.invoices i join public.jobs j on j.id = i.job_id where i.id = a.invoice_id;
    insert into public.notifications (company_id, kind, estimate_id, job_id, invoice_id, payload)
    select a.company_id, case when i.kind = 'deposit' then 'deposit.paid' else 'invoice.paid' end, v_est, i.job_id, i.id,
           jsonb_build_object('customer', v_cust, 'number', i.number, 'deposit', p.amount_cents, 'total', p.amount_cents,
                              'method', p.method, 'needs_review', p.needs_review)
      from public.invoices i where i.id = a.invoice_id;
  end if;
  return null;
end;
$$;
revoke all on function app.stripe_apply_intent(text, text, boolean, jsonb, text) from public, anon, authenticated;

-- ---- 8. Refunds and disputes of a charge -------------------------------------------------------------------------
create or replace function app.stripe_payment_of(p_account text, p_pi text)
returns public.payments language sql stable security definer set search_path = '' as $$
  select p.* from public.payments p join public.stripe_accounts s on s.company_id = p.company_id
   where p.idempotency_key = 'stripe:' || p_pi and s.account_id = p_account;
$$;
revoke all on function app.stripe_payment_of(text, text) from public, anon, authenticated;

create or replace function app.stripe_apply_refunded(p_payment_id uuid, p_refunded bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if p.status not in ('succeeded', 'partially_refunded') or p_refunded is null or p_refunded <= p.refunded_cents then
    return 'stale';                                    -- an older event, or nothing new: refunded_cents only grows
  end if;
  update public.payments
     set refunded_cents = least(p_refunded, p.amount_cents),
         status = case when p_refunded >= p.amount_cents then 'refunded' else 'partially_refunded' end
   where id = p.id;
  return null;
end;
$$;
revoke all on function app.stripe_apply_refunded(uuid, bigint) from public, anon, authenticated;

-- An event about our own PaymentIntent came before its payment (the order is not guaranteed): an error, so the event
-- is not recorded and Stripe sends it again later. An intent that is not ours (the contractor's own sale) is ignored.
create or replace function app.stripe_retry_if_ours(p_account text, p_pi text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.payment_attempts where stripe_payment_intent_id = p_pi and stripe_account_id = p_account) then
    raise exception 'payment of % is not recorded yet; retry later', p_pi using errcode = '55000';
  end if;
end;
$$;
revoke all on function app.stripe_retry_if_ours(text, text) from public, anon, authenticated;

-- ---- 9. The one entry: record the event, apply it once ------------------------------------------------------------
-- p_method: 'card' / 'ach' when the Edge Function knows it (expanded payment method), else derived from the event.
-- Returns 'duplicate' (seen before, nothing changed), 'processed' or 'ignored'. An error rolls back the record too,
-- so Stripe retries the event.
create or replace function app.stripe_event_apply(p_event jsonb, p_method text default null)
returns text language plpgsql security definer set search_path = '' as $$
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
begin
  if v_id is null or v_id !~ '^evt_[A-Za-z0-9]{1,64}$' or v_type is null or jsonb_typeof(o) <> 'object' then
    raise exception 'not a Stripe event' using errcode = '22023';
  end if;
  insert into app.stripe_events (event_id, type, account_id, livemode, payload)
  values (v_id, left(v_type, 100), v_account, coalesce((p_event ->> 'livemode')::boolean, false),
          -- the journal keeps no client's name, email, phone, address or card details (spec 35 §3)
          jsonb_set(p_event, '{data,object}', o - array['billing_details', 'payment_method_details', 'shipping', 'receipt_email',
                                                       'customer_details', 'evidence', 'description', 'last_payment_error']))
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
      perform app.stripe_account_sync(v_company, o);
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
      if (o ->> 'status') = 'failed' and p.refunded_cents > 0 then
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
revoke all on function app.stripe_event_apply(jsonb, text) from public, anon, authenticated;
grant execute on function app.stripe_event_apply(jsonb, text) to service_role;
