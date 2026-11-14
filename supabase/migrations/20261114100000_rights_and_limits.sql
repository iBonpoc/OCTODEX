-- Rights and limits, review of 14.11 (rule 16: every function keeps its signature; nothing is dropped or renamed).
-- 1) app.intake_lead: the old link of a rotated form is accepted only while the form is on.
-- 2) expenses: outside the office a person's own expense moves only to a job they may add it to (as on insert).
-- 3) trash_items: a row is locked only after its company is the caller's.
-- 4) the client's name ≤ 120 characters and every signature ≤ 64 KB: in app.estimate_client_accept and
--    sign_estimate_on_site (22023, hint signature_too_long; after the «repeat» answer) and as
--    checks on the tables (NOT VALID: the rows already there are kept; every door that writes a signature is held).
-- 6) the API roles create nothing in the schemas public, app, extensions.
-- 5) refunds: the key of a refund is the company's own ('octo:<company>:<key>'); a row with the older 'octo:<key>' is still
--    found by its retry (the rows made before this migration).

-- ---- 1. Lead intake -------------------------------------------------------------------------------------------------------
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

-- ---- 2. Expenses ----------------------------------------------------------------------------------------------------------
-- A trigger, not the policy: only a CHANGE of job_id is checked (an expense already on a job keeps its other edits).
-- is_staff (owner, admin, office, sales) as on insert: sales see every job and keep their own expenses (docs/specs/13 «Продажи»).
create or replace function app.tg_expense_job_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.job_id is not null and new.job_id is distinct from old.job_id and auth.uid() is not null
     and not app.is_staff(new.company_id) and not app.is_job_assignee(new.job_id) then
    raise exception 'an expense goes only to a job of your own' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_expense_job_guard() from public, anon, authenticated;
drop trigger if exists t12_expense_job_guard on public.expenses;
create trigger t12_expense_job_guard before update of job_id on public.expenses
  for each row execute function app.tg_expense_job_guard();

-- ---- 3. Trash -------------------------------------------------------------------------------------------------------------
create or replace function public.trash_items(p_kind text, p_ids uuid[])
returns table (id uuid, ok boolean, reason text) language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_id  uuid;
  v_why text;
  n     int;
  v_co  uuid;
