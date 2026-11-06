-- after 20261106160000: the old row is untouched and does not move any more
do $$
begin
  if (select ein from public.company_secrets where company_id = 'c1600000-0000-4000-8000-000000000001') is distinct from '11-1111111' then
    raise exception 'FAILED: upgrade 160000 old EIN changed';
  end if;
  begin
    update public.company_secrets set company_id = 'c1600000-0000-4000-8000-000000000002' where company_id = 'c1600000-0000-4000-8000-000000000001';
    raise exception 'FAILED: upgrade 160000 old EIN moved';
  exception when sqlstate '42501' then null;
  end;
end $$;
delete from public.company_secrets where company_id = 'c1600000-0000-4000-8000-000000000001';
\echo 'upgrade 20261106160000 old secrets stay put ok'
