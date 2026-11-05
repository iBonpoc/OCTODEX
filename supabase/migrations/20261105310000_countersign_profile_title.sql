-- E2b-2, security-check of PR #98 (lead, 05.11): the title on the contract comes from the employee's profile.
-- Before: coalesce(s.title, m.title) — an employee could type «President» with their own saved signature and so get
-- around the rule that only the owner / admin sets their title. Now: memberships.title (owner / admin) first;
-- the title typed with the signature only when the profile has none. Nothing else in countersign_estimate changes.
-- Test: supabase/tests/core_rls.sql T23 («President» typed, «Technician» in the profile → «Technician» on the contract).

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
  select * into m from public.memberships where company_id = e.company_id and user_id = auth.uid() and status = 'active' and deleted_at is null;
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
  -- security-check 05.11: the company signs only what the client signed — the client's signature on the sent version
  if ca.id is null or e.sent_version_id is null or ca.version_id is distinct from e.sent_version_id
     or not exists (select 1 from public.estimate_versions where id = e.sent_version_id and locked_at is not null) then
    raise exception 'no client signature on the sent version' using errcode = '22023';
  end if;

  insert into public.estimate_approvals (company_id, estimate_id, version_id, option_id, decision, signer_name, signature_svg,
                                         esign_consent, channel, party, signer_user_id, signer_title, signer_his,
                                         member_signature_id, method, document_hash)
  values (e.company_id, e.id, ca.version_id, ca.option_id, 'approved', s.name, s.svg, true,
          case when ca.channel = 'on_site' then 'on_site' else 'app' end, 'contractor', auth.uid(),
          coalesce(nullif(trim(m.title), ''), s.title),   -- the profile title (owner/admin set it) wins over the one typed with the signature
          m.his_registration_number, s.id, v_method, ca.document_hash);
  perform app.execute_estimate(e.id, p_job_id, p_invoice_id);
  return 'approved';
end;
$$;
revoke all on function public.countersign_estimate(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.countersign_estimate(uuid, text, uuid, uuid, uuid) to authenticated;
