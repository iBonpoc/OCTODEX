-- #865 В1-4а (audit 2026-11-11 X-01, X-02; spec PR #1106 docs/audit/2026-11-11-main-path-spec.md): the tax inside the invoices
-- of a contract. The contract total already holds the tax; an invoice of it (deposit / progress / final) keeps its total and
-- splits it into subtotal + tax — tax = round half up (total × contract tax / contract); the invoice that bills the rest of
-- the contract takes what is left of the tax, so Σ tax of the invoices = the contract's tax (director's decision 12.11).
-- The same as the engine (@octo/estimating-engine invoiceTaxShare). The server counts it for every such invoice as it is
-- sent (the app's invoice.issue, execute_estimate / countersign's deposit, record_visit_payment's final, older app
-- versions): revenue in the reports is the subtotal (without tax), a refund's tax part follows the invoice's tax (refunds,
-- 20261109050000). Counted: the job's other sent invoices of these kinds (a void one, a draft, a standalone one — not).
-- An invoice with a discount of its own keeps its own amounts; a sent invoice is never re-split (tg_invoice_guard keeps it).
-- The server's refusal of invoices above the contract (В1-4б) is not here: it comes with voiding an invoice (#1107).
-- The contract's tax: the client's approved choice (estimate_approvals: approved, the job's approved version, party customer,
-- selection → tax a number — as the phone reads it, repo.ts), else the version's own
-- count with the chosen add-ons (app.estimate_option_totals); a job without an estimate — its own lines (app.job_lines_totals).
-- Rule 16: only additive — two new functions and a new trigger; old app versions keep writing subtotal = total and the
-- server splits it; invoices already sent are not changed. Rule 18: app.job_contract_tax and the trigger function are revoked from
-- everyone; app.invoice_tax_split is revoked from public, anon and granted to authenticated (the invoker trigger calls it;
-- it answers null to anyone outside the company). Tests: supabase/tests/core_rls.sql T196, engine test/contract.test.ts.

create or replace function app.job_contract_tax(p_job uuid)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare j public.jobs; v_sel jsonb; v_addons uuid[]; v_tax bigint; t record;
begin
  select * into j from public.jobs where id = p_job;
  if j.id is null then return 0; end if;
  if j.estimate_id is not null then
    select a.selection into v_sel from public.estimate_approvals a
     where a.company_id = j.company_id and a.estimate_id = j.estimate_id and a.decision = 'approved' and a.deleted_at is null
       and a.party = 'customer' and (j.approved_version_id is null or a.version_id = j.approved_version_id)
       and jsonb_typeof(a.selection -> 'tax') = 'number'
     order by a.signed_at desc limit 1;
    if v_sel is not null then
      v_tax := (v_sel ->> 'tax')::numeric::bigint;
    elsif j.approved_version_id is not null and j.option_id is not null then
      -- an older approval without the tax: the version's own count with the add-ons the client chose (as the phone)
      select coalesce(array_agg(x::uuid), '{}') into v_addons
        from public.estimate_approvals a, jsonb_array_elements_text(case when jsonb_typeof(a.selection -> 'addon_ids') = 'array' then a.selection -> 'addon_ids' else '[]'::jsonb end) x
       where a.id = (select a2.id from public.estimate_approvals a2
                      where a2.company_id = j.company_id and a2.estimate_id = j.estimate_id and a2.decision = 'approved'
                        and a2.deleted_at is null and a2.party = 'customer' and a2.version_id = j.approved_version_id
                      order by a2.signed_at desc limit 1);
      select * into t from app.estimate_option_totals(j.approved_version_id, j.option_id, v_addons);
      v_tax := t.tax;
    end if;
  else
    select x.tax into v_tax from app.job_lines_totals(j.id) x where x.lines > 0;
  end if;
  return greatest(0, least(coalesce(v_tax, 0), coalesce(j.contract_total_cents, 0)));
end;
$$;
revoke all on function app.job_contract_tax(uuid) from public, anon, authenticated;

