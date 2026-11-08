-- Debt 4 of «Сметы» №1 (spec 19 §9.1, the residual): a tech edits a SENT estimate — the app makes a new version with
-- new line ids (the sent version stays as it is), so the office's costs of those lines did not reach the new version:
-- the tech cannot write costs (RLS: app.can_view_costs) and the kept cost of 20261108180000 is found only by the same id.
--
-- Now the app (from this build) sends, for each line of the new version, the line of the sent version it was copied
-- from (estimate_line_items.copied_from_line_id). When someone who does not see costs inserts such a line, its cost is
-- copied from that line — only a line of the same company, of an EARLIER, LOCKED version of the SAME estimate, so a
-- crafted id can never take a cost of another estimate or company. Who sees costs writes them itself (a cost the office
-- cleared must stay cleared). A cost already there wins. Older builds do not send the column: as before.
-- Rejected: matching lines by position or name — a wrong cost could be taken without anyone seeing it.
-- Rule 16: a new nullable column and a new trigger; nothing renamed or dropped.

alter table public.estimate_line_items add column copied_from_line_id uuid;
comment on column public.estimate_line_items.copied_from_line_id is
  'the line of an earlier locked version of the same estimate this line was copied from (the app''s edit of a sent estimate); the cost is copied from it for who cannot write costs';

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
  insert into public.estimate_line_costs (line_item_id, company_id, unit_cost_cents, unit_material_cost_cents,
                                          purchase_tax_bps, markup_bps, line_cost_cents, currency)
  select new.id, new.company_id, c.unit_cost_cents, c.unit_material_cost_cents,
         c.purchase_tax_bps, c.markup_bps, c.line_cost_cents, c.currency
    from public.estimate_line_items src
    join public.estimate_line_costs c on c.line_item_id = src.id and c.company_id = src.company_id and c.deleted_at is null
    join public.estimate_options so on so.id = src.option_id and so.company_id = src.company_id
    join public.estimate_versions sv on sv.id = so.version_id and sv.company_id = src.company_id
    join public.estimate_options nopt on nopt.id = new.option_id and nopt.company_id = new.company_id
    join public.estimate_versions nv on nv.id = nopt.version_id and nv.company_id = new.company_id
   where src.id = new.copied_from_line_id
     and src.company_id = new.company_id
     and src.deleted_at is null
     and sv.estimate_id = nv.estimate_id
     and sv.version_no < nv.version_no
     and sv.locked_at is not null
  on conflict (line_item_id) do nothing;
  return null;
end;
$$;
revoke all on function app.tg_line_cost_copy() from public, anon, authenticated;

create trigger t96_cost_copy after insert on public.estimate_line_items
  for each row execute function app.tg_line_cost_copy();
