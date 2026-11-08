-- Н1 (spec 33 П23.9, security-check of #396): the client's page /p/ is drawn from app.client_doc(calc_inputs), while
-- the server's sums (portal_accept → app.estimate_option_totals, the deposit, the signature's selection) come from
-- estimate_line_items. Both are written by the same op (ops.ts saveEstimate), but in separate requests: a bug, an old
-- build or a broken save could leave them apart — the client would sign one amount and be charged another.
--
-- Now a version is checked when it is locked (send_estimate: locked_at null → a time): for every option, the lines
-- the client sees with a non-zero amount (option id, line id, add-on or not, amount) are the same on both sides.
-- Amount = floor(qty × price + 0.5) on the stored quantity (numeric(14,4), half away from zero) — the rule of
-- estimate_line_items.line_total_cents and of the engine (custom.ts toLine, jobLineQty). A $0 line on either side
-- does not move a sum and is not compared (blank rows the app skips, quantity-0 lines client_doc hides).
-- Different → 22023, nothing is locked or sent: saving the estimate again writes both sides from one document.
-- Already locked versions are not touched. Rule 16: a new function and a new trigger only.


-- the lines (option, line, add-on, amount) of a version whose two sides differ; empty = they match
create or replace function app.version_lines_mismatch(p_version_id uuid)
returns table (option_id text, line_id text, optional boolean, amount bigint, side text)
language plpgsql stable security definer set search_path = '' as $$
declare v public.estimate_versions;
begin
  select * into v from public.estimate_versions where id = p_version_id;
  return query
  with doc as (
    select o.value ->> 'id' as option_id, l.value ->> 'id' as line_id,
           coalesce(l.value -> 'optional' = 'true'::jsonb, false) as optional,
           case when (l.value ->> 'quantity') ~ '^\s*-?([0-9]+[.]?[0-9]*|[.][0-9]+)\s*$'
                then floor(round(trim(l.value ->> 'quantity')::numeric, 4) * (l.value ->> 'unitPriceCents')::numeric + 0.5)::bigint
           end as amount
      from jsonb_array_elements(coalesce(app.client_doc(v.calc_inputs) -> 'options', '[]'::jsonb)) o,
           jsonb_array_elements(coalesce(o.value -> 'lines', '[]'::jsonb)) l
  ), d as (
    -- a quantity that is not a number: the page cannot count it — it never matches
    select doc.option_id, doc.line_id, doc.optional, doc.amount from doc where doc.amount is distinct from 0
  ), s as (
    select eo.id::text as option_id, li.id::text as line_id, li.is_optional as optional, li.line_total_cents as amount
      from public.estimate_line_items li
      join public.estimate_options eo on eo.id = li.option_id
     where eo.version_id = v.id and eo.deleted_at is null and li.deleted_at is null and li.client_visible
       and li.line_total_cents <> 0
  )
  (select d.*, 'document'::text from d except select s.*, 'document'::text from s)
  union all
  (select s.*, 'lines'::text from s except select d.*, 'lines'::text from d);
end;
$$;
revoke all on function app.version_lines_mismatch(uuid) from public, anon, authenticated;

create or replace function app.tg_version_lock_lines_match()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  -- a version without a document (no options array: rows written by hand, never by the app) is not checked —
  -- the page of such a version shows no lines at all;
  -- no JWT (a migration, the service role fixing data by hand) is not checked either: the check guards the app's send
  if jsonb_typeof(new.calc_inputs -> 'options') is distinct from 'array' or auth.uid() is null then
    return null;
  end if;
  select * into m from app.version_lines_mismatch(new.id) limit 1;
  if found then
    raise exception 'estimate lines do not match its document (option %, line %, %): save the estimate again',
      m.option_id, m.line_id, m.side
      using errcode = '22023', hint = 'estimate_lines_mismatch';
  end if;
  return null;
end;
$$;
revoke all on function app.tg_version_lock_lines_match() from public, anon, authenticated;

create trigger t50_lock_lines_match after update of locked_at on public.estimate_versions
  for each row when (old.locked_at is null and new.locked_at is not null)
  execute function app.tg_version_lock_lines_match();
