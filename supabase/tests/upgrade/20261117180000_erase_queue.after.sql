-- After 50-2: a person who existed before the migration leaves; the queue takes him; the job redacts his journal rows and
-- empties «by» in the history; the owner's rows and the company stay.
set request.jwt.claim.sub = 'cf520000-0000-0000-0000-0000000000bb';
select set_config('request.jwt.claims', jsonb_build_object('sub', 'cf520000-0000-0000-0000-0000000000bb', 'amr', jsonb_build_array(
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
  if not exists (select 1 from app.erase_queue where user_id = 'cf520000-0000-0000-0000-0000000000bb' and done_at is not null) then
    raise exception 'FAILED upgrade 20261117180000: the person is not done in the queue';
  end if;
  if exists (select 1 from public.audit_log where entity_type = 'memberships' and entity_id = 'cf520000-0000-0000-0000-0000000000b1'
              and (before ->> 'title' is not null or after ->> 'title' is not null or before ->> 'his_registration_number' is not null
                   or after ->> 'his_registration_number' is not null)) then
    raise exception 'FAILED upgrade 20261117180000: the journal still holds the title or the HIS number';
  end if;
  if exists (select 1 from public.catalog_cost_history where by = 'cf520000-0000-0000-0000-0000000000bb')
     or not exists (select 1 from public.catalog_cost_history where item_id = 'cf520000-0000-0000-0000-0000000000c1' and by is null) then
    raise exception 'FAILED upgrade 20261117180000: the cost history row is gone or still names the person';
  end if;
  if not exists (select 1 from public.memberships where user_id = 'cf520000-0000-0000-0000-0000000000aa' and status = 'active') then
    raise exception 'FAILED upgrade 20261117180000: the owner was touched';
  end if;
end $$;
-- clean up: the main tests count users (the company stays, as in the other upgrade checks)
delete from public.catalog_cost_history where item_id = 'cf520000-0000-0000-0000-0000000000c1';
delete from public.catalog_items where id = 'cf520000-0000-0000-0000-0000000000c1';
delete from public.memberships where company_id = 'cf520000-0000-0000-0000-000000000001';
delete from auth.users where id in ('cf520000-0000-0000-0000-0000000000aa', 'cf520000-0000-0000-0000-0000000000bb');
