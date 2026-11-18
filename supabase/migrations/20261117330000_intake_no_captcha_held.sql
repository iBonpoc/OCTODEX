-- #2012: a form that asks for a captcha never loses a request (spec 34 §3д «ни одна заявка не теряется молча»).
-- The public page has no captcha widget yet (founder's question В3), so its requests carry no captcha answer.
-- Before: captcha_required + no answer → rejected / captcha with the fields thrown away, the client told «ok».
-- Now:    no answer ('none') → held / no_captcha with its fields (the journal's «Принять / Отклонить»);
--         a failed answer ('fail', a widget that said «bot») → rejected / captcha, as before.
-- Same signature and grants (rule 16: nothing dropped or renamed); the limits (flood, IP, net, daily) still come first
-- or count the held ones as before.
revoke all on function app.intake_lead(text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;

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
     where e.prev_token_hash = p_token_hash and e.kind = p_kind and e.prev_rotated_at > now() - interval '30 days' and e.enabled
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
  elsif ep.captcha_required and coalesce(p_checks ->> 'captcha', 'none') = 'fail' then
    v_status := 'rejected'; v_reason := 'captcha';           -- a widget answered and the check failed: a bot
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
  elsif ep.captcha_required and coalesce(p_checks ->> 'captcha', 'none') <> 'ok' then
    -- last: a sharper reason (too fast, no IP, one address, the day's limit) tells the person more than «no captcha»
    v_status := 'held'; v_reason := 'no_captcha';           -- no captcha answer (the page has no widget yet, В3): a person decides
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
