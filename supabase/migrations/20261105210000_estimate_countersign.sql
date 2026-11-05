-- Estimates, wave E2a: the company signs the contract (docs/specs/07-estimates.md §2.2 А, §4; story map S8 / S8b).
-- Founder's decisions 05.11.2026:
--   * The deal counts only when BOTH sides signed. The client's signature (portal_accept, on the page or on site) makes
--     the estimate awaiting_countersign; an employee signs for the company in their own name (countersign_estimate),
--     and only then: estimate approved, lead won, client active, job "waiting for a date", deposit invoice.
--   * Every employee may sign (not subcontractors); the owner can take the right away. No auto-signing.
--   * An unsigned estimate's link works until "valid until" only (expires_at; default 7 days, company setting);
--     signed by both — always. Director and office can revoke the link (the token is dropped).
-- Security: approved is reachable only inside app.execute_estimate (guard trigger); a contractor signature row only
-- inside countersign_estimate (insert policy is customer-only); member signatures are append-only, own rows only.
-- The /p/ page body lives in app.portal_estimate_base (20261105180000): edited here, the public wrapper is untouched.

-- ---- 1. Who may sign ------------------------------------------------------------------------
alter table public.memberships alter column can_sign_contracts set default true;
alter table public.memberships add column if not exists title text;
update public.memberships set can_sign_contracts = true where role <> 'subcontractor' and not can_sign_contracts;
update public.memberships set can_sign_contracts = false where role = 'subcontractor' and can_sign_contracts;

create or replace function app.tg_membership_sign_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.role = 'subcontractor' then
    new.can_sign_contracts := false;                    -- a subcontractor never signs for the company
  end if;
  if tg_op = 'UPDATE' and new.can_sign_contracts is distinct from old.can_sign_contracts
     and auth.uid() is not null and not app.has_role(new.company_id, array['owner']) then
    raise exception 'only the owner gives or takes the right to sign contracts' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists t21_membership_sign_guard on public.memberships;
create trigger t21_membership_sign_guard before insert or update on public.memberships
  for each row execute function app.tg_membership_sign_guard();

create or replace function app.can_sign_contracts(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
     where m.company_id = p_company_id and m.user_id = auth.uid() and m.status = 'active'
       and m.deleted_at is null and m.can_sign_contracts and m.role <> 'subcontractor');
$$;
revoke all on function app.can_sign_contracts(uuid) from public, anon;

-- ---- 2. An employee's own signature (versions; append-only) ---------------------------------
create table if not exists public.member_signatures (
  id          uuid primary key default public.uuid_generate_v7(),
  company_id  uuid not null references public.companies (id),
  user_id     uuid not null references public.users (id),
  svg         text not null check (length(svg) between 3 and 20000),
  name        text not null check (length(trim(name)) > 0),
  title       text,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  unique (company_id, id)
);
create unique index if not exists member_signatures_one_active_idx on public.member_signatures (company_id, user_id) where revoked_at is null;

create or replace function app.tg_member_signature_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a signature is never deleted; revoke it' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    -- a new signature replaces the active one; the old one stays in history
    update public.member_signatures set revoked_at = now()
     where company_id = new.company_id and user_id = new.user_id and revoked_at is null;
    return new;
  end if;
  if old.revoked_at is not null
     or (new.id, new.company_id, new.user_id, new.svg, new.name, new.title, new.created_at)
        is distinct from (old.id, old.company_id, old.user_id, old.svg, old.name, old.title, old.created_at) then
    raise exception 'a signature cannot be changed; save a new one' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists t10_member_signature_guard on public.member_signatures;
create trigger t10_member_signature_guard before insert or update or delete on public.member_signatures
  for each row execute function app.tg_member_signature_guard();

alter table public.member_signatures enable row level security;
alter table public.member_signatures force row level security;
revoke all on public.member_signatures from anon, authenticated;
grant select, insert, update on public.member_signatures to authenticated;
create policy member_signatures_select on public.member_signatures for select to authenticated
  using (app.is_member(company_id));
