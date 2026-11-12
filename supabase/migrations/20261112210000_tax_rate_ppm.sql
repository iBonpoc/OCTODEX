-- #1219 (review of #1216): a sales tax rate with three decimals. The rate was kept in basis points (1 = 0.01 %): New York's
-- 8.875 % became 888 (8.88 %) silently, and a $1000 estimate took $88.80 of tax instead of $88.75. Now the rate is kept in
-- parts per million (1 = 0.0001 %; 8.875 % = 88750, 100 % = 1000000), next to the basis points — the same unit as the
-- engine (@octo/estimating-engine taxRatePpm, bpsFromPpm).
-- * estimate_versions.tax_rate_ppm, jobs.tax_rate_ppm: new, nullable, no data rewritten (a sent version is locked against
--   any update, and a null ppm means «the basis points × 100» everywhere — app.version_tax_ppm). Adding a nullable column
--   with no default rewrites no table.
-- * app.tg_tax_rate_ppm (t03, before the tax-exempt t17 and the job money t18): who writes ppm, the server writes the
--   basis points from it (round half up: 88750 → 888) — never a refusal in the phone's queue (director's decision 12.11);
--   an older phone that writes only the basis points (or a document of a version without ratePpm) — ppm goes back to null,
--   so the basis points it wrote are the rate, as before.
-- * The server counts from ppm: app.estimate_option_totals (the contract, the deposit, the approvals), a job's own lines
--   (app.job_lines_totals_ppm; tg_job_money), and the send check compares the version's ppm with its document's
--   (app.doc_tax_ppm: settings.tax.ratePpm when a whole ppm, else rateBps × 100).
-- * What the client reads keeps settings.tax.ratePpm (app.client_doc); a template may carry it (0..1000000).
-- * invoices.tax_rate_bps is not touched: the app never writes it (an invoice keeps its tax in cents).
-- Rule 16: only additive — two new columns, new functions; app.job_lines_totals_with stays (nothing calls it now; step 2
-- after 1.0 together with the basis points). Older phones read and write the basis points as before; a version they
-- save is counted by its basis points. Rule 18: every new function revoked from public, anon, authenticated; only
-- app.doc_tax_ppm is granted to authenticated — the trigger app.tg_tax_rate_ppm runs as the writer (a pure function of
-- the row's own document, it reads nothing).
-- Tests: supabase/tests/core_rls.sql T201, engine test/taxPpm.test.ts.

alter table public.estimate_versions add column if not exists tax_rate_ppm int check (tax_rate_ppm between 0 and 1000000);
alter table public.jobs add column if not exists tax_rate_ppm int check (tax_rate_ppm between 0 and 1000000);
grant update (tax_rate_ppm) on public.jobs to authenticated;

-- the rate of a row in ppm: its own ppm, else its basis points × 100 (an older row, an older phone)
create or replace function app.version_tax_ppm(p_ppm int, p_bps int)
returns int language sql immutable set search_path = '' as $$
  select coalesce(p_ppm, p_bps * 100)
$$;
revoke all on function app.version_tax_ppm(int, int) from public, anon, authenticated;

-- the rate of a document's settings.tax in ppm: ratePpm when it is a whole ppm (0..1000000) that rounds to the rateBps
-- beside it, else rateBps × 100 (a rate changed by something that writes only the basis points: the ppm is stale), else
-- 0 — no readable rate (the same as taxRatePpm of the engine)
create or replace function app.doc_tax_ppm(t jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(t -> 'ratePpm') = 'number' and (t ->> 'ratePpm') ~ '^[0-9]{1,7}$' and (t ->> 'ratePpm')::numeric <= 1000000
         and jsonb_typeof(t -> 'rateBps') = 'number' and floor((t ->> 'ratePpm')::numeric / 100 + 0.5) = (t ->> 'rateBps')::numeric
      then (t ->> 'ratePpm')::numeric
    when jsonb_typeof(t -> 'rateBps') = 'number' then (t ->> 'rateBps')::numeric * 100
    -- no basis points (or not a number): 0, as the engine counts (rateBps || 0)
    else 0
  end
$$;
revoke all on function app.doc_tax_ppm(jsonb) from public, anon, authenticated;
grant execute on function app.doc_tax_ppm(jsonb) to authenticated;

-- who writes ppm sets the rate; the basis points follow it. An older writer (only the basis points; a version document
-- without a ratePpm) puts ppm back to null: its basis points are the rate.
create or replace function app.tg_tax_rate_ppm()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.tax_rate_ppm is not null and (tg_op = 'INSERT' or new.tax_rate_ppm is distinct from old.tax_rate_ppm) then
    new.tax_rate_bps := floor(new.tax_rate_ppm / 100.0 + 0.5)::int;
  elsif tg_op = 'UPDATE' and new.tax_rate_ppm is not null then
    if new.tax_rate_bps is distinct from old.tax_rate_bps then
      new.tax_rate_ppm := null;
    elsif tg_table_name = 'estimate_versions' then
      -- (a nested if: a job's row has no calc_inputs, the expression is never planned for it)
      if new.calc_inputs is distinct from old.calc_inputs
         and app.doc_tax_ppm(new.calc_inputs -> 'settings' -> 'tax') is distinct from new.tax_rate_ppm then
        new.tax_rate_ppm := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_tax_rate_ppm() from public, anon, authenticated;
drop trigger if exists t03_tax_rate_ppm on public.estimate_versions;
create trigger t03_tax_rate_ppm before insert or update on public.estimate_versions
  for each row execute function app.tg_tax_rate_ppm();
drop trigger if exists t03_tax_rate_ppm on public.jobs;
create trigger t03_tax_rate_ppm before insert or update on public.jobs
  for each row execute function app.tg_tax_rate_ppm();

-- a job's own lines with a ppm rate (the same rule as jobLinesTotals of the engine)
create or replace function app.job_lines_totals_ppm(p_job uuid, p_tax_enabled boolean, p_rate_ppm int)
returns table (lines int, subtotal bigint, tax bigint, total bigint) language sql stable security definer set search_path = '' as $$
  with l as (
    select count(*)::int as n, coalesce(sum(li.line_total_cents), 0) as sub,
           coalesce(sum(li.line_total_cents) filter (where li.taxable), 0) as taxable
      from public.job_line_items li where li.job_id = p_job and li.deleted_at is null
  ), t as (select l.n, l.sub, case when p_tax_enabled then floor(l.taxable::numeric * coalesce(p_rate_ppm, 0) / 1000000 + 0.5)::bigint else 0 end as tx from l)
  select t.n, t.sub::bigint, t.tx, (t.sub + t.tx)::bigint from t;
$$;
revoke all on function app.job_lines_totals_ppm(uuid, boolean, int) from public, anon, authenticated;
create or replace function app.job_lines_totals(p_job uuid)
returns table (lines int, subtotal bigint, tax bigint, total bigint) language sql stable security definer set search_path = '' as $$
  select x.* from public.jobs j, app.job_lines_totals_ppm(j.id, j.tax_enabled, app.version_tax_ppm(j.tax_rate_ppm, j.tax_rate_bps)) x where j.id = p_job;
$$;
revoke all on function app.job_lines_totals(uuid) from public, anon, authenticated;

-- the job money: the exemption and the own-lines total follow a ppm rate too
create or replace function app.tg_job_money()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  if tg_op = 'UPDATE' and new.estimate_id is distinct from old.estimate_id then
    raise exception 'the estimate of a job does not change' using errcode = '42501';
  end if;
  if new.estimate_id is not null then return new; end if;
  -- the exemption is a snapshot: applied when the job is made or its tax is set, never by an unrelated change
  -- (status, description, a line) — an invoice already issued with tax must keep matching the contract
  if new.tax_enabled and (tg_op = 'INSERT' or new.tax_enabled is distinct from old.tax_enabled or new.tax_rate_bps is distinct from old.tax_rate_bps
                             or new.tax_rate_ppm is distinct from old.tax_rate_ppm)
     and app.customer_tax_exempt(new.company_id, new.customer_id) then
    new.tax_enabled := false;
  end if;
  if tg_op = 'UPDATE' then
    select * into t from app.job_lines_totals_ppm(new.id, new.tax_enabled, app.version_tax_ppm(new.tax_rate_ppm, new.tax_rate_bps));
    if t.lines > 0 then new.contract_total_cents := t.total; end if;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_job_money() from public, anon, authenticated;

-- the contract's totals: the tax from ppm
create or replace function app.estimate_option_totals(p_version_id uuid, p_option_id uuid, p_addon_ids uuid[])
returns table (subtotal bigint, discount bigint, tax bigint, total bigint, deposit bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.estimate_versions; o public.estimate_options;
  sub bigint; taxable bigint; disc bigint := 0; tdisc bigint := 0; tx bigint := 0; tot bigint; dep bigint := 0; rule jsonb;
  b numeric;
begin
  select * into v from public.estimate_versions where id = p_version_id;
  select * into o from public.estimate_options where id = p_option_id;
  select coalesce(sum(li.line_total_cents), 0), coalesce(sum(li.line_total_cents) filter (where li.taxable), 0)
    into sub, taxable
    from public.estimate_line_items li
   where li.option_id = o.id and li.deleted_at is null and li.client_visible
     and (not li.is_optional or li.id = any (coalesce(p_addon_ids, '{}')));
  if o.discount_mode = 'pct' then disc := floor(sub * o.discount_value / 10000.0 + 0.5);
  elsif o.discount_mode = 'fixed' then disc := least(o.discount_value, sub);
  end if;
  if sub > 0 then tdisc := floor(disc::numeric * taxable / sub + 0.5); end if;
  if v.tax_enabled then tx := floor((taxable - tdisc)::numeric * coalesce(app.version_tax_ppm(v.tax_rate_ppm, v.tax_rate_bps), 0) / 1000000 + 0.5); end if;
  tot := sub - disc + tx;
  rule := coalesce(v.deposit_rule, '{}'::jsonb);
  if jsonb_typeof(rule) is distinct from 'object' then rule := '{}'::jsonb; end if;
  if rule ->> 'kind' = 'pct' then
    if jsonb_typeof(rule -> 'bps') in ('number', 'string') then
      b := (rule ->> 'bps')::numeric;
    elsif jsonb_typeof(rule -> 'value') in ('number', 'string')
          and trim(rule ->> 'value') ~ '^([0-9]+([.][0-9]+)?|[.][0-9]+)$' then
      -- the share → whole bps, round half up ("0.1" → 1000, "0.12345" → 1235)
      b := floor(trim(rule ->> 'value')::numeric * 10000 + 0.5);
    else
      b := 0;
    end if;
    dep := floor(tot * least(greatest(b, 0), 10000) / 10000 + 0.5);
  elsif rule ->> 'kind' = 'fixed' then dep := least(greatest((rule ->> 'cents')::bigint, 0), tot);
  end if;
  return query select sub, disc, tx, tot, dep;
end;
$$;

-- the send check: the version's ppm against the document's
create or replace function app.version_lines_mismatch(p_version_id uuid)
returns table (option_id text, line_id text, side text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.estimate_versions;
  d jsonb;
  st jsonb;
  tax_on boolean;
  disc_kind text;
  disc_value bigint;
begin
  select * into v from public.estimate_versions where id = p_version_id;
  d := app.client_doc(v.calc_inputs);
  st := case when jsonb_typeof(v.calc_inputs -> 'settings') = 'object' then v.calc_inputs -> 'settings' else '{}'::jsonb end;
  -- as ops.ts: the tax is on when it is enabled and at least one group is taxed
  tax_on := coalesce(st #> '{tax,enabled}' = 'true'::jsonb, false)
            and exists (select 1 from jsonb_each(case when jsonb_typeof(st #> '{tax,groups}') = 'object' then st #> '{tax,groups}' else '{}'::jsonb end) g
                         where g.value = 'true'::jsonb);
  -- as ops.ts: pct — the fraction × 10000 (Math.round), fixed — the cents; anything else — none
  disc_kind := case st #>> '{discount,kind}' when 'pct' then 'pct' when 'fixed' then 'fixed' end;
  begin
    disc_value := case disc_kind
      when 'pct' then round((st #>> '{discount,value}')::numeric * 10000)::bigint
      when 'fixed' then (st #>> '{discount,cents}')::numeric::bigint
    end;
  exception when others then
    disc_kind := 'unreadable';                            -- never matches a stored discount
  end;
  return query
  with o as (
    select x.value as o, x.value ->> 'id' as oid
      from jsonb_array_elements(case when jsonb_typeof(d -> 'options') = 'array' then d -> 'options' else '[]'::jsonb end) x
  ), doc as (
    select o.oid, l.value ->> 'id' as lid,
           coalesce(l.value -> 'optional' = 'true'::jsonb, false) as optional,
           tax_on and coalesce(st #> array['tax', 'groups', l.value ->> 'group'] = 'true'::jsonb, false) as taxable,
           app.doc_line_amount(l.value ->> 'quantity', l.value -> 'unitPriceCents') as amount
      from o, jsonb_array_elements(case when jsonb_typeof(o.o -> 'lines') = 'array' then o.o -> 'lines' else '[]'::jsonb end) l
  ), dl as (
    select doc.oid, doc.lid, doc.optional, doc.taxable, doc.amount from doc where doc.amount is distinct from 0
  ), sl as (
    select eo.id::text as oid, li.id::text as lid, li.is_optional as optional, li.taxable, li.line_total_cents as amount
      from public.estimate_line_items li
      join public.estimate_options eo on eo.id = li.option_id
     where eo.version_id = v.id and eo.deleted_at is null and li.deleted_at is null and li.client_visible
       and li.line_total_cents <> 0
  ), so as (
    select eo.id::text as oid, eo.discount_mode, eo.discount_value
      from public.estimate_options eo where eo.version_id = v.id and eo.deleted_at is null
  )
  -- the lines, as multisets (EXCEPT ALL: a repeated id is a difference, security-check В1)
  (select x.oid, x.lid, 'document'::text from (select * from dl except all select * from sl) x)
  union all
  (select x.oid, x.lid, 'lines'::text from (select * from sl except all select * from dl) x)
  -- an option id twice in the document (the page shows two options, the server has one)
  union all
  (select o.oid, null::text, 'option twice'::text from o group by o.oid having count(*) > 1)
  -- the discount of every option of the document
  union all
  (select o.oid, null::text, 'discount'::text
     from o left join so on so.oid = o.oid
    where so.oid is null or (so.discount_mode, so.discount_value) is distinct from (disc_kind, disc_value))
  -- the tax and the deposit of the version
  union all
  (select null::text, null::text, 'tax'::text
    where v.tax_enabled is distinct from tax_on
       or (tax_on and app.version_tax_ppm(v.tax_rate_ppm, v.tax_rate_bps) is distinct from app.doc_tax_ppm(st -> 'tax')))
  union all
  (select null::text, null::text, 'deposit'::text
    where coalesce(v.deposit_rule, '{}'::jsonb) is distinct from coalesce(st -> 'deposit', '{}'::jsonb));
end;
$$;
revoke all on function app.version_lines_mismatch(uuid) from public, anon, authenticated;

-- what the client reads keeps the ppm rate
create or replace function app.client_doc(p jsonb, p_signed boolean)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'object' then
    app.jsonb_scalars(p, array['note'])
    || jsonb_build_object('options', coalesce((
         select jsonb_agg(
                  app.jsonb_scalars(o.value, array['id', 'name', 'recommended'])
                  -- РС-6: the option's sections as the client reads them (app.client_sections)
                  || case when jsonb_typeof(o.value -> 'sections') = 'array' then jsonb_build_object('sections', app.client_sections(o.value -> 'sections')) else '{}'::jsonb end
                  || jsonb_build_object('lines', coalesce((
                       select jsonb_agg(app.jsonb_scalars(l.value,
                                array['id', 'name', 'description', 'group', 'quantity', 'unit', 'unitPriceCents', 'optional', 'selected'])
                              -- a sectionId: a string of at most 64 characters, or no link (the phone the same)
                              || case when jsonb_typeof(l.value -> 'sectionId') = 'string' and (l.value ->> 'sectionId') <> ''
                                           and length(l.value ->> 'sectionId') <= 64
                                      then jsonb_build_object('sectionId', l.value ->> 'sectionId') else '{}'::jsonb end
                              order by l.ordinality)
                         from jsonb_array_elements(case when jsonb_typeof(o.value -> 'lines') = 'array' then o.value -> 'lines' else '[]'::jsonb end)
                              with ordinality l
                        where jsonb_typeof(l.value) = 'object'
                          -- a line hidden from the client goes whole (also «false» as a string or 0) — only at $0, as the
                          -- engine counts it (РС-6): a priced line marked hidden is a visible one (the client's total holds it)
                          and not (coalesce(lower(l.value ->> 'clientVisible'), 'true') in ('false', '0')
                                   and (coalesce(p_signed, false)
                                        or case when jsonb_typeof(l.value -> 'unitPriceCents') = 'number' then (l.value ->> 'unitPriceCents')::numeric = 0 else true end))
                          -- a line the page cannot draw goes whole too (the page would fail on it)
                          and jsonb_typeof(l.value -> 'name') = 'string'
                          and jsonb_typeof(l.value -> 'group') = 'string'
                          and jsonb_typeof(l.value -> 'quantity') in ('string', 'number')
                          and jsonb_typeof(l.value -> 'unitPriceCents') = 'number'
                          -- quantity 0: the part is left out (spec 33 П23.9)
                          and (l.value ->> 'quantity') !~ '^[[:space:]]*[+-]?(0+([.]0*)?|[.]0+)[[:space:]]*$'), '[]'::jsonb))
                  order by o.ordinality)
           from jsonb_array_elements(case when jsonb_typeof(p -> 'options') = 'array' then p -> 'options' else '[]'::jsonb end)
                with ordinality o
          where jsonb_typeof(o.value) = 'object'), '[]'::jsonb))
    || case when jsonb_typeof(p -> 'settings') = 'object' then jsonb_build_object('settings',
         app.jsonb_scalars(p -> 'settings', array['caHic'])
         || case when (p -> 'settings') ? 'discount' then jsonb_build_object('discount',
              app.jsonb_scalars(p -> 'settings' -> 'discount', array['kind', 'value', 'cents'])) else '{}'::jsonb end
         || case when jsonb_typeof(p -> 'settings' -> 'tax') = 'object' then jsonb_build_object('tax',
              app.jsonb_scalars(p -> 'settings' -> 'tax', array['enabled', 'rateBps', 'ratePpm'])
              || case when jsonb_typeof(p -> 'settings' -> 'tax' -> 'groups') = 'object' then jsonb_build_object('groups',
                   app.jsonb_scalars(p -> 'settings' -> 'tax' -> 'groups', array['service', 'labor', 'material'])) else '{}'::jsonb end)
            else '{}'::jsonb end
         || case when jsonb_typeof(p -> 'settings' -> 'deposit') = 'object' then jsonb_build_object('deposit',
              app.jsonb_scalars(p -> 'settings' -> 'deposit', array['kind', 'bps', 'cents'])) else '{}'::jsonb end)
       else '{}'::jsonb end
    -- spec 33 П24.7: the attached pages, only what the page may draw (app.doc_pages)
    || case when jsonb_typeof(p -> 'pages') = 'array' then jsonb_build_object('pages', app.doc_pages(p -> 'pages')) else '{}'::jsonb end
  end;
$$;

-- a template may carry the ppm rate
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
    if exists (select 1 from jsonb_object_keys(o) k where k not in ('id', 'name', 'recommended', 'lines')) then return false; end if;
    if jsonb_typeof(o -> 'id') is distinct from 'string' or (o ->> 'id') !~ '^[A-Za-z0-9_-]{1,64}$' or (o ->> 'id') = any (opt_ids) then return false; end if;
    opt_ids := opt_ids || (o ->> 'id');
    if not app.tpl_text(o -> 'name', 120, false) then return false; end if;
    if o ? 'recommended' and coalesce(jsonb_typeof(o -> 'recommended') not in ('boolean', 'null'), true) then return false; end if;
    if jsonb_typeof(o -> 'lines') is distinct from 'array' or jsonb_array_length(o -> 'lines') > 200 then return false; end if;
    for l in select x from jsonb_array_elements(o -> 'lines') x loop
      if jsonb_typeof(l) <> 'object' then return false; end if;
      if exists (select 1 from jsonb_object_keys(l) k
                 where k not in ('id', 'name', 'description', 'group', 'quantity', 'unit', 'unitPriceCents',
                                 'unitCostCents', 'catalogItemId', 'optional', 'selected')) then return false; end if;
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
      if l ? 'catalogItemId' and jsonb_typeof(l -> 'catalogItemId') <> 'null'
         and not (jsonb_typeof(l -> 'catalogItemId') = 'string' and (l ->> 'catalogItemId') ~ '^[A-Za-z0-9_-]{1,64}$') then return false; end if;
      if l ? 'optional' and jsonb_typeof(l -> 'optional') not in ('boolean', 'null') then return false; end if;
      if l ? 'selected' and jsonb_typeof(l -> 'selected') not in ('boolean', 'null') then return false; end if;
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

-- the floor of a job's total also when only the ppm rate changes
drop trigger if exists t19_job_total_floor on public.jobs;
create trigger t19_job_total_floor before update of contract_total_cents, tax_enabled, tax_rate_bps, tax_rate_ppm on public.jobs
  for each row execute function app.tg_job_total_floor();
