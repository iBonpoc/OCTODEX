-- After Почта П1a: the queue exists and is empty — old signed contracts get no letter; their estimate is untouched.
do $$
begin
  if (select count(*) from public.email_outbox) <> 0 then
    raise exception 'upgrade: no copies queued for contracts signed before the migration'; end if;
  if (select status from public.estimates where id = 'cf353000-0000-0000-0000-000000000001') <> 'approved' then
    raise exception 'upgrade: the old contract stays approved'; end if;
  if (select email from app.estimate_client_email('cf353000-0000-0000-0000-000000000001')) is distinct from 'old@example.com' then
    raise exception 'upgrade: the cached contacts.email is the client address when there is no contact_emails row'; end if;
end $$;
\echo 'upgrade 20261105350000_email_outbox ok'
