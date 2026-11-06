-- After wave 7а-2a: nothing about the existing people changes — no company is closed, everyone is alive and still sees
-- the company; the tightened policies (companies_select, tasks) keep working for members.
do $$
begin
  if (select closed_at from public.companies where id = 'cf500000-0000-0000-0000-000000000001') is not null then
    raise exception 'FAILED upgrade 20261106200000: an existing company got closed';
  end if;
  if exists (select 1 from public.users where id in ('cf500000-0000-0000-0000-0000000000aa', 'cf500000-0000-0000-0000-0000000000bb') and deleted_at is not null) then
    raise exception 'FAILED upgrade 20261106200000: an existing person looks deleted';
  end if;
end $$;
set request.jwt.claim.sub = 'cf500000-0000-0000-0000-0000000000bb';
set role authenticated;
do $$
begin
  if not app.account_alive() then
    raise exception 'FAILED upgrade 20261106200000: an existing account is not alive';
  end if;
  if (select count(*) from public.companies where id = 'cf500000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FAILED upgrade 20261106200000: a member lost the company (companies_select)';
  end if;
end $$;
reset role;
reset request.jwt.claim.sub;
-- clean up: the main tests count users (the company stays, as in the other upgrade checks)
delete from public.memberships where company_id = 'cf500000-0000-0000-0000-000000000001';
delete from auth.users where id in ('cf500000-0000-0000-0000-0000000000aa', 'cf500000-0000-0000-0000-0000000000bb');
