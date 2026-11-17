-- #1958 (а): a cost is written only over what the phone saw. Until now a save put its cost fields over whatever was there
-- (t30 with coalesce from the item's columns, and a plain upsert into catalog_item_costs): a cost changed meanwhile by
-- another phone or a price-list upload came back to the old one — and since 53-0б (#1807) the price counted from it too.
--
-- public.catalog_set_item_costs(p_item_id, p_costs, p_seen) — the new app's way to change an item's cost:
--   p_costs — the changed cost fields only, by column name (unit_cost_cents, vendor_tax_bps, markup_bps); a null clears;
--   p_seen  — what the phone had in the same fields before the change (null = none);
--   another value on the server in any of them → 40001 row_version_conflict, nothing written (the phone shows a card
--   and reads the truth again, as a group's price does — #1913). The rest of the fields stays as it is.
-- Only who sees our costs (app.can_view_costs) and works at the company (app.is_staff); an unknown or deleted item —
-- P0002 (the same answer for an item of another company). The writes the side table's triggers do stay as they are:
-- t32 counts a material's price from the new cost (53-0б), t98 spreads it to the item's price group (#1913), the cost
-- history writes «manual».
--
-- rule 16: nothing is renamed or dropped. Old builds keep writing as before (t30, the upsert): they cannot send what they
-- saw. Cutting them off is the founder's question (#1958 «вопрос»: the minimum version, #1949 / #1675).
-- rule 18: revoke from everyone, then execute for authenticated only.

create or replace function public.catalog_set_item_costs(p_item_id uuid, p_costs jsonb, p_seen jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  it    public.catalog_items;
  k     record;
  v_key text;
  v_now jsonb;
  v_cost bigint; v_tax int; v_markup int;
begin
  if p_costs is null or jsonb_typeof(p_costs) <> 'object' or p_costs = '{}'::jsonb
     or exists (select 1 from jsonb_object_keys(p_costs) x where x not in ('unit_cost_cents', 'vendor_tax_bps', 'markup_bps')) then
    raise exception 'costs: one or more of unit_cost_cents, vendor_tax_bps, markup_bps' using errcode = '22023';
  end if;
  if p_seen is not null and jsonb_typeof(p_seen) <> 'object' then
    raise exception 'seen: an object' using errcode = '22023';
  end if;
  -- the item, locked: two writers of one item's cost (or its first cost row) go one after the other
  select * into it from public.catalog_items i where i.id = p_item_id and i.deleted_at is null for update;
  if it.id is null or not app.is_staff(it.company_id) then
    raise exception 'catalog item not found' using errcode = 'P0002';
  end if;
  if not app.can_view_costs(it.company_id) then
    raise exception 'our costs are not this person''s to change' using errcode = '42501', hint = 'no_costs';
  end if;
  select c.unit_cost_cents, c.vendor_tax_bps, c.markup_bps into k
    from public.catalog_item_costs c where c.item_id = it.id and c.company_id = it.company_id for update;
  v_now := jsonb_build_object('unit_cost_cents', k.unit_cost_cents, 'vendor_tax_bps', k.vendor_tax_bps, 'markup_bps', k.markup_bps);
  -- what the phone saw is still there, field by field — or someone changed it first: nothing is written
  for v_key in select jsonb_object_keys(p_costs) loop
    if (v_now -> v_key) is distinct from coalesce(p_seen -> v_key, 'null'::jsonb) then
      raise exception 'the item''s cost changed meanwhile' using errcode = '40001', hint = 'row_version_conflict';
    end if;
  end loop;
  v_cost   := case when p_costs ? 'unit_cost_cents' then (p_costs ->> 'unit_cost_cents')::bigint else k.unit_cost_cents end;
  v_tax    := case when p_costs ? 'vendor_tax_bps'  then (p_costs ->> 'vendor_tax_bps')::int     else k.vendor_tax_bps end;
  v_markup := case when p_costs ? 'markup_bps'      then (p_costs ->> 'markup_bps')::int         else k.markup_bps end;
  insert into public.catalog_item_costs as c (item_id, company_id, unit_cost_cents, vendor_tax_bps, markup_bps, updated_by)
  values (it.id, it.company_id, v_cost, v_tax, v_markup, auth.uid())
  on conflict (item_id) do update
    set unit_cost_cents = excluded.unit_cost_cents, vendor_tax_bps = excluded.vendor_tax_bps, markup_bps = excluded.markup_bps,
        updated_at = now(), updated_by = auth.uid()
    where (c.unit_cost_cents, c.vendor_tax_bps, c.markup_bps) is distinct from (excluded.unit_cost_cents, excluded.vendor_tax_bps, excluded.markup_bps);
end;
$$;
revoke all on function public.catalog_set_item_costs(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.catalog_set_item_costs(uuid, jsonb, jsonb) to authenticated;
