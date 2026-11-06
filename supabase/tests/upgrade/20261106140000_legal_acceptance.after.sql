-- After wave 7а-1: the old member keeps working (the app's gate asks for the consent, the server does not lock them out);
-- no consent is invented after the fact; a new company needs the consent.
do $$
begin
  if (select status from public.memberships where user_id = 'cf490000-0000-0000-0000-0000000000aa') <> 'active' then
    raise exception 'FAILED upgrade 20261106140000: the old member is no longer active';
  end if;
  if exists (select 1 from public.legal_acceptance where user_id = 'cf490000-0000-0000-0000-0000000000aa') then
    raise exception 'FAILED upgrade 20261106140000: a consent was made up for an old member';
  end if;
end $$;
set request.jwt.claim.sub = 'cf490000-0000-0000-0000-0000000000aa';
set role authenticated;
do $$
begin
  if not app.is_member('cf490000-0000-0000-0000-000000000001') then
    raise exception 'FAILED upgrade 20261106140000: the old member lost the company';
  end if;
  if (select count(*) from public.companies where id = 'cf490000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FAILED upgrade 20261106140000: the old member does not see the company';
  end if;
  if app.has_current_legal() then
    raise exception 'FAILED upgrade 20261106140000: has_current_legal without a consent';
  end if;
  begin
    insert into public.companies (name) values ('Upgrade Legal Second Co');
    raise exception 'FAILED upgrade 20261106140000: a new company without the consent';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
reset request.jwt.claim.sub;
-- clean up: the main tests count users (the company stays, as in the other upgrade checks)
delete from public.memberships where company_id = 'cf490000-0000-0000-0000-000000000001';
delete from auth.users where id = 'cf490000-0000-0000-0000-0000000000aa';
