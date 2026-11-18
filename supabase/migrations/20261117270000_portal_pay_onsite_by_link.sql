-- Refs #2020 (the next step of #2025): by the client's link the client pays and signs; a person of the company does not.
--   * public.portal_pay_simulated — the same body as in 20261110030000, one check added after the link checks: a person of the
--     estimate's company (signed in) gets 42501, hint 'member_portal_pay'; the client (anonymous, by the token) pays as before.
--   * public.portal_accept — the same body as in 20261110030000; with p_channel 'on_site' (an old app on site, by the token:
--     rule 16, T142) the caller must read the estimate as accept_on_site asks (staff, or the estimate is one they read —
--     app.can_read_estimate), else 'estimate not found' (a signature already made still answers «repeat»). The right to sign contracts and a closed company are checked in
--     app.estimate_client_accept, as before. Removing on_site from this door is step 2 (#2026).
-- Rule 16: create or replace, nothing renamed or dropped. Rule 18: the rights are set again exactly as they were.

create or replace function public.portal_accept(p_token text, p_option_id uuid, p_addon_ids uuid[], p_signer text, p_svg text, p_consent boolean, p_channel text DEFAULT 'portal'::text, p_job_id uuid DEFAULT NULL::uuid, p_visit_id uuid DEFAULT NULL::uuid, p_invoice_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare v_id uuid; v_company uuid; v_status text;
begin
  select id, company_id, status into v_id, v_company, v_status from public.estimates where id = app.estimate_of_token(p_token) and deleted_at is null;
  if not found or p_token is null then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  -- on site by the token (an old app): only someone who reads this estimate, as accept_on_site (#2020);
  -- a signature already made goes on to the «repeat» answer as before (an old phone's queue, rule 16)
  if p_channel = 'on_site' and v_status not in ('awaiting_countersign', 'approved')
     and not (app.is_staff(v_company) or app.can_read_estimate(v_id)) then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  perform app.estimate_client_accept(v_id, p_token, p_option_id, p_addon_ids, p_signer, p_svg, p_consent, p_channel, p_job_id, p_invoice_id);
  return public.portal_estimate(p_token);
end;
$$;
revoke all on function public.portal_accept(text, uuid, uuid[], text, text, boolean, text, uuid, uuid, uuid) from public;
grant execute on function public.portal_accept(text, uuid, uuid[], text, text, boolean, text, uuid, uuid, uuid) to anon, authenticated;

create or replace function public.portal_pay_simulated(p_token text, p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  e    public.estimates;
  inv  public.invoices;
  amt  bigint;
  v_cust text;
begin
  select * into e from public.estimates where id = app.estimate_of_token(p_token) and deleted_at is null;
  if not found or p_token is null then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  if app.company_closed(e.company_id) then
    raise exception 'company closed' using errcode = '42501';
  end if;
  if not app.estimate_link_open(e) then
    raise exception 'this link is closed' using errcode = '42501';
  end if;
  -- #2020: by the link the client pays, not the company's own people
  if app.is_member(e.company_id) then
    raise exception 'a company member does not pay by the client''s link' using errcode = '42501', hint = 'member_portal_pay';
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
