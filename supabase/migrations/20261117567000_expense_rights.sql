-- Р-8a: which expense a member of the company may write. Only the policies change (alter policy: grants, names and
-- columns stay — rule 16). The office (owner, admin, office) — as before: any client, any sign (a supplier's credit
-- note, a discount line of spec 53 written as a negative expense).
-- The others (tech, sales, subcontractor):
--   * a client only of the expense's own job (or none): what the app sends (cloud/ops.ts expense.add) has no client at all;
--   * the sum and the tax not below zero;
--   * an expense without a job — tech and sales; a subcontractor only on a job he works (app.is_job_assignee);
--   * the same on a change of their own expense (expenses_update with check): not +500 written, then −500 000.
-- An old build never sends a client or a negative sum; a subcontractor's expense without a job is refused (42501, the op
-- goes to «отклонённые», outboxRejected) — the button is hidden for him by a separate PR. Test T433.

-- the client of a job, for the policies: read past the caller's own read rule (a subcontractor does not read jobs; a tech
-- taken off the job keeps editing his expense), but only a job of a company the caller is a member of
create or replace function app.job_customer(p_job_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select j.customer_id from public.jobs j where j.id = p_job_id and app.is_member(j.company_id);
$$;
-- rule 18 (T52): nobody by default; the policies of authenticated call it
revoke all on function app.job_customer(uuid) from public, anon, authenticated;
grant execute on function app.job_customer(uuid) to authenticated;

alter policy expenses_insert on public.expenses
  with check (
    app.is_member(company_id)
    and (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (amount_cents >= 0 and tax_cents >= 0
             -- no job: app.job_customer(null) is null, so no client either
             and (customer_id is null or customer_id = app.job_customer(job_id))
             and ((job_id is null and app.has_role(company_id, array['tech', 'sales']))
                  or (job_id is not null and (app.is_staff(company_id) or app.is_job_assignee(job_id)))))));

alter policy expenses_update on public.expenses
  with check (
    app.has_role(company_id, array['owner', 'admin', 'office'])
    or (created_by = (select auth.uid()) and app.is_member(company_id)
        and amount_cents >= 0 and tax_cents >= 0
        and (customer_id is null or customer_id = app.job_customer(job_id))
        and (job_id is not null or app.has_role(company_id, array['tech', 'sales']))));
