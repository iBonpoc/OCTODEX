-- #2075: what sales read of the company's money follows the roles decision (the founder's answer to В4, audit of roles
-- #2064: sales do not see the company's money — only the sums of their own estimates and leads).
-- «His deal» (app.sales_deal_*): an estimate he made (estimates.created_by) or an estimate of a lead he leads
-- (leads.assigned_to); its job (jobs.estimate_id); the invoices of that job or of that estimate's version.
--   * invoices_select — the office as before; the tech as before; sales — the invoices of his deals.
--   * payments_select — the office as before; the tech as before; sales — the payments he took himself (received_by) and
--     the payments of the invoices of his deals.
--   * refunds, payment_attempts, stripe_accounts — owner, admin, office (sales — none).
--   * notifications (select, mark read) — the office as before; sales — the notifications of his estimates only.
-- customer_balances is security_invoker: it follows invoices. An old phone of sales simply loads fewer rows.
-- db T420–T423. Rule 16: policies altered in place, new functions; nothing renamed or dropped.
-- Rule 18: the new functions — revoke all from public, anon; execute to authenticated (the policies call them).

create or replace function app.sales_deal_estimate(p_estimate_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.estimates e
     where e.id = p_estimate_id
       and (e.created_by = auth.uid()
            or (e.lead_id is not null
                and exists (select 1 from public.leads l where l.id = e.lead_id and l.company_id = e.company_id
                                                           and l.assigned_to = auth.uid())))
  );
$$;
revoke all on function app.sales_deal_estimate(uuid) from public, anon;
grant execute on function app.sales_deal_estimate(uuid) to authenticated;

create or replace function app.sales_deal_invoice(p_invoice_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.invoices i
     where i.id = p_invoice_id
       and ((i.job_id is not null
             and exists (select 1 from public.jobs j where j.id = i.job_id and j.company_id = i.company_id
                                                     and j.estimate_id is not null and app.sales_deal_estimate(j.estimate_id)))
            or (i.source_estimate_version_id is not null
                and exists (select 1 from public.estimate_versions v where v.id = i.source_estimate_version_id
                                                                     and v.company_id = i.company_id
                                                                     and app.sales_deal_estimate(v.estimate_id))))
  );
$$;
revoke all on function app.sales_deal_invoice(uuid) from public, anon;
grant execute on function app.sales_deal_invoice(uuid) to authenticated;

alter policy invoices_select on public.invoices
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (app.has_role(company_id, array['sales']) and app.sales_deal_invoice(id))
         or (app.has_role(company_id, array['tech']) and job_id is not null and app.is_job_assignee(job_id)));

alter policy payments_select on public.payments
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (app.has_role(company_id, array['sales'])
             and (received_by = (select auth.uid()) or (invoice_id is not null and app.sales_deal_invoice(invoice_id))))
         or (app.has_role(company_id, array['tech'])
             and (received_by = (select auth.uid()) or (visit_id is not null and app.is_visit_assignee(visit_id)))));

alter policy refunds_select on public.refunds
  using (app.has_role(company_id, array['owner', 'admin', 'office']));
alter policy payment_attempts_select on public.payment_attempts
  using (app.has_role(company_id, array['owner', 'admin', 'office']));
alter policy stripe_accounts_select on public.stripe_accounts
  using (app.has_role(company_id, array['owner', 'admin', 'office']));

alter policy notifications_select on public.notifications
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (app.has_role(company_id, array['sales']) and estimate_id is not null and app.sales_deal_estimate(estimate_id)));
alter policy notifications_update on public.notifications
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (app.has_role(company_id, array['sales']) and estimate_id is not null and app.sales_deal_estimate(estimate_id)))
  with check (app.has_role(company_id, array['owner', 'admin', 'office'])
              or (app.has_role(company_id, array['sales']) and estimate_id is not null and app.sales_deal_estimate(estimate_id)));