create policy member_signatures_insert on public.member_signatures for insert to authenticated
  with check (user_id = (select auth.uid()) and app.is_member(company_id));
create policy member_signatures_update on public.member_signatures for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---- 3. Signatures on the estimate: client and company --------------------------------------
alter table public.estimate_approvals add column if not exists party text not null default 'customer';
alter table public.estimate_approvals drop constraint if exists estimate_approvals_party_check;
alter table public.estimate_approvals add constraint estimate_approvals_party_check check (party in ('customer', 'contractor'));
alter table public.estimate_approvals add column if not exists signer_user_id uuid references public.users (id);
alter table public.estimate_approvals add column if not exists signer_title text;
alter table public.estimate_approvals add column if not exists signer_his text;
alter table public.estimate_approvals add column if not exists member_signature_id uuid;
alter table public.estimate_approvals add column if not exists method text;
alter table public.estimate_approvals add column if not exists document_hash text;
alter table public.estimate_approvals drop constraint if exists estimate_approvals_method_check;
alter table public.estimate_approvals add constraint estimate_approvals_method_check check (method is null or method in ('drawn', 'saved'));
alter table public.estimate_approvals drop constraint if exists estimate_approvals_channel_check;
alter table public.estimate_approvals add constraint estimate_approvals_channel_check check (channel in ('on_site', 'portal', 'app'));
alter table public.estimate_approvals drop constraint if exists estimate_approvals_contractor_check;
alter table public.estimate_approvals add constraint estimate_approvals_contractor_check
  check (party = 'customer' or (signer_user_id is not null and signature_svg is not null));
-- the app inserts only the client's signature (legacy on-site path); the company's goes through countersign_estimate
drop policy if exists estimate_approvals_insert on public.estimate_approvals;
create policy estimate_approvals_insert on public.estimate_approvals for insert to authenticated
  with check (app.is_member(company_id) and app.can_read_estimate(estimate_id) and party = 'customer');

-- ---- 4. Link: valid until, revoke; approved only through execute -----------------------------
alter table public.estimates add column if not exists link_revoked_at timestamptz;

create or replace function app.tg_estimate_send_and_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_days int; v_tz text;
begin
  -- every send of a new version gets a fresh "valid until" (founder: extend = send again with a new date)
  if new.status = 'sent' and old.status is distinct from 'sent' and old.status in ('draft', 'expired') then
    select coalesce(nullif(estimate_settings ->> 'valid_days', '')::int, 7), timezone into v_days, v_tz
      from public.companies where id = new.company_id;
    new.expires_at := (now() at time zone coalesce(v_tz, 'America/Los_Angeles'))::date + greatest(v_days, 1);
  end if;
  -- approved = signed by both: never by a direct update from the app or the page. Inside a security definer function
  -- (app.execute_estimate) current_user is the function owner, not authenticated / anon — a session flag would be
  -- settable by anyone, the role is not.
  if new.status = 'approved' and old.status is distinct from 'approved' and current_user in ('authenticated', 'anon') then
    raise exception 'an estimate is approved only when an employee signs for the company (countersign_estimate)' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists t25_estimate_send_and_guard on public.estimates;
create trigger t25_estimate_send_and_guard before update on public.estimates
  for each row execute function app.tg_estimate_send_and_guard();

-- the client page and its link are open: not revoked, and (signed by the client or both, or not past "valid until" in the company's day).
-- The founder's limit is for an UNSIGNED estimate; once the client signed they keep their page.
create or replace function app.estimate_link_open(e public.estimates)
returns boolean language sql stable security definer set search_path = '' as $$
  select e.link_revoked_at is null
     and (e.status in ('awaiting_countersign', 'approved') or e.expires_at is null
          or e.expires_at >= (select (now() at time zone c.timezone)::date from public.companies c where c.id = e.company_id));
$$;
revoke all on function app.estimate_link_open(public.estimates) from public, anon, authenticated;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('estimate.viewed', 'estimate.client_signed', 'estimate.approved', 'deposit.paid', 'invoice.paid'));

