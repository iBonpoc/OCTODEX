-- #1926 PR 2/4 (spec 53 §8а.12, variant (а″)): the exact cost of a unit in thousandths of a cent on the estimate's lines
-- and the templates' lines. PR 1/4 (20261117630000) put it on the catalog; here it follows into
--   estimate_line_costs, estimate_line_costs_kept (a tech's save), estimate_template_line_costs;
--   the triggers that copy a line's cost (keep / restore / copy), save_estimate_version, the template's cost move;
--   the cost keys a tech and a client never see (app.doc_without_costs, the template check).
-- The same rule as the catalog (app.tg_cost_millicents, t08): the exact value is the truth, unit_cost_cents its mirror
-- (half up), an echo of the old mirror keeps the exact value. The client's price stays whole cents.
-- New here (the director's note 19.11): a save deletes the lines and inserts them again (save_estimate_version and the
-- older ops.ts path); an office's delete takes the cost row with it, so «an echo keeps the exact value» had no row to
-- keep it on — an old office build would turn 22 500 into 23 000. The server keeps the exact value of a deleted cost
-- aside (estimate_line_cost_exact) and gives it back to the line's next cost when the cents sent are its mirror; a line
-- copied into a new version takes the exact value of the line it was copied from the same way.
-- Purchase orders (3/4) and the phone (4/4) follow. unit_material_cost_cents stays in cents (audit Р1).
-- rule16: step 1 — only new columns, a new table and new behaviour; nothing renamed or dropped.

-- ---- the columns ------------------------------------------------------------------------------------------------------
alter table public.estimate_line_costs add column if not exists unit_cost_millicents bigint;
alter table public.estimate_line_costs_kept add column if not exists unit_cost_millicents bigint;
alter table public.estimate_template_line_costs add column if not exists unit_cost_millicents bigint;

-- the old rows: exact = cents × 1000. Not through the triggers: nothing changed for a person (a locked version's cost
-- must not be refused by t40, no updated_by). In one block; the table owner runs migrations. rule16: small (before the
-- release these tables hold test companies only; ALTER TABLE … DISABLE TRIGGER locks the table to the end of the
-- migration's transaction — the phones' writes wait for it, none fails)
do $$
begin
  alter table public.estimate_line_costs disable trigger user;
  update public.estimate_line_costs set unit_cost_millicents = unit_cost_cents * 1000 where unit_cost_millicents is null;
  alter table public.estimate_line_costs enable trigger user;
  alter table public.estimate_line_costs_kept disable trigger user;
  update public.estimate_line_costs_kept set unit_cost_millicents = unit_cost_cents * 1000 where unit_cost_millicents is null;
  alter table public.estimate_line_costs_kept enable trigger user;
  alter table public.estimate_template_line_costs disable trigger user;
  update public.estimate_template_line_costs set unit_cost_millicents = unit_cost_cents * 1000 where unit_cost_millicents is null;
  alter table public.estimate_template_line_costs enable trigger user;
end $$;

-- the bounds: not below zero, at most $1 000 000 a unit (× 1000), as catalog_item_costs
do $$
declare t text;
begin
  foreach t in array array['estimate_line_costs', 'estimate_line_costs_kept', 'estimate_template_line_costs'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_millicents_range');
    execute format('alter table public.%I add constraint %I check (unit_cost_millicents between 0 and 100000000000000) not valid',
                   t, t || '_millicents_range');
    begin
      execute format('alter table public.%I validate constraint %I', t, t || '_millicents_range');
    exception when check_violation then
      raise notice '% left not valid: a stored cost out of range', t || '_millicents_range';
    end;
  end loop;
end $$;
-- estimate_line_costs: the table grant of core.sql covers the new column (RLS: who sees costs and may edit the
-- estimate); the kept costs and the template's costs are written by the server's triggers only (no grant, as before)

-- ---- t08: who writes the cost — the exact value is the truth, the mirror follows ------------------------------------
-- the kept costs and the template's costs: the catalog's rule as it is (app.tg_cost_millicents, PR 1/4)
drop trigger if exists t08_cost_millicents on public.estimate_line_costs_kept;
create trigger t08_cost_millicents before insert or update on public.estimate_line_costs_kept
  for each row execute function app.tg_cost_millicents();
drop trigger if exists t08_cost_millicents on public.estimate_template_line_costs;
create trigger t08_cost_millicents before insert or update on public.estimate_template_line_costs
  for each row execute function app.tg_cost_millicents();

-- the exact value of a deleted line cost, kept aside for the line's next cost (a save: delete, then insert the same id).
-- Whole cents too (review 1: a new build's 23 000 must not be replaced by the copied-from line's 22 500 on the next
-- old save). No one reads or writes it but the triggers below. A row lives at most 30 days: the cleanup is at write —
-- each keep and each use deletes what is older (as estimate_line_costs_kept); no pg_cron, no job.
create table public.estimate_line_cost_exact (
  line_item_id          uuid not null,
  company_id            uuid not null references public.companies (id) on delete cascade,
  unit_cost_millicents  bigint not null check (unit_cost_millicents between 0 and 100000000000000),
  kept_at               timestamptz not null default now(),
  -- one row per line AND company: another company that reuses a deleted line id never takes A's place (review 2)
  primary key (line_item_id, company_id)
);
revoke all on public.estimate_line_cost_exact from anon, authenticated;
create index estimate_line_cost_exact_company_idx on public.estimate_line_cost_exact (company_id);  -- the FK; a new table
create index estimate_line_cost_exact_at_idx on public.estimate_line_cost_exact (kept_at);          -- the 30-day sweep
create trigger t11_company_id_immutable before update on public.estimate_line_cost_exact
  for each row execute function app.tg_company_id_immutable();
alter table public.estimate_line_cost_exact enable row level security;
alter table public.estimate_line_cost_exact force row level security;
-- no policy: the tables' owner (the triggers, security definer) only

-- BEFORE DELETE of a line cost (anyone's, a cascade from its line too): its exact value is kept aside. Not when the
-- company itself is going (a cascade from companies: its row is gone, the keep would break its foreign key — review 2)
create or replace function app.tg_line_cost_exact_keep()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.unit_cost_millicents is not null and exists (select 1 from public.companies c where c.id = old.company_id) then
    delete from public.estimate_line_cost_exact where kept_at < now() - interval '30 days';
    insert into public.estimate_line_cost_exact as k (line_item_id, company_id, unit_cost_millicents)
    values (old.line_item_id, old.company_id, old.unit_cost_millicents)
    on conflict (line_item_id, company_id) do update set unit_cost_millicents = excluded.unit_cost_millicents, kept_at = now();
  end if;
  return old;
end;
$$;

-- t08 of estimate_line_costs: the catalog's rule, and on INSERT of the cents alone (an old build) the exact value it
-- had — kept aside at its delete, or, when nothing was kept for it, the cost of the line it was copied from under
-- t96_cost_copy's own conditions (an earlier locked version of the same estimate, the same name and unit, nothing
-- deleted — review 2: a tech cannot point copied_from_line_id anywhere) — when the cents are that value's mirror; else
-- exact = cents × 1000. The kept value is used up either way.
create or replace function app.tg_line_cost_millicents()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_exact bigint;
  v_kept  boolean;
begin
  if tg_op = 'INSERT' then
    delete from public.estimate_line_cost_exact k where k.kept_at < now() - interval '30 days';
    delete from public.estimate_line_cost_exact k
     where k.line_item_id = new.line_item_id and k.company_id = new.company_id
    returning k.unit_cost_millicents into v_exact;
    v_kept := found;
    if new.unit_cost_millicents is not null then
      new.unit_cost_cents := round(new.unit_cost_millicents::numeric / 1000, 0)::bigint;
    elsif new.unit_cost_cents is not null then
      if not v_kept then
        select c.unit_cost_millicents into v_exact
          from public.estimate_line_items li
          join public.estimate_options nopt on nopt.id = li.option_id and nopt.company_id = li.company_id and nopt.deleted_at is null
          join public.estimate_versions nv on nv.id = nopt.version_id and nv.company_id = li.company_id and nv.deleted_at is null
          join public.estimate_line_items src on src.id = li.copied_from_line_id and src.company_id = li.company_id and src.deleted_at is null
          join public.estimate_line_costs c on c.line_item_id = src.id and c.company_id = src.company_id and c.deleted_at is null
          join public.estimate_options so on so.id = src.option_id and so.company_id = src.company_id and so.deleted_at is null
          join public.estimate_versions sv on sv.id = so.version_id and sv.company_id = src.company_id and sv.deleted_at is null
         where li.id = new.line_item_id and li.company_id = new.company_id and li.copied_from_line_id is distinct from li.id
           and sv.estimate_id = nv.estimate_id and sv.version_no < nv.version_no and sv.locked_at is not null
           and lower(btrim(src.name)) = lower(btrim(li.name)) and src.unit is not distinct from li.unit;
      end if;
      if v_exact is not null and round(v_exact::numeric / 1000, 0)::bigint = new.unit_cost_cents then
        new.unit_cost_millicents := v_exact;
      else
        new.unit_cost_millicents := new.unit_cost_cents * 1000;
      end if;
    end if;
  elsif new.unit_cost_millicents is distinct from old.unit_cost_millicents then
    new.unit_cost_cents := round(new.unit_cost_millicents::numeric / 1000, 0)::bigint;
  elsif new.unit_cost_cents is distinct from old.unit_cost_cents then
    new.unit_cost_millicents := new.unit_cost_cents * 1000;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_line_cost_exact_keep(), app.tg_line_cost_millicents() from public, anon, authenticated;
drop trigger if exists t08_cost_millicents on public.estimate_line_costs;
create trigger t08_cost_millicents before insert or update on public.estimate_line_costs
  for each row execute function app.tg_line_cost_millicents();
drop trigger if exists t36_cost_exact_keep on public.estimate_line_costs;
create trigger t36_cost_exact_keep before delete on public.estimate_line_costs
  for each row execute function app.tg_line_cost_exact_keep();

-- ---- keep / restore / copy: the exact value goes with the cost ------------------------------------------------------
-- the bodies of 20261108180000 and 20261108200000, the column added to each list (same signatures)
create or replace function app.tg_line_cost_keep()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not app.can_view_costs(old.company_id) then
    delete from public.estimate_line_costs_kept where kept_at < now() - interval '30 days';
    insert into public.estimate_line_costs_kept as k (line_item_id, company_id, version_id, unit_cost_cents, unit_cost_millicents,
                                                     unit_material_cost_cents, purchase_tax_bps, markup_bps, line_cost_cents, currency)
    select c.line_item_id, c.company_id, eo.version_id, c.unit_cost_cents, c.unit_cost_millicents, c.unit_material_cost_cents,
           c.purchase_tax_bps, c.markup_bps, c.line_cost_cents, c.currency
      from public.estimate_line_costs c
      join public.estimate_options eo on eo.id = old.option_id and eo.company_id = old.company_id
     where c.line_item_id = old.id and c.company_id = old.company_id and c.deleted_at is null
    on conflict (line_item_id) do update
      set version_id = excluded.version_id, unit_cost_cents = excluded.unit_cost_cents,
          unit_cost_millicents = excluded.unit_cost_millicents, unit_material_cost_cents = excluded.unit_material_cost_cents,
          purchase_tax_bps = excluded.purchase_tax_bps, markup_bps = excluded.markup_bps,
          line_cost_cents = excluded.line_cost_cents, currency = excluded.currency, kept_at = now()
      -- a row kept for another company is never overwritten (security-check: the line id is free once deleted,
      -- another company may reuse it and must not plant a cost for A)
      where k.company_id = excluded.company_id;
  end if;
  return old;
end;
$$;

create or replace function app.tg_line_cost_restore()
returns trigger language plpgsql security definer set search_path = '' as $$
declare k public.estimate_line_costs_kept;
begin
  delete from public.estimate_line_costs_kept where kept_at < now() - interval '30 days';
  delete from public.estimate_line_costs_kept
   where line_item_id = new.id and company_id = new.company_id
     and version_id = (select eo.version_id from public.estimate_options eo where eo.id = new.option_id)
  returning * into k;
  if found then
    -- created_by becomes the tech (t10 stamps the writer); the figure is the office's — the residual of §9.1
    insert into public.estimate_line_costs (line_item_id, company_id, unit_cost_cents, unit_cost_millicents, unit_material_cost_cents,
                                            purchase_tax_bps, markup_bps, line_cost_cents, currency)
    values (k.line_item_id, k.company_id, k.unit_cost_cents, k.unit_cost_millicents, k.unit_material_cost_cents,
            k.purchase_tax_bps, k.markup_bps, k.line_cost_cents, k.currency)
    on conflict (line_item_id) do nothing;
  end if;
  return null;
end;
$$;

create or replace function app.tg_line_cost_copy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.copied_from_line_id is null or new.copied_from_line_id = new.id then
    return null;
  end if;
  -- who sees costs writes its own (upserted right after the insert); a migration or the service role copies nothing
  if auth.uid() is null or app.can_view_costs(new.company_id) then
    return null;
  end if;
  insert into public.estimate_line_costs (line_item_id, company_id, unit_cost_cents, unit_cost_millicents, unit_material_cost_cents,
                                          purchase_tax_bps, markup_bps, line_cost_cents, currency)
  select new.id, new.company_id, c.unit_cost_cents, c.unit_cost_millicents, c.unit_material_cost_cents,
         c.purchase_tax_bps, c.markup_bps, null, c.currency
    from public.estimate_line_items src
    join public.estimate_line_costs c on c.line_item_id = src.id and c.company_id = src.company_id and c.deleted_at is null
    join public.estimate_options so on so.id = src.option_id and so.company_id = src.company_id and so.deleted_at is null
    join public.estimate_versions sv on sv.id = so.version_id and sv.company_id = src.company_id and sv.deleted_at is null
    join public.estimate_options nopt on nopt.id = new.option_id and nopt.company_id = new.company_id and nopt.deleted_at is null
    join public.estimate_versions nv on nv.id = nopt.version_id and nv.company_id = new.company_id and nv.deleted_at is null
   where src.id = new.copied_from_line_id
     and src.company_id = new.company_id
     and src.deleted_at is null
     and sv.estimate_id = nv.estimate_id
     and sv.version_no < nv.version_no
     and sv.locked_at is not null
     and lower(btrim(src.name)) = lower(btrim(new.name))
     and src.unit is not distinct from new.unit
  on conflict (line_item_id) do nothing;
  return null;
end;
$$;
revoke all on function app.tg_line_cost_keep(), app.tg_line_cost_restore(), app.tg_line_cost_copy() from public, anon, authenticated;

-- ---- the cost keys a tech and a client never see --------------------------------------------------------------------
-- the body of 20261108130000 with unitCostMillicents (a new build's line, PR 4/4) taken out too
create or replace function app.doc_without_costs(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(p) = 'object' and jsonb_typeof(p -> 'options') = 'array' then
      jsonb_set(p, '{options}', (
        select coalesce(jsonb_agg(
                 case when jsonb_typeof(o.value) = 'object' and jsonb_typeof(o.value -> 'lines') = 'array' then
                   jsonb_set(o.value, '{lines}', (
                     select coalesce(jsonb_agg(case when jsonb_typeof(l.value) = 'object'
                                                    then l.value - array['unitCostCents', 'unitCostMillicents', 'unitMaterialCostCents',
                                                                         'vendorTaxBps', 'markupBps', 'purchaseTaxBps']
                                                    else l.value end
                                               order by l.ordinality), '[]'::jsonb)
                       from jsonb_array_elements(o.value -> 'lines') with ordinality l))
                 else o.value end order by o.ordinality), '[]'::jsonb)
          from jsonb_array_elements(p -> 'options') with ordinality o))
    else p end;
$$;
revoke all on function app.doc_without_costs(jsonb) from public, anon, authenticated;

-- ---- the template check: the exact cost is a line key (20261112235000 + one key) ------------------------------------
create or replace function app.valid_estimate_template_doc(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  o jsonb; l jsonb; s jsonb; d jsonb; t jsonb; dep jsonb;
  opt_ids text[] := '{}'; line_ids text[] := '{}';
begin
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 262144 then return false; end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in ('options', 'settings', 'note')) then return false; end if;
  if p ? 'note' and jsonb_typeof(p -> 'note') <> 'null'
     and not (jsonb_typeof(p -> 'note') = 'string' and length(p ->> 'note') <= 5000) then return false; end if;
  -- options: 1..10, unique ids, each with 0..200 lines
  if jsonb_typeof(p -> 'options') is distinct from 'array' or jsonb_array_length(p -> 'options') not between 1 and 10 then return false; end if;
  for o in select x from jsonb_array_elements(p -> 'options') x loop
    if jsonb_typeof(o) <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(o) k where k not in ('id', 'name', 'recommended', 'lines', 'sections')) then return false; end if;
    -- #1232: the option's sections, already as the client reads them (app.client_sections: ≤ 40, an id once, a cleaned
    -- title, a known kind, a subsection only under a top section) — the phone sends them so (estimateTemplate.ts)
    if o ? 'sections' and jsonb_typeof(o -> 'sections') <> 'null'
       and (jsonb_typeof(o -> 'sections') <> 'array' or app.client_sections(o -> 'sections') is distinct from o -> 'sections') then return false; end if;
    if jsonb_typeof(o -> 'id') is distinct from 'string' or (o ->> 'id') !~ '^[A-Za-z0-9_-]{1,64}$' or (o ->> 'id') = any (opt_ids) then return false; end if;
    opt_ids := opt_ids || (o ->> 'id');
    if not app.tpl_text(o -> 'name', 120, false) then return false; end if;
    if o ? 'recommended' and coalesce(jsonb_typeof(o -> 'recommended') not in ('boolean', 'null'), true) then return false; end if;
    if jsonb_typeof(o -> 'lines') is distinct from 'array' or jsonb_array_length(o -> 'lines') > 200 then return false; end if;
    for l in select x from jsonb_array_elements(o -> 'lines') x loop
      if jsonb_typeof(l) <> 'object' then return false; end if;
      if exists (select 1 from jsonb_object_keys(l) k
                 where k not in ('id', 'name', 'description', 'group', 'quantity', 'unit', 'unitPriceCents',
                                 'unitCostCents', 'unitCostMillicents', 'catalogItemId', 'optional', 'selected', 'clientVisible', 'sectionId')) then return false; end if;
      -- line ids are unique in the whole document (an estimate made from it keeps one id per line)
      if jsonb_typeof(l -> 'id') is distinct from 'string' or (l ->> 'id') !~ '^[A-Za-z0-9_-]{1,64}$' or (l ->> 'id') = any (line_ids) then return false; end if;
      line_ids := line_ids || (l ->> 'id');
      if not app.tpl_text(l -> 'name', 300, false) or not app.tpl_text(l -> 'unit', 20, false) then return false; end if;
      if l ? 'description' and jsonb_typeof(l -> 'description') <> 'null'
         and not (jsonb_typeof(l -> 'description') = 'string' and length(l ->> 'description') <= 2000) then return false; end if;
      if coalesce((l ->> 'group') not in ('service', 'labor', 'material'), true) then return false; end if;
      -- quantity: the engine's decimal (parseQty), a string or a number, never empty
      if coalesce(jsonb_typeof(l -> 'quantity') not in ('string', 'number'), true)
         or (l ->> 'quantity') !~ '^([0-9]{1,12}([.][0-9]{1,12})?|[.][0-9]{1,12})$' then return false; end if;
      if not app.tpl_cents(l -> 'unitPriceCents', 100000000000) then return false; end if;
      if l ? 'unitCostCents' and jsonb_typeof(l -> 'unitCostCents') <> 'null' and not app.tpl_cents(l -> 'unitCostCents', 100000000000) then return false; end if;
      -- #1926 PR 2/4: the exact cost in thousandths of a cent — integer digits, 0..$1 000 000 a unit (× 1000)
      if l ? 'unitCostMillicents' and jsonb_typeof(l -> 'unitCostMillicents') <> 'null'
         and not coalesce(jsonb_typeof(l -> 'unitCostMillicents') = 'number' and (l ->> 'unitCostMillicents') ~ '^[0-9]{1,15}$'
                          and (l ->> 'unitCostMillicents')::numeric <= 100000000000000, false) then return false; end if;
      if l ? 'catalogItemId' and jsonb_typeof(l -> 'catalogItemId') <> 'null'
         and not (jsonb_typeof(l -> 'catalogItemId') = 'string' and (l ->> 'catalogItemId') ~ '^[A-Za-z0-9_-]{1,64}$') then return false; end if;
      if l ? 'optional' and jsonb_typeof(l -> 'optional') not in ('boolean', 'null') then return false; end if;
      if l ? 'selected' and jsonb_typeof(l -> 'selected') not in ('boolean', 'null') then return false; end if;
      -- #1232: hidden from the client — only a $0 line (the engine counts a priced one as visible); its section — an id of
      -- at most 64 characters (the engine's sectionIdOk), or none
      if l ? 'clientVisible' and jsonb_typeof(l -> 'clientVisible') not in ('boolean', 'null') then return false; end if;
      if l -> 'clientVisible' = 'false'::jsonb and (l ->> 'unitPriceCents')::numeric <> 0 then return false; end if;
      if l ? 'sectionId' and jsonb_typeof(l -> 'sectionId') <> 'null'
         and not (jsonb_typeof(l -> 'sectionId') = 'string' and (l ->> 'sectionId') <> '' and length(l ->> 'sectionId') <= 64) then return false; end if;
    end loop;
  end loop;
  -- settings: discount, tax, deposit as the engine reads them
  s := p -> 'settings';
  if jsonb_typeof(s) is distinct from 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(s) k where k not in ('discount', 'tax', 'deposit', 'caHic')) then return false; end if;
  d := s -> 'discount';
  if d is not null and jsonb_typeof(d) <> 'null' then
    if jsonb_typeof(d) <> 'object' then return false; end if;
    if d ->> 'kind' = 'fixed' then
      if not app.tpl_cents(d -> 'cents', 100000000000) then return false; end if;
    elsif d ->> 'kind' = 'pct' then
      -- a share of the subtotal (the engine multiplies by it): 0..1, «5%» is "0.05"
      if coalesce(jsonb_typeof(d -> 'value') not in ('string', 'number'), true)
         or (d ->> 'value') !~ '^(0([.][0-9]{1,6})?|1([.]0{1,6})?|[.][0-9]{1,6})$' then return false; end if;
    else return false; end if;
  end if;
  t := s -> 'tax';
  if jsonb_typeof(t) is distinct from 'object' or jsonb_typeof(t -> 'enabled') is distinct from 'boolean'
     or not app.tpl_cents(t -> 'rateBps', 10000) or jsonb_typeof(t -> 'groups') is distinct from 'object'
     -- #1219: the rate in ppm, when the template has it: a whole number 0..1000000
     or (t ? 'ratePpm' and not app.tpl_cents(t -> 'ratePpm', 1000000)) then return false; end if;
  if exists (select 1 from jsonb_each(t -> 'groups') g
             where g.key not in ('service', 'labor', 'material') or jsonb_typeof(g.value) <> 'boolean') then return false; end if;
  dep := s -> 'deposit';
  if jsonb_typeof(dep) is distinct from 'object' then return false; end if;
  if dep ->> 'kind' = 'pct' then
    if not app.tpl_cents(dep -> 'bps', 10000) then return false; end if;
  elsif dep ->> 'kind' = 'fixed' then
    if not app.tpl_cents(dep -> 'cents', 100000000000) then return false; end if;
  elsif dep ->> 'kind' is distinct from 'none' then return false; end if;
  if s ? 'caHic' and jsonb_typeof(s -> 'caHic') not in ('boolean', 'null') then return false; end if;
  return true;
end;
$$;

-- ---- the template's cost move (20261108230000 + the exact value) ----------------------------------------------------
-- A line's cost: unitCostMillicents (a new build) wins over unitCostCents sent with it (audit Р3); the cents alone are an
-- old build's — t08 keeps the exact value when they are its mirror (an echo). A key sent as null with no cost in the
-- other clears the cost; a line without either keeps what it had; a removed line loses it (as before).
-- Not ON CONFLICT for the existing rows: its EXCLUDED row has passed t08's INSERT branch, «sent» and «derived» merge.
create or replace function app.tg_template_costs_move()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  bare jsonb;
begin
  if not app.valid_estimate_template_doc(new.doc) then
    raise exception 'estimate template document is not valid' using errcode = '23514';
  end if;
  bare := app.doc_without_costs(new.doc);
  if new.doc is not distinct from old.doc and bare is not distinct from new.doc then return new; end if;
  if auth.uid() is null or app.can_view_costs(new.company_id) then
    delete from public.estimate_template_line_costs k
     where k.template_id = old.id
       and not exists (select 1 from jsonb_array_elements(new.doc -> 'options') o, jsonb_array_elements(o -> 'lines') l
                        where l ->> 'id' = k.line_id
                          and (jsonb_typeof(l -> 'unitCostMillicents') = 'number' or jsonb_typeof(l -> 'unitCostCents') = 'number'
                               or not (l ? 'unitCostCents' or l ? 'unitCostMillicents')));
    -- the validator let only integer digits through: the casts cannot fail
    update public.estimate_template_line_costs k
       set unit_cost_millicents = coalesce(x.m, k.unit_cost_millicents),
           unit_cost_cents = case when x.m is null then x.c else k.unit_cost_cents end,
           updated_at = now()
      from (select l ->> 'id' as line_id,
                   case when jsonb_typeof(l -> 'unitCostMillicents') = 'number' then (l ->> 'unitCostMillicents')::bigint end as m,
                   case when jsonb_typeof(l -> 'unitCostCents') = 'number' then (l ->> 'unitCostCents')::bigint end as c
              from jsonb_array_elements(new.doc -> 'options') o, jsonb_array_elements(o -> 'lines') l) x
     where k.template_id = old.id and k.line_id = x.line_id and (x.m is not null or x.c is not null);
    insert into public.estimate_template_line_costs (template_id, line_id, company_id, unit_cost_cents, unit_cost_millicents)
    select old.id, x.line_id, new.company_id, x.c, x.m
      from (select l ->> 'id' as line_id,
                   case when jsonb_typeof(l -> 'unitCostMillicents') = 'number' then (l ->> 'unitCostMillicents')::bigint end as m,
                   case when jsonb_typeof(l -> 'unitCostCents') = 'number' then (l ->> 'unitCostCents')::bigint end as c
              from jsonb_array_elements(new.doc -> 'options') o, jsonb_array_elements(o -> 'lines') l) x
     where (x.m is not null or x.c is not null)
       and not exists (select 1 from public.estimate_template_line_costs k where k.template_id = old.id and k.line_id = x.line_id)
    on conflict (template_id, line_id) do nothing;
  end if;
  new.doc := bare;
  return new;
end;
$$;
revoke all on function app.tg_template_costs_move() from public, anon, authenticated;

-- ---- save_estimate_version: a cost may carry its exact value (20261112210000 + the column) --------------------------
create or replace function public.save_estimate_version(p_estimate_id uuid, p_version_id uuid, p_title text, p_version jsonb,
                                                        p_options jsonb, p_lines jsonb, p_costs jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_company uuid;
  v_costs   jsonb := coalesce(p_costs, '[]'::jsonb);
  n         int;
begin
  if jsonb_typeof(p_version) is distinct from 'object' or jsonb_typeof(p_options) is distinct from 'array'
     or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_typeof(v_costs) is distinct from 'array' then
    raise exception 'save_estimate_version: not the expected shape' using errcode = '22023', hint = 'estimate_save_shape';
  end if;
  if jsonb_array_length(p_options) > 10 or jsonb_array_length(p_lines) > 2000 or jsonb_array_length(v_costs) > 2000
     or length(coalesce(p_title, '')) > 500
     or octet_length(p_version::text) + octet_length(p_options::text) + octet_length(p_lines::text) + octet_length(v_costs::text)
        + octet_length(coalesce(p_title, '')) > 4194304 then
    raise exception 'save_estimate_version: too large' using errcode = '22023', hint = 'estimate_save_size';
  end if;
  -- only this version's rows: a line of an option not sent here, a cost of a line not sent here — refused
  if exists (select 1 from jsonb_array_elements(p_lines) l
              where jsonb_typeof(l) is distinct from 'object'
                 or not exists (select 1 from jsonb_array_elements(p_options) o where jsonb_typeof(o) = 'object' and o ->> 'id' = l ->> 'option_id'))
     or exists (select 1 from jsonb_array_elements(v_costs) c
              where jsonb_typeof(c) is distinct from 'object'
                 or not exists (select 1 from jsonb_array_elements(p_lines) l where jsonb_typeof(l) = 'object' and l ->> 'id' = c ->> 'line_item_id')) then
    raise exception 'save_estimate_version: a line or a cost outside this version' using errcode = '22023', hint = 'estimate_save_shape';
  end if;

  -- the estimate first, then its version — the order of send_estimate and the signing functions (never a deadlock with
  -- an office sending it at the same moment); two saves of one estimate go one after the other
  perform 1 from public.estimates e where e.id = p_estimate_id for update;
  -- the version, as the caller may change it (RLS): locked for the rest of the save
  select v.company_id into v_company from public.estimate_versions v
   where v.id = p_version_id and v.estimate_id = p_estimate_id for update;
  if v_company is null then
    raise exception 'save_estimate_version: no such version' using errcode = '42501';
  end if;

  update public.estimate_versions set
    calc_inputs   = p_version -> 'calc_inputs',
    engine_version = p_version ->> 'engine_version',
    source        = coalesce(p_version ->> 'source', 'scratch'),
    template_id   = nullif(p_version ->> 'template_id', '')::uuid,
    intro_text    = p_version ->> 'intro_text',
    totals        = p_version -> 'totals',
    tax_enabled   = coalesce((p_version ->> 'tax_enabled')::boolean, false),
    tax_rate_bps  = (p_version ->> 'tax_rate_bps')::int,
    -- #1219: the rate in ppm (an older phone sends none: null — its basis points are the rate; t03 writes the basis
    -- points from a ppm)
    tax_rate_ppm  = (p_version ->> 'tax_rate_ppm')::int,
    tax_mode      = p_version ->> 'tax_mode',
    deposit_rule  = p_version -> 'deposit_rule',
    contract_type = p_version ->> 'contract_type'
   where id = p_version_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'save_estimate_version: the version was not changed' using errcode = '42501'; end if;

  update public.estimates set title = p_title, current_version_id = p_version_id where id = p_estimate_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'save_estimate_version: the estimate was not changed' using errcode = '42501'; end if;

  delete from public.estimate_line_items li using public.estimate_options o where li.option_id = o.id and o.version_id = p_version_id;
  delete from public.estimate_options o where o.version_id = p_version_id;

  insert into public.estimate_options (id, company_id, version_id, name, position, is_recommended, discount_mode, discount_value)
  select x.id, v_company, p_version_id, x.name, coalesce(x.position, 0), coalesce(x.is_recommended, false), x.discount_mode, x.discount_value
    from jsonb_to_recordset(p_options) as x(id uuid, name text, position int, is_recommended boolean, discount_mode text, discount_value bigint);

  insert into public.estimate_line_items (id, company_id, option_id, position, line_group, catalog_item_id, origin, name, description,
                                          quantity, unit, unit_price_cents, taxable, is_optional, client_visible, copied_from_line_id)
  select x.id, v_company, x.option_id, coalesce(x.position, 0), x.line_group, x.catalog_item_id, coalesce(x.origin, 'manual'), x.name, x.description,
         x.quantity, x.unit, x.unit_price_cents, coalesce(x.taxable, false), coalesce(x.is_optional, false), coalesce(x.client_visible, true),
         x.copied_from_line_id
    from jsonb_to_recordset(p_lines) as x(id uuid, option_id uuid, position int, line_group text, catalog_item_id uuid, origin text,
                                          name text, description text, quantity numeric, unit text, unit_price_cents bigint, taxable boolean,
                                          is_optional boolean, client_visible boolean, copied_from_line_id uuid);

  -- the costs: only for who sees costs (anyone else: left out, the estimate itself is saved — as before)
  if jsonb_array_length(v_costs) > 0 and app.can_view_costs(v_company) then
    -- #1926 PR 2/4: a cost may carry its exact value (unit_cost_millicents, a new build); it wins over the cents sent
    -- with it (the mirror follows, t08). An old build sends the cents only. A row already there (a cost restored for this
    -- line, t95): the exact value sent replaces it, the cents alone change it only when they differ (t08 — an echo of
    -- the mirror keeps the exact cost). Not ON CONFLICT: its EXCLUDED row has passed the BEFORE INSERT trigger already, so
    -- «sent» and «derived» could not be told apart.
    update public.estimate_line_costs c
       set unit_cost_millicents = coalesce(x.unit_cost_millicents, c.unit_cost_millicents),
           unit_cost_cents = case when x.unit_cost_millicents is null then x.unit_cost_cents else c.unit_cost_cents end
      from jsonb_to_recordset(v_costs) as x(line_item_id uuid, unit_cost_cents bigint, unit_cost_millicents bigint)
     where c.line_item_id = x.line_item_id and c.company_id = v_company;
    insert into public.estimate_line_costs as c (line_item_id, company_id, unit_cost_cents, unit_cost_millicents)
    select x.line_item_id, v_company, x.unit_cost_cents, x.unit_cost_millicents
      from jsonb_to_recordset(v_costs) as x(line_item_id uuid, unit_cost_cents bigint, unit_cost_millicents bigint)
     where not exists (select 1 from public.estimate_line_costs e where e.line_item_id = x.line_item_id)
    on conflict (line_item_id) do nothing;
  end if;
end;
$$;
