-- A job the app writes itself (security check of wave 3b, 06.11).
-- jobs_insert / jobs_update let the staff write a row themselves, and the app still inserts jobs in three places
-- (ops.ts: lead.book, lead.visit — the «Estimate visit» job; estimate.deposit — a repeat for the job of a signed estimate).
-- That path skipped the checks of public.create_job. Until those ops move to server functions (then: revoke insert on jobs
-- from authenticated and column grants for update — a debt on docs/ai/BOARD.md), this trigger keeps the rules for a row
-- the app writes itself (current_user «authenticated»; anon has no jobs policy at all):
-- INSERT
--   * a repeat with an id that is already there (offline queue replay, upsert … do nothing) is let through to its conflict;
--   * the client is of this company and not deleted (the composite foreign key checks the company, not the deletion);
--   * the address is a property of THIS client, not deleted; the job type is of this company and not archived;
--   * a job of an estimate is made only by its signature (execute_estimate): no estimate, version, option or total from the
--     app — otherwise a row on an unsigned estimate would take unique (estimate_id) with the app's price;
--   * no recurring plan / occurrence (unique across companies), not born deleted;
--   * a new job starts at «draft» («ждёт даты»): no other status, no completed/closed/cancelled time.
-- UPDATE
--   * the client, the estimate, its version / option, the recurring plan, the author do not change directly;
--   * the total the app sends is dropped (kept as it was): t18 / t90 write it from the job's lines (security definer);
--   * completed_at / closed_at / cancelled_at do not change without a change of the status;
--   * a new address is a property of the same client, not deleted; a new job type is of this company and not archived.
-- «Do not service» is not checked here: «Лиды и клиенты» guard it with their own trigger on jobs/estimates/visits (4b-1).
-- Server functions (create_job, execute_estimate, cancel_visit, complete_job, …) are security definer: current_user there is
-- the owner of the function, so their writes keep their own checks and are not touched. service_role is trusted.
-- The trigger is not security definer: every lookup is under the caller's RLS, so «not found» and «not yours» are one answer.

create or replace function app.tg_job_write_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if exists (select 1 from public.jobs j where j.id = new.id) then
      return new;   -- a replay: the primary key decides (do nothing / duplicate), no change goes through
    end if;
    if not exists (select 1 from public.customers c where c.id = new.customer_id and c.company_id = new.company_id and c.deleted_at is null) then
      raise exception 'the client is not found' using errcode = '42501';
    end if;
    if new.estimate_id is not null or new.approved_version_id is not null or new.option_id is not null or new.contract_total_cents is not null then
      raise exception 'a job of an estimate is made by its signature' using errcode = '42501';
    end if;
    if new.recurring_plan_id is not null or new.occurrence_date is not null or new.deleted_at is not null then
      raise exception 'a new job is a plain job' using errcode = '42501';
    end if;
    if new.status <> 'draft' or new.completed_at is not null or new.closed_at is not null or new.cancelled_at is not null then
      raise exception 'a new job starts waiting for a date' using errcode = 'check_violation';
    end if;
  else
    -- the total is the server's: kept as it was, t18 then recounts it from the lines (the phone's number is dropped, T41)
    new.contract_total_cents := old.contract_total_cents;
    if new.customer_id is distinct from old.customer_id or new.estimate_id is distinct from old.estimate_id
       or new.approved_version_id is distinct from old.approved_version_id or new.option_id is distinct from old.option_id
       or new.recurring_plan_id is distinct from old.recurring_plan_id or new.occurrence_date is distinct from old.occurrence_date
       or new.created_by is distinct from old.created_by or new.company_id is distinct from old.company_id then
      raise exception 'the client, the estimate and the total of a job do not change here' using errcode = '42501';
    end if;
    -- the times of «completed» / «closed» / «cancelled» move only with the status (t31 guards the status itself)
    if new.status is not distinct from old.status and (new.completed_at is distinct from old.completed_at
       or new.closed_at is distinct from old.closed_at or new.cancelled_at is distinct from old.cancelled_at) then
      raise exception 'the time of a status moves with the status' using errcode = '42501';
    end if;
  end if;

  if (tg_op = 'INSERT' or new.property_id is distinct from old.property_id)
     and not exists (select 1 from public.properties p where p.id = new.property_id and p.company_id = new.company_id
                      and p.customer_id = new.customer_id and p.deleted_at is null) then
    raise exception 'the address is not a property of this client' using errcode = '22023';
  end if;
  if new.job_type_id is not null and (tg_op = 'INSERT' or new.job_type_id is distinct from old.job_type_id)
     and not exists (select 1 from public.job_types t where t.id = new.job_type_id and t.company_id = new.company_id and t.archived_at is null) then
    raise exception 'unknown job type' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_job_write_guard() from public, anon, authenticated;
-- t14: before the direction (t15, t16), the money (t18), the number (t20), the status (t30, t31)
create trigger t14_job_write_guard before insert or update on public.jobs
  for each row execute function app.tg_job_write_guard();
