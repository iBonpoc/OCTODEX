-- After П1a: every visit knows its property; only the bare old inspection job moved to its visit (soft delete).
do $$
begin
  if (select count(*) from public.visits where id::text like 'cfa70000%' and property_id = 'cfa20000-0000-0000-0000-000000000001') <> 5 then
    raise exception 'upgrade: every visit got its property'; end if;
  if (select job_id from public.visits where id = 'cfa70000-0000-0000-0000-000000000001') is not null
     or (select lead_id from public.visits where id = 'cfa70000-0000-0000-0000-000000000001') is distinct from 'cfa30000-0000-0000-0000-000000000001' then
    raise exception 'upgrade: the old inspection is a visit of the lead without a job'; end if;
  if (select deleted_at from public.jobs where id = 'cfa40000-0000-0000-0000-000000000001') is null then
    raise exception 'upgrade: the bare inspection job is soft-deleted'; end if;
  if (select count(*) from public.jobs where id = 'cfa40000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'upgrade: soft delete only, the row stays'; end if;
  if (select count(*) from public.jobs where id in ('cfa40000-0000-0000-0000-000000000002', 'cfa40000-0000-0000-0000-000000000003', 'cfa40000-0000-0000-0000-000000000004') and deleted_at is null) <> 3 then
    raise exception 'upgrade: jobs with an invoice, a real job and a job with an estimate are untouched'; end if;
  if (select count(*) from public.visits where id in ('cfa70000-0000-0000-0000-000000000002', 'cfa70000-0000-0000-0000-000000000003', 'cfa70000-0000-0000-0000-000000000004') and job_id is not null) <> 3 then
    raise exception 'upgrade: their visits keep the job'; end if;
  if (select count(*) from pg_constraint where conrelid = 'public.visits'::regclass and conname = 'visits_property_required') <> 1 then
    raise exception 'upgrade: the new rule is on'; end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.visits'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%job_id IS NOT NULL%lead_id IS NOT NULL%') then
    raise exception 'upgrade: the old "job or lead" rule is gone'; end if;
  if (select deleted_at from public.jobs where id = 'cfa40000-0000-0000-0000-000000000005') is not null
     or (select job_id from public.visits where id = 'cfa70000-0000-0000-0000-000000000005') is null then
    raise exception 'upgrade: a real job named "Estimate visit" is untouched'; end if;
  if not (select legacy_no_property from public.visits where id = 'cfa70000-0000-0000-0000-000000000006') then
    raise exception 'upgrade: a visit without any property is flagged legacy'; end if;
  update public.visits set status = 'cancelled', cancel_reason = 'other', cancel_reason_text = 'no address' where id = 'cfa70000-0000-0000-0000-000000000006';
  if (select status from public.visits where id = 'cfa70000-0000-0000-0000-000000000006') <> 'cancelled' then
    raise exception 'upgrade: a legacy visit can still be cancelled'; end if;
end $$;
-- the invoice of case 2 is removed again so later counts of T5 stay as they were (money rows are never deleted by people)
alter table public.invoices disable trigger user;
delete from public.invoices where id = 'cfa60000-0000-0000-0000-000000000001';
alter table public.invoices enable trigger user;
\echo 'upgrade 20261105280000_visit_property ok'
