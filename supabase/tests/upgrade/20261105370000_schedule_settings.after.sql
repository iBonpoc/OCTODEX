-- After П4a on a database with data: every company has '{}' settings; good hours stay, junk hours become null (= defaults).
do $$
begin
  if (select count(*) from public.companies where id::text like 'cfc00000-%' and schedule_settings = '{}'::jsonb) <> 3 then
    raise exception 'FAILED upgrade 20261105370000: schedule_settings is not {} on old companies';
  end if;
  if (select business_hours from public.companies where id = 'cfc00000-0000-0000-0000-000000000001') is not null then
    raise exception 'FAILED upgrade 20261105370000: null hours changed';
  end if;
  if (select business_hours from public.companies where id = 'cfc00000-0000-0000-0000-000000000002') is not null then
    raise exception 'FAILED upgrade 20261105370000: junk hours were kept';
  end if;
  if (select business_hours from public.companies where id = 'cfc00000-0000-0000-0000-000000000003') <> '{"mon": [420, 960], "sun": null}'::jsonb then
    raise exception 'FAILED upgrade 20261105370000: good hours changed';
  end if;
end $$;
\echo 'upgrade 20261105370000 schedule settings on old companies ok'
