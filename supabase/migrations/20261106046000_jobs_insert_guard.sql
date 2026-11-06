-- A direct insert into public.jobs (security check of wave 3b, 06.11).
-- jobs_insert lets owner/admin/office/sales insert a row themselves, and the app still does it in three places
-- (ops.ts: lead.book, lead.visit — the «Estimate visit» job; estimate.deposit — the job of an estimate). That path skipped the
-- checks of public.create_job. Until those ops move to server functions (then: revoke insert on jobs from authenticated —
-- a debt on docs/ai/BOARD.md), this trigger repeats the checks for a row the app inserts itself:
--   * the client is of this company and not deleted (the composite foreign key checks the company, not the deletion);
--   * the address is a property of THIS client, not deleted;
--   * the job type is of this company and not archived;
--   * the estimate (if any) is of this client, and the approved version (if any) is a version of that estimate;
--   * a new job starts at «draft» («ждёт даты»): no other status, no completed/closed/cancelled time — a status moves
--     later, by a visit (S9) or a server function (complete_job). t31 already refuses «completed»/«closed»; this is wider.
-- «Do not service» is not checked here: «Лиды и клиенты» guard it with their own trigger on jobs/estimates/visits (4b-1).
-- Server functions (create_job, execute_estimate, the signature of an estimate) are security definer: current_user there is
-- the owner of the function, not «authenticated», so their inserts keep their own checks and are not touched.
-- One answer for «not found» and «not yours» (no existence oracle).

create or replace function app.tg_job_insert_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if not exists (select 1 from public.customers c where c.id = new.customer_id and c.company_id = new.company_id and c.deleted_at is null) then
    raise exception 'the client is not found' using errcode = '42501';
  end if;
  if not exists (select 1 from public.properties p where p.id = new.property_id and p.company_id = new.company_id
                  and p.customer_id = new.customer_id and p.deleted_at is null) then
    raise exception 'the address is not a property of this client' using errcode = '22023';
  end if;
  if new.job_type_id is not null and not exists (select 1 from public.job_types t where t.id = new.job_type_id
                  and t.company_id = new.company_id and t.archived_at is null) then
    raise exception 'unknown job type' using errcode = '22023';
  end if;
  if new.estimate_id is not null and not exists (select 1 from public.estimates e where e.id = new.estimate_id
                  and e.company_id = new.company_id and e.customer_id = new.customer_id) then
    raise exception 'the estimate is not of this client' using errcode = '22023';
  end if;
  if new.approved_version_id is not null and (new.estimate_id is null or not exists (select 1 from public.estimate_versions v
                  where v.id = new.approved_version_id and v.company_id = new.company_id and v.estimate_id = new.estimate_id)) then
    raise exception 'the version is not of this estimate' using errcode = '22023';
  end if;
  if new.status <> 'draft' or new.completed_at is not null or new.closed_at is not null or new.cancelled_at is not null then
    raise exception 'a new job starts waiting for a date' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_job_insert_guard() from public, anon, authenticated;
-- t14: before the inherit (t15) and guard (t16) of the direction, the money (t18), the number (t20) and t31
create trigger t14_job_insert_guard before insert on public.jobs
  for each row execute function app.tg_job_insert_guard();
