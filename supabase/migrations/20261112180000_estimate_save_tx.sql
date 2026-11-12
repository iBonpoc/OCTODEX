-- #1220 (review of #1218): saving an estimate to the cloud in one transaction. Before, the phone wrote the version
-- (calc_inputs), switched estimates.current_version_id, deleted the version's options and lines and inserted them again —
-- separate requests: an insert refused for good (a check, a lost right) left the client's estimate with no lines, and the
-- document said otherwise (22023 estimate_lines_mismatch at the next send). New lines take the same ids as the old ones,
-- so the insert cannot go first.
-- public.save_estimate_version — one transaction: the version (its document and settings), the estimate's title and
-- current version, the options and lines replaced, the costs (only for who sees costs — for anyone else they are left
-- out, as the phone's request did on 42501). Any refusal rolls back all of it: the version, its lines and the current
-- version stay as they were.
-- * security invoker: the caller's own rights — the same RLS and triggers as the separate requests (the lock of a sent
--   version, the line checks, t20, a tech's own estimate); it gives nobody a new right.
-- * The estimate is locked first, then the version (the order of send_estimate): two saves of one estimate go one after
--   the other, a save and a send never deadlock.
-- * Size: at most 10 options, 2000 lines, 2000 costs, a title of 500 characters and 4 MB in all (the title counted
--   too) — beyond that 22023, hint estimate_save_size (as doc_pages caps the attached pages); a payload not of the
--   expected shape — 22023, hint estimate_save_shape.
-- * Only this version: every line belongs to one of the options sent, every cost to one of the lines sent — else 22023,
--   hint estimate_save_shape, nothing written (security-check of #1226: a line into another estimate's option, a cost
--   over another estimate's line of the same company).
-- Rule 16: a new function; older phones keep the separate requests (no worse than before), this phone uses them only
-- when the server has no such function yet (PGRST202). Rule 18: revoked from public, anon; execute for authenticated.
-- The size caps stay above the app's own limits (3 options, a template's 10; pages ≤ 512 KB): a refusal of size is for
--   good (the op leaves the queue), so the app never reaches it.
-- Tests: supabase/tests/core_rls.sql T200, apps/mobile/test/opsEstimateSaveTx.test.ts.

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
    insert into public.estimate_line_costs as c (line_item_id, company_id, unit_cost_cents)
    select x.line_item_id, v_company, x.unit_cost_cents
      from jsonb_to_recordset(v_costs) as x(line_item_id uuid, unit_cost_cents bigint)
    on conflict (line_item_id) do update set unit_cost_cents = excluded.unit_cost_cents;
  end if;
end;
$$;
revoke all on function public.save_estimate_version(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_estimate_version(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) to authenticated;
