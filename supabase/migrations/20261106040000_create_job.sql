-- Wave 3b «Новая работа» (docs/specs/17-job.md §4, §7.3, §8; 13 §3.5, §5 S17; story map S17).
-- * public.create_job: a job without an estimate, one server function. The client and the property are already there
--   (made by customer.create / property.save before it in the same offline queue). Owner, admin, office and sales
--   may create; a client marked «do not service» takes no new job; a «prospect» client becomes «active» (a client with a
--   job is active, like Jobber; «prospect» comes only from a lead, S3). The direction follows S16 (the trigger
--   t15_service_category_inherit already does it when none is given). A repeat with the same id (offline queue replay)
--   returns the same job and changes nothing.
-- * Sales do not plan (13 §5 S17 «продажи — только без даты», 03 §8.1): a visit of a JOB is put only by the office;
--   so far sales could insert one straight into public.visits (visits_insert lets any staff in).

create or replace function public.create_job(
  p_job_id uuid, p_customer_id uuid, p_property_id uuid, p_title text,
  p_description text default null, p_job_type_id uuid default null, p_service_category_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  v_status text;
  j public.jobs;
begin
  -- rights first, one answer for "not found" and "not yours" (no existence oracle)
  select company_id, status into v_company, v_status from public.customers where id = p_customer_id and deleted_at is null;
  if v_company is null or auth.uid() is null or not app.has_role(v_company, array['owner', 'admin', 'office', 'sales']) then
    raise exception 'only the office or sales create a job' using errcode = '42501';
  end if;
  -- offline replay: the same id again is the same job
  select * into j from public.jobs where id = p_job_id;
  if found then
    if j.company_id <> v_company then
      raise exception 'only the office or sales create a job' using errcode = '42501';
    end if;
    return jsonb_build_object('id', j.id, 'number', j.number, 'repeat', true);
  end if;
  if v_status = 'do_not_service' then
    raise exception 'this client is marked «do not service»' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.properties p where p.id = p_property_id and p.company_id = v_company and p.customer_id = p_customer_id and p.deleted_at is null) then
    raise exception 'the address is not a property of this client' using errcode = '22023';
  end if;
  if coalesce(btrim(p_title), '') = '' or char_length(btrim(p_title)) > 200 then
    raise exception 'a job needs a name (up to 200 characters)' using errcode = '22023';
  end if;
  if p_job_type_id is not null and not exists (select 1 from public.job_types t where t.id = p_job_type_id and t.company_id = v_company and t.archived_at is null) then
    raise exception 'unknown job type' using errcode = '22023';
  end if;

  insert into public.jobs (id, company_id, title, customer_id, property_id, status, description, job_type_id, service_category_id)
  values (p_job_id, v_company, btrim(p_title), p_customer_id, p_property_id, 'draft', nullif(btrim(p_description), ''), p_job_type_id, p_service_category_id)
  returning * into j;

  update public.customers set status = 'active' where id = p_customer_id and company_id = v_company and status = 'prospect';

  return jsonb_build_object('id', j.id, 'number', j.number, 'repeat', false);
end;
$$;
revoke all on function public.create_job(uuid, uuid, uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_job(uuid, uuid, uuid, text, text, uuid, uuid) to authenticated;

-- sales do not put a visit on a job (a date for a job is planning); inspections stay as they are
create or replace function app.tg_visit_job_by_office()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.job_id is not null and auth.uid() is not null and not app.has_role(new.company_id, array['owner', 'admin', 'office']) then
    raise exception 'only the office plans a job' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_visit_job_by_office() from public, anon, authenticated;
create trigger t05_visit_job_by_office before insert on public.visits
  for each row execute function app.tg_visit_job_by_office();
