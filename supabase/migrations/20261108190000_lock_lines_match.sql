-- Н1 (spec 33 П23.9, security-check of #396): the client's page /p/ is drawn from app.client_doc(calc_inputs), while
-- the server's sums (portal_accept → app.estimate_option_totals, the deposit, the signature's selection) come from
-- estimate_line_items, estimate_options (discount) and the version's tax and deposit columns. Both are written by the
-- same op (ops.ts saveEstimate), but in separate requests: a bug, an old build or a broken save could leave them apart —
-- the client would sign one amount and be charged another.
--
-- Now a version is checked when it is locked (send_estimate: locked_at null → a time):
--   * lines: per option, the lines the client sees with a non-zero amount — (option id, line id, add-on or not, taxed
--     or not, amount) — are the same on both sides, as a multiset (a repeated option or line id never matches);
--     amount = floor(qty × price + 0.5) on the stored quantity (numeric(14,4), half away from zero) — the rule of
--     estimate_line_items.line_total_cents and of the engine (custom.ts toLine, jobLineQty); a $0 line on either side
--     does not move a sum and is not compared (blank rows the app skips, quantity-0 lines client_doc hides);
--   * the money settings, as ops.ts writes them from the document: the discount of every option, the tax (on/off,
--     rate) and the deposit rule of the version;
--   * a version with no document (calc_inputs null — the old quick estimate, estimate.add never writes one) is not
--     checked, as before this migration (review #415 №1): it has nothing to compare, and its
--     on-site signature must not be refused with no way to save it again. A document (any source) with no
--     options and paid lines does not match: the page would show nothing.
-- Different → 22023 (hint estimate_lines_mismatch: the app's card «Смета не отправлена»), nothing is locked or sent:
-- saving the estimate again writes both sides from one document. Not checked: a lock without a JWT (a migration, the
-- service role fixing data); versions locked before.
-- Also (security-check С2, С3): the child-lock trigger reads the version FOR SHARE (a line cannot slip into a version
-- while it is being locked), and a member cannot insert a version that is locked already.
-- Rule 16: new functions and triggers; app.tg_estimate_child_lock — same signature, one lock clause added.

-- the stored amount of a document line; null when it is not a number the page can count (never matches)
create or replace function app.doc_line_amount(p_qty text, p_price jsonb)
returns bigint language plpgsql immutable set search_path = '' as $$
declare q numeric; p numeric;
begin
  if p_qty is null or p_qty !~ '^\s*[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)([eE][+-]?[0-9]{1,3})?\s*$'
     or jsonb_typeof(p_price) is distinct from 'number' then
    return null;
  end if;
  q := round(trim(p_qty)::numeric, 4);
  p := (p_price #>> '{}')::numeric;
  if abs(q) >= 1e10 or abs(p) >= 1e15 or p <> trunc(p) then
    return null;                                          -- beyond numeric(14,4) / a fractional cent: never matches
  end if;
  return floor(q * p + 0.5)::bigint;
exception when others then
  return null;
end;
$$;
revoke all on function app.doc_line_amount(text, jsonb) from public, anon, authenticated;

-- what differs between the two sides of a version; empty = they match
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
       or (tax_on and v.tax_rate_bps is distinct from
             (case when jsonb_typeof(st #> '{tax,rateBps}') = 'number' then (st #>> '{tax,rateBps}')::numeric end)))
  union all
  (select null::text, null::text, 'deposit'::text
    where coalesce(v.deposit_rule, '{}'::jsonb) is distinct from coalesce(st -> 'deposit', '{}'::jsonb));
end;
$$;
revoke all on function app.version_lines_mismatch(uuid) from public, anon, authenticated;

create or replace function app.tg_version_lock_lines_match()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  -- no JWT (a migration, the service role fixing data by hand) is not checked: the check guards a member's send
  if auth.uid() is null then
    return null;
  end if;
  -- no document: nothing to compare (the old quick estimate; review #415 №1)
  -- (any document, of any source, without options and with paid lines still does not match: security-check В2)
  if new.calc_inputs is null then
    return null;
  end if;
  select * into m from app.version_lines_mismatch(new.id) limit 1;
  if found then
    raise exception 'estimate lines do not match its document (%): save the estimate again', m.side
      using errcode = '22023', hint = 'estimate_lines_mismatch',
            detail = format('option %s, line %s', left(coalesce(m.option_id, '-'), 64), left(coalesce(m.line_id, '-'), 64));
  end if;
  return null;
end;
$$;
revoke all on function app.tg_version_lock_lines_match() from public, anon, authenticated;

create trigger t50_lock_lines_match after update of locked_at on public.estimate_versions
  for each row when (old.locked_at is null and new.locked_at is not null)
  execute function app.tg_version_lock_lines_match();

-- С3: a version is born open; only send_estimate locks it (and through it, the check above)
create or replace function app.tg_version_born_open()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and new.locked_at is not null then
    raise exception 'a new estimate version cannot be locked: send the estimate' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_version_born_open() from public, anon, authenticated;
create trigger t05_born_open before insert on public.estimate_versions
  for each row execute function app.tg_version_born_open();

-- С2: is the version locked — read FOR SHARE: a send_estimate in progress is waited for, and the row as it commits
-- is seen (READ COMMITTED re-reads a locked row). security definer: the row lock needs no write right of the caller.
create or replace function app.version_locked_for_share(p_version_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare locked boolean;
begin
  select v.locked_at is not null into locked from public.estimate_versions v where v.id = p_version_id for share;
  return coalesce(locked, false);
end;
$$;
revoke all on function app.version_locked_for_share(uuid) from public, anon, authenticated;

-- С2: the same body as core.sql (now security definer: it only reads, and calls the helper that is nobody's), the
-- version read FOR SHARE — it waits for a lock (send_estimate's UPDATE) in progress,
-- then sees the version locked; a line can no longer be added between the check and the lock
create or replace function app.tg_estimate_child_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_version_id uuid;
  v_row        jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if tg_table_name = 'estimate_options' then
    v_version_id := (v_row ->> 'version_id')::uuid;
  elsif tg_table_name = 'estimate_line_items' then
    select o.version_id into v_version_id from public.estimate_options o where o.id = (v_row ->> 'option_id')::uuid;
  else -- estimate_line_costs
    select o.version_id into v_version_id
      from public.estimate_line_items li join public.estimate_options o on o.id = li.option_id
     where li.id = (v_row ->> 'line_item_id')::uuid;
  end if;
  if app.version_locked_for_share(v_version_id) then
    raise exception 'estimate version % is locked', v_version_id using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function app.tg_estimate_child_lock() from public, anon, authenticated;
