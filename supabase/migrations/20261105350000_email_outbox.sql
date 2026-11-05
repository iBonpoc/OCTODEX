-- Почта П1a — the database side of «a copy of the signed contract to the client» (docs/specs/07-email.md §4, §7.1, §9).
-- Nothing leaves the database here: rows wait in public.email_outbox. Sending (edge function send-email, the pg_net
-- trigger, the secret in Vault, pg_cron retries) is П1b — after the platform has a domain (§10, В2; director 05.11).
--
-- 1. public.email_outbox — the queue and the journal at once. Clients never write it: only app.execute_estimate,
--    public.resend_signed_copy (security definer) and the service functions public.email_claim / public.email_finish
--    (service_role only, for the edge function).
-- 2. app.execute_estimate (S8b) is replaced in full (body of 20261105240000) plus one call: app.enqueue_signed_copy.
--    The automatic row is unique per (estimate, kind) and goes in with `on conflict do nothing`; any error of the queue
--    is caught, so a signature is never rolled back by mail (§9.3).
-- 3. The first status is decided here, where it can be tested now (§10 В3: the company setting is off by default):
--    autoSendSignedCopy off → skipped_off; no clean client email → skipped_no_email; over a limit → rate_limited;
--    otherwise queued. not_configured / expired / sending / sent / failed are set by the edge function (П1b).
-- 4. Limits (§9.1): per estimate — 3 manual repeats in all, not more than once in 10 minutes; per company — 20 a day;
--    the platform — 90 a day (below Resend's free 100 a day).
-- 5. public.reissue_estimate_link (§9.7): a signed estimate gets a new client link; the old one is revoked for good.

-- ---- 1. A clean single address (the same rules as cleanEmail in the app; §9.10) ------------------------------------
create or replace function app.clean_email(p text)
returns text language sql immutable set search_path = '' as $$
  select case
    when x is null or x = '' or length(x) > 254 then null
    -- ASCII only, one address: no spaces, CR/LF, commas, semicolons, «?» or angle brackets
    when x !~ '^[A-Za-z0-9.!#$%&''*+/=^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$' then null
    when x ~ '^\.|\.\.|\.@' then null
    else x
  end
  from (select trim(p) as x) s;
$$;
revoke all on function app.clean_email(text) from public, anon, authenticated;

-- The client's email: the main person of the estimate's client — their primary address, else the cached contacts.email.
-- Returns the address and who last set it (§9.7: the journal keeps who changed the client's email).
create or replace function app.estimate_client_email(p_estimate_id uuid, out email text, out set_by uuid)
language sql stable security definer set search_path = '' as $$
  select app.clean_email(coalesce(ce.address, c.email)), coalesce(ce.updated_by, ce.created_by, c.updated_by, c.created_by)
    from public.estimates e
    join public.customers cu on cu.id = e.customer_id
    join public.contacts c on c.id = cu.primary_contact_id and c.deleted_at is null
    left join lateral (select x.address, x.updated_by, x.created_by from public.contact_emails x
                        where x.contact_id = c.id and x.deleted_at is null
                        order by x.is_primary desc, x.position, x.created_at limit 1) ce on true
   where e.id = p_estimate_id;
$$;
revoke all on function app.estimate_client_email(uuid) from public, anon, authenticated;

-- ---- 2. The queue -----------------------------------------------------------------------------------------------------
create table if not exists public.email_outbox (
  id            uuid primary key default public.uuid_generate_v7(),
  company_id    uuid not null references public.companies (id),
  estimate_id   uuid not null references public.estimates (id),
  kind          text not null check (kind in ('signed_copy')),
  to_email      text check (to_email is null or length(to_email) <= 254),   -- set by email_claim at sending time
  to_email_set_by uuid,                                                      -- who last changed that address
  lang          text not null default 'en' check (lang in ('en', 'es', 'ru')),
  status        text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped_no_email',
                                                        'skipped_off', 'not_configured', 'rate_limited', 'expired')),
  attempts      integer not null default 0 check (attempts between 0 and 3),
  provider_id   text check (provider_id is null or length(provider_id) <= 128),
  error         text check (error is null or length(error) <= 64),          -- a response code only, never an address
  requested_by  uuid references public.users (id),                          -- null: sent automatically on signing
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  sent_at       timestamptz
);
-- one automatic copy per contract; manual repeats are separate rows
create unique index if not exists email_outbox_auto_once on public.email_outbox (estimate_id, kind) where requested_by is null;
create index if not exists email_outbox_estimate_idx on public.email_outbox (estimate_id, created_at);
create index if not exists email_outbox_company_day_idx on public.email_outbox (company_id, created_at);
create index if not exists email_outbox_day_idx on public.email_outbox (created_at);

