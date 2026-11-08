-- Lead intake from outside (step 16, wave L4 of docs/14; docs/specs/34-lead-intake.md §3, §3а).
-- A lead comes in from the company's own request page /f/<token> (and the same page in an iframe on a site), or from a
-- webhook with the company's key (Zapier / Make: Google LSA, Facebook, Angi, Thumbtack exports).
-- * public.intake_endpoints — the company's ways in: a form (public token, shown in settings) or a webhook (secret key,
--   shown once, kept only as a hash). The settings of a way in: source, kind of work, on/off, captcha, SMS consent box,
--   daily limit. Switches are stored now, what they show is the founder's call (В1, В3): off by default.
-- * public.intake_events — the journal of every request: one row per (way in, event key); a repeat returns the stored
--   result and never touches the row. Over a limit a request is held (kept, «Accept» by hand), never lost.
-- * app.intake_lead — the one pipeline for all channels (docs/14 §4): service_role only (the Edge Function lead-intake).
--   The database finds the company by the hash of the token itself; nothing in the body names a company.
-- * leads.provider / provider_ref / parse_status / intake_event_id; activities kind 'intake' (a repeat request from an
--   open lead's person goes to its feed, ≤ 3 a day, marked unconfirmed — contact, price and status stay).
-- * app.add_lead_main_person keeps Russian (ru) as the person's language (spec 34 §3а п.15).
-- Rule 16: everything is added; the old app ignores the new columns and the unknown activity kind (leadTimeline).

-- ---- 1. Ways in ------------------------------------------------------------------------------------
create table public.intake_endpoints (
  id                   uuid primary key default public.uuid_generate_v7(),
  company_id           uuid not null references public.companies (id),
  kind                 text not null check (kind in ('form', 'webhook')),
  token_hash           text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  public_token         text,                                  -- the form's link token (public by design); null for a webhook
  token_hint           text not null check (char_length(token_hint) between 4 and 8),
  source_id            uuid not null,
  service_category_id  uuid,
  enabled              boolean not null default true,
  captcha_required     boolean not null default false,
  sms_consent_enabled  boolean not null default false,
  daily_limit          int not null default 100 check (daily_limit between 1 and 1000),
  rotated_at           timestamptz,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  check ((kind = 'form') = (public_token is not null)),
  foreign key (company_id, source_id) references public.lead_sources (company_id, id),
  foreign key (company_id, service_category_id) references public.service_categories (company_id, id)
);
create index intake_endpoints_company_idx on public.intake_endpoints (company_id);
create index intake_endpoints_source_idx on public.intake_endpoints (company_id, source_id);
create index intake_endpoints_category_idx on public.intake_endpoints (company_id, service_category_id) where service_category_id is not null;
select app.attach_standard_triggers('public.intake_endpoints');
alter table public.intake_endpoints enable row level security;
alter table public.intake_endpoints force row level security;
create policy intake_endpoints_select on public.intake_endpoints for select to authenticated
  using (app.has_role(company_id, array['owner', 'admin']) and deleted_at is null);
revoke all on public.intake_endpoints from anon, authenticated;
grant select (id, company_id, kind, public_token, token_hint, source_id, service_category_id, enabled, captcha_required,
              sms_consent_enabled, daily_limit, rotated_at, created_at, updated_at, deleted_at)
  on public.intake_endpoints to authenticated;

-- ---- 2. The journal ---------------------------------------------------------------------------------
create table public.intake_events (
  id             uuid primary key default public.uuid_generate_v7(),
  company_id     uuid not null references public.companies (id),
  endpoint_id    uuid not null,
  event_key      text not null check (char_length(event_key) between 1 and 200),
  payload_hash   text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  received_at    timestamptz not null default now(),
  ip_hash        text check (ip_hash ~ '^[0-9a-f]{64}$'),
  status         text not null check (status in ('accepted', 'merged', 'held', 'rejected', 'invalid')),
  reason         text check (char_length(reason) <= 60),
  lead_id        uuid,
  payload        jsonb,                                   -- trimmed fields; cleared by app.purge_intake_events
  sms_consent    boolean not null default false,
  consent_text_version text check (char_length(consent_text_version) <= 40),
  decided_by     uuid references public.users (id),
  decided_at     timestamptz,
  unique (endpoint_id, event_key),
  unique (company_id, id),
  foreign key (company_id, endpoint_id) references public.intake_endpoints (company_id, id),
  foreign key (company_id, lead_id) references public.leads (company_id, id)
);
create index intake_events_company_idx on public.intake_events (company_id, received_at desc);
create index intake_events_endpoint_idx on public.intake_events (company_id, endpoint_id);
create index intake_events_decided_by_idx on public.intake_events (decided_by) where decided_by is not null;
create index intake_events_ip_idx on public.intake_events (company_id, ip_hash, received_at) where ip_hash is not null;
create index intake_events_lead_idx on public.intake_events (company_id, lead_id) where lead_id is not null;
create trigger t11_company_id_immutable before update on public.intake_events
  for each row execute function app.tg_company_id_immutable();
alter table public.intake_events enable row level security;
alter table public.intake_events force row level security;
create policy intake_events_select on public.intake_events for select to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office']));
revoke all on public.intake_events from anon, authenticated;
grant select (id, company_id, endpoint_id, event_key, received_at, status, reason, lead_id, payload, sms_consent, decided_by, decided_at)
  on public.intake_events to authenticated;

-- ---- 3. Leads and their feed ------------------------------------------------------------------------
alter table public.leads add column if not exists provider        text;
alter table public.leads add column if not exists provider_ref    text;
alter table public.leads add column if not exists parse_status    text;
alter table public.leads add column if not exists intake_event_id uuid;
-- the checks without a scan of the big table under a lock; validated in 20261108210200
alter table public.leads add constraint leads_provider_check check (provider ~ '^[a-z][a-z0-9_]{0,29}$') not valid;
alter table public.leads add constraint leads_provider_ref_check check (char_length(provider_ref) <= 120) not valid;
alter table public.leads add constraint leads_parse_status_check check (parse_status in ('ok', 'needs_review')) not valid;
-- the unique (company, provider, provider_ref) index is built concurrently in 20261108210100 (leads is big, rule 16)

-- not valid: no scan of the big table under a lock; validated in 20261108210200
alter table public.activities drop constraint if exists activities_kind_check;
alter table public.activities add constraint activities_kind_check
  check (kind in ('call', 'sms', 'email', 'marketplace', 'reply', 'status', 'assigned', 'edited', 'intake')) not valid;

-- ---- 4. The main person keeps Russian (was en / es only) ------------------------------------------------
create or replace function app.add_lead_main_person(p_lead public.leads)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_k int := 0;
begin
  if coalesce(trim(p_lead.contact_name), '') = '' and coalesce(trim(p_lead.phone), '') = '' and position('@' in coalesce(p_lead.email, '')) <= 1 then
    return null;
  end if;
  insert into public.contacts (company_id, lead_id, name, role, is_primary, phone, email, preferred_language)
  values (p_lead.company_id, p_lead.id, coalesce(nullif(trim(p_lead.contact_name), ''), '—'), 'main', true,
          nullif(trim(p_lead.phone), ''), case when position('@' in coalesce(p_lead.email, '')) > 1 then trim(p_lead.email) end,
          case when p_lead.language in ('en', 'es', 'ru') then p_lead.language end)
  returning id into v_id;
  if coalesce(trim(p_lead.phone), '') <> '' then
    insert into public.contact_phones (company_id, contact_id, number, label, is_primary, position)
    values (p_lead.company_id, v_id, trim(p_lead.phone), 'mobile', true, 0);
    v_k := 1;
  end if;
  if coalesce(trim(p_lead.phone2), '') <> '' and app.phone_key(p_lead.phone2) is distinct from app.phone_key(p_lead.phone) then
    insert into public.contact_phones (company_id, contact_id, number, label, is_primary, position)
    values (p_lead.company_id, v_id, trim(p_lead.phone2), coalesce(p_lead.phone2_label, 'home'), v_k = 0, v_k);
  end if;
  if position('@' in coalesce(p_lead.email, '')) > 1 then
    insert into public.contact_emails (company_id, contact_id, address, is_primary, position)
    values (p_lead.company_id, v_id, trim(p_lead.email), true, 0);
  end if;
  return v_id;
end;
$$;
revoke all on function app.add_lead_main_person(public.leads) from public, anon, authenticated;

-- ---- 5. Helpers ---------------------------------------------------------------------------------------
create or replace function app.sha256_hex(p text)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex');
$$;
revoke all on function app.sha256_hex(text) from public, anon, authenticated;

-- a text field of the request: trimmed, control characters out, cut to the limit, empty → null
create or replace function app.intake_text(p jsonb, p_key text, p_max int)
returns text language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(coalesce(p ->> p_key, ''), '[[:cntrl:]]+', ' ', 'g')), p_max), '');
$$;
revoke all on function app.intake_text(jsonb, text, int) from public, anon, authenticated;

