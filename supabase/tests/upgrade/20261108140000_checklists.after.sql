-- CH1a: the old arrays became rows; old phones read the same list back (rule 16, step 1)
do $$
declare n integer;
begin
  select count(*) into n from public.visit_checklist_items where visit_id = 'c1010000-0000-4000-8000-0000000000f1';
  if n <> 3 then raise exception 'T101 upgrade: 3 good items of the first visit become rows, junk is left out (got %)', n; end if;
  if not exists (select 1 from public.visit_checklist_items where id = 'c1010000-0000-4000-8000-0000000000a1' and done and required and kind = 'check' and position = 0) then
    raise exception 'T101 upgrade: a uuid item keeps its id and tick, is required, a tick item';
  end if;
  if (select count(*) from public.visit_checklist_items where id = 'c1010000-0000-4000-8000-0000000000a3') <> 1 then
    raise exception 'T101 upgrade: the same id in two visits is one row';
  end if;
  if (select count(*) from public.visit_checklist_items where visit_id = 'c1010000-0000-4000-8000-0000000000f2') <> 1 then
    raise exception 'T101 upgrade: the second visit keeps its item under a new id';
  end if;
  -- the mirror: every visit reads its rows, in order; the non-uuid id is replaced by the row's id
  if exists (select 1 from public.visits v where v.company_id = 'c1010000-0000-4000-8000-000000000001'
              and v.checklist is distinct from app.chk_items_json(v.id)) then
    raise exception 'T101 upgrade: visits.checklist is the mirror of the rows';
  end if;
  if (select checklist -> 1 ->> 'label' from public.visits where id = 'c1010000-0000-4000-8000-0000000000f1') <> 'Clean up'
     or (select checklist -> 1 ->> 'id' from public.visits where id = 'c1010000-0000-4000-8000-0000000000f1') = 'v1-c1' then
    raise exception 'T101 upgrade: order kept, the non-uuid id gets a uuid';
  end if;
  if (select checklist from public.visits where id = 'c1010000-0000-4000-8000-0000000000f3') <> '[]'::jsonb then
    raise exception 'T101 upgrade: an empty list stays empty';
  end if;
  if (select checklist_since from public.companies where id = 'c1010000-0000-4000-8000-000000000001') is null
     or (select visit_settings from public.companies where id = 'c1010000-0000-4000-8000-000000000001') <> '{}'::jsonb then
    raise exception 'T101 upgrade: an existing company gets the defaults';
  end if;
end $$;
-- clean up as 050000 does: every child of the company (seeded rows too), then the company
do $$
declare r record;
begin
  set local session_replication_role = replica;
  for r in select c.conrelid::regclass as tbl, a.attname as col
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid = 'public.companies'::regclass loop
    execute format('delete from %s where %I = %L', r.tbl, r.col, 'c1010000-0000-4000-8000-000000000001');
  end loop;
  delete from public.companies where id = 'c1010000-0000-4000-8000-000000000001';
  set local session_replication_role = origin;
end $$;
