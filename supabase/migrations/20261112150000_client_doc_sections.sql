-- РС-6 of the estimate editor (spec docs/audit/2026-11-12-estimate-editor-spec.md Р3, Р4, §4.2 п.1): what the client
-- reads of an estimate (app.client_doc — the page /p/, the signed document) now carries the sections.
-- * An option's sections (app.client_sections): the first 40 places, then a broken entry (no string id) and a repeated id go
--   — the same order as the engine (countedSections) and the phone (normalizeDoc); only id, title (control characters →
--   spaces, at most 60 characters, trimmed, a blank one left out), kind (service / labor / material / module) and parentId
--   (only under a top section that counts) — a module's key stays the company's.
-- * A line passes its sectionId (a line whose section is not there is shown «без раздела» by the page).
-- * A line hidden from the client goes whole only at $0, as the engine counts it: a priced line marked hidden (an older
--   phone, a broken copy) is shown — the client's total holds it, the page and the total agree.
-- * A locked (signed) version is read as it was signed: a line marked hidden goes whatever its price (the signed document
--   never changes after the signature) — app.client_doc(p, p_signed), the page passes v.locked_at is not null.
-- * ids: a section id, a parentId and a line's sectionId are strings of at most 64 characters, or they do not count; a
--   subsection is one whose parentId is a non-empty string. The title: Cc → space, Cf goes, 60 characters, the edge spaces
--   go (app.client_title) — all as the engine (countedSections) and the phone (normalizeDoc, clientDoc).
-- Rule 16: the same signatures (create or replace) and a new two-argument form; only what the client reads grows. Rule 18: revoked from everyone —
-- only the security-definer page functions call them, as their owner. Tests: supabase/tests/core_rls.sql T199.

-- a section's title as the client reads it — the same three sets as the phone (estimateDoc.ts cleanTitle): a control
-- character (Cc) is a space, a format character (Cf: zero width, the direction marks) goes; at most 60 characters, then
-- the edge spaces go (the same set of spaces as the phone trims); blank — none
create or replace function app.client_title(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(
           left(regexp_replace(regexp_replace(coalesce(p, ''), '[\u0001-\u001f\u007f-\u009f]', ' ', 'g'),
                               '[­؀-؅؜۝܏࣢᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]', '', 'g'), 60),
           '^[    -     　]+|[    -     　]+$', '', 'g'), '');
$$;
revoke all on function app.client_title(text) from public, anon, authenticated;

