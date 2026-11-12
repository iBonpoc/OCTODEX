-- #1147, step 1 of 2 (rule 16): the client's signature on an employee's device carries the total the client saw.
-- The server signs the estimate's sent version (sent_version_id) and counts its own total (app.estimate_option_totals).
-- When the office changed and sent it again while the phone held the older copy, the client signed one sum on the phone
-- and the signature was kept under another. Now the phone says what it showed; a different total → refused
-- (22023, hint estimate_total_mismatch), nothing signed — the client signs again on the estimate as it is now.
-- * public.sign_estimate_on_site(…, p_total_cents) — the quick estimate (its first option, no add-on);
-- * public.accept_on_site(…, p_total_cents) — the universal one (the chosen option and add-ons).
-- Each checks the person and the total under the estimate's row lock, then signs through the existing function of the
-- same name (one body of the signature, as before). The old ones stay as they are: older app versions keep calling them.
-- Step 2 (a separate PR, when no app version calls them without the total): drop the old overloads.
-- Rule 18: revoke from public, anon; execute for authenticated. Tests: supabase/tests/core_rls.sql T195.

create or replace function public.sign_estimate_on_site(p_estimate_id uuid, p_signer text, p_svg text, p_total_cents bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare e public.estimates; v public.estimate_versions; o public.estimate_options; t record;
begin
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null for update;
  if not found or not app.is_staff(e.company_id) and not app.can_read_estimate(e.id) then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  if not app.can_sign_contracts(e.company_id) then
    raise exception 'on-site signature requires an employee who may sign contracts' using errcode = '42501';
  end if;
  -- only an estimate open for the signature is counted; a repeat or anything else answers as the old door does
  if e.status in ('sent', 'viewed') and e.link_revoked_at is null then
    select * into v from public.estimate_versions where id = e.sent_version_id;
    if found and v.locked_at is not null then
      select * into o from public.estimate_options where version_id = v.id and deleted_at is null order by position, created_at limit 1;
      select * into t from app.estimate_option_totals(v.id, o.id, '{}');
      if p_total_cents is null or t.total is distinct from p_total_cents then
        raise exception 'the estimate changed: the client saw another total' using errcode = '22023', hint = 'estimate_total_mismatch';
      end if;
    end if;
  end if;
  return public.sign_estimate_on_site(p_estimate_id, p_signer, p_svg);
end;
$$;
revoke all on function public.sign_estimate_on_site(uuid, text, text, bigint) from public, anon;
grant execute on function public.sign_estimate_on_site(uuid, text, text, bigint) to authenticated;

create or replace function public.accept_on_site(p_estimate_id uuid, p_option_id uuid, p_addon_ids uuid[], p_signer text, p_svg text,
                                                 p_consent boolean, p_job_id uuid, p_invoice_id uuid, p_total_cents bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.estimates; v public.estimate_versions; o public.estimate_options; t record;
begin
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null for update;
  -- the same rows the person reads (estimates_select), as the old door
  if not found or not (app.is_staff(e.company_id) or app.can_read_estimate(e.id)) then
    raise exception 'estimate not found' using errcode = 'P0002';
  end if;
  -- the right to sign first (as sign_estimate_on_site): someone without it never learns how the total stands
  if not app.can_sign_contracts(e.company_id) then
    raise exception 'on-site signature requires an employee who may sign contracts' using errcode = '42501';
  end if;
  if e.status in ('sent', 'viewed') and e.link_revoked_at is null then
    select * into v from public.estimate_versions where id = e.sent_version_id;
    select * into o from public.estimate_options where id = p_option_id and version_id = v.id and deleted_at is null;
    if found then
      select * into t from app.estimate_option_totals(v.id, o.id, p_addon_ids);
      if p_total_cents is null or t.total is distinct from p_total_cents then
        raise exception 'the estimate changed: the client saw another total' using errcode = '22023', hint = 'estimate_total_mismatch';
      end if;
    end if;
  end if;
  return public.accept_on_site(p_estimate_id, p_option_id, p_addon_ids, p_signer, p_svg, p_consent, p_job_id, p_invoice_id);
end;
$$;
revoke all on function public.accept_on_site(uuid, uuid, uuid[], text, text, boolean, uuid, uuid, bigint) from public, anon;
grant execute on function public.accept_on_site(uuid, uuid, uuid[], text, text, boolean, uuid, uuid, bigint) to authenticated;
