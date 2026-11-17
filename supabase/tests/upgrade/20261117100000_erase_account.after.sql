-- After 50-1: the person who existed before the migration leaves through the NEW chain delete_account → app.erase_account on a
-- database that already had data: the profile is anonymised, the membership is deleted, the private note is gone, the owner and the
-- company are untouched; a second call is the same success; the erasure itself is not callable from outside.
set request.jwt.claim.sub = 'cf510000-0000-0000-0000-0000000000bb';
select set_config('request.jwt.claims', jsonb_build_object('sub', 'cf510000-0000-0000-0000-0000000000bb', 'amr', jsonb_build_array(
  jsonb_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint)))::text, false);
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.delete_account('DELETE');
  if not (r ->> 'deleted')::boolean or (r ->> 'repeat')::boolean then
    raise exception 'FAILED upgrade 20261117100000: delete_account did not delete (%)', r;
  end if;
  if not (public.delete_account('DELETE') ->> 'repeat')::boolean then
    raise exception 'FAILED upgrade 20261117100000: the second call is not a repeat';
  end if;
end $$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
do $$
begin
  if not exists (select 1 from public.users where id = 'cf510000-0000-0000-0000-0000000000bb' and deleted_at is not null and full_name = 'Deleted user') then
    raise exception 'FAILED upgrade 20261117100000: the profile is not anonymised';
  end if;
  if exists (select 1 from public.memberships where user_id = 'cf510000-0000-0000-0000-0000000000bb' and status <> 'deleted') then
    raise exception 'FAILED upgrade 20261117100000: the membership is not deleted';
  end if;
  if exists (select 1 from public.notes where created_by = 'cf510000-0000-0000-0000-0000000000bb' and visibility = 'private') then
    raise exception 'FAILED upgrade 20261117100000: the private note stayed';
  end if;
  if not exists (select 1 from public.memberships where user_id = 'cf510000-0000-0000-0000-0000000000aa' and status = 'active')
     or (select closed_at from public.companies where id = 'cf510000-0000-0000-0000-000000000001') is not null then
    raise exception 'FAILED upgrade 20261117100000: the owner or the company was touched';
  end if;
  if has_function_privilege('authenticated', 'app.erase_account(uuid,uuid[])', 'EXECUTE') then
    raise exception 'FAILED upgrade 20261117100000: erase_account is open to authenticated';
  end if;
end $$;
-- clean up: the main tests count users (the company stays, as in the other upgrade checks)
delete from public.notes where company_id = 'cf510000-0000-0000-0000-000000000001';
delete from public.memberships where company_id = 'cf510000-0000-0000-0000-000000000001';
delete from auth.users where id in ('cf510000-0000-0000-0000-0000000000aa', 'cf510000-0000-0000-0000-0000000000bb');