create or replace function app.client_sections(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  with raw as (
    select e.value as v, e.ordinality as n
      from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality e
     where e.ordinality <= 40
  ), ok as (
    -- an id is a non-empty string of at most 64 characters (the engine's sectionIdOk)
    select v, n from raw where jsonb_typeof(v) = 'object' and jsonb_typeof(v -> 'id') = 'string'
                           and (v ->> 'id') <> '' and length(v ->> 'id') <= 64
  ), firsts as (
    select distinct on (v ->> 'id') v, n from ok order by v ->> 'id', n
  ), tops as (
    -- a subsection is one whose parentId is a non-empty string (the engine's isSubsection); "" or anything else — a top
    select v ->> 'id' as id from firsts where not coalesce(jsonb_typeof(v -> 'parentId') = 'string' and (v ->> 'parentId') <> '', false)
  )
  select coalesce(jsonb_agg(
           jsonb_build_object('id', f.v ->> 'id')
           || case when t.title is not null then jsonb_build_object('title', t.title) else '{}'::jsonb end
           || case when f.v ->> 'kind' in ('service', 'labor', 'material', 'module') and jsonb_typeof(f.v -> 'kind') = 'string'
                   then jsonb_build_object('kind', f.v ->> 'kind') else '{}'::jsonb end
           || case when coalesce(jsonb_typeof(f.v -> 'parentId') = 'string' and (f.v ->> 'parentId') <> '', false) then jsonb_build_object('parentId', f.v ->> 'parentId') else '{}'::jsonb end
           order by f.n), '[]'::jsonb)
    from firsts f,
         lateral (select app.client_title(case when jsonb_typeof(f.v -> 'title') = 'string' then f.v ->> 'title' end) as title) t
   where not coalesce(jsonb_typeof(f.v -> 'parentId') = 'string' and (f.v ->> 'parentId') <> '', false) or (f.v ->> 'parentId') in (select id from tops);
$$;
revoke all on function app.client_sections(jsonb) from public, anon, authenticated;

-- p_signed: a locked (signed) version is read as it was signed — a line marked hidden goes whatever its price, as before
-- this migration: the signed document never changes after the signature (the production base has none such, 12.11)
create or replace function app.client_doc(p jsonb, p_signed boolean)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'object' then
    app.jsonb_scalars(p, array['note'])
    || jsonb_build_object('options', coalesce((
         select jsonb_agg(
                  app.jsonb_scalars(o.value, array['id', 'name', 'recommended'])
                  -- РС-6: the option's sections as the client reads them (app.client_sections)
                  || case when jsonb_typeof(o.value -> 'sections') = 'array' then jsonb_build_object('sections', app.client_sections(o.value -> 'sections')) else '{}'::jsonb end
                  || jsonb_build_object('lines', coalesce((
                       select jsonb_agg(app.jsonb_scalars(l.value,
                                array['id', 'name', 'description', 'group', 'quantity', 'unit', 'unitPriceCents', 'optional', 'selected'])
                              -- a sectionId: a string of at most 64 characters, or no link (the phone the same)
                              || case when jsonb_typeof(l.value -> 'sectionId') = 'string' and (l.value ->> 'sectionId') <> ''
                                           and length(l.value ->> 'sectionId') <= 64
                                      then jsonb_build_object('sectionId', l.value ->> 'sectionId') else '{}'::jsonb end
                              order by l.ordinality)
                         from jsonb_array_elements(case when jsonb_typeof(o.value -> 'lines') = 'array' then o.value -> 'lines' else '[]'::jsonb end)
                              with ordinality l
                        where jsonb_typeof(l.value) = 'object'
                          -- a line hidden from the client goes whole (also «false» as a string or 0) — only at $0, as the
                          -- engine counts it (РС-6): a priced line marked hidden is a visible one (the client's total holds it)
                          and not (coalesce(lower(l.value ->> 'clientVisible'), 'true') in ('false', '0')
                                   and (coalesce(p_signed, false)
                                        or case when jsonb_typeof(l.value -> 'unitPriceCents') = 'number' then (l.value ->> 'unitPriceCents')::numeric = 0 else true end))
                          -- a line the page cannot draw goes whole too (the page would fail on it)
                          and jsonb_typeof(l.value -> 'name') = 'string'
                          and jsonb_typeof(l.value -> 'group') = 'string'
                          and jsonb_typeof(l.value -> 'quantity') in ('string', 'number')
                          and jsonb_typeof(l.value -> 'unitPriceCents') = 'number'
                          -- quantity 0: the part is left out (spec 33 П23.9)
                          and (l.value ->> 'quantity') !~ '^[[:space:]]*[+-]?(0+([.]0*)?|[.]0+)[[:space:]]*$'), '[]'::jsonb))
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
    -- spec 33 П24.7: the attached pages, only what the page may draw (app.doc_pages)
    || case when jsonb_typeof(p -> 'pages') = 'array' then jsonb_build_object('pages', app.doc_pages(p -> 'pages')) else '{}'::jsonb end
  end;
$$;
revoke all on function app.client_doc(jsonb, boolean) from public, anon, authenticated;

-- the one-argument form (the lock check app.version_lines_mismatch, older callers): an unsigned reading
create or replace function app.client_doc(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select app.client_doc(p, false);
$$;
revoke all on function app.client_doc(jsonb) from public, anon, authenticated;

-- the client's page reads a locked (signed) version as it was signed (app.client_doc p_signed); the rest as before
-- (20261110030000) — the same signature, the same rights
create or replace function app.portal_estimate_base(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  e   public.estimates;
  v   public.estimate_versions;
  co  public.companies;
  a   public.estimate_approvals;
  ca  public.estimate_approvals;
  dep_paid boolean;
begin
  select * into e from public.estimates where id = app.estimate_of_token(p_token) and deleted_at is null;
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
    'doc', app.client_doc(v.calc_inputs, v.locked_at is not null),  -- 20261106180000: never our costs
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
