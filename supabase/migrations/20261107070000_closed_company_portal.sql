-- 7а-3 а+б (docs/specs/22 §3.5, «Каркас» №8): a company closed by its owner (companies.closed_at, delete_account)
-- * the client page (/p/): portal_estimate answers only {status: 'closed', company: {name}, doc_language} — no phone,
--   no estimate, no «Pay by card»; the estimate is not marked viewed and no notification is made;
-- * portal_accept and portal_pay_simulated refuse with «company closed» (42501) before anything else;
-- * email_claim never hands out a letter of a closed company (→ expired, no attempt counted).
-- The functions are the last versions (20261106180000, 20261106090000, 20261105240000, 20261105350000) plus the check;
-- grants as before (rule 18).

create or replace function app.company_closed(p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.companies c where c.id = p_company and c.closed_at is not null);
$$;
revoke all on function app.company_closed(uuid) from public, anon, authenticated;

create or replace function app.portal_estimate_base(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e   public.estimates;
  v   public.estimate_versions;
  co  public.companies;
  a   public.estimate_approvals;
  ca  public.estimate_approvals;
  dep_paid boolean;
begin
  select * into e from public.estimates where public_token = p_token and deleted_at is null;
  if not found or p_token is null then
    return null;
  end if;
  select * into co from public.companies where id = e.company_id;
  -- 7а-3 (S22a): the company was closed by its owner — only its name; before «expired»/«declined» (they give the phone),
  -- before sent → viewed and the notification (nobody works there any more)
  if co.closed_at is not null then
    return jsonb_build_object('status', 'closed', 'company', jsonb_build_object('name', coalesce(nullif(co.dba, ''), co.name)));
  end if;
  if not app.estimate_link_open(e) then
    -- past "valid until" (unsigned): only who to call, nothing of the estimate (E2b, plan audit 05.11).
    -- A revoked link has no token any more, so it never reaches here (the page says "link not valid").
    return jsonb_build_object('status', 'expired',
      'company', jsonb_build_object('name', coalesce(nullif(co.dba, ''), co.name), 'phone', co.phone));
  end if;
  if e.status = 'declined' then
    -- the company declined (E2b, security-check 05.11): only what the page shows — who declined and who to call
    return jsonb_build_object('status', 'declined',
      'company', jsonb_build_object('name', coalesce(nullif(co.dba, ''), co.name), 'phone', co.phone));
  end if;
  select * into v from public.estimate_versions where id = coalesce(e.sent_version_id, e.current_version_id);
  select * into a from public.estimate_approvals where estimate_id = e.id and decision = 'approved' and party = 'customer' order by signed_at desc limit 1;
  select * into ca from public.estimate_approvals where estimate_id = e.id and decision = 'approved' and party = 'contractor' order by signed_at desc limit 1;
  select exists (
    select 1 from public.jobs j join public.invoices i on i.job_id = j.id
     where j.estimate_id = e.id and i.kind = 'deposit' and i.paid_cents > 0
  ) into dep_paid;

  -- first view by the client (not by an employee): sent → viewed, a notification to the contractor
  if e.status = 'sent' and not app.is_member(e.company_id) then
    update public.estimates set status = 'viewed', viewed_count = viewed_count + 1, last_viewed_at = now() where id = e.id;
    insert into public.notifications (company_id, kind, estimate_id, payload)
    select e.company_id, 'estimate.viewed', e.id,
           jsonb_build_object('customer', c.display_name, 'number', e.number)
      from public.customers c where c.id = e.customer_id;
    e.status := 'viewed';
  elsif e.status in ('viewed', 'awaiting_countersign', 'approved') and not app.is_member(e.company_id) then
    update public.estimates set viewed_count = viewed_count + 1, last_viewed_at = now() where id = e.id;
  end if;

  return jsonb_build_object(
    'number', e.number,
    'title', e.title,
    'status', e.status,
    'sent_at', v.sent_at,
    'valid_until', e.expires_at,
    'doc', app.client_doc(v.calc_inputs),  -- 20261106180000: never our costs
    'company', jsonb_build_object(
      'name', coalesce(nullif(co.dba, ''), co.name), 'legal_name', co.legal_name, 'phone', co.phone, 'email', co.email,
      'website', co.website, 'license', co.license_number,
      'address', concat_ws(', ', co.address_line1, co.address_city, concat_ws(' ', co.address_state, co.address_zip)),
      'logo', co.brand ->> 'logo', 'color', co.brand ->> 'color',
      'terms', co.estimate_settings ->> 'terms',
      'timezone', co.timezone,
      'licenses', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'number', l.number, 'classes', l.classes) order by l.created_at)
                              from public.company_licenses l
                             where l.company_id = co.id and l.on_documents and l.deleted_at is null), '[]'::jsonb),
      'contacts', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'title', c.title, 'phone', c.phone, 'email', c.email)
                                             order by c.is_primary desc, c.position)
                              from public.company_contacts c
                             where c.company_id = co.id and c.on_documents and c.deleted_at is null), '[]'::jsonb)),
    -- the client sees their own main phone and email on their document
    'customer', (select jsonb_build_object('name', cu.display_name, 'phone', pc.phone, 'email', pc.email)
                   from public.customers cu left join public.contacts pc on pc.id = cu.primary_contact_id and pc.deleted_at is null
                  where cu.id = e.customer_id),
    'property', (select jsonb_build_object('address', p.address_line1, 'city', p.address_city, 'state', p.address_state, 'zip', p.address_zip)
                   from public.properties p where p.id = e.property_id),
    'approval', case when a.id is null then null else jsonb_build_object(
                  'option_id', a.option_id, 'signer_name', a.signer_name, 'signed_at', a.signed_at,
                  'signature_svg', a.signature_svg, 'selection', a.selection - 'job_id' - 'invoice_id',
                  'channel', a.channel,
                  -- on site: the employee whose device the client signed on (signature record, security-check 05.11)
                  'device_user', (select u.full_name from public.users u where u.id = a.signer_user_id)) end,
    'countersign', case when ca.id is null then null else jsonb_build_object(
                  'signer_name', ca.signer_name, 'signer_title', ca.signer_title, 'his', ca.signer_his,
                  'signed_at', ca.signed_at, 'signature_svg', ca.signature_svg) end,
    'deposit_paid', dep_paid,
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'title', i.title, 'kind', i.kind,
                                                            'total', i.total_cents, 'paid', i.paid_cents, 'due_date', i.due_date)
                                           order by i.created_at)
                            from public.invoices i join public.jobs j on j.id = i.job_id
                           where j.estimate_id = e.id and i.status = 'sent' and i.deleted_at is null), '[]'::jsonb)
  );