begin
  if auth.uid() is null then raise exception 'trash: sign in' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('estimate', 'task', 'expense', 'catalog_item', 'customer', 'lead') then
    raise exception 'trash: unknown kind %', p_kind using errcode = '22023';
  end if;
  if coalesce(cardinality(p_ids), 0) > 500 then raise exception 'trash: at most 500 at once' using errcode = '22023'; end if;
  foreach v_id in array coalesce(p_ids, '{}'::uuid[]) loop
    id := v_id; ok := false; reason := null;
    -- the company first, without a lock: a row of a company the caller is not in is neither locked nor written
    v_co := case p_kind
      when 'estimate' then (select x.company_id from public.estimates x where x.id = v_id)
      when 'task' then (select x.company_id from public.tasks x where x.id = v_id)
      when 'expense' then (select x.company_id from public.expenses x where x.id = v_id)
      when 'catalog_item' then (select x.company_id from public.catalog_items x where x.id = v_id)
      when 'customer' then (select x.company_id from public.customers x where x.id = v_id)
      when 'lead' then (select x.company_id from public.leads x where x.id = v_id)
    end;
    if v_co is null or not app.is_member(v_co) then
      reason := 'noRight';
      return next;
      continue;
    end if;
    -- the row is locked before its rule: a new estimate / job of this client or lead (its key check takes a share lock on
    -- the row) waits for us, and a send of the estimate at the same moment too — the rule and the write see one state (#752 №4)
    case p_kind
      when 'estimate' then perform 1 from public.estimates x where x.id = v_id for update;
      when 'task' then perform 1 from public.tasks x where x.id = v_id for update;
      when 'expense' then perform 1 from public.expenses x where x.id = v_id for update;
      when 'catalog_item' then perform 1 from public.catalog_items x where x.id = v_id for update;
      when 'customer' then perform 1 from public.customers x where x.id = v_id for update;
      when 'lead' then perform 1 from public.leads x where x.id = v_id for update;
    end case;
    v_why := app.trash_reason(p_kind, v_id, true);
    if v_why is not null then
      reason := v_why;
    else
      begin
        case p_kind
          -- the estimate's rule again in the write: sent at the same moment — not deleted (no lock window)
          when 'estimate' then update public.estimates x set deleted_at = now() where x.id = v_id and x.deleted_at is null and x.status = 'draft' and x.sent_version_id is null;
          when 'task' then update public.tasks x set deleted_at = now() where x.id = v_id and x.deleted_at is null;
          when 'expense' then update public.expenses x set deleted_at = now() where x.id = v_id and x.deleted_at is null;
          when 'catalog_item' then update public.catalog_items x set deleted_at = now(), is_active = false where x.id = v_id and x.deleted_at is null;
          when 'customer' then update public.customers x set deleted_at = now() where x.id = v_id and x.deleted_at is null;
          when 'lead' then update public.leads x set deleted_at = now() where x.id = v_id and x.deleted_at is null;
        end case;
        get diagnostics n = row_count;
        if n = 1 then
          perform app.trash_note_row(p_kind, v_id);   -- definer: the trigger of the entry does not fire here (current_user is the owner)
          ok := true;
        elsif exists (select 1 from public.trash_entries t where t.kind = p_kind and t.object_id = v_id and t.restored_at is null) then
          ok := true;                                -- a replay: in the Trash already
        else
          reason := 'refused';                       -- changed meanwhile (sent at the same moment)
        end if;
      exception when others then
        reason := case when sqlerrm like 'trash:%' then split_part(substr(sqlerrm, 7), ' ', 1)
                       when sqlerrm like '%do_not_service%' then 'doNotService' else 'refused' end;
      end;
    end if;
    return next;
  end loop;
end;
$$;
revoke all on function public.trash_items(text, uuid[]) from public, anon;
grant execute on function public.trash_items(text, uuid[]) to authenticated;

-- ---- 4. The client's signature --------------------------------------------------------------------------------------------
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
  -- after the repeat: a signature already made, sent again from the queue, still answers «repeat»
  if char_length(trim(p_signer)) > 120 or octet_length(p_svg) > 65536 then
    raise exception 'signer name or signature is too long' using errcode = '22023', hint = 'signature_too_long';
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
revoke all on function app.estimate_client_accept(uuid, text, uuid, uuid[], text, text, boolean, text, uuid, uuid) from public, anon, authenticated;

-- the quick estimate's on-site signature (its version with the total calls this one): the same size, its own answer
create or replace function public.sign_estimate_on_site(p_estimate_id uuid, p_signer text, p_svg text)
returns text language plpgsql security definer set search_path = '' as $$
declare e public.estimates; v public.estimate_versions; o public.estimate_options; t record;
begin
  if coalesce(trim(p_signer), '') = '' or coalesce(p_svg, '') = '' then
    raise exception 'name and signature are required' using errcode = '22023';
  end if;
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null for update;
  if not found or not app.is_staff(e.company_id) and not app.can_read_estimate(e.id) then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  if not app.can_sign_contracts(e.company_id) then
    -- the client signs on an employee's device: only someone who may sign contracts (security-check 05.11)
    raise exception 'on-site signature requires an employee who may sign contracts' using errcode = '42501';
  end if;
  if e.status in ('awaiting_countersign', 'approved') then
    return e.status;                                      -- repeat: nothing doubles
  end if;
  -- after the repeat (a queued repeat answers as before), before the insert (no bare check_violation of the table)
  if char_length(trim(p_signer)) > 120 or octet_length(p_svg) > 65536 then
    raise exception 'signer name or signature is too long' using errcode = '22023', hint = 'signature_too_long';
  end if;
  if e.status not in ('sent', 'viewed') then
    raise exception 'estimate is not open for approval (status %)', e.status using errcode = '22023';
  end if;
  if e.link_revoked_at is not null then
    raise exception 'the estimate link was revoked' using errcode = '22023';
  end if;
  select * into v from public.estimate_versions where id = e.sent_version_id;
  if not found or v.locked_at is null then
    raise exception 'the estimate was not sent (no locked version)' using errcode = '22023';
  end if;
  select * into o from public.estimate_options where version_id = v.id and deleted_at is null order by position, created_at limit 1;
  select * into t from app.estimate_option_totals(v.id, o.id, '{}');
  insert into public.estimate_approvals (company_id, estimate_id, version_id, option_id, decision, signer_name, signature_svg,
                                         esign_consent, channel, selection, party, document_hash, signer_user_id)
  values (e.company_id, e.id, v.id, o.id, 'approved', trim(p_signer), p_svg, true, 'on_site',
          jsonb_build_object('addon_ids', '[]'::jsonb, 'subtotal', t.subtotal, 'discount', t.discount, 'tax', t.tax, 'total', t.total, 'deposit', t.deposit),
          'customer', encode(sha256(convert_to(coalesce(v.calc_inputs::text, '') || coalesce(v.id::text, ''), 'UTF8')), 'hex'),
          auth.uid());                                    -- whose device the client signed on
  perform set_config('app.signing_estimate', e.id::text, true);
  update public.estimates set status = 'awaiting_countersign' where id = e.id;
  perform set_config('app.signing_estimate', '', true);
  return 'awaiting_countersign';
end;
$$;
revoke all on function public.sign_estimate_on_site(uuid, text, text) from public, anon;
grant execute on function public.sign_estimate_on_site(uuid, text, text) to authenticated;

alter table public.estimate_approvals drop constraint if exists estimate_approvals_sizes_check;
alter table public.estimate_approvals add constraint estimate_approvals_sizes_check
  check ((party <> 'customer' or char_length(signer_name) <= 120) and octet_length(signature_svg) <= 65536) not valid;
-- (the company's saved signature, member_signatures.svg, has its own limit since 20261105240000: ≤ 20,000)

-- ---- 5. Refund keys -------------------------------------------------------------------------------------------------------
create or replace function app.refund_key(p_company_id uuid, p_key text)
returns text language sql immutable set search_path = '' as $$
  select 'octo:' || p_company_id::text || ':' || p_key;
$$;
revoke all on function app.refund_key(uuid, text) from public, anon, authenticated;

-- a key already used: the same refund again (a double tap, a retry) — only by the same person for the same payment
create or replace function app.refund_by_key(p_user uuid, p_payment_id uuid, p_key text)
returns public.refunds language plpgsql stable security definer set search_path = '' as $$
declare r public.refunds;
begin
  select x.* into r from public.refunds x
   where x.company_id = (select p.company_id from public.payments p where p.id = p_payment_id)
     and (x.idempotency_key = app.refund_key(x.company_id, p_key)
          or (strpos(p_key, ':') = 0 and x.idempotency_key = 'octo:' || p_key))   -- the older form: a key had no ':'
   order by (x.idempotency_key = 'octo:' || p_key)
   limit 1;
  if r.id is not null and (r.payment_id <> p_payment_id or r.created_by is distinct from p_user) then
    raise exception 'key used' using errcode = '23505';
  end if;
  return r;
end;
$$;
revoke all on function app.refund_by_key(uuid, uuid, text) from public, anon, authenticated;

-- ---- 3. Cash, check, Zelle, financing, other: a record -----------------------------------------------------------------
create or replace function public.refund_record(p_payment_id uuid, p_amount_cents bigint, p_reason_kind text,
                                                p_reason text, p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  p      public.payments;
  r      public.refunds;
  v_tax  bigint;
begin
  r := app.refund_by_key(v_user, p_payment_id, p_key);
  if r.id is not null then
    return app.refund_json(r);
  end if;
  if p_amount_cents is null then
    raise exception 'refund_above_available' using errcode = 'check_violation';
  end if;
  p := app.refund_guard(v_user, p_payment_id, p_amount_cents, p_reason_kind, p_reason, p_key);
  r := app.refund_by_key(v_user, p_payment_id, p_key);   -- a double tap that waited for the lock: the same refund
  if r.id is not null then
    return app.refund_json(r);
  end if;
  if app.refund_is_stripe(p) then
    raise exception 'refund_through_stripe' using errcode = 'check_violation';   -- a card taken by the contractor's own terminal: a record
  end if;
  v_tax := app.refund_tax_part(p.invoice_id, p_amount_cents);
  insert into public.refunds (company_id, payment_id, amount_cents, reason_kind, reason, status, idempotency_key, created_by,
                              method, tax_cents, net_cents)
  values (p.company_id, p.id, p_amount_cents, p_reason_kind, nullif(btrim(p_reason), ''), 'succeeded', app.refund_key(p.company_id, p_key), v_user,
          p.method, v_tax, p_amount_cents - v_tax)
  returning * into r;
  -- as the person: tg_payment_guard checks owner/admin once more; the invoice's balance is recalculated by its trigger
  update public.payments
     set refunded_cents = p.refunded_cents + p_amount_cents,
         status = case when p.refunded_cents + p_amount_cents >= p.amount_cents then 'refunded' else 'partially_refunded' end
   where id = p.id;
  return app.refund_json(r);
end;
$$;
revoke all on function public.refund_record(uuid, bigint, text, text, text) from public, anon;
grant execute on function public.refund_record(uuid, bigint, text, text, text) to authenticated;

-- ---- 4. Card / ACH: through Stripe (the Edge Function stripe-refund) -----------------------------------------------------
create or replace function public.stripe_refund_open(p_user_id uuid, p_payment_id uuid, p_amount_cents bigint,
                                                     p_reason_kind text, p_reason text, p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p      public.payments;
  r      public.refunds;
  v_acct text;
  v_tax  bigint;
begin
  r := app.refund_by_key(p_user_id, p_payment_id, p_key);
  if r.id is not null and (r.status <> 'pending' or r.stripe_refund_id is not null) then
    select * into p from public.payments where id = r.payment_id for update;   -- answered: the same answer, no Stripe call
    if not app.refund_role_ok(p_user_id, p.company_id) then
      raise exception 'only owner/admin can refund' using errcode = '42501';
    end if;
  else
    -- the person, the company, the dispute, the status — first; nothing about the payment is told to anyone else
    p := app.refund_guard(p_user_id, p_payment_id, null, coalesce(r.reason_kind, p_reason_kind), p_reason, p_key);
    if not app.refund_is_stripe(p) then
      raise exception 'refund_not_stripe' using errcode = 'check_violation';
    end if;
    if r.id is null then
      r := app.refund_by_key(p_user_id, p_payment_id, p_key);   -- the same key that waited for the lock
    end if;
    if r.id is null then
      -- one refund on its way per payment; only ITS key resumes it (another tab, another key: wait — the Edge Function asks
      -- Stripe about an old one first and frees it). Adopting it under another key would let that key make a second refund.
      if exists (select 1 from public.refunds where payment_id = p.id and status = 'pending' and stripe_refund_id is null
                                                  and idempotency_key like 'octo:%') then
        raise exception 'refund_in_progress' using errcode = 'check_violation';
      end if;
      if p_amount_cents is null then
        raise exception 'refund_above_available' using errcode = 'check_violation';
      end if;
      perform app.refund_guard(p_user_id, p.id, p_amount_cents, p_reason_kind, p_reason, p_key);   -- the limit
      v_tax := app.refund_tax_part(p.invoice_id, p_amount_cents);
      insert into public.refunds (company_id, payment_id, amount_cents, reason_kind, reason, status, idempotency_key, created_by,
                                  method, tax_cents, net_cents)
      values (p.company_id, p.id, p_amount_cents, p_reason_kind, nullif(btrim(p_reason), ''), 'pending', app.refund_key(p.company_id, p_key), p_user_id,
              p.method, v_tax, p_amount_cents - v_tax)
      returning * into r;
    else
      update public.refunds set updated_at = now() where id = r.id returning * into r;   -- this try: «not old» while it calls Stripe
    end if;
  end if;
  select s.account_id into v_acct from public.stripe_accounts s where s.company_id = p.company_id;
  if v_acct is null then
    raise exception 'refund_not_stripe' using errcode = 'check_violation';
  end if;
  return app.refund_json(r) || jsonb_build_object(
    'account_id', v_acct, 'payment_intent', p.stripe_payment_intent_id, 'company_id', p.company_id,
    'stripe_refund_id', r.stripe_refund_id, 'fee_cents', p.fee_cents, 'platform_fee_cents', p.platform_fee_cents,
    -- one refund row = one Stripe refund, whoever retries; after Stripe's 24 h the Edge Function asks Stripe first
    'idempotency_key', 'octodex-refund-' || r.id);
end;
$$;
revoke all on function public.stripe_refund_open(uuid, uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.stripe_refund_open(uuid, uuid, bigint, text, text, text) to service_role;

-- the refund of this payment that has not reached Stripe yet (or null) — for the Edge Function to ask Stripe about it
-- before anything else (a timeout long ago: did Stripe make it?). Owner/admin only, as every door.
create or replace function public.stripe_refund_inflight(p_user_id uuid, p_payment_id uuid, p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  r public.refunds;
begin
  select * into p from public.payments where id = p_payment_id;
  if p.id is null or not app.refund_role_ok(p_user_id, p.company_id) then
    raise exception 'only owner/admin can refund' using errcode = '42501';
  end if;
  select * into r from public.refunds
   where payment_id = p.id and status = 'pending' and stripe_refund_id is null and idempotency_key like 'octo:%'
   order by created_at limit 1;
  if r.id is null then
    return null;
  end if;
  return app.refund_json(r) || jsonb_build_object('account_id', (select s.account_id from public.stripe_accounts s where s.company_id = p.company_id),
                                                  'payment_intent', p.stripe_payment_intent_id,
                                                  -- the asker's own try (its key): resumed, never freed under it
                                                  'own', r.idempotency_key = app.refund_key(p.company_id, p_key)
                                                         or (strpos(p_key, ':') = 0 and r.idempotency_key = 'octo:' || p_key));
end;
$$;
revoke all on function public.stripe_refund_inflight(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.stripe_refund_inflight(uuid, uuid, text) to service_role;

-- ---- 6. Schemas -----------------------------------------------------------------------------------------------------------
revoke create on schema public from public, anon, authenticated;
revoke create on schema app from public, anon, authenticated;
do $$ begin
  if to_regnamespace('extensions') is not null then
    execute 'revoke create on schema extensions from public, anon, authenticated';
  end if;
end $$;
