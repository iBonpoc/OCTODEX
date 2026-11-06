-- Security #2, PR-7 (docs/specs/19-db-security.md §7.3, audit 06.11 item 11): indexes on foreign keys.
--
-- RLS filters by company_id first, and every delete / update of a parent (S22: deleting a user touches every FK
-- to public.users) scans the child table without an index. Built CONCURRENTLY: writes from the phones go on.
-- !! This file holds ONLY `create index concurrently` statements: supabase db push (CLI 3.0.0, release.yml) runs
-- such a file outside a transaction (checked 06.11); any other statement here would wrap it in one and fail.
-- A failed build leaves an INVALID index that `if not exists` would skip: drop it concurrently and push again
-- (T61 fails on any invalid index). Index names: <table>_<columns>_fk_idx.

create index concurrently if not exists estimate_line_costs_company_id_line_item_id_fk_idx on public.estimate_line_costs (company_id, line_item_id);
create index concurrently if not exists visit_assignees_company_id_visit_id_fk_idx on public.visit_assignees (company_id, visit_id);
create index concurrently if not exists visit_assignees_company_id_user_id_fk_idx on public.visit_assignees (company_id, user_id);
create index concurrently if not exists estimate_approvals_company_id_estimate_id_fk_idx on public.estimate_approvals (company_id, estimate_id);
create index concurrently if not exists lead_costs_company_id_lead_id_fk_idx on public.lead_costs (company_id, lead_id);
create index concurrently if not exists property_secrets_company_id_property_id_fk_idx on public.property_secrets (company_id, property_id);
create index concurrently if not exists revoked_link_tokens_company_id_fk_idx on public.revoked_link_tokens (company_id);
create index concurrently if not exists leads_assigned_to_fk_idx on public.leads (assigned_to);
create index concurrently if not exists tasks_assignee_id_fk_idx on public.tasks (assignee_id);
create index concurrently if not exists estimates_owner_user_id_fk_idx on public.estimates (owner_user_id);
create index concurrently if not exists leads_company_id_customer_id_fk_idx on public.leads (company_id, customer_id);
create index concurrently if not exists leads_company_id_property_id_fk_idx on public.leads (company_id, property_id);
create index concurrently if not exists leads_company_id_source_id_fk_idx on public.leads (company_id, source_id);
create index concurrently if not exists estimates_company_id_lead_id_fk_idx on public.estimates (company_id, lead_id);
create index concurrently if not exists jobs_company_id_estimate_id_fk_idx on public.jobs (company_id, estimate_id);
create index concurrently if not exists jobs_company_id_option_id_fk_idx on public.jobs (company_id, option_id);
create index concurrently if not exists visits_company_id_lead_id_fk_idx on public.visits (company_id, lead_id);
create index concurrently if not exists payments_company_id_customer_id_fk_idx on public.payments (company_id, customer_id);
create index concurrently if not exists files_company_id_job_id_fk_idx on public.files (company_id, job_id);
create index concurrently if not exists expenses_company_id_customer_id_fk_idx on public.expenses (company_id, customer_id);
create index concurrently if not exists notifications_company_id_estimate_id_fk_idx on public.notifications (company_id, estimate_id);
create index concurrently if not exists notifications_company_id_invoice_id_fk_idx on public.notifications (company_id, invoice_id);
create index concurrently if not exists notifications_company_id_visit_id_fk_idx on public.notifications (company_id, visit_id);
create index concurrently if not exists customer_tags_company_id_customer_id_fk_idx on public.customer_tags (company_id, customer_id);
create index concurrently if not exists job_tags_company_id_job_id_fk_idx on public.job_tags (company_id, job_id);
create index concurrently if not exists custom_field_values_company_id_field_id_fk_idx on public.custom_field_values (company_id, field_id);
create index concurrently if not exists email_outbox_company_id_estimate_id_fk_idx on public.email_outbox (company_id, estimate_id);
create index concurrently if not exists memberships_invited_by_fk_idx on public.memberships (invited_by);
create index concurrently if not exists payments_received_by_fk_idx on public.payments (received_by);
create index concurrently if not exists payments_voided_by_fk_idx on public.payments (voided_by);
create index concurrently if not exists invoices_voided_by_fk_idx on public.invoices (voided_by);
create index concurrently if not exists estimate_approvals_signer_user_id_fk_idx on public.estimate_approvals (signer_user_id);
create index concurrently if not exists member_signatures_user_id_fk_idx on public.member_signatures (user_id);
create index concurrently if not exists email_outbox_requested_by_fk_idx on public.email_outbox (requested_by);
create index concurrently if not exists invitations_invited_by_fk_idx on public.invitations (invited_by);
create index concurrently if not exists invitations_accepted_by_fk_idx on public.invitations (accepted_by);
create index concurrently if not exists calendar_events_user_id_fk_idx on public.calendar_events (user_id);
create index concurrently if not exists company_contacts_user_id_fk_idx on public.company_contacts (user_id);
create index concurrently if not exists visits_company_id_property_id_fk_idx on public.visits (company_id, property_id);
create index concurrently if not exists users_last_active_company_id_fk_idx on public.users (last_active_company_id);
create index concurrently if not exists companies_lead_default_assignee_id_fk_idx on public.companies (lead_default_assignee_id);
create index concurrently if not exists legal_acceptance_user_id_fk_idx on public.legal_acceptance (user_id);
create index concurrently if not exists legal_acceptance_company_id_fk_idx on public.legal_acceptance (company_id);