alter table public.email_outbox enable row level security;
alter table public.email_outbox force row level security;
revoke all on public.email_outbox from anon, authenticated;
grant select on public.email_outbox to authenticated;
-- the director and the office read the journal; a tech sees the status only through the estimate (§4, §9.12)
create policy email_outbox_select on public.email_outbox for select to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office']));

-- ---- 3. Limits and the first status -----------------------------------------------------------------------------------
create or replace function app.email_company_daily_limit() returns integer language sql immutable set search_path = '' as $$ select 20 $$;
create or replace function app.email_platform_daily_limit() returns integer language sql immutable set search_path = '' as $$ select 90 $$;
revoke all on function app.email_company_daily_limit() from public, anon, authenticated;
revoke all on function app.email_platform_daily_limit() from public, anon, authenticated;

-- Rows that may still reach a mailbox count toward the daily limits; skipped / limited ones do not.
create or replace function app.email_over_limit(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.email_outbox
           where company_id = p_company_id and created_at > now() - interval '24 hours'
             and status in ('queued', 'sending', 'sent', 'failed')) >= app.email_company_daily_limit()
      or (select count(*) from public.email_outbox
           where created_at > now() - interval '24 hours'
             and status in ('queued', 'sending', 'sent', 'failed')) >= app.email_platform_daily_limit();
$$;
revoke all on function app.email_over_limit(uuid) from public, anon, authenticated;

-- The automatic copy after both signatures. Never raises: mail must not roll a signature back (§9.3).
create or replace function app.enqueue_signed_copy(p_estimate_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.estimates; v_status text; v_lang text;
begin
  select * into e from public.estimates where id = p_estimate_id;
  if not found then
    return;
  end if;
  v_lang := app.estimate_doc_language(e.id);
  v_status := case
    when coalesce((select (estimate_settings ->> 'autoSendSignedCopy')::boolean from public.companies where id = e.company_id), false) is not true
      then 'skipped_off'
    when (select email from app.estimate_client_email(e.id)) is null then 'skipped_no_email'
    when app.email_over_limit(e.company_id) then 'rate_limited'
    else 'queued' end;
  insert into public.email_outbox (company_id, estimate_id, kind, lang, status, requested_by)
  values (e.company_id, e.id, 'signed_copy', case when v_lang in ('en', 'es', 'ru') then v_lang else 'en' end, v_status, null)
  on conflict (estimate_id, kind) where requested_by is null do nothing;
exception when others then
  raise warning 'email_outbox: signed copy not queued for % (%)', p_estimate_id, sqlstate;
end;
$$;
revoke all on function app.enqueue_signed_copy(uuid) from public, anon, authenticated;

-- ---- 4. Both signed: the deal (S8b) — the body of 20261105240000 §7, plus the signed copy at the end ------------------
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
  -- the price is always recomputed from the signed version's lines (never trusted from the stored selection)
  select * into t from app.estimate_option_totals(v.id, o.id,
    coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(a.selection -> 'addon_ids', '[]')) x), '{}'));
  total := t.total; dep := t.deposit;
  -- the price the client signed must still hold (a locked version cannot change; this is the last line of defence)
  if a.selection ? 'total' and (a.selection ->> 'total')::bigint <> total then
    raise exception 'the signed total (%) no longer matches the estimate (%)', a.selection ->> 'total', total using errcode = '22023';
  end if;

  perform set_config('app.signing_estimate', e.id::text, true);
  update public.estimates set status = 'approved' where id = e.id;
  perform set_config('app.signing_estimate', '', true);
  if e.lead_id is not null then
    update public.leads set status = 'won', won_via = 'approval', customer_id = coalesce(customer_id, e.customer_id)
     where id = e.lead_id and status not in ('won', 'lost', 'declined', 'archived');   -- the same set as the app
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
  -- Почта П1a (S8c): the client's copy of the signed contract waits in the queue (07-email §3)
  perform app.enqueue_signed_copy(e.id);
  return v_job;
end;
$$;
revoke all on function app.execute_estimate(uuid, uuid, uuid) from public, anon, authenticated;

