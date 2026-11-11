-- #868 (Q-42, audit 2026-11-11): what sales may do with the company's money — two holes in the database.
--   1) payments_insert_staff let sales write a payment straight into payments: «Принять оплату» on an invoice
--      (ops.ts payment.record, invoice.pay). Spec 13 §4: sales take no payments on invoices. The deposit at the
--      signing (public.record_estimate_deposit, spec 17, T73) and the payment on a visit (public.record_visit_payment)
--      are security-definer functions with their own role lists: not changed here (the second is founder's #1042).
--   2) expenses_select / expenses_update went by app.is_staff, which counts sales: sales read every expense of the
--      company (and the app shows «Прибыль» from them) and could change other people's. Now sales read and change only
--      their own, like the tech (founder's #1042: by default sales do not see the company's expenses and profit).
-- Only policies change (alter policy: the grants stay as they are). Rule 16 — nothing is renamed or dropped. An older
-- build signed in as sales that sends a payment gets the server's refusal (42501): the op goes to «отклонённые»
-- (outboxRejected), nothing is lost silently. Test T191.

alter policy payments_insert_staff on public.payments
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));

alter policy expenses_select on public.expenses
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (app.has_role(company_id, array['tech', 'sales']) and deleted_at is null and created_by = (select auth.uid())));

alter policy expenses_update on public.expenses
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (created_by = (select auth.uid()) and app.is_member(company_id) and deleted_at is null))
  with check (app.has_role(company_id, array['owner', 'admin', 'office'])
              or (created_by = (select auth.uid()) and app.is_member(company_id)));
