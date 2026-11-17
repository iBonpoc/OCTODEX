-- #2015, docs/specs/38-deletion.md §12 (story map S37): «Отменить работу». Step 1 of rule 16 — only an addition.
--
-- public.cancel_job(p_job, p_reason): one function for the office, in one transaction:
--   * rights first, without a lock, one answer for «not found» / «not yours» / «no role» (42501, no existence oracle);
--   * the same refusals as the guard t13_job_cancel_guard (app.job_cancel_reason: paid / invoiceOpen / noRight — the guard does
--     not run inside a security definer, so the function asks it itself) plus «done» (a completed or closed job is not cancelled)
--     and «visitOnSite» (a visit on site is finished or cancelled first);
--   * the open visits (scheduled, en_route) → public.cancel_visit (reason we_cancelled; the job first goes scheduled → draft, S9a);
--   * the unpaid invoices of the job (draft, sent) → void with the reason «job cancelled» (tg_invoice_guard: owner / admin only,
--     and not with payments — the paid case is already refused above);
--   * the job → cancelled with cancel_reason and cancelled_at (the status journal is written by tg_status_event).
-- The estimate (approved) and the lead (won) do not change. A repeat on a cancelled job changes nothing (the offline queue may replay).
-- Lock order as cancel_visit (visit → job): the visits of the job first (by id), then the job — a cancel of a visit and a cancel
-- of its job never wait for each other crosswise.
-- Not here: a way back (the founder's word — variant B of §12); the client's notice.

create or replace function public.cancel_job(p_job uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  j public.jobs;
  v_why text;
  v_visit uuid;
  v_text text := btrim(coalesce(p_reason, ''));
  v_voided int := 0;
  v_cancelled int := 0;
begin
  -- rights first: no lock, one answer for «not found», «not yours» and «no role»
  select company_id into v_company from public.jobs where id = p_job and deleted_at is null;
  if v_company is null or auth.uid() is null or not app.has_role(v_company, array['owner', 'admin', 'office']) then
    raise exception 'only the office cancels a job' using errcode = '42501';
  end if;
  if v_text = '' or char_length(v_text) > 500 then
    raise exception 'the reason of a cancelled job is 1 to 500 characters' using errcode = '22023';
  end if;

  -- the visits of the job first (the order of cancel_visit), then the job
  perform 1 from public.visits v
   where v.job_id = p_job and v.company_id = v_company and v.deleted_at is null order by v.id for update;
  select * into j from public.jobs where id = p_job and company_id = v_company and deleted_at is null for update;
  if j.id is null then
    raise exception 'only the office cancels a job' using errcode = '42501';
  end if;
  if j.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled', 'repeat', true, 'visits', 0, 'invoices', 0);
  end if;
  if j.status in ('completed', 'closed') then
    raise exception 'job:done' using errcode = '23514', hint = 'done';
  end if;
  if exists (select 1 from public.visits v where v.job_id = j.id and v.company_id = v_company and v.deleted_at is null
                and v.status = 'on_site') then
    raise exception 'job:visitOnSite' using errcode = '23514', hint = 'visitOnSite';
  end if;
  v_why := app.job_cancel_reason(v_company, j.id);
  if v_why is not null then
    raise exception 'job:%', v_why using errcode = case when v_why = 'noRight' then '42501' else '23514' end, hint = v_why;
  end if;

  -- S9a: the open visits (cancel_visit takes the job back to «waits for a date» with the last one)
  for v_visit in
    select v.id from public.visits v
     where v.job_id = j.id and v.company_id = v_company and v.deleted_at is null and v.status in ('scheduled', 'en_route')
     order by v.id
  loop
    perform public.cancel_visit(v_visit, 'we_cancelled', null);
    v_cancelled := v_cancelled + 1;
  end loop;

  -- the unpaid invoices of the job: an open invoice of a cancelled job would stay «owed» for good
  update public.invoices i set status = 'void', void_reason = 'job cancelled'
   where i.job_id = j.id and i.company_id = v_company and i.status in ('draft', 'sent');
  get diagnostics v_voided = row_count;

  perform set_config('app.status_reason', 'job_cancelled', true);
  update public.jobs set status = 'cancelled', cancel_reason = v_text, cancelled_at = now()
   where id = j.id and company_id = v_company;
  perform set_config('app.status_reason', '', true);

  return jsonb_build_object('status', 'cancelled', 'repeat', false, 'visits', v_cancelled, 'invoices', v_voided);
end;
$$;
revoke all on function public.cancel_job(uuid, text) from public, anon;
grant execute on function public.cancel_job(uuid, text) to authenticated;
