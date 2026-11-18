-- After 50-3: the person who had a picture before the migration leaves; his picture's object waits for the Storage API, the file row
-- is gone, the owner and the company are untouched.
set request.jwt.claim.sub = 'cf5a0000-0000-0000-0000-0000000000bb';
select set_config('request.jwt.claims', jsonb_build_object('sub', 'cf5a0000-0000-0000-0000-0000000000bb', 'amr', jsonb_build_array(
  jsonb_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint)))::text, false);
set role authenticated;
select public.delete_account('DELETE');
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
set role service_role;
select app.erase_queue_run();
reset role;
do $$
begin
  if not exists (select 1 from app.storage_erase_queue where bucket = 'files' and path = 'cf5a0000-0000-0000-0000-000000000001/upgrade-avatar.jpg' and done_at is null) then
    raise exception 'FAILED upgrade 20261117200000: the picture''s object is not queued';
  end if;
  if exists (select 1 from public.files where id = 'cf5a0000-0000-0000-0000-0000000000f1') then
    raise exception 'FAILED upgrade 20261117200000: the picture''s file row stayed';
  end if;
  if not exists (select 1 from public.memberships where user_id = 'cf5a0000-0000-0000-0000-0000000000aa' and status = 'active') then
    raise exception 'FAILED upgrade 20261117200000: the owner was touched';
  end if;
end $$;
-- clean up: the main tests count users (the queue row stays for the main tests' own drains)
delete from app.storage_erase_queue where path like 'cf5a0000-%';
delete from public.memberships where company_id = 'cf5a0000-0000-0000-0000-000000000001';
delete from auth.users where id in ('cf5a0000-0000-0000-0000-0000000000aa', 'cf5a0000-0000-0000-0000-0000000000bb');
