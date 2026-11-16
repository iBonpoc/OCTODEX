-- #1866 (К1, founder 16.11.2026: «как в компанию пригласить сотрудника и определять для него роли»): the role of a person
-- already on the team is changed by one function. Until now a role was set only by the invitation; a direct update of
-- memberships.role stays closed (column grants, 20261106110000_team_invitations.sql: only title, HIS number, the right
-- to sign and the colour are written directly; T48).
-- The rules (plan of #1866, checked by Plan and security-check):
-- * the caller is an active owner or admin of this company; never their own role;
-- * the new role is admin, office, sales or tech: an owner is made only by transfer_ownership; a subcontractor ↔ an
--   employee only by a new invitation (spec 42, wave 4-4);
-- * the target is an active employee of this company and not an owner; an existing admin is changed by an owner only
--   (as set_member_status); raising to admin — an owner or an admin (as invite_member), with a recent sign-in;
-- * every check runs AFTER the locks (owners, the caller and the target, by id — the order of transfer_ownership):
--   a transfer or a switch-off that comes meanwhile is seen (security-check of the plan, blocker 1);
-- * the company keeps an active owner and at least one director (owner or admin) after the change;
-- * an admin lowered: the invitations they sent stop (as set_member_status); `view_costs` given by hand to the person
--   goes with the old role (the director gives it again if wanted);
-- * every «no» about the person or the company is the same answer (nothing tells another company's team).
-- The change is written to audit_log by t90_audit (actor — the caller). Rule 16: a new function only.

create or replace function public.set_member_role(p_company_id uuid, p_user_id uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  m    public.memberships;
begin
  if v_me is null or not app.account_alive() then
    raise exception 'sign in again first' using errcode = 'OD001';
  end if;
  if p_role is null or p_role not in ('admin', 'office', 'sales', 'tech') then
    raise exception 'this role is not set here' using errcode = '22023';
  end if;
  if p_user_id is null or p_user_id = v_me then
    raise exception 'not yourself' using errcode = '42501';
  end if;
  perform set_config('lock_timeout', '5s', true);
  -- the same set and order as transfer_ownership: the owners, me and the target, by id
  perform 1 from public.memberships x
   where x.company_id = p_company_id and (x.role = 'owner' or x.user_id in (v_me, p_user_id))
   order by x.id for update;
  -- every check after the locks
  if not app.has_role(p_company_id, array['owner', 'admin']) then
    raise exception 'no such person on the team' using errcode = 'OD001';
  end if;
  select * into m from public.memberships
   where company_id = p_company_id and user_id = p_user_id and status = 'active' and deleted_at is null;
  if m.id is null or m.role in ('owner', 'subcontractor')
     or not exists (select 1 from public.users u where u.id = p_user_id and u.deleted_at is null) then
    raise exception 'no such person on the team' using errcode = 'OD001';
  end if;
  -- an existing admin is changed by an owner only; raising to admin needs a recent sign-in (a stolen session must not)
  if m.role = 'admin' and not app.has_role(p_company_id, array['owner']) then
    raise exception 'only the owner changes an admin' using errcode = '42501';
  end if;
  if m.role = p_role then
    return jsonb_build_object('company_id', p_company_id, 'user_id', p_user_id, 'role', p_role, 'repeat', true);
  end if;
  if p_role = 'admin' and not app.signed_in_recently() then
    raise exception 'sign in again first' using errcode = 'OD001';
  end if;
  -- the company keeps a director: an active owner or admin other than the person lowered
  if m.role = 'admin' and not exists (
       select 1 from public.memberships x
        where x.company_id = p_company_id and x.id <> m.id and x.role in ('owner', 'admin')
          and x.status = 'active' and x.deleted_at is null) then
    raise exception 'the company keeps a director' using errcode = '42501';
  end if;
  update public.memberships
     set role = p_role,
         permissions_override = coalesce(permissions_override, '{}'::jsonb) - 'view_costs'
   where id = m.id;
  -- an admin lowered: the invitations they sent stop working (accept_invitation would refuse them anyway)
  if m.role = 'admin' then
    update public.invitations set status = 'revoked', updated_at = now()
     where company_id = p_company_id and invited_by = p_user_id and status = 'pending';
  end if;
  return jsonb_build_object('company_id', p_company_id, 'user_id', p_user_id, 'role', p_role, 'repeat', false);
exception
  when deadlock_detected or serialization_failure or lock_not_available or query_canceled then
    raise exception 'try again' using errcode = 'OD001';
end;
$$;
-- rule 18 (T52): revoke first, then the one grant the app needs
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
