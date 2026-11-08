-- Lead intake, hardening after the director's security check of #421 (docs/specs/34 §3д): no request is lost silently.
-- * Refused at once only by the trap field. A «bot» by the fill time only (< 3 s, a tab older than a day), no trusted IP
--   header (no_ip) or a link changed ≤ 30 days ago (old_link) → held with its fields: a person accepts or refuses.
-- * intake_events.net_hash — the HMAC of the IPv6 /48 (the function sends it in p_checks.net): a second, higher limit
--   (20 an hour per company) for a client that walks its whole site.
-- * intake_endpoints.prev_token_hash / prev_rotated_at — the old link of a rotation, kept 30 days for the above (forms only;
--   an old webhook key stops at once).
-- Rule 16: columns added; the functions keep their signatures (the deployed function of #421 still works: its «bot: true»
-- is the trap).
alter table public.intake_events add column if not exists net_hash text check (net_hash ~ '^[0-9a-f]{64}$');
create index if not exists intake_events_net_idx on public.intake_events (company_id, net_hash, received_at) where net_hash is not null;
alter table public.intake_endpoints add column if not exists prev_token_hash text check (prev_token_hash ~ '^[0-9a-f]{64}$');
alter table public.intake_endpoints add column if not exists prev_rotated_at timestamptz;
create index if not exists intake_endpoints_prev_token_idx on public.intake_endpoints (prev_token_hash) where prev_token_hash is not null;

create or replace function app.intake_lead(p_kind text, p_token_hash text, p_event_key text, p_payload_hash text,
                                           p_ip_hash text, p_payload jsonb, p_checks jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ep public.intake_endpoints;
  v_old public.intake_events;
  v_id uuid;
  v_status text; v_reason text; v_res jsonb; v_lead uuid;
  v_consent boolean;
  v_old_link boolean := false;
  v_bot text := coalesce(p_checks ->> 'bot', '');
  v_net text := p_checks ->> 'net';
begin
  select e.* into ep from public.intake_endpoints e join public.companies c on c.id = e.company_id
   where e.token_hash = p_token_hash and e.kind = p_kind and e.enabled and e.deleted_at is null and c.closed_at is null;
  if ep.id is null and p_kind = 'form' then
    -- a form link changed ≤ 30 days ago: its requests are held for a person to look at, never dropped silently.
    -- Not a webhook key: a key is changed because it leaked — the old one stops at once (T118).
    select e.* into ep from public.intake_endpoints e join public.companies c on c.id = e.company_id
     where e.prev_token_hash = p_token_hash and e.kind = p_kind and e.prev_rotated_at > now() - interval '30 days'
       and e.deleted_at is null and c.closed_at is null;
    v_old_link := ep.id is not null;
  end if;
  if ep.id is null then
    return jsonb_build_object('status', 'unknown');
  end if;
  if v_net is not null and v_net !~ '^[0-9a-f]{64}$' then v_net := null; end if;
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
  -- refused at once only by the trap field (a person never sees it); «true» is the trap of the first function (#421)
  if v_bot in ('trap', 'true') then
    v_status := 'rejected'; v_reason := 'bot';
  elsif ep.captcha_required and coalesce(p_checks ->> 'captcha', 'none') <> 'ok' then
    v_status := 'rejected'; v_reason := 'captcha';
  elsif jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    v_status := 'invalid'; v_reason := 'not_object';
  elsif octet_length(p_payload::text) > 16384 then
    v_status := 'invalid'; v_reason := 'too_big';
  elsif (select count(*) from public.intake_events x where x.endpoint_id = ep.id
          and x.received_at > now() - interval '1 day') >= 10 * ep.daily_limit then
    v_status := 'rejected'; v_reason := 'flood';            -- past ten days' worth in a day: not even kept
  elsif v_old_link then
    v_status := 'held'; v_reason := 'old_link';
  elsif v_bot = 'time' then
    v_status := 'held'; v_reason := 'too_fast';             -- only the fill time says «bot»: a person may be wrongly judged
  elsif p_kind = 'form' and (p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$') then
    v_status := 'held'; v_reason := 'no_ip';                -- no trusted IP header: the limits cannot count it — a person decides
  elsif v_net is not null and (select count(*) from public.intake_events x where x.company_id = ep.company_id
          and x.net_hash = v_net and x.received_at > now() - interval '1 hour') >= 20 then
    v_status := 'held'; v_reason := 'net_limit';            -- one IPv6 /48 (a whole site) — a higher bar than one address
  elsif p_ip_hash is not null and (select count(*) from public.intake_events x where x.company_id = ep.company_id
          and x.ip_hash = p_ip_hash and x.received_at > now() - interval '1 hour') >= 5 then
    v_status := 'held'; v_reason := 'ip_limit';
  elsif (select count(*) from public.intake_events x where x.endpoint_id = ep.id and x.status in ('accepted', 'merged', 'held')
          and x.received_at > now() - interval '1 day') >= ep.daily_limit then
    v_status := 'held'; v_reason := 'daily_limit';
  end if;

  insert into public.intake_events (company_id, endpoint_id, event_key, payload_hash, ip_hash, net_hash, status, reason, payload,
                                    sms_consent, consent_text_version)
  values (ep.company_id, ep.id, p_event_key, p_payload_hash, p_ip_hash, v_net, coalesce(v_status, 'accepted'), v_reason,
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
grant execute on function app.intake_lead(text, text, text, text, text, jsonb, jsonb) to service_role;

-- a rotation keeps the old link's hash 30 days (its requests are held, not lost)
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
     set prev_token_hash = ep.token_hash, prev_rotated_at = now(),
         token_hash = app.sha256_hex(v_token), public_token = case when ep.kind = 'form' then v_token end,
         token_hint = right(v_token, 4), rotated_at = now()
   where id = ep.id;
  return jsonb_build_object('id', ep.id, 'token', v_token);
end;
$$;
revoke all on function public.intake_endpoint_rotate(uuid) from public, anon;
grant execute on function public.intake_endpoint_rotate(uuid) to authenticated;

-- the page of an old link (≤ 30 days) still opens: its requests are held, not lost
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
     where e.kind = 'form' and e.enabled and e.deleted_at is null and c.closed_at is null
       and (e.token_hash = p_token_hash or (e.prev_token_hash = p_token_hash and e.prev_rotated_at > now() - interval '30 days'))
     limit 1), '{}'::jsonb);
$$;
revoke all on function app.intake_form_info(text) from public, anon, authenticated;
grant execute on function app.intake_form_info(text) to service_role;
