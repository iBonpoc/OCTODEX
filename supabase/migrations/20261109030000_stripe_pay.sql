-- Step 20в: paying an invoice online from the client page /p/ (docs/specs/35-stripe.md §5). Test mode only.
-- The Edge Function stripe-pay (verify_jwt = false: the client has no account) calls, as service_role:
-- * public.stripe_pay_open(token, invoice) — the /p/ token is checked against the invoice HERE, before an attempt is opened:
--   the token's estimate → its job → this invoice (as portal_pay_simulated). Knowing an invoice id is not enough (IDOR, review 20а).
--   The link must be open, the company not closed; then app.payment_attempt_open(invoice, the whole online balance).
-- * public.stripe_pay_set_intent(attempt, intent) — app.payment_attempt_set_intent.
-- portal_estimate tells the page whether the company takes online payments (online_pay) and what is on its way by ACH
-- (pending: {invoice id: cents}). PostgREST shows only public: these are the doors, app.* stays closed (rule 18, T52).
-- Rule 16: only additions; portal_estimate keeps every field it had.


create or replace function public.stripe_pay_open(p_token text, p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e    public.estimates;
  inv  public.invoices;
  a    public.payment_attempts;
  bal  bigint;
begin
  if p_token is null or p_invoice_id is null then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  select * into e from public.estimates where public_token = p_token and deleted_at is null;
  if not found then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  if app.company_closed(e.company_id) then
    raise exception 'company closed' using errcode = '42501';
  end if;
  if not app.estimate_link_open(e) then
    raise exception 'this link is closed' using errcode = '42501';
  end if;
  select i.* into inv from public.invoices i join public.jobs j on j.id = i.job_id
   where i.id = p_invoice_id and j.estimate_id = e.id and j.company_id = e.company_id and i.status = 'sent' and i.deleted_at is null;
  if not found then
    raise exception 'invoice does not belong to this estimate' using errcode = '22023';
  end if;
  bal := app.invoice_online_balance(inv.id);
  if bal is null or bal < 1 then
    raise exception 'nothing to pay' using errcode = '22023';
  end if;
  a := app.payment_attempt_open(inv.id, bal);   -- locks the invoice, checks charges_enabled (55000) and the balance again
  return jsonb_build_object('attempt_id', a.id, 'company_id', a.company_id, 'invoice_id', a.invoice_id,
                            'amount_cents', a.amount_cents, 'idempotency_key', a.idempotency_key,
                            'account_id', a.stripe_account_id, 'payment_intent_id', a.stripe_payment_intent_id,
                            'status', a.status,
                            -- intents of this invoice's OTHER attempts the client could still pay (another amount, an old tab,
                            -- a failed try): stripe-pay cancels them, so one invoice is never charged twice (review 20в)
                            'stale_intents', coalesce((select jsonb_agg(o.stripe_payment_intent_id order by o.attempt_no)
                                                         from public.payment_attempts o
                                                        where o.invoice_id = inv.id and o.id <> a.id and o.status in ('open', 'failed')
                                                          and o.stripe_payment_intent_id is not null
                                                          and o.stripe_account_id = a.stripe_account_id), '[]'::jsonb));
end;
$$;
revoke all on function public.stripe_pay_open(text, uuid) from public, anon, authenticated;
grant execute on function public.stripe_pay_open(text, uuid) to service_role;

create or replace function public.stripe_pay_set_intent(p_attempt_id uuid, p_intent_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.payment_attempts;
begin
  if p_intent_id is null or p_intent_id !~ '^pi_[A-Za-z0-9]{1,64}$' then
    raise exception 'not a PaymentIntent' using errcode = '22023';
  end if;
  a := app.payment_attempt_set_intent(p_attempt_id, p_intent_id);
  return jsonb_build_object('attempt_id', a.id, 'payment_intent_id', a.stripe_payment_intent_id);
end;
$$;
revoke all on function public.stripe_pay_set_intent(uuid, text) from public, anon, authenticated;
grant execute on function public.stripe_pay_set_intent(uuid, text) to service_role;

-- the wrapper of 20261107070000 plus two fields; a closed company still gets only its language
create or replace function public.portal_estimate(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  v_id uuid;
  v_company uuid;
begin
  r := app.portal_estimate_base(p_token);
  if r is null then
    return null;
  end if;
  select id, company_id into v_id, v_company from public.estimates where public_token = p_token and deleted_at is null;
  if r ->> 'status' = 'closed' then
    return r || jsonb_build_object('doc_language', app.estimate_doc_language(v_id));
  end if;
  return r || jsonb_build_object(
    'doc_language', app.estimate_doc_language(v_id),
    'simulated_pay', app.company_simulates_payments(v_company),
    -- the company's Stripe account takes charges; the page then shows the real Payment Element
    'online_pay', exists (select 1 from public.stripe_accounts s where s.company_id = v_company and s.charges_enabled)
                  and exists (select 1 from public.estimates e where e.id = v_id and app.estimate_link_open(e)),
    -- ACH on its way per invoice of this estimate: not money yet, but the client must not pay it twice
    'pending', coalesce((select jsonb_object_agg(x.invoice_id, x.cents)
                           from (select p.invoice_id, sum(p.amount_cents) as cents
                                   from public.payments p join public.invoices i on i.id = p.invoice_id
                                   join public.jobs j on j.id = i.job_id
                                  where j.estimate_id = v_id and p.status = 'pending' and p.deleted_at is null
                                    and i.deleted_at is null and i.status = 'sent'
                                  group by p.invoice_id) x), '{}'::jsonb));
end;
$$;
revoke all on function public.portal_estimate(text) from public;
grant execute on function public.portal_estimate(text) to anon, authenticated;
