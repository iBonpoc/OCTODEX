-- After П2: the inspection job moved by 20261105280000 has its line in the status journal, once.
do $$
begin
  if (select count(*) from public.status_events where entity_type = 'job' and entity_id = 'cfa40000-0000-0000-0000-000000000001' and to_status = 'deleted') <> 1 then
    raise exception 'upgrade: the moved inspection job is in the status journal once'; end if;
  if exists (select 1 from public.status_events where entity_type = 'job' and entity_id = 'cfa40000-0000-0000-0000-000000000002' and to_status = 'deleted') then
    raise exception 'upgrade: an untouched job gets no journal line'; end if;
end $$;
\echo 'upgrade 20261105300000_cancel_visit ok'
