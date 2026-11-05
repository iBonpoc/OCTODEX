-- After П3c: the old «on the way» visit keeps its step, with no left-at time (the app shows «в пути» without «с HH:MM»).
do $$
begin
  if (select status from public.visits where id = 'cfb70000-0000-0000-0000-000000000001') <> 'en_route' then
    raise exception 'upgrade: the visit on the way keeps its step'; end if;
  if (select en_route_at from public.visits where id = 'cfb70000-0000-0000-0000-000000000001') is not null then
    raise exception 'upgrade: no left-at time is made up for old visits'; end if;
end $$;
\echo 'upgrade 20261105360000_visit_en_route ok'
