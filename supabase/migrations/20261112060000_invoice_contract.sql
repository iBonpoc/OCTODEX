-- #865 (audit 2026-11-11 X-01, X-02, X-03): the invoices of a contract.
-- 1) Never more than the contract: Σ sent contract invoices (deposit / progress / final) of a job (a void or removed one does not count; a draft is not billed,
--    as the app reads them — repo.ts, t19_job_total_floor, record_visit_payment) plus the new one ≤ jobs.contract_total_cents.
--    Refused: 23514, hint invoice_over_contract (the app shows its own words, outboxRejected.ts). The job's row is locked
--    first, so two phones billing the same job at once are checked one after the other. A job with no contract amount
--    (contract_total_cents null) is not checked: there is nothing to check against.
-- 2) The tax inside: the contract total already holds the tax; an invoice of it (deposit / progress / final) keeps its
--    total and splits it into subtotal + tax — tax = round half up (total × contract tax / contract); the invoice that bills
--    the rest of the contract takes what is left of the tax, so Σ tax of the invoices = the contract's tax. The same as the
--    engine (@octo/estimating-engine invoiceTaxShare). The server counts it for every such invoice (the app's
--    invoice.issue, execute_estimate / countersign's deposit, record_visit_payment's final, older app versions): revenue
--    in the reports is the subtotal (without tax), a refund's tax part follows the invoice's tax (refunds, 20261109050000).
--    An invoice with a discount of its own keeps its own amounts.
-- The contract's tax: the client's approved choice (estimate_approvals.selection → tax, as signed), else the version's
-- own count (app.estimate_option_totals); a job without an estimate — its own lines (app.job_lines_totals).
-- Rule 16: only additive — two new functions and a new trigger; nothing is renamed or dropped, old app versions keep
-- writing what they wrote (subtotal = total) and the server splits it. Already issued invoices are not changed (a sent
-- invoice keeps its amounts, tg_invoice_guard). Rule 18: both functions are revoked from everyone — only the trigger runs
-- them. Tests: supabase/tests/core_rls.sql T196, engine test/contract.test.ts.

create or replace function app.job_contract_tax(p_job uuid)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare j public.jobs; v_sel jsonb; v_tax bigint; t record;
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
      select * into t from app.estimate_option_totals(j.approved_version_id, j.option_id, '{}');
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
  -- only the contract's invoices (deposit / progress / final); a standalone or recurring one is outside the contract
  if new.job_id is null or new.kind not in ('deposit', 'progress', 'final') or new.status <> 'sent' or new.deleted_at is not null then
    return new;
  end if;
  -- a sent invoice that stays as it was (the payment recalc, reminders, the title): nothing to check
  if tg_op = 'UPDATE' and old.status = 'sent' and old.deleted_at is null
     and new.total_cents is not distinct from old.total_cents and new.job_id is not distinct from old.job_id
     and new.kind is not distinct from old.kind then
    return new;
  end if;
  select * into j from public.jobs where id = new.job_id and company_id = new.company_id for update;
  if j.id is null or j.contract_total_cents is null then return new; end if;
  select coalesce(sum(i.total_cents), 0), coalesce(sum(i.tax_cents), 0) into v_inv, v_tax
    from public.invoices i
   where i.company_id = new.company_id and i.job_id = new.job_id and i.kind in ('deposit', 'progress', 'final')
     and i.status = 'sent' and i.deleted_at is null and i.id <> new.id;
  if v_inv + new.total_cents > j.contract_total_cents then
    -- no amounts in the text: this trigger runs before the row's RLS check, the text reaches whoever tried
    raise exception 'the job''s invoices would be more than its contract'
      using errcode = 'check_violation', hint = 'invoice_over_contract';
  end if;
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

-- after t40_invoice_guard (it keeps a sent invoice's amounts and refuses a void one at insert)
drop trigger if exists t41_invoice_contract on public.invoices;
create trigger t41_invoice_contract before insert or update of status, kind, total_cents, job_id, deleted_at on public.invoices
  for each row execute function app.tg_invoice_contract();