-- ---- 5. «Send again» — the director and the office (§3, §9.11) --------------------------------------------------------
create or replace function public.resend_signed_copy(p_estimate_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare e public.estimates; v_lang text; v_status text;
begin
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null for update;
  if not found or not app.has_role(e.company_id, array['owner', 'admin', 'office']) then
    raise exception 'only the director or the office sends the copy again' using errcode = '42501';
  end if;
  if e.status <> 'approved' then
    raise exception 'the contract is not signed by both sides (status %)', e.status using errcode = '22023';
  end if;
  if (select email from app.estimate_client_email(e.id)) is null then
    raise exception 'the client has no email' using errcode = '22023';
  end if;
  if exists (select 1 from public.email_outbox where estimate_id = e.id and kind = 'signed_copy'
                and created_at > now() - interval '10 minutes') then
    raise exception 'the copy was sent less than 10 minutes ago' using errcode = '22023';
  end if;
  if (select count(*) from public.email_outbox where estimate_id = e.id and kind = 'signed_copy' and requested_by is not null) >= 3 then
    raise exception 'the copy was already sent again 3 times' using errcode = '22023';
  end if;
  v_lang := app.estimate_doc_language(e.id);
  v_status := case when app.email_over_limit(e.company_id) then 'rate_limited' else 'queued' end;
  insert into public.email_outbox (company_id, estimate_id, kind, lang, status, requested_by)
  values (e.company_id, e.id, 'signed_copy', case when v_lang in ('en', 'es', 'ru') then v_lang else 'en' end, v_status, auth.uid());
  return v_status;
end;
$$;
revoke all on function public.resend_signed_copy(uuid) from public, anon;
grant execute on function public.resend_signed_copy(uuid) to authenticated;

-- ---- 6. For the edge function (П1b): take a row once, then write the result (§9.2, §9.5, §9.6) -------------------------
-- Takes the row atomically; a repeated webhook for the same row gets null and does nothing. A row older than 24 hours
-- is never sent (expired): connecting the key later does not send a pile of old contracts.
create or replace function public.email_claim(p_outbox_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.email_outbox; v_email text; v_by uuid;
begin
  update public.email_outbox set status = 'expired', updated_at = now()
   where id = p_outbox_id and status in ('queued', 'failed') and created_at <= now() - interval '24 hours';
  update public.email_outbox set status = 'sending', attempts = attempts + 1, updated_at = now()
   where id = p_outbox_id and status in ('queued', 'failed') and attempts < 3
   returning * into r;
  if not found then
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

-- p_status: sent | failed | not_configured. p_final: no retry (a 4xx from the provider, §9.5).
create or replace function public.email_finish(p_outbox_id uuid, p_status text, p_provider_id text default null,
                                               p_error text default null, p_final boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status = 'not_configured' then
    -- no platform key: final, the row is never sent later (§9.6)
    update public.email_outbox set status = 'not_configured', updated_at = now()
     where id = p_outbox_id and status in ('queued', 'sending');
  elsif p_status = 'sent' then
    update public.email_outbox set status = 'sent', provider_id = left(p_provider_id, 128), error = null, sent_at = now(), updated_at = now()
     where id = p_outbox_id and status = 'sending';
  elsif p_status = 'failed' then
    update public.email_outbox set status = 'failed', error = left(p_error, 64), updated_at = now(),
           attempts = case when p_final then 3 else attempts end
     where id = p_outbox_id and status = 'sending';
  else
    raise exception 'unknown mail status %', p_status using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.email_finish(uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.email_finish(uuid, text, text, text, boolean) to service_role;

-- Addresses are kept 2 years (§9.12); the daily run is set up with pg_cron in П1b.
create or replace function app.email_outbox_purge()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.email_outbox set to_email = null, to_email_set_by = null
   where to_email is not null and created_at < now() - interval '2 years';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function app.email_outbox_purge() from public, anon, authenticated;

-- ---- 7. A new client link for a signed estimate (§9.7) -----------------------------------------------------------------
-- The link went to the wrong address: the director or the office issues a new one; the old token is revoked for good.
-- An unsigned estimate keeps the old way: revoke_estimate_link, then send_estimate.
create or replace function public.reissue_estimate_link(p_estimate_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare e public.estimates; v_token text;
begin
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null for update;
  if not found or not app.has_role(e.company_id, array['owner', 'admin', 'office']) then
    raise exception 'only the director or the office issues a new link' using errcode = '42501';
  end if;
  if e.status not in ('awaiting_countersign', 'approved') then
    raise exception 'only a signed estimate gets a new link (status %); revoke and send it instead', e.status using errcode = '22023';
  end if;
  if e.public_token is not null then
    insert into public.revoked_link_tokens (token_hash, company_id, estimate_id)
    values (encode(sha256(convert_to(e.public_token, 'UTF8')), 'hex'), e.company_id, e.id)
    on conflict (token_hash) do nothing;
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  perform set_config('app.signing_estimate', e.id::text, true);
  update public.estimates set public_token = v_token, link_revoked_at = null where id = e.id;
  perform set_config('app.signing_estimate', '', true);
  insert into public.activities (company_id, subject_type, subject_id, kind, body, meta)
  values (e.company_id, 'estimate', e.id, 'edited', 'link reissued', jsonb_build_object('action', 'link_reissued'));
  return v_token;
end;
$$;
revoke all on function public.reissue_estimate_link(uuid) from public, anon;
grant execute on function public.reissue_estimate_link(uuid) to authenticated;
