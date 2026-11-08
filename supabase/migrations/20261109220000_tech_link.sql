-- The tech and the client link, step 1 (docs/specs/35-stripe.md §4д п.10, «Деньги и отчёты» №7). Rule 16: everything is added.
-- * app.estimate_client_accept — the client's signature (the page /p/ or on an employee's device), ONE body for both doors:
--   public.portal_accept (by the link's token, as before — old app versions keep working) and the new
--   public.accept_on_site (by the estimate's id: the employee who holds the device needs no token).
-- * public.accept_on_site — fixes the tech's on-site signature: the app sent the estimate first (send_estimate, staff only →
--   42501, the op was dropped, the client's signature never reached the server — T142). Only an estimate the person sees by
--   RLS (staff; a tech — his own or on a property he is assigned to), only sent / viewed (a repeat of a signed one is a no-op).
-- * public.estimate_link — the client link for those who manage it (owner, admin, office, sales). Not read by the app yet:
--   until step 2 the row still carries public_token (a tech hides only the buttons now); step 2 moves the app to this door.
-- Step 2 (a separate PR, when no app version reads estimates.public_token): revoke the column from authenticated, reissue the
-- links a tech could read.

create or replace function app.estimate_client_accept(p_estimate_id uuid, p_option_id uuid, p_addon_ids uuid[], p_signer text,
                                                      p_svg text, p_consent boolean, p_channel text, p_job_id uuid, p_invoice_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  e public.estimates; v public.estimate_versions; o public.estimate_options; member boolean;
  t record; v_cust text;
begin
  if coalesce(p_consent, false) is not true or coalesce(trim(p_signer), '') = '' or coalesce(p_svg, '') = '' then
    raise exception 'E-SIGN consent, name and signature are required' using errcode = '22023';
  end if;
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null for update;
  if not found then
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
revoke all on function app.estimate_client_accept(uuid, uuid, uuid[], text, text, boolean, text, uuid, uuid) from public, anon, authenticated;

create or replace function public.portal_accept(p_token text, p_option_id uuid, p_addon_ids uuid[], p_signer text, p_svg text,
                                                p_consent boolean, p_channel text default 'portal', p_job_id uuid default null,
                                                p_visit_id uuid default null, p_invoice_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.estimates where public_token = p_token and deleted_at is null;
  if not found or p_token is null then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  perform app.estimate_client_accept(v_id, p_option_id, p_addon_ids, p_signer, p_svg, p_consent, p_channel, p_job_id, p_invoice_id);
  return public.portal_estimate(p_token);
end;
$$;

create or replace function public.accept_on_site(p_estimate_id uuid, p_option_id uuid, p_addon_ids uuid[], p_signer text, p_svg text,
                                                 p_consent boolean, p_job_id uuid default null, p_invoice_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.estimates; v_r text;
begin
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null;
  -- the same rows the person reads (estimates_select): staff, or a tech — his own estimate or one on his property
  if not found or not (app.is_staff(e.company_id)
                       or (app.has_role(e.company_id, array['tech'])
                           and (e.created_by = (select auth.uid()) or app.is_property_assignee(e.property_id)))) then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  if e.status not in ('sent', 'viewed', 'awaiting_countersign', 'approved') then
    raise exception 'the estimate is not sent yet (status %)', e.status using errcode = '22023';
  end if;
  v_r := app.estimate_client_accept(e.id, p_option_id, p_addon_ids, p_signer, p_svg, p_consent, 'on_site', p_job_id, p_invoice_id);
  return jsonb_build_object('result', v_r, 'status', (select status from public.estimates where id = e.id));
end;
$$;
revoke all on function public.accept_on_site(uuid, uuid, uuid[], text, text, boolean, uuid, uuid) from public, anon;
grant execute on function public.accept_on_site(uuid, uuid, uuid[], text, text, boolean, uuid, uuid) to authenticated;

create or replace function public.estimate_link(p_estimate_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare e public.estimates;
begin
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null;
  if not found or not app.is_staff(e.company_id) then
    raise exception 'only the office or the director manages the client link' using errcode = '42501';
  end if;
  return e.public_token;
end;
$$;
revoke all on function public.estimate_link(uuid) from public, anon;
grant execute on function public.estimate_link(uuid) to authenticated;
