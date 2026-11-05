-- Estimates, wave E2b-1 (docs/specs/07-estimates.md «E2b — экраны подписи», plan audit 05.11; lead's answers 05.11):
--   * The company declines after the client signed: awaiting_countersign → declined, with the reason in words
--     (decline_countersign; director, admin, office). The lead does not change (lead 05.11: usually "redo and resend").
--   * The client page for an expired unsigned link returns only who to call ({status: expired, company: name, phone}),
--     nothing of the estimate; plus the company's time zone for dates on the PDF.
-- The /p/ body stays in app.portal_estimate_base (the public wrapper with doc_language is untouched — test T19).

-- ---- 1. The company declines a client-signed estimate --------------------------------------------
insert into app.status_transitions (entity_type, from_status, to_status) values
  ('estimate', 'awaiting_countersign', 'declined')
on conflict do nothing;

create or replace function public.decline_countersign(p_estimate_id uuid, p_text text)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.estimates;
begin
  if coalesce(trim(p_text), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  if length(trim(p_text)) > 500 then
    raise exception 'the reason is longer than 500 characters' using errcode = '22023';
  end if;
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null for update;
  if not found or not app.has_role(e.company_id, array['owner', 'admin', 'office']) then
    raise exception 'only the director or the office declines a signed estimate' using errcode = '42501';
  end if;
  if e.status = 'declined' then
    return;                                               -- repeat: nothing doubles
  end if;
  if e.status <> 'awaiting_countersign' then
    raise exception 'only an estimate the client signed and the company has not can be declined here (status %)', e.status
      using errcode = '22023';
  end if;
  update public.estimates set status = 'declined', declined_reason = 'other', declined_reason_text = trim(p_text) where id = e.id;
  insert into public.activities (company_id, subject_type, subject_id, kind, body, meta)
  values (e.company_id, 'estimate', e.id, 'status', trim(p_text),
          jsonb_build_object('action', 'declined_by_company', 'from', 'awaiting_countersign', 'to', 'declined'));
end;
$$;
revoke all on function public.decline_countersign(uuid, text) from public, anon, authenticated;
grant execute on function public.decline_countersign(uuid, text) to authenticated;

-- ---- 2. The client page: an expired link says who to call; the company's time zone ---------------------
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
    'doc', v.calc_inputs,
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
