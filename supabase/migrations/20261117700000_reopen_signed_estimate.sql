-- #2478 (the tail of #2474, spec 65 §3.5, items 2 and 4): «don't sign — change it» names the client's signature it takes off.
-- reopen_estimate(id, reason) takes off any signature: both the explicit choice and the cloud save of older builds call it
-- (an edit made without the network while the client signed meanwhile) — the arguments cannot tell them apart. The new
-- entry takes the option the phone saw the client sign (estimate_approvals.option_id: every version has its own options).
-- Another client signature (newer: reopened, changed and signed again meanwhile) or none named — refused for good:
-- 22023 + hint estimate_signed_meanwhile (the app's card «the client signed while your edits waited»); the signature stays.
-- Rule 16, step 1: only added; reopen_estimate(uuid, text) stays for the builds before this change. Step 2 — a separate
-- task: close it for authenticated once the older builds got the update.
-- Rule 18: revoked from public, anon; the app (owner / admin / office) — granted to authenticated.

create or replace function public.reopen_signed_estimate(p_estimate_id uuid, p_reason text, p_signed_option_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.estimates; v_option uuid;
begin
  select * into e from public.estimates where id = p_estimate_id and deleted_at is null for update;
  if not found or not app.has_role(e.company_id, array['owner', 'admin', 'office']) then
    raise exception 'only the director or the office changes a signed estimate' using errcode = '42501';
  end if;
  if e.status = 'draft' then
    return;                                               -- a repeat of the queue
  end if;
  if e.status <> 'awaiting_countersign' then
    raise exception 'only an estimate the client signed and the company has not can be reopened (status %)', e.status using errcode = '22023';
  end if;
  -- the client's latest signature (as countersign_estimate reads it)
  select a.option_id into v_option from public.estimate_approvals a
   where a.estimate_id = e.id and a.decision = 'approved' and a.party = 'customer' and a.deleted_at is null
   order by a.signed_at desc limit 1;
  if p_signed_option_id is null or v_option is distinct from p_signed_option_id then
    raise exception 'estimate_signed_meanwhile: the client signed another version than the phone saw'
      using errcode = '22023', hint = 'estimate_signed_meanwhile';
  end if;
  update public.estimates set status = 'draft' where id = e.id;
  insert into public.activities (company_id, subject_type, subject_id, kind, body, meta)
  values (e.company_id, 'estimate', e.id, 'status', nullif(trim(coalesce(p_reason, '')), ''),
          jsonb_build_object('action', 'reopened', 'from', 'awaiting_countersign', 'to', 'draft'));
end;
$$;
revoke all on function public.reopen_signed_estimate(uuid, text, uuid) from public, anon;
grant execute on function public.reopen_signed_estimate(uuid, text, uuid) to authenticated;
