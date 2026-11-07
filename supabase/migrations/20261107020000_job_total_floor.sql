-- 3b-2 «Работы и выезды» (docs/specs/17-job.md §11.1): the own lines of a job (a job without an estimate) may not bring
-- its total below what is already invoiced — the balance would go negative and «Создать счёт на остаток» would not
-- catch it. A line change, a removed line or the tax switched off are refused the same way (the job total is
-- recounted by t18_job_money before this trigger; t90_job_line_total updates the job after a line changes, so the
-- line change rolls back with it). The app checks the same first (engine jobLinesBelowInvoiced). db T69.
-- Only additive (rule 16): a new trigger function and a trigger, no column changes.

create or replace function app.tg_job_total_floor()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_invoiced bigint;
begin
  if new.estimate_id is not null or new.contract_total_cents >= old.contract_total_cents then return new; end if;
  select coalesce(sum(i.total_cents), 0) into v_invoiced from public.invoices i
   where i.job_id = new.id and i.company_id = new.company_id and i.status <> 'void' and i.deleted_at is null;
  if new.contract_total_cents < v_invoiced then
    raise exception 'the job total cannot go below what is invoiced' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_job_total_floor() from public, anon, authenticated;

-- after t18_job_money (it recounts the total from the lines), before t20 and the rest
drop trigger if exists t19_job_total_floor on public.jobs;
create trigger t19_job_total_floor before update of contract_total_cents, tax_enabled, tax_rate_bps on public.jobs
  for each row execute function app.tg_job_total_floor();
