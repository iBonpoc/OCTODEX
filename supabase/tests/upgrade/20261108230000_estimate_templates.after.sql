-- After E3a on a database with data: the old version is untouched, a new version of it still saves (the trigger
-- finds no template and counts nothing), the new tables start empty. The rows stay (as the other upgrade checks).
insert into public.estimate_versions (id, company_id, estimate_id, version_no, source, template_id) values
  ('cfe30000-0000-0000-0000-000000000005', 'cfe30000-0000-0000-0000-000000000000', 'cfe30000-0000-0000-0000-000000000003', 2, 'template', 'cfe30000-0000-0000-0000-0000000000ff');
do $$
begin
  if (select count(*) from public.estimate_versions where estimate_id = 'cfe30000-0000-0000-0000-000000000003' and source = 'template') <> 2 then
    raise exception 'FAILED upgrade 20261108230000: old versions changed';
  end if;
  if exists (select 1 from public.estimate_templates) or exists (select 1 from public.estimate_template_line_costs)
     or exists (select 1 from public.estimate_template_uses) then
    raise exception 'FAILED upgrade 20261108230000: new tables are not empty';
  end if;
end $$;
\echo 'upgrade 20261108230000 estimate templates on old estimates ok'
