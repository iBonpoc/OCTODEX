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
-- The contract's tax: the client's approved choice (estimate_approvals.selection → tax, as signed), else the version's own
-- count with the chosen add-ons (app.estimate_option_totals); a job without an estimate — its own lines (app.job_lines_totals).
-- Rule 16: only additive — two new functions and a new trigger; old app versions keep writing subtotal = total and the
-- server splits it; invoices already sent are not changed. Rule 18: both functions are revoked from everyone — only the
-- trigger runs them. Tests: supabase/tests/core_rls.sql T196, engine test/contract.test.ts.

create or replace function app.job_contract_tax(p_job uuid)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare j public.jobs; v_sel jsonb; v_addons uuid[]; v_tax bigint; t record;
begin
  select * into j from public.jobs where id = p_job;
  if j.id is null then return 0; end if;
  if j.estimate_id is not null then
    select a.selection into v_sel from public.estimate_approvals a
     where a.company_id = j.company_id and a.estimate_id = j.estimate_id and a.decision = 'approved' and a.deleted_at is null
       and (j.approved_version_id is null or a.version_id = j.approved_version_id)
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
                        and a2.deleted_at is null and a2.version_id = j.approved_version_id
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

create or replace function app.tg_invoice_contract()
returns trigger language plpgsql security definer set search_path = '' as $$
declare j public.jobs; v_inv bigint; v_tax bigint; v_ctax bigint; v_left bigint; v_share bigint;
begin
  -- someone who may not bill this company: nothing is counted (the trigger runs before the row's RLS check, which then
  -- refuses the row as before — no lock on the job; security-check of #865, finding 1)
  if current_user in ('authenticated', 'anon') and not app.has_role(new.company_id, array['owner', 'admin', 'office', 'sales']) then
    return new;
  end if;
  -- only the contract's invoices (deposit / progress / final); a standalone or recurring one is outside the contract
  if new.job_id is null or new.kind not in ('deposit', 'progress', 'final') or new.status <> 'sent' or new.deleted_at is not null then
    return new;
  end if;
  -- split once, as it is sent (inserted sent, or a draft sent now); a sent invoice keeps its amounts (tg_invoice_guard)
  if tg_op = 'UPDATE' and old.status <> 'draft' then return new; end if;
  select * into j from public.jobs where id = new.job_id and company_id = new.company_id for update;
  if j.id is null or j.contract_total_cents is null then return new; end if;
  select coalesce(sum(i.total_cents), 0), coalesce(sum(i.tax_cents), 0) into v_inv, v_tax
    from public.invoices i
   where i.company_id = new.company_id and i.job_id = new.job_id and i.kind in ('deposit', 'progress', 'final')
     and i.status = 'sent' and i.deleted_at is null and i.id <> new.id;
  if coalesce(new.discount_cents, 0) = 0 and new.total_cents > 0
     and j.contract_total_cents > 0 then
    v_ctax := app.job_contract_tax(j.id);
    v_left := greatest(0, v_ctax - v_tax);
    if v_inv + new.total_cents >= j.contract_total_cents then
      v_share := v_left;
    else
      v_share := floor(new.total_cents::numeric * v_ctax / j.contract_total_cents + 0.5)::bigint;
    end if;
    v_share := greatest(0, least(v_share, v_left, new.total_cents));
    new.tax_cents := v_share;
    new.subtotal_cents := new.total_cents - v_share;
    new.tax_enabled := v_share > 0;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_invoice_contract() from public, anon, authenticated;

-- after t40_invoice_guard (it keeps a sent invoice's amounts and refuses a void one at insert); В1-4б adds the refusal
-- above the contract to this same function
drop trigger if exists t41_invoice_contract on public.invoices;
create trigger t41_invoice_contract before insert or update of status on public.invoices
  for each row execute function app.tg_invoice_contract();