-- the person a new lead goes to: the company's choice if still an active staff member (docs/14 §6.4), else the owner
create or replace function app.intake_assignee(p_company uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select m.user_id from public.companies c join public.memberships m on m.company_id = c.id and m.user_id = c.lead_default_assignee_id
      where c.id = p_company and m.status = 'active' and m.deleted_at is null and m.role <> 'subcontractor'),
    (select m.user_id from public.memberships m where m.company_id = p_company and m.role = 'owner' and m.status = 'active'
        and m.deleted_at is null order by m.created_at limit 1));
$$;
revoke all on function app.intake_assignee(uuid) from public, anon, authenticated;

-- an open lead of the same person (phone or email) received ≤ 30 days ago
create or replace function app.intake_open_lead(p_company uuid, p_phone text, p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select l.id from public.leads l
   where l.company_id = p_company and l.deleted_at is null and l.archived_at is null
     and l.status not in ('won', 'lost', 'declined', 'archived') and l.received_at > now() - interval '30 days'
     and ((app.phone_key(p_phone) is not null and app.phone_key(l.phone) = app.phone_key(p_phone))
       or (p_email is not null and lower(btrim(l.email)) = p_email))
   order by l.received_at desc limit 1;
$$;
revoke all on function app.intake_open_lead(uuid, text, text) from public, anon, authenticated;

-- a client of this company with this phone or email (its people)
create or replace function app.intake_customer(p_company uuid, p_phone text, p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select c.customer_id from public.contacts c
   where c.company_id = p_company and c.customer_id is not null and c.deleted_at is null
     and ((app.phone_key(p_phone) is not null and app.phone_key(p_phone) in (select app.contact_phone_keys(c.id)))
       or (p_email is not null and p_email in (select app.contact_email_keys(c.id))))
   order by c.created_at limit 1;
$$;
revoke all on function app.intake_customer(uuid, text, text) from public, anon, authenticated;

-- ---- 6. A lead from a request (the pipeline's steps 2–6, docs/14 §4) -----------------------------------
-- p_payload is the request as the Edge Function cleaned it: name, phone, email, address, city, state, zip, service,
-- message, language, provider, provider_ref, cost_cents, utm {}. Returns {status, lead_id}.
create or replace function app.intake_make_lead(p_ep public.intake_endpoints, p_event uuid, p_payload jsonb, p_consent boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := app.intake_text(p_payload, 'phone', 40);
  v_email text := lower(app.intake_text(p_payload, 'email', 254));
  v_lang text := lower(app.intake_text(p_payload, 'language', 5));
  v_cost bigint;
  v_open uuid; v_lead uuid; v_parse text := 'ok';
  v_provider text := lower(app.intake_text(p_payload, 'provider', 30));
begin
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := null; end if;
  if app.phone_key(v_phone) is null then v_phone := null; end if;
  if v_phone is null and v_email is null then
    return jsonb_build_object('status', 'invalid', 'reason', 'no_contact');
  end if;
  if v_lang is null or v_lang not in ('en', 'es', 'ru') then
    select c.doc_language into v_lang from public.companies c where c.id = p_ep.company_id;
  end if;
  if v_provider is not null and v_provider !~ '^[a-z][a-z0-9_]{0,29}$' then v_provider := null; v_parse := 'needs_review'; end if;
  -- a price from the provider: whole cents, $0..$500; anything else → no price, the lead marked for review
  if p_payload ? 'cost_cents' then
    begin
      v_cost := (p_payload ->> 'cost_cents')::bigint;
    exception when others then v_cost := null;
    end;
    if v_cost is null or v_cost < 0 or v_cost > 50000 or (p_payload ->> 'cost_cents') !~ '^\d+$' then
      v_cost := null; v_parse := 'needs_review';
    end if;
  end if;

  -- the provider's lead already came (a replay with another event key): the same lead, nothing new
  if v_provider is not null and app.intake_text(p_payload, 'provider_ref', 120) is not null then
    select l.id into v_open from public.leads l
     where l.company_id = p_ep.company_id and l.provider = v_provider and l.provider_ref = app.intake_text(p_payload, 'provider_ref', 120)
       and l.deleted_at is null;
    if v_open is not null then
      return jsonb_build_object('status', 'merged', 'lead_id', v_open, 'reason', 'provider_ref');
    end if;
  end if;

  -- the same person's open lead: one feed event (≤ 3 a day), nothing else changes on it
  v_open := app.intake_open_lead(p_ep.company_id, v_phone, v_email);
  if v_open is not null then
    if (select count(*) from public.activities a where a.company_id = p_ep.company_id and a.subject_type = 'lead'
          and a.subject_id = v_open and a.kind = 'intake' and a.at > now() - interval '1 day') < 3 then
      insert into public.activities (company_id, subject_type, subject_id, kind, direction, body, meta, actor_id)
      values (p_ep.company_id, 'lead', v_open, 'intake', 'in', app.intake_text(p_payload, 'message', 2000),
              jsonb_build_object('event', p_event::text, 'unconfirmed', '1', 'endpoint', p_ep.kind), null);
      return jsonb_build_object('status', 'merged', 'lead_id', v_open);
    end if;
    return jsonb_build_object('status', 'merged', 'lead_id', v_open, 'reason', 'repeat_cap');
  end if;

  insert into public.leads (company_id, source_id, service_category_id, customer_id, contact_name, phone, email,
                            address_line1, address_city, address_state, address_zip, service_requested, message, language,
                            utm, assigned_to, provider, provider_ref, parse_status, intake_event_id, cost_origin)
  values (p_ep.company_id, p_ep.source_id,
          coalesce(p_ep.service_category_id, (select s.id from public.service_categories s
             where s.company_id = p_ep.company_id and s.archived_at is null
               and s.id::text = app.intake_text(p_payload, 'category_id', 36))),
          app.intake_customer(p_ep.company_id, v_phone, v_email),
          app.intake_text(p_payload, 'name', 120), v_phone, v_email,
          app.intake_text(p_payload, 'address', 200), app.intake_text(p_payload, 'city', 80),
          upper(app.intake_text(p_payload, 'state', 2)), app.intake_text(p_payload, 'zip', 10),
          app.intake_text(p_payload, 'service', 120), app.intake_text(p_payload, 'message', 2000), v_lang,
          case when jsonb_typeof(p_payload -> 'utm') = 'object' then
            (select jsonb_object_agg(k, left(v, 200)) from jsonb_each_text(p_payload -> 'utm') u(k, v)
              where k in ('utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'landing_page', 'referrer'))
          end,
          app.intake_assignee(p_ep.company_id), v_provider,
          case when v_provider is not null then app.intake_text(p_payload, 'provider_ref', 120) end,
          v_parse, p_event, case when v_cost is not null then 'provider' end)
  returning id into v_lead;
  if v_cost is not null and v_cost > 0 then
    insert into public.lead_costs (lead_id, company_id, cost_cents, origin) values (v_lead, p_ep.company_id, v_cost, 'provider');
  end if;
  -- the person agreed to texts in the form (the box is shown only when the company turned it on)
  if p_consent then
    update public.contacts set sms_consent_status = 'opted_in'
     where company_id = p_ep.company_id and lead_id = v_lead and is_primary and deleted_at is null;
  end if;
  return jsonb_build_object('status', 'accepted', 'lead_id', v_lead);
end;
$$;
revoke all on function app.intake_make_lead(public.intake_endpoints, uuid, jsonb, boolean) from public, anon, authenticated;

-- ---- 7. The pipeline (service_role: the Edge Function) ------------------------------------------------
-- p_kind: the way in the caller came by ('form' / 'webhook'); a form token never opens a webhook and back.
-- p_checks: what the Edge Function found — {"bot": bool, "captcha": "ok" | "fail" | "none", "consent": bool,
-- "consent_version": text}. A bot or a failed captcha is kept without its fields (counts for the limits).
create or replace function app.intake_lead(p_kind text, p_token_hash text, p_event_key text, p_payload_hash text,
                                           p_ip_hash text, p_payload jsonb, p_checks jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ep public.intake_endpoints;
  v_old public.intake_events;
  v_id uuid;
  v_status text; v_reason text; v_res jsonb; v_lead uuid;
  v_consent boolean;
begin
  select e.* into ep from public.intake_endpoints e join public.companies c on c.id = e.company_id
   where e.token_hash = p_token_hash and e.kind = p_kind and e.enabled and e.deleted_at is null and c.closed_at is null;
  if ep.id is null then
    return jsonb_build_object('status', 'unknown');
  end if;
  if p_event_key is null or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' or char_length(p_event_key) not between 1 and 200 then
    return jsonb_build_object('status', 'invalid', 'reason', 'bad_key');
  end if;
  -- one request of a company at a time: the limits count what the previous one wrote
  perform pg_advisory_xact_lock(hashtextextended('intake:' || ep.company_id::text, 0));

  select * into v_old from public.intake_events where endpoint_id = ep.id and event_key = p_event_key;
  if v_old.id is not null then
    if v_old.payload_hash <> p_payload_hash then
      return jsonb_build_object('status', 'invalid', 'reason', 'key_reuse');
    end if;
    return jsonb_build_object('status', v_old.status, 'event_id', v_old.id, 'repeat', true);
  end if;

  v_consent := ep.sms_consent_enabled and coalesce(p_checks ->> 'consent', '') = 'true';
  if coalesce(p_checks ->> 'bot', '') = 'true' then
    v_status := 'rejected'; v_reason := 'bot';
  elsif ep.captcha_required and coalesce(p_checks ->> 'captcha', 'none') <> 'ok' then
    v_status := 'rejected'; v_reason := 'captcha';
  elsif jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    v_status := 'invalid'; v_reason := 'not_object';
  elsif octet_length(p_payload::text) > 16384 then
    v_status := 'invalid'; v_reason := 'too_big';
  elsif p_kind = 'form' and (p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$') then
    v_status := 'rejected'; v_reason := 'no_ip';
  elsif (select count(*) from public.intake_events x where x.endpoint_id = ep.id
          and x.received_at > now() - interval '1 day') >= 10 * ep.daily_limit then
    v_status := 'rejected'; v_reason := 'flood';            -- past ten days' worth in a day: not even kept
  elsif p_ip_hash is not null and (select count(*) from public.intake_events x where x.company_id = ep.company_id
          and x.ip_hash = p_ip_hash and x.received_at > now() - interval '1 hour') >= 5 then
    v_status := 'held'; v_reason := 'ip_limit';
  elsif (select count(*) from public.intake_events x where x.endpoint_id = ep.id and x.status in ('accepted', 'merged', 'held')
          and x.received_at > now() - interval '1 day') >= ep.daily_limit then
    v_status := 'held'; v_reason := 'daily_limit';
  end if;

  insert into public.intake_events (company_id, endpoint_id, event_key, payload_hash, ip_hash, status, reason, payload,
                                    sms_consent, consent_text_version)
  values (ep.company_id, ep.id, p_event_key, p_payload_hash, p_ip_hash, coalesce(v_status, 'accepted'), v_reason,
          case when v_status in ('rejected', 'invalid') then null else p_payload end,
          v_consent, case when v_consent then left(p_checks ->> 'consent_version', 40) end)
  on conflict (endpoint_id, event_key) do nothing
  returning id into v_id;
  if v_id is null then  -- a parallel copy won (the lock is per company; this is belt and braces)
    select * into v_old from public.intake_events where endpoint_id = ep.id and event_key = p_event_key;
    return jsonb_build_object('status', v_old.status, 'event_id', v_old.id, 'repeat', true);
  end if;
  if v_status is not null then
    return jsonb_build_object('status', v_status, 'event_id', v_id);
  end if;

  v_res := app.intake_make_lead(ep, v_id, p_payload, v_consent);
  v_lead := (v_res ->> 'lead_id')::uuid;
  update public.intake_events
     set status = v_res ->> 'status', reason = v_res ->> 'reason', lead_id = v_lead,
         payload = case when v_res ->> 'status' = 'invalid' then null else payload end
   where id = v_id;
  return jsonb_build_object('status', v_res ->> 'status', 'event_id', v_id);
end;
$$;
revoke all on function app.intake_lead(text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant usage on schema app to service_role;
grant execute on function app.intake_lead(text, text, text, text, text, jsonb, jsonb) to service_role;

-- what the request page shows: the company's name, the kinds of work, the switches. Unknown and switched-off tokens
-- give the same empty answer.
create or replace function app.intake_form_info(p_token_hash text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('company', c.name, 'language', c.doc_language, 'captcha', e.captcha_required,
                              'sms_consent', e.sms_consent_enabled,
                              'categories', case when e.service_category_id is null then coalesce((
                                select jsonb_agg(jsonb_build_object('id', s.id, 'key', s.seed_key, 'name', s.name) order by s.position)
                                  from public.service_categories s where s.company_id = c.id and s.archived_at is null), '[]'::jsonb)
                                else '[]'::jsonb end)
      from public.intake_endpoints e join public.companies c on c.id = e.company_id
     where e.token_hash = p_token_hash and e.kind = 'form' and e.enabled and e.deleted_at is null and c.closed_at is null), '{}'::jsonb);
$$;
revoke all on function app.intake_form_info(text) from public, anon, authenticated;
grant execute on function app.intake_form_info(text) to service_role;

-- ---- 8. The company's settings (owner / admin) -----------------------------------------------------------
create or replace function app.intake_new_token(p_kind text)
returns text language sql volatile set search_path = '' as $$
  select case when p_kind = 'form' then 'f' || encode(extensions.gen_random_bytes(16), 'hex')
              else 'gxk_' || encode(extensions.gen_random_bytes(32), 'hex') end;
$$;
revoke all on function app.intake_new_token(text) from public, anon, authenticated;

-- a new way in; returns {id, token}: the webhook key is shown only here (and after a rotation), the form link always
create or replace function public.intake_endpoint_create(p_company_id uuid, p_kind text, p_source_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token text; v_id uuid;
begin
  if not app.has_role(p_company_id, array['owner', 'admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind not in ('form', 'webhook') then raise exception 'bad kind' using errcode = '22023'; end if;
  if (select count(*) from public.intake_endpoints where company_id = p_company_id and deleted_at is null) >= 10 then
    raise exception 'too many ways in' using errcode = '54000';
  end if;
  v_token := app.intake_new_token(p_kind);
  insert into public.intake_endpoints (company_id, kind, token_hash, public_token, token_hint, source_id)
  values (p_company_id, p_kind, app.sha256_hex(v_token), case when p_kind = 'form' then v_token end, right(v_token, 4), p_source_id)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;
revoke all on function public.intake_endpoint_create(uuid, text, uuid) from public, anon;
grant execute on function public.intake_endpoint_create(uuid, text, uuid) to authenticated;

-- a new link / key: the old one stops at once
create or replace function public.intake_endpoint_rotate(p_endpoint_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ep public.intake_endpoints; v_token text;
begin
  select * into ep from public.intake_endpoints where id = p_endpoint_id and deleted_at is null for update;
  if ep.id is null or not app.has_role(ep.company_id, array['owner', 'admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_token := app.intake_new_token(ep.kind);
  update public.intake_endpoints
     set token_hash = app.sha256_hex(v_token), public_token = case when ep.kind = 'form' then v_token end,
         token_hint = right(v_token, 4), rotated_at = now()
   where id = ep.id;
  return jsonb_build_object('id', ep.id, 'token', v_token);
end;
$$;
revoke all on function public.intake_endpoint_rotate(uuid) from public, anon;
grant execute on function public.intake_endpoint_rotate(uuid) to authenticated;

-- the switches and links of a way in; null keeps a value (the category: p_clear_category)
create or replace function public.intake_endpoint_set(p_endpoint_id uuid, p_enabled boolean default null, p_source_id uuid default null,
  p_service_category_id uuid default null, p_clear_category boolean default false, p_captcha_required boolean default null,
  p_sms_consent_enabled boolean default null, p_daily_limit int default null, p_delete boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare ep public.intake_endpoints;
begin
  select * into ep from public.intake_endpoints where id = p_endpoint_id and deleted_at is null for update;
  if ep.id is null or not app.has_role(ep.company_id, array['owner', 'admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.intake_endpoints
     set source_id = coalesce(p_source_id, source_id),
         service_category_id = case when p_clear_category then null else coalesce(p_service_category_id, service_category_id) end,
         captcha_required = coalesce(p_captcha_required, captcha_required),
         sms_consent_enabled = coalesce(p_sms_consent_enabled, sms_consent_enabled),
         daily_limit = coalesce(p_daily_limit, daily_limit),
         deleted_at = case when p_delete then now() else deleted_at end,
         enabled = case when p_delete then false else coalesce(p_enabled, enabled) end
   where id = ep.id;
end;
$$;
revoke all on function public.intake_endpoint_set(uuid, boolean, uuid, uuid, boolean, boolean, boolean, int, boolean) from public, anon;
grant execute on function public.intake_endpoint_set(uuid, boolean, uuid, uuid, boolean, boolean, boolean, int, boolean) to authenticated;

-- a held request: «Accept» makes its lead the usual way, «Reject» closes it. Owner / admin / office.
create or replace function public.intake_event_decide(p_event_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ev public.intake_events; ep public.intake_endpoints; v_res jsonb;
begin
  select * into ev from public.intake_events where id = p_event_id for update;
  if ev.id is null or not app.has_role(ev.company_id, array['owner', 'admin', 'office']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.companies c where c.id = ev.company_id and c.closed_at is not null) then
    raise exception 'company closed' using errcode = '42501';
  end if;
  if ev.status <> 'held' then
    return jsonb_build_object('status', ev.status, 'lead_id', ev.lead_id);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('intake:' || ev.company_id::text, 0));
  if not p_accept then
    update public.intake_events set status = 'rejected', reason = 'by_hand', decided_by = auth.uid(), decided_at = now(), payload = null
     where id = ev.id;
    return jsonb_build_object('status', 'rejected');
  end if;
  select * into ep from public.intake_endpoints where id = ev.endpoint_id;
  v_res := app.intake_make_lead(ep, ev.id, ev.payload, ev.sms_consent);
  update public.intake_events
     set status = v_res ->> 'status', reason = v_res ->> 'reason', lead_id = (v_res ->> 'lead_id')::uuid,
         decided_by = auth.uid(), decided_at = now()
   where id = ev.id;
  return v_res;
end;
$$;
revoke all on function public.intake_event_decide(uuid, boolean) from public, anon;
grant execute on function public.intake_event_decide(uuid, boolean) to authenticated;

-- ---- 9. Keeping (spec 34 §3а п.12): fields of a refused or held request — 30 days, of an accepted one — 90 days;
--         the row itself (status, consent and its time) stays for the reports and as the consent record.
create or replace function app.purge_intake_events()
returns void language sql security definer set search_path = '' as $$
  update public.intake_events set payload = null
   where payload is not null
     and ((status in ('held', 'rejected', 'invalid') and received_at < now() - interval '30 days')
       or (status in ('accepted', 'merged') and received_at < now() - interval '90 days'));
  -- the consent record keeps its IP hash (who agreed, from where)
  update public.intake_events set ip_hash = null where ip_hash is not null and not sms_consent and received_at < now() - interval '30 days';
$$;
revoke all on function app.purge_intake_events() from public, anon, authenticated;

do $$
begin
  if to_regnamespace('cron') is not null then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = $1' using 'intake-purge';
    execute $q$select cron.schedule('intake-purge', '41 4 * * *', 'select app.purge_intake_events()')$q$;
  end if;
end;
$$;
