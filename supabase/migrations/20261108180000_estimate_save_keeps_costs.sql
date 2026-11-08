-- A tech's edit of a draft no longer erases the office's costs and margin (debt after #383, spec 19 §9).
--
-- Every app version saves a draft by deleting its estimate_line_items and inserting them again (same line ids). The
-- delete cascades to estimate_line_costs; the office then writes the costs back, but a tech cannot (RLS:
-- app.can_view_costs) — so after a tech's save the lines had no cost. And the tech's app sends totals.marginPct = null
-- (it has no costs), which t45 wrote over the office's margin.
--
-- Fixed on the server, so old phones are covered too (no app change needed):
--   * a line deleted by someone who does not see costs leaves its cost in estimate_line_costs_kept; when a line with
--     the same id comes back (the insert right after the delete, or the same op resent later) the cost returns to it;
--   * a margin sent by someone who does not see costs is dropped (the office's margin stays).
-- A line the tech removed for good: its kept cost is never used and goes after 30 days. Rule 16: new table, new
-- functions, one function body replaced (same signature) — nothing renamed or dropped.

-- ---- the kept costs: no one reads or writes them but the two triggers ------------------------
create table public.estimate_line_costs_kept (
  line_item_id              uuid primary key,
  company_id                uuid not null references public.companies (id) on delete cascade,
  -- the version the line was in: the cost comes back only to a line of the same version (never another estimate)
  version_id                uuid not null,
  unit_cost_cents           bigint not null,
  unit_material_cost_cents  bigint,
  purchase_tax_bps          int,
  markup_bps                int,
  line_cost_cents           bigint,
  currency                  char(3) not null,
  kept_at                   timestamptz not null default now()
);
revoke all on public.estimate_line_costs_kept from anon, authenticated;
create index estimate_line_costs_kept_company_idx on public.estimate_line_costs_kept (company_id);  -- the FK; a new table
create index estimate_line_costs_kept_at_idx on public.estimate_line_costs_kept (kept_at);           -- the 30-day sweep
create trigger t11_company_id_immutable before update on public.estimate_line_costs_kept
  for each row execute function app.tg_company_id_immutable();
alter table public.estimate_line_costs_kept enable row level security;
alter table public.estimate_line_costs_kept force row level security;
-- no policy: the tables' owner (the triggers, security definer) only

-- BEFORE DELETE of a line: whoever does not see costs (a JWT without can_view_costs) — keep the cost aside.
-- The office's own delete is not kept: it writes its costs back itself (and a cleared cost must stay cleared).
create or replace function app.tg_line_cost_keep()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not app.can_view_costs(old.company_id) then
    delete from public.estimate_line_costs_kept where kept_at < now() - interval '30 days';
    insert into public.estimate_line_costs_kept as k (line_item_id, company_id, version_id, unit_cost_cents,
                                                     unit_material_cost_cents, purchase_tax_bps, markup_bps, line_cost_cents, currency)
    select c.line_item_id, c.company_id, eo.version_id, c.unit_cost_cents, c.unit_material_cost_cents,
           c.purchase_tax_bps, c.markup_bps, c.line_cost_cents, c.currency
      from public.estimate_line_costs c
      join public.estimate_options eo on eo.id = old.option_id and eo.company_id = old.company_id
     where c.line_item_id = old.id and c.company_id = old.company_id and c.deleted_at is null
    on conflict (line_item_id) do update
      set version_id = excluded.version_id, unit_cost_cents = excluded.unit_cost_cents, unit_material_cost_cents = excluded.unit_material_cost_cents,
          purchase_tax_bps = excluded.purchase_tax_bps, markup_bps = excluded.markup_bps,
          line_cost_cents = excluded.line_cost_cents, currency = excluded.currency, kept_at = now()
      -- a row kept for another company is never overwritten (security-check: the line id is free once deleted,
      -- another company may reuse it and must not plant a cost for A)
      where k.company_id = excluded.company_id;
  end if;
  return old;
end;
$$;

-- AFTER INSERT of a line by who does not see costs: a cost kept for this id (same company) goes back to it. The
-- line's own company only: a line id sent by another company finds nothing. The office's insert takes nothing back
-- (it sends its own costs; one it cleared must stay cleared, review №1) and drops what was kept for that id.
-- A cost already there wins.
create or replace function app.tg_line_cost_restore()
returns trigger language plpgsql security definer set search_path = '' as $$
declare k public.estimate_line_costs_kept;
begin
  delete from public.estimate_line_costs_kept where kept_at < now() - interval '30 days';
  if auth.uid() is null or app.can_view_costs(new.company_id) then
    delete from public.estimate_line_costs_kept where line_item_id = new.id and company_id = new.company_id;
    return null;
  end if;
  delete from public.estimate_line_costs_kept
   where line_item_id = new.id and company_id = new.company_id
     and version_id = (select eo.version_id from public.estimate_options eo where eo.id = new.option_id)
  returning * into k;
  if found then
    -- created_by becomes the tech (t10 stamps the writer); the figure is the office's — the residual of §9.1
    insert into public.estimate_line_costs (line_item_id, company_id, unit_cost_cents, unit_material_cost_cents,
                                            purchase_tax_bps, markup_bps, line_cost_cents, currency)
    values (k.line_item_id, k.company_id, k.unit_cost_cents, k.unit_material_cost_cents,
            k.purchase_tax_bps, k.markup_bps, k.line_cost_cents, k.currency)
    on conflict (line_item_id) do nothing;
  end if;
  return null;
end;
$$;
revoke all on function app.tg_line_cost_keep(), app.tg_line_cost_restore() from public, anon, authenticated;

create trigger t35_cost_keep before delete on public.estimate_line_items
  for each row execute function app.tg_line_cost_keep();
create trigger t95_cost_restore after insert on public.estimate_line_items
  for each row execute function app.tg_line_cost_restore();

-- ---- the margin: only who sees costs sets it --------------------------------------------------
-- Same as 20261108130000 except the margin is written only by who sees costs (or a migration, no JWT); the key is
-- taken out of totals in any case. Who does not see costs keeps the margin while the total stays, and makes it
-- «not counted» (null) when the total changes.
create or replace function app.tg_version_margin_move()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.calc_inputs := app.doc_without_costs(new.calc_inputs);
  if jsonb_typeof(new.totals) = 'object' and new.totals ? 'marginPct' then
    if auth.uid() is null or app.can_view_costs(new.company_id) then
      insert into public.estimate_version_costs as k (version_id, company_id, margin_pct)
      values (old.id, new.company_id, new.totals ->> 'marginPct')
      on conflict (version_id) do update set margin_pct = excluded.margin_pct, updated_at = now();
    elsif (old.totals -> 'total') is distinct from (new.totals -> 'total') then
      -- the tech changed the money: the office's margin is no longer true — «not counted» until the office saves
      -- (a wrong number about money is worse than none, review №2)
      update public.estimate_version_costs set margin_pct = null, updated_at = now() where version_id = old.id;
    end if;
    new.totals := new.totals - 'marginPct';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_version_margin_move() from public, anon, authenticated;
