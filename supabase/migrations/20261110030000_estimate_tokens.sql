-- The tech and the client link, step 2 of 3 (docs/specs/35-stripe.md §4е, «Деньги и отчёты» №7). Rule 16.
-- A tech read estimates.public_token (estimates_select) and could sign as the client on /p/ (director's check of #457).
-- The column cannot simply be revoked: every app version reads estimates with select * — one closed column fails the whole
-- load. So the links move:
-- * app.estimate_tokens — the live links of an estimate (no grant to anyone: only the doors below read it). An estimate may
--   have more than one: an older app shows and copies the token it made itself — send_estimate keeps it as one more live
--   link (staff only), so what the office sent works. A revoke ends them all (their hashes go to revoked_link_tokens: the
--   page says «this link is no longer valid», as before).
-- * estimates.public_token — moved out and from now on always null (t02_public_token_null); an older app shows no link and
--   does not fail. Step 3 (a separate PR, when no app version reads it) drops the column.
-- * public.estimate_links() — the links of the company's estimates for the office side (owner, admin, office, sales); a tech
--   gets nothing. The app reads it once with the estimates.
-- * The links of open estimates a tech could read (his own, or on a property he is assigned to) are issued anew; the old
--   ones are revoked (production 08.11: none open, no active tech).
-- * The 12 functions that read the column read the new table; their bodies are as they were otherwise (the PR has the
--   line-by-line diff of each against its last version).

-- ---- 1. The table of links ------------------------------------------------------------------------------------------
create table app.estimate_tokens (
  token       text primary key check (char_length(token) between 20 and 128 and token ~ '^[A-Za-z0-9_-]+$'),
  estimate_id uuid not null,
  company_id  uuid not null,
  created_at  timestamptz not null default clock_timestamp(),   -- the order of links even inside one transaction
  foreign key (company_id, estimate_id) references public.estimates (company_id, id)
);
create index estimate_tokens_estimate_idx on app.estimate_tokens (estimate_id, created_at desc);
alter table app.estimate_tokens enable row level security;
alter table app.estimate_tokens force row level security;
revoke all on app.estimate_tokens from public, anon, authenticated;
create trigger t11_company_id_immutable before update on app.estimate_tokens for each row execute function app.tg_company_id_immutable();

-- a new link of an estimate is «something new for the client»: a client marked «do not service» gets none (before: the
-- estimates guard saw public_token appear — t44_no_service_guard; the row no longer carries it)
create or replace function app.tg_estimate_token_no_service()
returns trigger language plpgsql security definer set search_path = '' as $$
declare e public.estimates; v_closed uuid[];
begin
  select * into e from public.estimates where id = new.estimate_id;
  if e.company_id is distinct from new.company_id then
    raise exception 'the link belongs to its estimate''s company' using errcode = '23514';
  end if;
  if e.status in ('awaiting_countersign', 'approved') then
    return new;                                  -- the client's signed copy: a new link to it is not new work (as before)
  end if;
  v_closed := app.no_service_among(e.company_id, app.no_service_clients('estimates', e.company_id, e.customer_id, e.property_id, null, null));
  if cardinality(v_closed) > 0 then
    raise exception 'customer_do_not_service' using errcode = 'P0001',
      hint = 'the client is marked «do not service»: no new jobs, estimates or visits';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_estimate_token_no_service() from public, anon, authenticated;

create or replace function app.estimate_of_token(p_token text)
returns uuid language sql stable security definer set search_path = '' as $$
  select k.estimate_id from app.estimate_tokens k where k.token = p_token;
$$;
revoke all on function app.estimate_of_token(text) from public, anon, authenticated;

-- the link the office sees: the newest live one
create or replace function app.estimate_current_token(p_estimate_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select k.token from app.estimate_tokens k where k.estimate_id = p_estimate_id order by k.created_at desc, k.token limit 1;
$$;
revoke all on function app.estimate_current_token(uuid) from public, anon, authenticated;

-- every live link of an estimate ends: its hash is kept (the page says «no longer valid»), the link is gone
create or replace function app.estimate_tokens_revoke(p_estimate_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.revoked_link_tokens (token_hash, company_id, estimate_id)
  select encode(sha256(convert_to(k.token, 'UTF8')), 'hex'), k.company_id, k.estimate_id from app.estimate_tokens k where k.estimate_id = p_estimate_id
  on conflict (token_hash) do nothing;
  delete from app.estimate_tokens where estimate_id = p_estimate_id;
end;
$$;
revoke all on function app.estimate_tokens_revoke(uuid) from public, anon, authenticated;

-- ---- 2. The data: the links move out of the row (triggers off — a move, not a change; CHECKS: direct, triggers off) ---
insert into app.estimate_tokens (token, estimate_id, company_id, created_at)
select e.public_token, e.id, e.company_id, coalesce(e.updated_at, now()) from public.estimates e where e.public_token is not null
on conflict (token) do nothing;
alter table public.estimates disable trigger user;
update public.estimates set public_token = null where public_token is not null;
alter table public.estimates enable trigger user;

-- from now on the row never carries a link (an older app or a forgotten path cannot put one back)
create or replace function app.tg_public_token_null()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.public_token := null;
  return new;
end;
$$;
revoke all on function app.tg_public_token_null() from public, anon, authenticated;
create trigger t02_public_token_null before insert or update on public.estimates for each row execute function app.tg_public_token_null();

-- (for the reissue below only) the person is the office side of the company today: owner, admin, office, sales, active
create or replace function app.staff_now(p_company_id uuid, p_user_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.company_id = p_company_id and m.user_id = p_user_id
                   and m.status = 'active' and m.deleted_at is null and m.role in ('owner', 'admin', 'office', 'sales'));
$$;
revoke all on function app.staff_now(uuid, uuid) from public, anon, authenticated;

-- ---- 3. The links a tech could read: issued anew — every status (a signed one can be reopened and sent again with the
-- same link; a deleted one restored), and every person who could read it and is not the office side today (a tech, a
-- former tech, someone whose role changed). Production 08.11: no active tech, no such estimate. A signed copy's new link
-- goes to the client again through «Новая ссылка» (reissue_estimate_link).
do $$
declare r record; v_token text;
begin
  for r in select e.id, e.company_id from public.estimates e
            where exists (select 1 from app.estimate_tokens k where k.estimate_id = e.id)
              and ((e.created_by is not null and not app.staff_now(e.company_id, e.created_by))
                   or exists (select 1 from public.visits v join public.visit_assignees a on a.visit_id = v.id
                               where v.company_id = e.company_id and v.property_id = e.property_id
                                 and not app.staff_now(e.company_id, a.user_id)))
  loop
    perform app.estimate_tokens_revoke(r.id);
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into app.estimate_tokens (token, estimate_id, company_id) values (v_token, r.id, r.company_id);
    -- written down: the estimate's history says its link was issued anew and why (the office sends the new one)
    insert into public.activities (company_id, subject_type, subject_id, kind, body, meta)
    values (r.company_id, 'estimate', r.id, 'edited', 'link reissued', jsonb_build_object('action', 'link_reissued', 'why', 'tech_link_step2'));
  end loop;
end;
$$;

-- the guard of new links — after the move and the reissue above (moving what exists is not «new for the client»)
create trigger t10_no_service before insert on app.estimate_tokens for each row execute function app.tg_estimate_token_no_service();

-- ---- 4. The doors that read the link --------------------------------------------------------------------------------
create or replace function app.estimate_client_accept(p_estimate_id uuid, p_token text, p_option_id uuid, p_addon_ids uuid[], p_signer text, p_svg text, p_consent boolean, p_channel text, p_job_id uuid, p_invoice_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  e public.estimates; v public.estimate_versions; o public.estimate_options; member boolean;
  t record; v_cust text;
begin
  if coalesce(p_consent, false) is not true or coalesce(trim(p_signer), '') = '' or coalesce(p_svg, '') = '' then
    raise exception 'E-SIGN consent, name and signature are required' using errcode = '22023';
  end if;
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null for update;
  if not found or (p_token is not null and not exists (select 1 from app.estimate_tokens k where k.token = p_token and k.estimate_id = e.id)) then
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
    return 'repeat';                                     -- repeat (network): no duplicates
  end if;
  if e.status not in ('sent', 'viewed') then
    raise exception 'estimate is not open for approval (status %)', e.status using errcode = '22023';
  end if;
  -- the page link must be open; on site the employee is present, so the date does not stop the signature
  -- a link the office revoked (a wrong price, say) is closed on site too: the employee present waives only the date (review #457)
  if e.link_revoked_at is not null then
    raise exception 'the estimate link was revoked' using errcode = '22023';
  end if;
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
  -- the device's ids for the job and the deposit invoice: an id that is already another record's is not taken (a tech's
  -- device must not make the countersign fail on a primary key — security review of §4д п.10); the server makes its own
  if p_job_id is not null and exists (select 1 from public.jobs j where j.id = p_job_id and j.estimate_id is distinct from e.id) then
    p_job_id := null;
  end if;
  if p_invoice_id is not null and exists (select 1 from public.invoices i where i.id = p_invoice_id) then
    p_invoice_id := null;
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
  return 'signed';
end;
$$;

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

create or replace function public.portal_estimate(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  r jsonb;
  v_id uuid;
  v_company uuid;
begin
  r := app.portal_estimate_base(p_token);
  if r is null then
    return null;
  end if;
  select id, company_id into v_id, v_company from public.estimates where id = app.estimate_of_token(p_token) and deleted_at is null;
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

create or replace function public.portal_accept(p_token text, p_option_id uuid, p_addon_ids uuid[], p_signer text, p_svg text, p_consent boolean, p_channel text DEFAULT 'portal'::text, p_job_id uuid DEFAULT NULL::uuid, p_visit_id uuid DEFAULT NULL::uuid, p_invoice_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare v_id uuid;
begin
  select id into v_id from public.estimates where id = app.estimate_of_token(p_token) and deleted_at is null;
  if not found or p_token is null then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  perform app.estimate_client_accept(v_id, p_token, p_option_id, p_addon_ids, p_signer, p_svg, p_consent, p_channel, p_job_id, p_invoice_id);
  return public.portal_estimate(p_token);
end;
$$;

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

create or replace function public.stripe_pay_open(p_token text, p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  e    public.estimates;
  inv  public.invoices;
  a    public.payment_attempts;
  bal  bigint;
begin
  if p_token is null or p_invoice_id is null then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  select * into e from public.estimates where id = app.estimate_of_token(p_token) and deleted_at is null;
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

create or replace function public.send_estimate(p_estimate_id uuid, p_token text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare e public.estimates; v_token text;
begin
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null for update;
  if not found or not app.is_staff(e.company_id) or not app.can_edit_estimate(e.id) then
    raise exception 'only the office or the director sends an estimate' using errcode = '42501';
  end if;
  if e.status not in ('draft', 'sent', 'viewed') then
    return app.estimate_current_token(e.id);              -- signed or closed: nothing to send, keep the link
  end if;
  perform set_config('app.signing_estimate', e.id::text, true);
  if e.status = 'draft' then
    if e.current_version_id is null then
      raise exception 'nothing to send: the estimate has no version' using errcode = '22023';
    end if;
    update public.estimate_versions set locked_at = coalesce(locked_at, now()), sent_at = coalesce(sent_at, now())
     where id = e.current_version_id;
    update public.estimates set status = 'sent', sent_version_id = e.current_version_id where id = e.id;
  end if;
  v_token := app.estimate_current_token(e.id);
  -- the phone's own token (an older app shows and copies the link it made itself): kept as one more live link of this
  -- estimate, so what the office already sent works (spec 35 §4е, step 2); a new estimate's first link is the same
  if p_token is not null and length(p_token) between 20 and 128 and p_token ~ '^[A-Za-z0-9_-]+$' and p_token is distinct from v_token
     and not exists (select 1 from public.revoked_link_tokens r where r.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
     and not exists (select 1 from app.estimate_tokens k where k.token = p_token) then
    -- no endless pile: at most 5 live links — the OLDEST one ends (its hash kept: «no longer valid»), the new one always
    -- works (an older app sends the link it made; the client must never get a dead one — director's check of #464)
    if (select count(*) from app.estimate_tokens k where k.estimate_id = e.id) >= 5 then
      with old as (
        delete from app.estimate_tokens k
         where k.token = (select x.token from app.estimate_tokens x where x.estimate_id = e.id order by x.created_at, x.token limit 1)
        returning k.token, k.company_id, k.estimate_id)
      insert into public.revoked_link_tokens (token_hash, company_id, estimate_id)
      select encode(sha256(convert_to(old.token, 'UTF8')), 'hex'), old.company_id, old.estimate_id from old
      on conflict (token_hash) do nothing;
    end if;
    insert into app.estimate_tokens (token, estimate_id, company_id) values (p_token, e.id, e.company_id);
    v_token := p_token;                          -- the newest: the one the office sees (estimate_link, estimate_links)
    update public.estimates set link_revoked_at = null where id = e.id;
  elsif v_token is null then
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into app.estimate_tokens (token, estimate_id, company_id) values (v_token, e.id, e.company_id);
    update public.estimates set link_revoked_at = null where id = e.id;
  end if;
  perform set_config('app.signing_estimate', '', true);
  return v_token;
end;
$$;

create or replace function public.revoke_estimate_link(p_estimate_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare e public.estimates;
begin
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null for update;
  if not found or not app.has_role(e.company_id, array['owner', 'admin', 'office']) then
    raise exception 'only the director or the office revokes a link' using errcode = '42501';
  end if;
  if not exists (select 1 from app.estimate_tokens k where k.estimate_id = e.id) then
    return;                                               -- already revoked: nothing to do
  end if;
  if e.status not in ('sent', 'viewed', 'draft', 'declined', 'expired') then
    -- the client signed: they were promised their copy on this page (plan audit 05.11)
    raise exception 'a signed estimate keeps its link' using errcode = '22023';
  end if;
  perform app.estimate_tokens_revoke(e.id);              -- every live link of it (an older app may have added its own)
  perform set_config('app.signing_estimate', e.id::text, true);
  update public.estimates set public_token = null, link_revoked_at = now() where id = e.id;
  perform set_config('app.signing_estimate', '', true);
  insert into public.activities (company_id, subject_type, subject_id, kind, body, meta)
  values (e.company_id, 'estimate', e.id, 'edited', 'link revoked', jsonb_build_object('action', 'link_revoked'));
end;
$$;

create or replace function public.reissue_estimate_link(p_estimate_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare e public.estimates; v_token text;
begin
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null for update;
  if not found or not app.has_role(e.company_id, array['owner', 'admin', 'office']) then
    raise exception 'only the director or the office issues a new link' using errcode = '42501';
  end if;
  if e.status not in ('awaiting_countersign', 'approved') then
    raise exception 'only a signed estimate gets a new link (status %); revoke and send it instead', e.status using errcode = '22023';
  end if;
  perform app.estimate_tokens_revoke(e.id);
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into app.estimate_tokens (token, estimate_id, company_id) values (v_token, e.id, e.company_id);
  perform set_config('app.signing_estimate', e.id::text, true);
  update public.estimates set public_token = null, link_revoked_at = null where id = e.id;
  perform set_config('app.signing_estimate', '', true);
  insert into public.activities (company_id, subject_type, subject_id, kind, body, meta)
  values (e.company_id, 'estimate', e.id, 'edited', 'link reissued', jsonb_build_object('action', 'link_reissued'));
  return v_token;
end;
$$;

create or replace function app.revoke_customer_links(p_company_id uuid, p_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare e record;
begin
  for e in select x.id, x.company_id from public.estimates x
            where x.company_id = p_company_id and x.customer_id = p_customer_id   -- also deleted ones: a restore must not bring a link back
              and exists (select 1 from app.estimate_tokens k where k.estimate_id = x.id)
              and x.status in ('draft', 'sent', 'viewed', 'declined', 'expired')
            for update
  loop
    perform app.estimate_tokens_revoke(e.id);
    perform set_config('app.signing_estimate', e.id::text, true);
    update public.estimates set public_token = null, link_revoked_at = now() where id = e.id;
    perform set_config('app.signing_estimate', '', true);
    insert into public.activities (company_id, subject_type, subject_id, kind, body, meta)
    values (e.company_id, 'estimate', e.id, 'edited', 'link revoked', jsonb_build_object('action', 'link_revoked', 'why', 'do_not_service'));
  end loop;
end;
$$;

create or replace function public.email_claim(p_outbox_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
                    and e.status = 'approved' and exists (select 1 from app.estimate_tokens k where k.estimate_id = e.id)) then
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

create or replace function public.estimate_link(p_estimate_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
declare e public.estimates;
begin
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null;
  if not found or not app.is_staff(e.company_id) then
    raise exception 'only the office or the director manages the client link' using errcode = '42501';
  end if;
  return app.estimate_current_token(e.id);
end;
$$;

-- the links of the company's estimates for the office side; a tech, a subcontractor, another company — nothing
create or replace function public.estimate_links(p_company_id uuid)
returns table (estimate_id uuid, token text) language sql stable security definer set search_path = '' as $$
  select k.estimate_id, (array_agg(k.token order by k.created_at desc, k.token))[1]
    from app.estimate_tokens k join public.estimates e on e.id = k.estimate_id
   where k.company_id = p_company_id and e.deleted_at is null and app.is_staff(p_company_id)
   group by k.estimate_id;
$$;
revoke all on function public.estimate_links(uuid) from public, anon;
grant execute on function public.estimate_links(uuid) to authenticated;
