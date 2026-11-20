-- #2020: the signature by the client's link is the client's own. A person of the estimate's company signs the client only
-- on site (channel on_site, the right to sign contracts — as before); by the link («portal») the server answers 42501,
-- hint 'member_portal_sign'. The app's «open as client» only shows the page (apps/mobile/src/app/p/[token].tsx).
--   * app.estimate_client_accept — the same body as in 20261114100000, one check added right after the «repeat» branch:
--     a signature already made answers «repeat» as before (an old phone's queue is not turned into an error).
-- Rule 16: create or replace, nothing renamed or dropped. Rule 18: the rights are set again exactly as they were.

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
  -- #2020: by the link the client signs, not the company's own people (they sign on site, above); after the repeat branch,
  -- so a signature already made still answers «repeat»
  if member and p_channel is distinct from 'on_site' then
    raise exception 'a company member signs the client on site, not by the client''s link' using errcode = '42501', hint = 'member_portal_sign';
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
