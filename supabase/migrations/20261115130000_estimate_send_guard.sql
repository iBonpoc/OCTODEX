-- #1600, #1599, #1601: what the client signs is what the office sent, and the company's signature is the signer's own.
-- Rule 16: nothing renamed or dropped; functions replaced with the same signature. The app sends an estimate only
-- through send_estimate (cloud/ops.ts «estimate.send», since 20261105240000) and sets only «draft» and its own current
-- version directly — both still pass.

-- 1 ------------------------------------------------------------------------------------------------
-- the estimate (20261109120000, plus the #1600 checks at the top)
create or replace function app.tg_estimate_send_and_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_days int; v_tz text; v_merge boolean := false;
begin
  -- security-check 05.11: the two signing statuses are set only by the signing functions — never by a direct
  -- insert or update from the app or the page. Two conditions together: the call runs inside a security definer
  -- function (current_user is its owner, not authenticated / anon) AND that function marked this very estimate
  -- (app.signing_estimate). The flag alone is settable by anyone; the role alone lets any other definer through.
  if (tg_op = 'INSERT' and new.status <> 'draft' and current_user in ('authenticated', 'anon')) then
    raise exception 'a new estimate starts as a draft' using errcode = '42501';
  end if;
  if new.status in ('awaiting_countersign', 'approved')
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and (current_user in ('authenticated', 'anon')
          or coalesce(current_setting('app.signing_estimate', true), '') <> new.id::text) then
    raise exception 'only a signature moves an estimate to % (portal_accept / sign_estimate_on_site / countersign_estimate)', new.status
      using errcode = '42501';
  end if;
  -- #1600: «sent» and the sent version are set only by send_estimate (a definer, it marks the estimate) — never by the
  -- app's own update: what the client signs (portal_accept takes sent_version_id) is the version the office sent
  if current_user in ('authenticated', 'anon') then
    -- the app's own update moves an estimate only back to a draft (cloud/ops.ts «estimate.save» of a sent one);
    -- «sent» is send_estimate's, «viewed» the client page's, «expired» / «declined» the server's
    if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status <> 'draft' then
      raise exception 'an estimate is sent by send_estimate (the app sets only «draft»)' using errcode = '42501';
    end if;
    -- a signed estimate (waiting for the company, or approved) changes status only through the server's functions
    -- (reopen_estimate, decline_countersign): never a quiet «draft» that drops the client's signature
    if tg_op = 'UPDATE' and new.status is distinct from old.status and old.status in ('awaiting_countersign', 'approved') then
      raise exception 'a signed estimate is reopened or declined by the server (reopen_estimate / decline_countersign)' using errcode = '42501';
    end if;
    if (tg_op = 'INSERT' and new.sent_version_id is not null)
       or (tg_op = 'UPDATE' and new.sent_version_id is distinct from old.sent_version_id) then
      raise exception 'the sent version is set by send_estimate' using errcode = '42501';
    end if;
  end if;
  -- the versions an estimate points at are its own (any caller): never another estimate's locked version
  if new.sent_version_id is not null and (tg_op = 'INSERT' or new.sent_version_id is distinct from old.sent_version_id)
     and not exists (select 1 from public.estimate_versions v
                      where v.id = new.sent_version_id and v.company_id = new.company_id and v.estimate_id = new.id) then
    raise exception 'the sent version is a version of this estimate' using errcode = '42501';
  end if;
  if new.current_version_id is not null and (tg_op = 'INSERT' or new.current_version_id is distinct from old.current_version_id)
     and not exists (select 1 from public.estimate_versions v
                      where v.id = new.current_version_id and v.company_id = new.company_id and v.estimate_id = new.id) then
    raise exception 'the current version is a version of this estimate' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.customer_id is distinct from old.customer_id and current_user not in ('authenticated', 'anon')
     and new.status is not distinct from old.status then
    -- the client merge (merge_customers, S3d): a signed estimate moves to the kept client and nothing else changes
    v_merge := app.merging_customer(old.customer_id, new.customer_id);
  end if;
  if tg_op = 'UPDATE' and (current_user in ('authenticated', 'anon')
                           or coalesce(current_setting('app.signing_estimate', true), '') <> new.id::text) then
    -- what the client signed is frozen: the client, the place, the lead and the versions (security-check 05.11)
    if old.status in ('awaiting_countersign', 'approved')
       and (case when v_merge then old.customer_id else new.customer_id end, new.property_id, new.lead_id, new.sent_version_id, new.current_version_id)
           is distinct from (old.customer_id, old.property_id, old.lead_id, old.sent_version_id, old.current_version_id) then
      raise exception 'a signed estimate keeps its client, property, lead and versions' using errcode = '42501';
    end if;
    -- the link (token, valid until, revoke) changes only through send_estimate / revoke_estimate_link
    if (new.public_token, new.link_revoked_at) is distinct from (old.public_token, old.link_revoked_at)
       or (new.expires_at is distinct from old.expires_at and not (new.status = 'sent' and old.status in ('draft', 'expired'))) then
      raise exception 'the client link changes only through send_estimate / revoke_estimate_link' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' and new.public_token is not null and current_user in ('authenticated', 'anon') then
    raise exception 'the client link is made by send_estimate' using errcode = '42501';
  end if;
  -- every send of a new version gets a fresh "valid until" (founder: extend = send again with a new date)
  if tg_op = 'UPDATE' and new.status = 'sent' and old.status is distinct from 'sent' and old.status in ('draft', 'expired') then
    select coalesce(nullif(estimate_settings ->> 'valid_days', '')::int, 7), timezone into v_days, v_tz
      from public.companies where id = new.company_id;
    new.expires_at := (now() at time zone coalesce(v_tz, 'America/Los_Angeles'))::date + greatest(v_days, 1);
  end if;
  return new;
end;
$$;


-- 2 ------------------------------------------------------------------------------------------------
-- a version is locked (and its estimate never changed) only by the server's functions: send_estimate, the signatures
-- (definers). The app may not lock a version, unlock it, give it a «sent» date, or move it to another estimate.
create or replace function app.tg_version_lock_by_send()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and (tg_op = 'INSERT' and (new.sent_at is not null or new.locked_at is not null)
          or tg_op = 'UPDATE' and ((new.locked_at, new.sent_at) is distinct from (old.locked_at, old.sent_at)
                                   or new.estimate_id is distinct from old.estimate_id)) then
    raise exception 'a version is locked by send_estimate and stays with its estimate' using errcode = '42501';
  end if;
  return new;
end;
$$;
-- rule 18 (T52): a trigger function; nobody calls it
revoke all on function app.tg_version_lock_by_send() from public, anon, authenticated;
drop trigger if exists t06_version_lock_by_send on public.estimate_versions;
create trigger t06_version_lock_by_send before insert or update of locked_at, sent_at, estimate_id on public.estimate_versions
  for each row execute function app.tg_version_lock_by_send();

-- 3 ------------------------------------------------------------------------------------------------
-- #1599, #1601: the company's signature (20261111193000, plus: an active non-subcontractor membership; the signer's
-- name from the account — full name, else email; the title from the profile only)
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
  if not found or not app.is_member(e.company_id) or not (app.is_staff(e.company_id) or app.can_read_estimate(e.id)) then
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
  select * into m from public.memberships where company_id = e.company_id and user_id = auth.uid() and status = 'active' and deleted_at is null;
  -- #1601: an active employee of the company signs for it, never a subcontractor (not only the right above)
  if not found or m.role = 'subcontractor' then
    raise exception 'no right to sign contracts for the company' using errcode = '42501';
  end if;
  -- #1599: the name under the company's signature is the signer's account (its full name, else its email), not the text
  -- typed with a saved signature
  select coalesce(nullif(trim(u.full_name), ''), u.email) into v_name from public.users u where u.id = auth.uid();
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
  -- security-check 05.11: the company signs only what the client signed — the client's signature on the sent version
  if ca.id is null or e.sent_version_id is null or ca.version_id is distinct from e.sent_version_id
     or not exists (select 1 from public.estimate_versions where id = e.sent_version_id and locked_at is not null) then
    raise exception 'no client signature on the sent version' using errcode = '22023';
  end if;

  insert into public.estimate_approvals (company_id, estimate_id, version_id, option_id, decision, signer_name, signature_svg,
                                         esign_consent, channel, party, signer_user_id, signer_title, signer_his,
                                         member_signature_id, method, document_hash)
  values (e.company_id, e.id, ca.version_id, ca.option_id, 'approved', coalesce(nullif(trim(v_name), ''), 'Employee'), s.svg, true,
          case when ca.channel = 'on_site' then 'on_site' else 'app' end, 'contractor', auth.uid(),
          nullif(trim(m.title), ''),   -- #1599: the profile title only (owner/admin set it), never the one typed with the signature
          m.his_registration_number, s.id, v_method, ca.document_hash);
  perform app.execute_estimate(e.id, p_job_id, p_invoice_id);
  return 'approved';
end;
$$;

revoke all on function public.countersign_estimate(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.countersign_estimate(uuid, text, uuid, uuid, uuid) to authenticated;
