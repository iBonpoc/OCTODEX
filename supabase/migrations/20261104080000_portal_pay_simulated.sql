-- =============================================================================
-- OCTODEX: имитация оплаты картой (Stripe test mode) на странице клиента — решение основателя 04.11:
-- сначала приложение, Stripe потом. Деньги не списываются; платёж помечается reference = 'stripe-simulated'.
--   * portal_estimate возвращает выставленные счета работы по этой смете (без себестоимости).
--   * portal_pay_simulated(token, invoice_id): клиент «оплачивает» остаток счёта; квитанция RCT от сервера,
--     уведомление подрядчику. Когда подключим Stripe, эту функцию заменит webhook Stripe.
-- =============================================================================

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('estimate.viewed', 'estimate.approved', 'deposit.paid', 'invoice.paid'));

create or replace function public.portal_estimate(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e   public.estimates;
  v   public.estimate_versions;
  co  public.companies;
  a   public.estimate_approvals;
  dep_paid boolean;
begin
  select * into e from public.estimates where public_token = p_token and deleted_at is null;
  if not found or p_token is null then
    return null;
  end if;
  select * into v from public.estimate_versions where id = coalesce(e.sent_version_id, e.current_version_id);
  select * into co from public.companies where id = e.company_id;
  select * into a from public.estimate_approvals where estimate_id = e.id and decision = 'approved' order by signed_at desc limit 1;
  select exists (
    select 1 from public.jobs j join public.invoices i on i.job_id = j.id
     where j.estimate_id = e.id and i.kind = 'deposit' and i.paid_cents > 0
  ) into dep_paid;

  -- Первый просмотр клиентом (не сотрудником): sent → viewed, уведомление подрядчику.
  if e.status = 'sent' and not app.is_member(e.company_id) then
    update public.estimates set status = 'viewed', viewed_count = viewed_count + 1, last_viewed_at = now() where id = e.id;
    insert into public.notifications (company_id, kind, estimate_id, payload)
    select e.company_id, 'estimate.viewed', e.id,
           jsonb_build_object('customer', c.display_name, 'number', e.number)
      from public.customers c where c.id = e.customer_id;
    e.status := 'viewed';
  elsif e.status in ('viewed', 'approved') and not app.is_member(e.company_id) then
    update public.estimates set viewed_count = viewed_count + 1, last_viewed_at = now() where id = e.id;
  end if;

  return jsonb_build_object(
    'number', e.number,
    'title', e.title,
    'status', e.status,
    'sent_at', v.sent_at,
    'doc', v.calc_inputs,
    'company', jsonb_build_object(
      'name', coalesce(nullif(co.dba, ''), co.name), 'legal_name', co.legal_name, 'phone', co.phone, 'email', co.email,
      'website', co.website, 'license', co.license_number,
      'address', concat_ws(', ', co.address_line1, co.address_city, concat_ws(' ', co.address_state, co.address_zip)),
      'logo', co.brand ->> 'logo', 'color', co.brand ->> 'color',
      'terms', co.estimate_settings ->> 'terms',
      'licenses', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'number', l.number, 'classes', l.classes) order by l.created_at)
                              from public.company_licenses l
                             where l.company_id = co.id and l.on_documents and l.deleted_at is null), '[]'::jsonb),
      'contacts', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'title', c.title, 'phone', c.phone, 'email', c.email)
                                             order by c.is_primary desc, c.position)
                              from public.company_contacts c
                             where c.company_id = co.id and c.on_documents and c.deleted_at is null), '[]'::jsonb)),
    'customer', (select jsonb_build_object('name', c.display_name) from public.customers c where c.id = e.customer_id),
    'property', (select jsonb_build_object('address', p.address_line1, 'city', p.address_city, 'state', p.address_state, 'zip', p.address_zip)
                   from public.properties p where p.id = e.property_id),
    'approval', case when a.id is null then null else jsonb_build_object(
                  'option_id', a.option_id, 'signer_name', a.signer_name, 'signed_at', a.signed_at,
                  'signature_svg', a.signature_svg, 'selection', a.selection) end,
    'deposit_paid', dep_paid,
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'title', i.title, 'kind', i.kind,
                                                            'total', i.total_cents, 'paid', i.paid_cents, 'due_date', i.due_date)
                                           order by i.created_at)
                            from public.invoices i join public.jobs j on j.id = i.job_id
                           where j.estimate_id = e.id and i.status = 'sent' and i.deleted_at is null), '[]'::jsonb)
  );
end;
$$;



revoke all on function public.portal_estimate(text) from public;
grant execute on function public.portal_estimate(text) to anon, authenticated;

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
    insert into public.notifications (company_id, kind, estimate_id, job_id, payload)
    values (e.company_id, case when inv.kind = 'deposit' then 'deposit.paid' else 'invoice.paid' end, e.id, inv.job_id,
            jsonb_build_object('customer', v_cust, 'number', inv.number, 'deposit', amt, 'total', amt, 'simulated', true));
  end if;
  return public.portal_estimate(p_token);
end;
$$;
revoke all on function public.portal_pay_simulated(text, uuid) from public;
grant execute on function public.portal_pay_simulated(text, uuid) to anon, authenticated;
