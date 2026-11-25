-- The developer's company: add-on modules without a term (founder 22.11.2026, #2410; К1).
--
-- The founder's word: «Сделай мой аккаунт… аккаунт разработчика, чтобы пробный период никогда не заканчивался».
-- A company marked as the developer's has every module it switched on active with no end: app.module_active reads the
-- flag next to the trial and the payment. The module still has to be switched on (enabled) — «Отключить» works as before.
-- trial_ends_at, paid_until and module_enable are not touched: billing's columns stay billing's.
--
-- Who sets the flag: only this migration and service_role (the operator). The app never writes it — the update grant on
-- public.companies is per column (20261117566000_companies_update) and this column is not in it; the insert grant is
-- (id, name), so a new company always starts without it. Members read it (the app shows «Без срока»): the select grant
-- on companies covers the whole row today; it is granted on this column as well, so a later per-column select grant
-- can not drop it silently. RLS companies_select stays: a company's own members only.
-- db T470.
--
-- rule 16: only added (a column with a default, a function replaced with the same signature and result); an old build
-- does not read the column and sees the module as before; the server simply accepts its writes.
-- rule 18: app.module_active is replaced — its rights are set again: nobody, then authenticated (RLS and the app call it);
-- the trigger function — for nobody.

-- a column with a constant default: a catalog-only change in Postgres 11+, no table rewrite, no long lock
alter table public.companies add column if not exists developer_account boolean not null default false;

revoke all (developer_account) on public.companies from anon, authenticated;
grant select (developer_account) on public.companies to authenticated;

-- a second lock, should a later grant ever open the column (security-check): the app's own writes never change the flag
-- (insert — off; update — as it was), as t00_company_secret_off keeps stripe_account_id
create or replace function app.tg_company_developer_off()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.developer_account := case when tg_op = 'UPDATE' then old.developer_account else false end;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_company_developer_off() from public, anon, authenticated;
drop trigger if exists t01_company_developer_off on public.companies;
create trigger t01_company_developer_off before insert or update on public.companies
  for each row execute function app.tg_company_developer_off();

create or replace function app.module_active(p_company_id uuid, p_module_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_member(p_company_id) and exists (
    select 1 from public.company_modules cm
     where cm.company_id = p_company_id
       and cm.module_key = p_module_key
       and cm.enabled
       and (cm.trial_ends_at > now()
            or cm.paid_until > now()
            or exists (select 1 from public.companies c where c.id = p_company_id and c.developer_account))
  );
$$;
revoke all on function app.module_active(uuid, text) from public, anon, authenticated;
grant execute on function app.module_active(uuid, text) to authenticated;

-- the founder's company. Only its id: the repository is open. On a clean database no row matches.
update public.companies set developer_account = true where id = '01a1eb73-a746-728b-b42d-8cfcd8eaeae4';
