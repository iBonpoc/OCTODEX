-- #2075: the rights of sales on invoices and on the money of a job follow the roles decision (audit of roles #2064, В9:
-- sales do not issue or change invoices; the deposit at the signature is made by the signature's own server functions).
--   * invoices_insert / invoices_update — owner, admin, office. The server functions (execute_estimate, countersign,
--     record_estimate_deposit, record_visit_payment, the payment recalc) are security definer and keep their own checks.
--   * job_line_items_insert / job_line_items_update — owner, admin, office: the lines of a job make its contract total.
--   * the tax of a job (tax_enabled, tax_rate_bps, tax_rate_ppm), set on a new job or changed — owner, admin, office
--     (trigger t13_job_tax_rights);
--     the server functions are not touched (current_user is the owner of the function there).
-- The app hides the same buttons for sales (ContractStatement, JobLinesBlock). An old phone's queued write is refused with
-- 42501 and shown in «Требует внимания» (outboxRetry isAccessDenied). db T414–T416.
-- Rule 16: policies changed in place, a new trigger function and a trigger; nothing renamed or dropped.
-- Rule 18: the new function — revoke all from public, anon, authenticated; a trigger needs no execute right.

alter policy invoices_insert on public.invoices
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));
-- update: sales still find the row (USING as before) and the new row is refused (WITH CHECK) — an old phone gets 42501
-- for its queued change instead of «0 rows», which the queue would take for done
alter policy invoices_update on public.invoices
  using (app.has_role(company_id, array['owner', 'admin', 'office', 'sales']))
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));

alter policy job_line_items_insert on public.job_line_items
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));
alter policy job_line_items_update on public.job_line_items
  using (app.is_staff(company_id))
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));

create or replace function app.tg_job_tax_rights()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;   -- a server function or the service role
  end if;
  -- a new job of the app comes without a tax (the column defaults: off, 0, none); a change of it is the office's
  if (case when tg_op = 'INSERT' then new.tax_enabled or new.tax_rate_bps <> 0 or new.tax_rate_ppm is not null
           else new.tax_enabled is distinct from old.tax_enabled or new.tax_rate_bps is distinct from old.tax_rate_bps
                or new.tax_rate_ppm is distinct from old.tax_rate_ppm end)
     and not app.has_role(new.company_id, array['owner', 'admin', 'office']) then
    raise exception 'only the office changes the tax of a job' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_job_tax_rights() from public, anon, authenticated;

-- t13: before the write guard (t14) and the money (t18), so a refused change recounts nothing
drop trigger if exists t13_job_tax_rights on public.jobs;
create trigger t13_job_tax_rights before insert or update of tax_enabled, tax_rate_bps, tax_rate_ppm on public.jobs
  for each row execute function app.tg_job_tax_rights();
