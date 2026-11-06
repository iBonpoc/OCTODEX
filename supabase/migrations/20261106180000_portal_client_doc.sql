-- Security #2, PR-6 (docs/specs/19-db-security.md §7.2, audit 06.11 item 8): our costs never reach the client page.
--
-- app.portal_estimate_base gave anon the whole estimate_versions.calc_inputs; only the app cut unitCostCents out
-- (clientDoc, features/estimateDoc.ts). An old app, a module bug or a direct UPDATE through the API would show the
-- client our costs. Now the server builds the client's copy from an ALLOW-list of the universal estimate
-- (EstimateDoc / CustomOption / CustomLine / CustomSettings of @octo/estimating-engine), every leaf a scalar,
-- lines with clientVisible = false dropped whole. A new field of the document reaches /p/ only once it is added
-- here (T60 lists the keys). Stored data is untouched: locked versions cannot change (t40) and their document hash
-- was taken from the stored text.
-- A server-side PDF / e-mail of the estimate (П1b) must build the document with app.client_doc too.

-- only the listed keys whose values are scalars (string, number, boolean, null): nothing nested hides behind a name
create or replace function app.jsonb_scalars(p jsonb, p_keys text[])
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'object' then
    coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(p) e
               where e.key = any (p_keys) and jsonb_typeof(e.value) in ('string', 'number', 'boolean', 'null')), '{}'::jsonb)
  end;
$$;

create or replace function app.client_doc(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'object' then
    app.jsonb_scalars(p, array['note'])
    || jsonb_build_object('options', coalesce((
         select jsonb_agg(
                  app.jsonb_scalars(o.value, array['id', 'name', 'recommended'])
                  || jsonb_build_object('lines', coalesce((
                       select jsonb_agg(app.jsonb_scalars(l.value,
                                array['id', 'name', 'description', 'group', 'quantity', 'unit', 'unitPriceCents', 'optional', 'selected'])
                              order by l.ordinality)
                         from jsonb_array_elements(case when jsonb_typeof(o.value -> 'lines') = 'array' then o.value -> 'lines' else '[]'::jsonb end)
                              with ordinality l
                        where jsonb_typeof(l.value) = 'object'
                          and (l.value -> 'clientVisible') is distinct from 'false'::jsonb), '[]'::jsonb))
                  order by o.ordinality)
           from jsonb_array_elements(case when jsonb_typeof(p -> 'options') = 'array' then p -> 'options' else '[]'::jsonb end)
                with ordinality o
          where jsonb_typeof(o.value) = 'object'), '[]'::jsonb))
    || case when jsonb_typeof(p -> 'settings') = 'object' then jsonb_build_object('settings',
         app.jsonb_scalars(p -> 'settings', array['caHic'])
         || case when (p -> 'settings') ? 'discount' then jsonb_build_object('discount',
              app.jsonb_scalars(p -> 'settings' -> 'discount', array['kind', 'value', 'cents'])) else '{}'::jsonb end
         || case when jsonb_typeof(p -> 'settings' -> 'tax') = 'object' then jsonb_build_object('tax',
              app.jsonb_scalars(p -> 'settings' -> 'tax', array['enabled', 'rateBps'])
              || case when jsonb_typeof(p -> 'settings' -> 'tax' -> 'groups') = 'object' then jsonb_build_object('groups',
                   app.jsonb_scalars(p -> 'settings' -> 'tax' -> 'groups', array['service', 'labor', 'material'])) else '{}'::jsonb end)
            else '{}'::jsonb end
         || case when jsonb_typeof(p -> 'settings' -> 'deposit') = 'object' then jsonb_build_object('deposit',
              app.jsonb_scalars(p -> 'settings' -> 'deposit', array['kind', 'bps', 'cents'])) else '{}'::jsonb end)
       else '{}'::jsonb end
  end;
$$;
-- rule 18: only the security definer page function calls them (as their owner)
revoke all on function app.jsonb_scalars(jsonb, text[]), app.client_doc(jsonb) from public, anon, authenticated;

-- The page body of 20261105260000 with one change: 'doc' is the client's copy.
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
