-- Security audit 06.11, item 2: anyone with a /p/ link could mark an invoice paid through portal_pay_simulated
-- (a real "card, succeeded" payment, a receipt number, a "paid" notice) — no money moved.
-- * The simulation now works only for a company the operator marked as a demo: app.company_flags.simulated_payments.
--   The table is not reachable through the API (schema app), so no one in the company can switch it on for itself.
--   Every company starts with it off; to switch a demo company on (operator, SQL editor):
--     insert into app.company_flags (company_id, simulated_payments) values ('<company id>', true)
--       on conflict (company_id) do update set simulated_payments = true, updated_at = now();
-- * A revoked / expired link takes no payment either (app.estimate_link_open, as portal_accept).
-- * portal_estimate tells the page whether to show «Pay by card» (simulated_pay), keeping doc_language.
-- The function itself goes away in two steps (rule 16) when Stripe comes.

create table if not exists app.company_flags (
  company_id          uuid primary key references public.companies (id) on delete cascade,
  simulated_payments  boolean not null default false,
  updated_at          timestamptz not null default now()
);
alter table app.company_flags enable row level security;
revoke all on app.company_flags from public, anon, authenticated;

create or replace function app.company_simulates_payments(p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select f.simulated_payments from app.company_flags f where f.company_id = p_company), false);
$$;
revoke all on function app.company_simulates_payments(uuid) from public, anon, authenticated;

create or replace function public.portal_pay_simulated(p_token text, p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e    public.estimates;
  inv  public.invoices;
  amt  bigint;
  v_cust text;
begin
  select * into e from public.estimates where public_token = p_token and deleted_at is null;
  if not found or p_token is null then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  if not app.estimate_link_open(e) then
    raise exception 'this link is closed' using errcode = '42501';
  end if;
  if not app.company_simulates_payments(e.company_id) then
    raise exception 'card payments are not available yet' using errcode = '42501';
  end if;
  select i.* into inv from public.invoices i join public.jobs j on j.id = i.job_id
   where i.id = p_invoice_id and j.estimate_id = e.id and i.status = 'sent' and i.deleted_at is null
   for update of i;
  if not found then
    raise exception 'invoice does not belong to this estimate' using errcode = '22023';
  end if;
  amt := inv.total_cents - inv.paid_cents;
  if amt > 0 then
    insert into public.payments (company_id, invoice_id, customer_id, method, amount_cents, status, idempotency_key, reference)
    values (e.company_id, inv.id, inv.customer_id, 'card', amt, 'succeeded', 'sim-' || inv.id || '-' || inv.paid_cents, 'stripe-simulated');
    select display_name into v_cust from public.customers where id = inv.customer_id;
    insert into public.notifications (company_id, kind, estimate_id, job_id, invoice_id, payload)
    values (e.company_id, case when inv.kind = 'deposit' then 'deposit.paid' else 'invoice.paid' end, e.id, inv.job_id, inv.id,
            jsonb_build_object('customer', v_cust, 'number', inv.number, 'deposit', amt, 'total', amt, 'simulated', true));
  end if;
  return public.portal_estimate(p_token);
end;
$$;
revoke all on function public.portal_pay_simulated(text, uuid) from public;
grant execute on function public.portal_pay_simulated(text, uuid) to anon, authenticated;

-- the wrapper of 20261105180000 plus one field; the page body stays in app.portal_estimate_base (T19 keeps doc_language)
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
  return r || jsonb_build_object('doc_language', app.estimate_doc_language(v_id),
                                 'simulated_pay', app.company_simulates_payments(v_company));
end;
$$;
revoke all on function public.portal_estimate(text) from public;
grant execute on function public.portal_estimate(text) to anon, authenticated;
