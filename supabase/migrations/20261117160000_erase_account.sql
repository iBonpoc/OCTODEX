-- Spec 50 §3.2, PR 50-1 (K1, epic #1940, stage 1): the body of delete_account moves into app.erase_account(uid, close[]) WITHOUT a
-- change of behaviour; public.delete_account keeps its signature (old phones, rule 16) and calls it.
--   * delete_account (the caller's own path): the sign-in checks that belong to the CALLER — signed in and not anonymous, the lock
--     timeout, my profile row locked, «already deleted» is a success, the word, a fresh sign-in (≤ 10 min) — then app.erase_account.
--   * app.erase_account(p_uid, p_close_companies): the erasure itself — the owner locks, the last-owner rule, the closing of the
--     companies, every write and the postconditions. It takes the person as an argument, so the support path of spec 45 §5.6
--     (platform_delete_account) can call the same erasure later without the caller's sign-in. It stands behind delete_account (the
--     checks above); nobody else may call it (rule 18: revoke from public, anon, authenticated — no grant at all).
-- A later caller (platform_delete_account, spec 45 §5.6) must repeat the wrapper's duties: the lock timeout, the lock on the person's
-- profile row, the «already deleted» success, the same error mapping (OD001 / «try again» / OD002) — erase_account itself does none of them.
-- The errors map in delete_account as before: our refusals OD001 as they are; a lock conflict → «try again»; anything else → OD002.
-- Rule 16: nothing is renamed or dropped; the signature and the result of delete_account are the same.

create or replace function app.erase_account(p_uid uuid, p_close_companies uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := p_uid;
  v_gone text;
  v_last uuid[];
  v_c uuid;
begin
  -- lock, in one order (by id), every owner of my companies and every row of mine: two owners leaving at once, or a
  -- transfer meanwhile, cannot leave a company without an owner (security-check 7а-2 №5)
  perform 1 from public.memberships m
   where m.company_id in (select x.company_id from public.memberships x where x.user_id = v_me)
     and (m.role = 'owner' or m.user_id = v_me)
   order by m.id for update;
  -- after the locks: the companies where I am the last active owner
  select coalesce(array_agg(mine.company_id), '{}') into v_last
    from public.memberships mine
   where mine.user_id = v_me and mine.role = 'owner' and mine.status = 'active' and mine.deleted_at is null
     and not exists (select 1 from public.memberships o where o.company_id = mine.company_id and o.role = 'owner'
                       and o.status = 'active' and o.deleted_at is null and o.user_id <> v_me);
  foreach v_c in array v_last loop
    -- an active admin is there: hand the company over first, it is never closed under them (review #214 №2)
    if exists (select 1 from public.memberships a join public.users u on u.id = a.user_id
                where a.company_id = v_c and a.role = 'admin' and a.status = 'active' and a.deleted_at is null
                  and u.deleted_at is null) then
      raise exception 'transfer the company first' using errcode = 'OD001', detail = v_c::text;
    end if;
    if not (v_c = any (coalesce(p_close_companies, '{}'))) then
      raise exception 'the company keeps at least one active owner' using errcode = 'OD001', detail = v_c::text;
    end if;
  end loop;
  v_gone := 'deleted+' || v_me::text || '@deleted.invalid';

  perform set_config('app.accepting_invite', 'on', true);
  -- the companies closed with the account: nobody works in them any more, their records are kept
  if cardinality(v_last) > 0 then
    update public.companies set closed_at = now() where id = any (v_last) and closed_at is null;
    update public.memberships set status = 'deleted', deleted_at = now(), share_location = false
     where company_id = any (v_last) and user_id <> v_me and status <> 'deleted';
    update public.invitations set status = 'revoked', updated_at = now()
     where company_id = any (v_last) and status = 'pending';
  end if;
  perform set_config('app.accepting_invite', '', true);

  -- invitations: the ones I sent and the ones to my email stop working; the accepted ones forget my email and name
  update public.invitations set status = 'revoked', updated_at = now()
   where status = 'pending' and invited_by = v_me;
  -- the ones TO me: revoked and they forget my email and name (security-check №6)
  update public.invitations set status = case when status = 'pending' then 'revoked' else status end,
         email = v_gone, name = null, updated_at = now()
   where email = (select lower(u.email) from auth.users u where u.id = v_me) and accepted_by is distinct from v_me;
  update public.invitations set email = v_gone, name = null, updated_at = now() where accepted_by = v_me;
  -- unlinked: the company keeps its contact row and its settings, not the link to me
  update public.company_contacts set user_id = null where user_id = v_me;
  update public.companies set lead_default_assignee_id = null where lead_default_assignee_id = v_me;
  -- my active signature is never put on a new document; the signed documents keep theirs (business record)
  update public.member_signatures set revoked_at = now() where user_id = v_me and revoked_at is null;
  -- my private notes: nobody else may read them, ever
  delete from public.notes where created_by = v_me and visibility = 'private';
  -- my own rows (member_prefs; 7б-2: user_locations)
  perform app.erase_personal_rows(v_me);
  -- the proof of the consent stays, without the IP
  perform set_config('app.erasing_user', 'on', true);
  update public.legal_acceptance set ip = null, ip_raw = null where user_id = v_me and (ip is not null or ip_raw is not null);
  perform set_config('app.erasing_user', '', true);
  -- my memberships: deleted; what was about me goes (last of the writes: until here I am still a member — the writes
  -- above never depend on BYPASSRLS ordering, security-check 7а-2a №3)
  perform set_config('app.accepting_invite', 'on', true);
  update public.memberships
     set status = 'deleted', deleted_at = now(), share_location = false, title = null, his_registration_number = null, color = null
   where user_id = v_me and status <> 'deleted';
  perform set_config('app.accepting_invite', '', true);
  -- the profile: anonymised (the business records point to it); the sign-in is closed by Auth (the edge function)
  update public.users
     set full_name = 'Deleted user', email = v_gone, phone = null, avatar_file_id = null, last_active_company_id = null,
         deleted_at = now()
   where id = v_me;

  -- postconditions: under FORCE RLS a write can pass with 0 rows — check, never trust (security-check 7а-2 №4)
  if exists (select 1 from public.memberships where user_id = v_me and status <> 'deleted')
     or exists (select 1 from public.member_prefs where user_id = v_me)
     or exists (select 1 from public.company_contacts where user_id = v_me)
     or exists (select 1 from public.companies where lead_default_assignee_id = v_me)
     or exists (select 1 from public.notes where created_by = v_me and visibility = 'private')
     or exists (select 1 from public.member_signatures where user_id = v_me and revoked_at is null)
     or exists (select 1 from public.legal_acceptance where user_id = v_me and (ip is not null or ip_raw is not null))
     or exists (select 1 from public.invitations where status = 'pending' and (invited_by = v_me or email = v_gone))
     or not exists (select 1 from public.users where id = v_me and deleted_at is not null and email = v_gone) then
    raise exception 'account deletion incomplete';
  end if;
  return jsonb_build_object('deleted', true, 'repeat', false, 'closed_companies', to_jsonb(v_last));
end;
$$;
revoke all on function app.erase_account(uuid, uuid[]) from public, anon, authenticated;

-- the caller's own path: the same checks in the same order as before, then the erasure
create or replace function public.delete_account(p_confirm text, p_close_companies uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  begin
    if v_me is null or app.is_anonymous_user() then
      raise exception 'sign in first' using errcode = 'OD001';
    end if;
    -- a lock wait never hangs until the statement timeout (→ «try again»)
    perform set_config('lock_timeout', '5s', true);
    -- my profile row first: two taps at once — the second waits here and then sees the first one's result
    perform 1 from public.users u where u.id = v_me for update;
    -- again (the answer was lost, or the sign-in is closed by Auth later): nothing changes, it is a success
    if exists (select 1 from public.users u where u.id = v_me and u.deleted_at is not null) then
      return jsonb_build_object('deleted', true, 'repeat', true);
    end if;
    if btrim(coalesce(p_confirm, '')) not in ('DELETE', 'УДАЛИТЬ', 'ELIMINAR') then
      raise exception 'type the word to confirm' using errcode = 'OD001';
    end if;
    if not app.signed_in_recently() then
      raise exception 'sign in again first' using errcode = 'OD001';
    end if;
    return app.erase_account(v_me, p_close_companies);
  exception
    when sqlstate 'OD001' then
      raise;
    when deadlock_detected or serialization_failure or lock_not_available or query_canceled then
      raise exception 'try again' using errcode = 'OD001';
    when others then
      -- SQLSTATE and the message (no DETAIL: it may hold values) — enough to read a staging failure
      raise warning 'delete_account failed: % %', sqlstate, sqlerrm;
      raise exception 'account deletion failed' using errcode = 'OD002';
  end;
end;
$$;
revoke all on function public.delete_account(text, uuid[]) from public, anon;
grant execute on function public.delete_account(text, uuid[]) to authenticated;