end;
$$;
revoke all on function app.portal_estimate_base(text) from public, anon, authenticated;  -- only the public wrapper calls it

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
    -- 7а-3: the client's language only — no «Pay by card» flag for a closed company (security-check 07.11)
    return r || jsonb_build_object('doc_language', app.estimate_doc_language(v_id));
  end if;
  return r || jsonb_build_object('doc_language', app.estimate_doc_language(v_id),
                                 'simulated_pay', app.company_simulates_payments(v_company));
end;
$$;
revoke all on function public.portal_estimate(text) from public;
grant execute on function public.portal_estimate(text) to anon, authenticated;

create or replace function public.portal_accept(
  p_token      text,
  p_option_id  uuid,
  p_addon_ids  uuid[],
  p_signer     text,
  p_svg        text,
  p_consent    boolean,
  p_channel    text default 'portal',
  p_job_id     uuid default null,
  p_visit_id   uuid default null,
  p_invoice_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.estimates; v public.estimate_versions; o public.estimate_options; member boolean;
  t record; v_cust text;
begin
  if coalesce(p_consent, false) is not true or coalesce(trim(p_signer), '') = '' or coalesce(p_svg, '') = '' then
    raise exception 'E-SIGN consent, name and signature are required' using errcode = '22023';
  end if;
  select * into e from public.estimates where public_token = p_token and deleted_at is null for update;
  if not found or p_token is null then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  -- 7а-3 (S22a): first — before «on site» and before the repeat branch (the page then reloads and shows «closed»)
  if app.company_closed(e.company_id) then
    raise exception 'company closed' using errcode = '42501';
  end if;
  member := app.is_member(e.company_id);
  if p_channel = 'on_site' and not app.can_sign_contracts(e.company_id) then
    -- on site the client signs on an employee's device: only someone who may sign contracts (security-check 05.11)
    raise exception 'on-site signature requires an employee who may sign contracts' using errcode = '42501';
  end if;
  if e.status in ('awaiting_countersign', 'approved') then
    return public.portal_estimate(p_token);              -- repeat (network): no duplicates
  end if;
  if e.status not in ('sent', 'viewed') then
    raise exception 'estimate is not open for approval (status %)', e.status using errcode = '22023';
  end if;
  -- the page link must be open; on site the employee is present, so the date does not stop the signature
  if not (p_channel = 'on_site' and member) and not app.estimate_link_open(e) then
    raise exception 'the estimate link has expired or was revoked' using errcode = '22023';
  end if;
  -- the client signs only the sent, locked version: its lines can no longer change (security-check 05.11)
  select * into v from public.estimate_versions where id = e.sent_version_id;
  if not found or v.locked_at is null then
    raise exception 'the estimate was not sent (no locked version)' using errcode = '22023';
  end if;
  select * into o from public.estimate_options where id = p_option_id and version_id = v.id and deleted_at is null;
  if not found then
    raise exception 'option does not belong to the sent version' using errcode = '22023';
  end if;
  select * into t from app.estimate_option_totals(v.id, o.id, p_addon_ids);

  insert into public.estimate_approvals (company_id, estimate_id, version_id, option_id, decision, signer_name,
                                         signature_svg, esign_consent, channel, selection, party, document_hash, signer_user_id)
  values (e.company_id, e.id, v.id, o.id, 'approved', trim(p_signer), p_svg, true,
          case when p_channel = 'on_site' then 'on_site' else 'portal' end,
          jsonb_build_object('addon_ids', coalesce(p_addon_ids, '{}'), 'subtotal', t.subtotal, 'discount', t.discount, 'tax', t.tax,
                             'total', t.total, 'deposit', t.deposit,
                             'job_id', case when member then p_job_id end, 'invoice_id', case when member then p_invoice_id end),
          'customer', encode(sha256(convert_to(coalesce(v.calc_inputs::text, '') || v.id::text, 'UTF8')), 'hex'),
          case when p_channel = 'on_site' then auth.uid() end);   -- on site: whose device the client signed on
  perform set_config('app.signing_estimate', e.id::text, true);
  update public.estimates set status = 'awaiting_countersign' where id = e.id;
  perform set_config('app.signing_estimate', '', true);

  select display_name into v_cust from public.customers where id = e.customer_id;
  insert into public.notifications (company_id, kind, estimate_id, payload)
  values (e.company_id, 'estimate.client_signed', e.id,
          jsonb_build_object('customer', v_cust, 'number', e.number, 'option', o.name, 'total', t.total, 'channel', p_channel));
  return public.portal_estimate(p_token);
end;
$$;
revoke all on function public.portal_accept(text, uuid, uuid[], text, text, boolean, text, uuid, uuid, uuid) from public;
grant execute on function public.portal_accept(text, uuid, uuid[], text, text, boolean, text, uuid, uuid, uuid) to anon, authenticated;

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
  if app.company_closed(e.company_id) then
    raise exception 'company closed' using errcode = '42501';
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

create or replace function public.email_claim(p_outbox_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.email_outbox; v_email text; v_by uuid;
begin
  update public.email_outbox set status = 'expired', updated_at = now()
   where id = p_outbox_id and status in ('queued', 'failed') and created_at <= now() - interval '24 hours';
  -- 7а-3 (S22a): a closed company sends nothing — before «sending» and the attempt (to_email stays empty)
  update public.email_outbox o set status = 'expired', updated_at = now()
   where o.id = p_outbox_id and o.status in ('queued', 'failed') and app.company_closed(o.company_id);
  update public.email_outbox set status = 'sending', attempts = attempts + 1, updated_at = now()
   where id = p_outbox_id and status in ('queued', 'failed') and attempts < 3
   returning * into r;
  if not found then
    return null;
  end if;
  -- the state now, not when queued: a deleted estimate or a dead link sends nothing; an automatic copy
  -- the company turned off meanwhile is not sent either
  if not exists (select 1 from public.estimates e where e.id = r.estimate_id and e.deleted_at is null
                    and e.status = 'approved' and e.public_token is not null) then
    update public.email_outbox set status = 'expired', updated_at = now() where id = r.id;
    return null;
  end if;
  if r.requested_by is null and coalesce((select estimate_settings ->> 'autoSendSignedCopy' from public.companies where id = r.company_id), 'false') <> 'true' then
    update public.email_outbox set status = 'skipped_off', updated_at = now() where id = r.id;
    return null;
  end if;
  select c.email, c.set_by into v_email, v_by from app.estimate_client_email(r.estimate_id) c;
  if v_email is null then
    update public.email_outbox set status = 'skipped_no_email', updated_at = now() where id = r.id;
    return null;
  end if;
  update public.email_outbox set to_email = v_email, to_email_set_by = v_by where id = r.id;
  return jsonb_build_object('id', r.id, 'kind', r.kind, 'lang', r.lang, 'to', v_email,
                            'estimate_id', r.estimate_id, 'company_id', r.company_id, 'attempt', r.attempts);
end;
$$;
revoke all on function public.email_claim(uuid) from public, anon, authenticated;
grant execute on function public.email_claim(uuid) to service_role;