-- the share of the tax of an invoice of `p_total` on the job (sent now): null — nothing to split (no such job of this
-- company, no contract amount, an invoice with a discount of its own). Security definer: it reads the job's other
-- invoices and the contract under the job's row lock (two phones billing one job at once are split one after the other).
-- Only for the office side of that company (owner, admin, office, sales), a tech on a job of his (his visit payment's
-- final through record_visit_payment) or a server path with no signed-in user; anyone else gets null, nothing is locked or read
-- (security-check of #865: the trigger runs before the row's RLS check).
create or replace function app.invoice_tax_split(p_company uuid, p_job uuid, p_invoice uuid, p_total bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare j public.jobs; v_inv bigint; v_tax bigint; v_ctax bigint; v_left bigint; v_share bigint; v_before boolean;
begin
  -- the office side of the company; a tech only on a job of his (a visit of his — as invoices_select lets him read it):
  -- another job's contract, tax and billed sum are not his to learn (security-check of #1197)
  if auth.uid() is not null and not (app.has_role(p_company, array['owner', 'admin', 'office', 'sales'])
                                     or (app.has_role(p_company, array['tech']) and app.is_job_assignee(p_job))) then
    return null;
  end if;
  if p_job is null or not (p_total > 0) then return null; end if;
  select * into j from public.jobs where id = p_job and company_id = p_company for no key update;
  if j.id is null or not (j.contract_total_cents > 0) then return null; end if;
  v_ctax := app.job_contract_tax(j.id);
  select coalesce(sum(i.total_cents), 0), coalesce(sum(i.tax_cents), 0),
         coalesce(bool_or(i.tax_cents = 0 and v_ctax > 0 and floor(i.total_cents::numeric * v_ctax / j.contract_total_cents + 0.5) > 0), false)
    into v_inv, v_tax, v_before
    from public.invoices i
   where i.company_id = p_company and i.job_id = p_job and i.kind in ('deposit', 'progress', 'final')
     and i.status = 'sent' and i.deleted_at is null and i.id <> p_invoice;
  v_left := greatest(0, v_ctax - v_tax);
  -- the invoice that bills the rest takes the rest of the tax — unless an invoice issued before the split (no tax although
  -- its share is not 0) is among them: then each takes its own share (director's decision 12.11, З4; engine the same)
  if v_inv + p_total >= j.contract_total_cents and not v_before then
    v_share := v_left;
  else
    v_share := floor(p_total::numeric * v_ctax / j.contract_total_cents + 0.5)::bigint;
  end if;
  return greatest(0, least(v_share, v_left, p_total));
end;
$$;
revoke all on function app.invoice_tax_split(uuid, uuid, uuid, bigint) from public, anon;
-- the trigger runs as the person who writes the invoice (security invoker): they call this one
grant execute on function app.invoice_tax_split(uuid, uuid, uuid, bigint) to authenticated;

-- security invoker: current_user is the person writing (authenticated) — or the owner of a server function
-- (execute_estimate, record_visit_payment), which bills for its own caller
create or replace function app.tg_invoice_contract()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_share bigint;
begin
  -- someone who may not bill this company: nothing is counted (the row's RLS check refuses it after this trigger)
  if current_user in ('authenticated', 'anon') and not app.has_role(new.company_id, array['owner', 'admin', 'office', 'sales']) then
    return new;
  end if;
  -- only the contract's invoices (deposit / progress / final); a standalone or recurring one is outside the contract
  if new.job_id is null or new.kind not in ('deposit', 'progress', 'final') or new.status <> 'sent' or new.deleted_at is not null
     or coalesce(new.discount_cents, 0) <> 0 then
    return new;
  end if;
  -- split once, as it is sent (inserted sent, or a draft sent now); a sent invoice keeps its amounts (tg_invoice_guard)
  if tg_op = 'UPDATE' and old.status <> 'draft' then return new; end if;
  v_share := app.invoice_tax_split(new.company_id, new.job_id, new.id, new.total_cents);
  if v_share is not null then
    new.tax_cents := v_share;
    new.subtotal_cents := new.total_cents - v_share;
    new.tax_enabled := v_share > 0;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_invoice_contract() from public, anon, authenticated;

-- after t40_invoice_guard (it keeps a sent invoice's amounts and refuses a void one at insert); В1-4б adds the refusal
-- above the contract next to the split
drop trigger if exists t41_invoice_contract on public.invoices;
create trigger t41_invoice_contract before insert or update of status on public.invoices
  for each row execute function app.tg_invoice_contract();
