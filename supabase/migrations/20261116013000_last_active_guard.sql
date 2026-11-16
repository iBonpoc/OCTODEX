-- Spec 42 §14 (wave 4-1, the company switcher, #1673): users.last_active_company_id is now read by the app (the company
-- a new phone opens first). Until now anyone could write any company id into their own row (grant update,
-- 20261106110000_team_invitations.sql:292; only the FK checked it). From now on it is null or a company the row's own
-- person is an active member of, and the company is open.
-- Rule 16: nothing renamed or dropped; the column, its grant and accept_invitation stay as they are.

-- 1 ------------------------------------------------------------------------------------------------
-- a value written before this migration that points at a company the person is not (or no longer) active in, or a
-- closed one, is cleared (the app never read it; accept_invitation and delete_account are the only writers)
update public.users u set last_active_company_id = null
 where u.last_active_company_id is not null
   and not exists (select 1 from public.memberships m join public.companies c on c.id = m.company_id
                    where m.user_id = u.id and m.company_id = u.last_active_company_id
                      and m.status = 'active' and m.deleted_at is null
                      and c.closed_at is null and c.deleted_at is null);

-- 2 ------------------------------------------------------------------------------------------------
-- The check is of the row's person (new.id), not of the caller: accept_invitation, delete_account and the service role
-- write other people's rows or no JWT at all (security-check of the plan, С1). security definer: the caller's read
-- rules never hide the membership it checks. Only a change is checked (a person switched off in «A» still renames
-- himself — spec 42 §11 Ж9).
create or replace function app.tg_users_last_active_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.last_active_company_id is not null
     and (tg_op = 'INSERT' or new.last_active_company_id is distinct from old.last_active_company_id)
     and not exists (select 1 from public.memberships m join public.companies c on c.id = m.company_id
                      where m.user_id = new.id and m.company_id = new.last_active_company_id
                        and m.status = 'active' and m.deleted_at is null
                        and c.closed_at is null and c.deleted_at is null) then
    raise exception 'not a company of yours' using errcode = '42501';
  end if;
  return new;
end;
$$;
-- rule 18 (T52): a trigger function; nobody calls it
revoke all on function app.tg_users_last_active_guard() from public, anon, authenticated;
drop trigger if exists t15_last_active_guard on public.users;
create trigger t15_last_active_guard before insert or update of last_active_company_id on public.users
  for each row execute function app.tg_users_last_active_guard();

-- 3 ------------------------------------------------------------------------------------------------
-- security-check of the wave: the guard checks only a change, so after a switch-off or a closing the old value stays
-- (on purpose, T286) — the column is a hint for which company a phone opens, never a right
comment on column public.users.last_active_company_id is
  'The company the person last worked in (spec 42 S34): a hint for which company a new phone opens. Never a right: read it only together with an active membership of that company.';
