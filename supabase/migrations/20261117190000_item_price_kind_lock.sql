-- #1965 (К1, a finding of the independent check of 53-0б-2): sales without our costs on an old build could switch a material
-- counted from its cost (price_from_cost) to service / labor and send its own price in the same save — t31 does not count a
-- non-material, so the hand price stayed (no cost leaked, but the lock was got round). Now an author without
-- app.can_view_costs keeps the kind of such an item: the row stays a material, the formula's rules apply (the old price
-- stays for them, the sent one is noted in catalog_price_recalc). The new app never sends such a change (53-0б-2, #1970).
-- Only the body of app.tg_item_price changes (rule 16: the same name, the same trigger t31).
create or replace function app.tg_item_price()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_due    boolean := false;
  k        record;
  v_price  bigint;
  v_can    boolean;
  v_sent   boolean;
  v_other  boolean;
  v_echo   boolean;
begin
  -- the flag first, before any return: a later row of the same command or transaction must not inherit it
  if tg_op = 'UPDATE' then
    v_due := coalesce(current_setting('app.item_price_due', true), '') = old.id::text;
  end if;
  perform set_config('app.item_price_due', '', true);

  -- #1965: an author without our costs does not turn a counted material into another kind (the lock is not got round)
  if tg_op = 'UPDATE' and old.kind = 'material' and old.price_from_cost and new.kind is distinct from 'material'
     and auth.uid() is not null and not app.can_view_costs(new.company_id) then
    new.kind := old.kind;
  end if;
  -- a new row has no cost row yet (t95 moves the cost with an update of the row, and that update counts the price)
  if tg_op = 'INSERT' or new.kind is distinct from 'material' then
    new.price_from_cost := false;
    return new;
  end if;
  select c.unit_cost_cents, c.vendor_tax_bps, c.markup_bps into k
    from public.catalog_item_costs c where c.item_id = old.id and c.company_id = new.company_id;
  new.price_from_cost := k.unit_cost_cents is not null;
  -- no cost: the price is the hand price; in the trash: not counted (it comes back counted, below)
  if k.unit_cost_cents is null or new.deleted_at is not null then
    return new;
  end if;

  v_price := app.item_price_cents(k.unit_cost_cents, k.vendor_tax_bps, k.markup_bps);
  v_can   := auth.uid() is null or app.can_view_costs(new.company_id);
  -- a null price is no «sent price»: the item's own not null refuses the row (never an error of the note below)
  v_sent  := new.unit_price_cents is not null and new.unit_price_cents is distinct from old.unit_price_cents;
  v_other := v_sent or old.kind is distinct from 'material' or (old.deleted_at is not null and new.deleted_at is null);
  if not (v_due or v_other) then
    return new;  -- a rename, a photo, a code: an off-formula price stays (spec 53 §5.3б п.2)
  end if;

  -- a price the client sent and the server replaces: noted for the office, unless it is a stale echo (an old phone sends
  -- its whole cached row: the sent price is the price this item had before its last change)
  if v_sent and new.unit_price_cents is distinct from (case when v_can then v_price else old.unit_price_cents end) then
    select exists (
      select 1 from (select h.prev_unit_price_cents from public.catalog_price_history h
                      where h.company_id = new.company_id and h.item_id = old.id and h.unit_price_cents is not null
                      order by h.at desc, h.id desc limit 1) last
       where last.prev_unit_price_cents = new.unit_price_cents) into v_echo;
    -- the same price sent again by the same person is one note (a phone retrying, or saving again and again)
    if not v_echo and not exists (
         select 1 from (select r.sent_price_cents, r.by from public.catalog_price_recalc r
                         where r.company_id = new.company_id and r.item_id = old.id
                         order by r.at desc, r.id desc limit 1) last
          where last.sent_price_cents = new.unit_price_cents and last.by is not distinct from auth.uid()) then
      -- the FK is on old.id: a client that changes the id and sends a price fails its own save, nothing else
      insert into public.catalog_price_recalc (company_id, item_id, sent_price_cents, server_price_cents, by)
      values (new.company_id, old.id, new.unit_price_cents,
              case when v_can then v_price else old.unit_price_cents end, auth.uid());
    end if;
  end if;

  -- the formula only for an author who sees our costs (or none: a migration, a server job). The «price due» flag never
  -- grants it: t30 and t32 run for such an author anyway, so a forged flag gives a non-viewer nothing (security check)
  if v_can then
    new.unit_price_cents := v_price;
  else
    -- without our costs the author never gets the formula back (check 2, Б1): the price stays as it was
    new.unit_price_cents := old.unit_price_cents;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_item_price() from public, anon, authenticated;