-- ---- 5. Totals of the chosen option (the same rule as @octo/estimating-engine; moved out of portal_accept) ----
create or replace function app.estimate_option_totals(p_version_id uuid, p_option_id uuid, p_addon_ids uuid[])
returns table (subtotal bigint, discount bigint, tax bigint, total bigint, deposit bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.estimate_versions; o public.estimate_options;
  sub bigint; taxable bigint; disc bigint := 0; tdisc bigint := 0; tx bigint := 0; tot bigint; dep bigint := 0; rule jsonb;
begin
  select * into v from public.estimate_versions where id = p_version_id;
  select * into o from public.estimate_options where id = p_option_id;
  select coalesce(sum(li.line_total_cents), 0), coalesce(sum(li.line_total_cents) filter (where li.taxable), 0)
    into sub, taxable
    from public.estimate_line_items li
   where li.option_id = o.id and li.deleted_at is null and li.client_visible
     and (not li.is_optional or li.id = any (coalesce(p_addon_ids, '{}')));
  if o.discount_mode = 'pct' then disc := floor(sub * o.discount_value / 10000.0 + 0.5);
  elsif o.discount_mode = 'fixed' then disc := least(o.discount_value, sub);
  end if;
  if sub > 0 then tdisc := floor(disc::numeric * taxable / sub + 0.5); end if;
  if v.tax_enabled then tx := floor((taxable - tdisc)::numeric * coalesce(v.tax_rate_bps, 0) / 10000 + 0.5); end if;
  tot := sub - disc + tx;
  rule := coalesce(v.deposit_rule, '{}'::jsonb);
  if rule ->> 'kind' = 'pct' then dep := floor(tot * least(greatest((rule ->> 'bps')::numeric, 0), 10000) / 10000 + 0.5);
  elsif rule ->> 'kind' = 'fixed' then dep := least(greatest((rule ->> 'cents')::bigint, 0), tot);
  end if;
  return query select sub, disc, tx, tot, dep;
end;
$$;
revoke all on function app.estimate_option_totals(uuid, uuid, uuid[]) from public, anon, authenticated;

-- ---- 6. The client signs (page or on site): awaiting the company ------------------------------
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
  member := app.is_member(e.company_id);
  if p_channel = 'on_site' and not member then
    raise exception 'on-site signature requires a company member' using errcode = '42501';
  end if;
  if e.status in ('awaiting_countersign', 'approved') then
    return public.portal_estimate(p_token);              -- repeat (network): no duplicates
  end if;
  if e.status not in ('sent', 'viewed') then
    raise exception 'estimate is not open for approval (status %)', e.status using errcode = '22023';
  end if;
  if not app.estimate_link_open(e) then
    raise exception 'the estimate link has expired or was revoked' using errcode = '22023';
  end if;
  select * into v from public.estimate_versions where id = coalesce(e.sent_version_id, e.current_version_id);
  select * into o from public.estimate_options where id = p_option_id and version_id = v.id and deleted_at is null;
  if not found then
    raise exception 'option does not belong to the sent version' using errcode = '22023';
  end if;
  select * into t from app.estimate_option_totals(v.id, o.id, p_addon_ids);

  insert into public.estimate_approvals (company_id, estimate_id, version_id, option_id, decision, signer_name,
                                         signature_svg, esign_consent, channel, selection, party, document_hash)
  values (e.company_id, e.id, v.id, o.id, 'approved', trim(p_signer), p_svg, true,
          case when p_channel = 'on_site' then 'on_site' else 'portal' end,
          jsonb_build_object('addon_ids', coalesce(p_addon_ids, '{}'), 'subtotal', t.subtotal, 'discount', t.discount, 'tax', t.tax,
                             'total', t.total, 'deposit', t.deposit,
                             'job_id', case when member then p_job_id end, 'invoice_id', case when member then p_invoice_id end),
          'customer', encode(sha256(convert_to(coalesce(v.calc_inputs::text, '') || v.id::text, 'UTF8')), 'hex'));
  update public.estimates set status = 'awaiting_countersign' where id = e.id;

  select display_name into v_cust from public.customers where id = e.customer_id;
  insert into public.notifications (company_id, kind, estimate_id, payload)
  values (e.company_id, 'estimate.client_signed', e.id,
          jsonb_build_object('customer', v_cust, 'number', e.number, 'option', o.name, 'total', t.total, 'channel', p_channel));
  return public.portal_estimate(p_token);
end;
$$;
revoke all on function public.portal_accept(text, uuid, uuid[], text, text, boolean, text, uuid, uuid, uuid) from public;
grant execute on function public.portal_accept(text, uuid, uuid[], text, text, boolean, text, uuid, uuid, uuid) to anon, authenticated;

-- ---- 7. Both signed: the deal (one function for S8b) -----------------------------------------
create or replace function app.execute_estimate(p_estimate_id uuid, p_job_id uuid, p_invoice_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  e public.estimates; a public.estimate_approvals; v public.estimate_versions; o public.estimate_options;
  t record; total bigint; dep bigint; v_job uuid; v_inv uuid; tz text; v_cust text;
begin
  select * into e from public.estimates where id = p_estimate_id for update;
  select * into a from public.estimate_approvals
   where estimate_id = e.id and party = 'customer' and decision = 'approved' order by signed_at desc limit 1;
  select * into v from public.estimate_versions where id = coalesce(a.version_id, e.sent_version_id, e.current_version_id);
  select * into o from public.estimate_options
   where id = coalesce(a.option_id, (select id from public.estimate_options where version_id = v.id and deleted_at is null order by position, created_at limit 1));
  if a.selection ? 'total' then
    total := (a.selection ->> 'total')::bigint; dep := coalesce((a.selection ->> 'deposit')::bigint, 0);
  else
    select * into t from app.estimate_option_totals(v.id, o.id, '{}'); total := t.total; dep := t.deposit;
  end if;

  update public.estimates set status = 'approved' where id = e.id;
  if e.lead_id is not null then
    update public.leads set status = 'won', won_via = 'approval', customer_id = coalesce(customer_id, e.customer_id)
     where id = e.lead_id and status not in ('won', 'lost', 'archived');
  end if;
  update public.customers set status = 'active' where id = e.customer_id and status = 'prospect';

  v_job := coalesce(p_job_id, (a.selection ->> 'job_id')::uuid, public.uuid_generate_v7());
  insert into public.jobs (id, company_id, number, title, customer_id, property_id, estimate_id, approved_version_id, option_id, contract_total_cents)
  values (v_job, e.company_id, '', coalesce(nullif(e.title, ''), o.name), e.customer_id, e.property_id, e.id, v.id, o.id, total)
  on conflict (estimate_id) do nothing;
  select id into v_job from public.jobs where estimate_id = e.id;

  if dep > 0 and not exists (select 1 from public.invoices where job_id = v_job and kind = 'deposit' and status <> 'void') then
    v_inv := coalesce(p_invoice_id, (a.selection ->> 'invoice_id')::uuid, public.uuid_generate_v7());
    select timezone into tz from public.companies where id = e.company_id;
    insert into public.invoices (id, company_id, number, customer_id, job_id, kind, status, title, due_date,
                                 subtotal_cents, total_cents, sent_at, source_estimate_version_id)
    values (v_inv, e.company_id, '', e.customer_id, v_job, 'deposit', 'sent', 'Deposit', (now() at time zone tz)::date,
            dep, dep, now(), v.id);
  end if;

  select display_name into v_cust from public.customers where id = e.customer_id;
  insert into public.notifications (company_id, kind, estimate_id, job_id, payload)
  values (e.company_id, 'estimate.approved', e.id, v_job,
          jsonb_build_object('customer', v_cust, 'number', e.number, 'option', o.name, 'total', total, 'deposit', dep, 'channel', a.channel));
  return v_job;
end;
$$;
revoke all on function app.execute_estimate(uuid, uuid, uuid) from public, anon, authenticated;

-- ---- 8. An employee signs for the company ------------------------------------------------------
-- p_member_signature_id: the saved signature (method saved); or p_svg: drawn now (method drawn, saved as the new own signature).
create or replace function public.countersign_estimate(
  p_estimate_id          uuid,
  p_svg                  text default null,
  p_member_signature_id  uuid default null,
  p_job_id               uuid default null,
  p_invoice_id           uuid default null
) returns text language plpgsql security definer set search_path = '' as $$
declare
  e public.estimates; ca public.estimate_approvals; m public.memberships; s public.member_signatures;
  v_name text; v_method text;
begin
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null for update;
  if not found or not app.is_member(e.company_id) then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  if e.status = 'approved' then
    return 'approved';                                    -- repeat (network, double tap): nothing doubles
  end if;
  if e.status <> 'awaiting_countersign' then
    raise exception 'the client has not signed this estimate (status %)', e.status using errcode = '22023';
  end if;
  if not app.can_sign_contracts(e.company_id) then
    raise exception 'no right to sign contracts for the company' using errcode = '42501';
  end if;
  select * into m from public.memberships where company_id = e.company_id and user_id = auth.uid() and deleted_at is null;
  select full_name into v_name from public.users where id = auth.uid();
  if p_member_signature_id is not null then
    select * into s from public.member_signatures
     where id = p_member_signature_id and company_id = e.company_id and user_id = auth.uid() and revoked_at is null;
    if not found then
      raise exception 'not your current signature' using errcode = '42501';
    end if;
    v_method := 'saved';
  elsif coalesce(p_svg, '') <> '' then
    insert into public.member_signatures (company_id, user_id, svg, name, title)
    values (e.company_id, auth.uid(), p_svg, coalesce(nullif(trim(v_name), ''), 'Employee'), m.title)
    returning * into s;
    v_method := 'drawn';
  else
    raise exception 'a signature is required' using errcode = '22023';
  end if;
  select * into ca from public.estimate_approvals
   where estimate_id = e.id and party = 'customer' and decision = 'approved' order by signed_at desc limit 1;

  insert into public.estimate_approvals (company_id, estimate_id, version_id, option_id, decision, signer_name, signature_svg,
                                         esign_consent, channel, party, signer_user_id, signer_title, signer_his,
                                         member_signature_id, method, document_hash)
  values (e.company_id, e.id, ca.version_id, ca.option_id, 'approved', s.name, s.svg, true,
          case when ca.channel = 'on_site' then 'on_site' else 'app' end, 'contractor', auth.uid(), coalesce(s.title, m.title),
          m.his_registration_number, s.id, v_method, ca.document_hash);
  perform app.execute_estimate(e.id, p_job_id, p_invoice_id);
  return 'approved';
end;
$$;
revoke all on function public.countersign_estimate(uuid, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.countersign_estimate(uuid, text, uuid, uuid, uuid) to authenticated;

-- ---- 9. Revoke the client link (director, admin, office) ---------------------------------------
create or replace function public.revoke_estimate_link(p_estimate_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.estimates;
begin
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null for update;
  if not found or not app.has_role(e.company_id, array['owner', 'admin', 'office']) then
    raise exception 'only the director or the office revokes a link' using errcode = '42501';
  end if;
  if e.public_token is null then
    return;                                               -- already revoked: nothing to do
  end if;
  update public.estimates set public_token = null, link_revoked_at = now() where id = e.id;
  insert into public.activities (company_id, subject_type, subject_id, kind, body, meta)
  values (e.company_id, 'estimate', e.id, 'edited', 'link revoked', jsonb_build_object('action', 'link_revoked'));
end;
$$;
revoke all on function public.revoke_estimate_link(uuid) from public, anon;
grant execute on function public.revoke_estimate_link(uuid) to authenticated;

-- ---- 10. The client page: expired / revoked → nothing; valid until, client contacts, company signature ----
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
  if not app.estimate_link_open(e) then
    return null;                                          -- past "valid until" (unsigned) or revoked
  end if;
  select * into v from public.estimate_versions where id = coalesce(e.sent_version_id, e.current_version_id);
  select * into co from public.companies where id = e.company_id;
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
                  'signature_svg', a.signature_svg, 'selection', a.selection - 'job_id' - 'invoice_id') end,
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
revoke all on function app.portal_estimate_base(text) from public, anon, authenticated;
