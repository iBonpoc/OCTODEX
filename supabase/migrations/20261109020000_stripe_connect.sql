-- Step 20b: connecting Stripe from «Компания → Онлайн-оплата» (docs/specs/35-stripe.md §5). Test mode only.
-- The Edge Function stripe-connect (verify_jwt = true) takes the person from the JWT and calls, as service_role:
-- * public.stripe_connect_target(user, company) — may this person connect payments (the OWNER only, active: the Stripe
--   account with its full dashboard and payouts belongs to whoever fills the form — not an admin; security-check 20b №1), and the
--   company's account id and name for the Stripe form;
-- * public.stripe_account_save(company, account) — keeps what Stripe says about the account (app.stripe_account_sync).
-- PostgREST shows only the public schema: these are the doors, app.* stays closed (rule 18, T52).

create or replace function public.stripe_connect_target(p_user_id uuid, p_company_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'allowed', exists (select 1 from public.memberships m
                        where m.company_id = c.id and m.user_id = p_user_id and m.status = 'active' and m.role = 'owner'),
    'account_id', (select s.account_id from public.stripe_accounts s where s.company_id = c.id),
    'name', coalesce(nullif(c.dba, ''), c.name),
    'closed', c.closed_at is not null)
    from public.companies c where c.id = p_company_id;
$$;
revoke all on function public.stripe_connect_target(uuid, uuid) from public, anon, authenticated;
grant execute on function public.stripe_connect_target(uuid, uuid) to service_role;

create or replace function public.stripe_account_save(p_company_id uuid, p_account jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.stripe_accounts;
begin
  if exists (select 1 from public.companies where id = p_company_id and closed_at is not null) then
    raise exception 'the company is closed' using errcode = '42501';
  end if;
  r := app.stripe_account_sync(p_company_id, p_account);
  return jsonb_build_object('charges_enabled', r.charges_enabled, 'payouts_enabled', r.payouts_enabled,
                            'details_submitted', r.details_submitted, 'requirements_due', r.requirements_due,
                            'disabled_reason', r.disabled_reason, 'livemode', r.livemode);
end;
$$;
revoke all on function public.stripe_account_save(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.stripe_account_save(uuid, jsonb) to service_role;
