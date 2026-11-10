-- #544 (решение основателя 10.11.2026): the quick estimate's deposit rule {"kind":"pct","value":"0.1"} is 10 %, not none.
-- estimate.add (apps/mobile/src/cloud/ops.ts) writes the percent as a share of the total (value 0..1, «10 %» is "0.1"),
-- the custom estimate writes whole bps ({"kind":"pct","bps":1000}). The server read only bps → null → no deposit, and the
-- client signed a quick estimate with $0 deposit. Now: bps when the rule has it (as before), otherwise the share in value,
-- counted as whole bps (round half up), 0..10000 — the same as depositSettingFromRule in @octo/estimating-engine.
-- No data is rewritten: old phones keep writing value, approvals keep the deposit they were signed with (selection).
-- Only the body changes (same signature, same grants): rule 16 — nothing renamed or dropped.

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
  if v.tax_enabled then tx := floor((taxable - tdisc)::numeric * coalesce(v.tax_rate_bps, 0) / 10000 + 0.5); end if;
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
revoke all on function app.estimate_option_totals(uuid, uuid, uuid[]) from public, anon, authenticated;
