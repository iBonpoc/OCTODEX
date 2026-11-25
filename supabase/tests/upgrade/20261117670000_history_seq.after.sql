-- After #2250: the old rows are numbered by (at, id) — the last one of «at desc, id desc» has the largest seq — with no
-- gap and no repeat; the next row of each table gets the next number (no collision with *_seq_key).
do $$
declare t text; got text; want text; n bigint; m bigint;
begin
  foreach t in array array['catalog_cost_history', 'catalog_price_history', 'catalog_price_recalc'] loop
    execute format('select string_agg(id::text, '','' order by seq), string_agg(id::text, '','' order by at, id) from public.%I
                     where company_id = %L', t, 'cacc0000-0000-4000-8000-000000000468') into got, want;
    if got is distinct from want or got is null then
      raise exception 'UPG468 %: seq is not the order (at, id): % / %', t, got, want;
    end if;
    execute format('select count(*), max(seq) from public.%I', t) into n, m;
    if n <> m then
      raise exception 'UPG468 %: % rows numbered up to % — a gap or a repeat', t, n, m;
    end if;
  end loop;
  set local session_replication_role = replica;
  insert into public.catalog_price_history (company_id, item_id, unit_price_cents, prev_unit_price_cents)
  values ('cacc0000-0000-4000-8000-000000000468', 'cacc0000-0000-4000-8000-0000000004d1', 110, 100);
  insert into public.catalog_cost_history (company_id, item_id, unit_cost_cents, vendor_tax_bps, source)
  values ('cacc0000-0000-4000-8000-000000000468', 'cacc0000-0000-4000-8000-0000000004d1', 40, 0, 'manual');
  insert into public.catalog_price_recalc (company_id, item_id, sent_price_cents, server_price_cents)
  values ('cacc0000-0000-4000-8000-000000000468', 'cacc0000-0000-4000-8000-0000000004d1', 3, 110);
  set local session_replication_role = origin;
  foreach t in array array['catalog_cost_history', 'catalog_price_history', 'catalog_price_recalc'] loop
    execute format('select count(*), max(seq) from public.%I', t) into n, m;
    if n <> m then raise exception 'UPG468 %: the next row did not get the next number (% rows, max %)', t, n, m; end if;
  end loop;
end $$;
\echo 'UPG468 the old history rows are numbered by (at, id), the next row is after them'
do $$
declare r record;
begin
  set local session_replication_role = replica;
  for r in select c.conrelid::regclass as tbl, a.attname as col
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid = 'public.companies'::regclass loop
    execute format('delete from %s where %I = %L', r.tbl, r.col, 'cacc0000-0000-4000-8000-000000000468');
  end loop;
  delete from public.companies where id = 'cacc0000-0000-4000-8000-000000000468';
  set local session_replication_role = origin;
end $$;
