-- Р-6 (#2064): who sees whom in the team, and the company row, follow the roles decision (PRD 01 §3, audit of roles).
--   * memberships_select — the office (owner, admin, office) as before; sales and tech — their own row and the
--     colleagues who joined (active, disabled, deleted: the app names them on the history, «Удалённый пользователь»
--     included), not the invited; a subcontractor — his own row and the people he is on a visit with (app.shares_visit). An old phone
--     simply loads fewer rows (repo.ts members: the people it does not see are not in its team list).
--   * users_select — the same rule for the people of the team (app.sees_user).
--   * memberships.invite_token_hash — a column the app never wrote (invitations live in public.invitations since
--     20261106110000): cleared (the app has no right to write it, T428).
--   * companies.stripe_account_id — the app never read it (Stripe goes through public.stripe_accounts and the server's
--     functions): a copy is kept in company_secrets (owner, admin), the column on the company row is cleared and the app
--     cannot write it (t00_company_secret_off). The column itself stays (rule 16: dropped by step 2).
-- Step 2 (a separate PR, rule 16, after the app reads an explicit list of columns): what of the company row and of a
-- colleague's row a role does not need (payment, tax, contract settings for a subcontractor; another's share_location
-- and location_notice_ack_at for a tech) — by columns per role. db T427–T430.
-- Rule 18: the new functions — revoke all from public, anon; shares_visit, sees_user — execute to authenticated (the policy calls it);
-- the trigger function — for nobody.

create or replace function app.shares_visit(p_company_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.visit_assignees me
      join public.visit_assignees other on other.visit_id = me.visit_id and other.company_id = me.company_id
      join public.visits v on v.id = me.visit_id and v.company_id = me.company_id
     where me.company_id = p_company_id
       and me.user_id = (select auth.uid())
       and other.user_id = p_user_id
       and me.deleted_at is null and other.deleted_at is null and v.deleted_at is null
  );
$$;
revoke all on function app.shares_visit(uuid, uuid) from public, anon;
grant execute on function app.shares_visit(uuid, uuid) to authenticated;

alter policy memberships_select on public.memberships
  using (user_id = (select auth.uid())
         or app.has_role(company_id, array['owner', 'admin', 'office'])
         or (status <> 'invited' and app.is_member(company_id)
             and not app.has_role(company_id, array['subcontractor']))
         or (status <> 'invited' and app.has_role(company_id, array['subcontractor'])
             and app.shares_visit(company_id, user_id)));

-- the people of the team (users: name, e-mail, phone, photo) by the same rule — before, any member read every
-- person of his companies (app.shares_company, kept as it is for its other callers)
create or replace function app.sees_user(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships mine
      join public.memberships theirs on theirs.company_id = mine.company_id and theirs.user_id = p_user_id
     where mine.user_id = (select auth.uid()) and mine.status = 'active' and mine.deleted_at is null
       and (mine.role in ('owner', 'admin', 'office')
            or (theirs.status <> 'invited'
                and (mine.role <> 'subcontractor' or app.shares_visit(mine.company_id, p_user_id))))
  );
$$;
revoke all on function app.sees_user(uuid) from public, anon;
grant execute on function app.sees_user(uuid) to authenticated;

alter policy users_select on public.users
  using (id = (select auth.uid()) or app.sees_user(id));

-- the invite token of a membership: none (the app writes memberships only through four columns since 20261106110000 —
-- title, his_registration_number, can_sign_contracts, color; the invitations have their own table)
update public.memberships set invite_token_hash = null where invite_token_hash is not null;

-- the Stripe account of a company: the owner's and the admin's (company_secrets), not on the row every member reads
alter table public.company_secrets add column if not exists stripe_account_id text;
insert into public.company_secrets (company_id, stripe_account_id)
  select id, stripe_account_id from public.companies where stripe_account_id is not null
  on conflict (company_id) do update set stripe_account_id = excluded.stripe_account_id;
update public.companies set stripe_account_id = null where stripe_account_id is not null;
create or replace function app.tg_company_secret_off()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.stripe_account_id := case when tg_op = 'UPDATE' then old.stripe_account_id end;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_company_secret_off() from public, anon, authenticated;
drop trigger if exists t00_company_secret_off on public.companies;
create trigger t00_company_secret_off before insert or update on public.companies
  for each row execute function app.tg_company_secret_off();
