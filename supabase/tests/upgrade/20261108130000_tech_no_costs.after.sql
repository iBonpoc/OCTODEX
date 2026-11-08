-- After «the tech does not see our costs»: the money moved to the side tables, the old places are blank,
-- the sent version is still locked (t40 back on), its document untouched.
do $$
declare v_hash text;
begin
  if (select row(unit_cost_cents, vendor_tax_bps, markup_bps) is distinct from row(1000::bigint, 1025, 1000)
        from public.catalog_item_costs where item_id = 'c1300000-0000-4000-8000-0000000000a1') is not false
     or exists (select 1 from public.catalog_item_costs where item_id = 'c1300000-0000-4000-8000-0000000000a2')
     or exists (select 1 from public.catalog_items where company_id = 'c1300000-0000-4000-8000-000000000001'
                 and (unit_cost_cents is not null or vendor_tax_bps is not null or markup_bps is not null))
     or (select unit_price_cents from public.catalog_items where id = 'c1300000-0000-4000-8000-0000000000a1') <> 1213 then
    raise exception 'FAILED: T99 upgrade — catalog costs moved to catalog_item_costs, the rows blank, the price kept';
  end if;
  if (select array_agg(margin_pct order by version_id) from public.estimate_version_costs
       where company_id = 'c1300000-0000-4000-8000-000000000001') is distinct from array['41.2', '38.5']
     or exists (select 1 from public.estimate_versions where company_id = 'c1300000-0000-4000-8000-000000000001' and totals ? 'marginPct')
     or (select totals from public.estimate_versions where id = 'c1300000-0000-4000-8000-0000000000f2') <> '{"total": 90000, "deposit": 9000}'::jsonb
     or (select locked_at is null or calc_inputs <> '{"options":[]}'::jsonb from public.estimate_versions where id = 'c1300000-0000-4000-8000-0000000000f2') then
    raise exception 'FAILED: T100 upgrade — margins moved to estimate_version_costs, totals without marginPct, the sent version kept';
  end if;
  if exists (select 1 from pg_trigger t where t.tgrelid = 'public.estimate_versions'::regclass and not t.tgisinternal and t.tgenabled <> 'O') then
    raise exception 'FAILED: T100 upgrade — every trigger of estimate_versions is on again';
  end if;
  -- the open draft lost the cost in its document (M1), the rest of the line is there; its tax snapshot untouched
  if (select calc_inputs from public.estimate_versions where id = 'c1300000-0000-4000-8000-0000000000f1')
       <> '{"options":[{"id":"o1","name":"A","lines":[{"id":"l1","name":"Bracket","unitPriceCents":1213,"quantity":"2"}]}]}'::jsonb
     or not (select tax_enabled from public.estimate_versions where id = 'c1300000-0000-4000-8000-0000000000f1') then
    raise exception 'FAILED: T100 upgrade — an open document loses only unitCostCents';
  end if;
  begin
    update public.estimate_versions set totals = '{"total": 1}' where id = 'c1300000-0000-4000-8000-0000000000f2';
    raise exception 'FAILED: T100 upgrade — a locked version was changed after the migration';
  exception when insufficient_privilege then null;
  end;
  if (select cost_cents from public.leads where id = 'c1300000-0000-4000-8000-0000000000b1') is not null
     or (select cost_cents from public.lead_costs where lead_id = 'c1300000-0000-4000-8000-0000000000b1') <> 4500
     or exists (select 1 from public.lead_sources where default_cost_cents is not null) then
    raise exception 'FAILED: T99 upgrade (P4) — leads.cost_cents and lead_sources.default_cost_cents blank, lead_costs kept';
  end if;
end $$;
\echo 'T99/T100 upgrade: costs and margins moved to the side tables, old places blank, sent version still locked ok'
