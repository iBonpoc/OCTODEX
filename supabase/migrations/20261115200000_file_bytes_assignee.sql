-- #1696: a person outside the office writes a file's bytes into his own row only while he is still on what the row is
-- tied to (the visit, the job, the client, the measurement) — the same check files_insert makes. Before, his own row
-- took bytes after he was taken off it. The body is 20261115190000's (#1694) word for word with this one condition added.
-- A row tied to a client asks is_customer_assignee (his visit there within 14 days), as files_update already does right
-- after the bytes. Rule 16: the same signature, nothing dropped. Rule 18: the same revoke / grant.

create or replace function app.can_write_file_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare p record;
begin
  p := app.file_object_parts(p_name);
  if p.company_id is null then return false; end if;
  -- a stored file is not replaced by anyone (a «before / after» photo, a signed estimate's photo is evidence)
  if exists (select 1 from public.files f
              where f.id = p.file_id and f.company_id = p.company_id
                and (f.storage_key is not null or f.upload_status = 'uploaded')) then
    return false;
  end if;
  -- a measurement's photo: nobody uploads while the module is not active, the office included
  if exists (select 1 from public.files f where f.id = p.file_id and f.company_id = p.company_id and f.measurement_id is not null)
     and not app.module_active(p.company_id, 'gutters') then
    return false;
  end if;
  -- a live row of this file: the office (a receipt — not sales), or its author (a subcontractor: a row his rule allows)
  return exists (select 1 from public.files f
                  where f.id = p.file_id and f.company_id = p.company_id and f.deleted_at is null
                    and (app.has_role(f.company_id, array['owner', 'admin', 'office'])
                         or (f.kind <> 'receipt' and app.is_staff(f.company_id))
                         or (app.is_member(f.company_id) and f.created_by = auth.uid()
                             -- #1696: still on what the row is tied to, as files_insert asks (a tech taken off the visit,
                             -- the job or the client writes no more bytes into his old row); sales (staff) as before
                             and (app.is_staff(f.company_id)
                                  or ((f.customer_id is null or app.is_customer_assignee(f.customer_id))
                                      and (f.job_id is null or app.is_job_assignee(f.job_id))
                                      and (f.visit_id is null or app.is_visit_assignee(f.visit_id))
                                      and (f.measurement_id is null or app.gutter_sees_measurement(f.measurement_id))))
                             and (not app.has_role(f.company_id, array['subcontractor'])
                                  or app.sub_file_ok(f.kind, f.customer_id, f.job_id, f.visit_id, f.measurement_id, false))
                             -- a row with nothing attached made before the limit (#1656): bytes only within it
                             and (f.visit_id is not null or f.job_id is not null or f.customer_id is not null or f.measurement_id is not null
                                  or app.bare_files_count(f.company_id, auth.uid(), f.id) < 3)
                             -- #1694: my receipt — with my live expense, or within 20 holding bytes without one
                             and (f.kind <> 'receipt'
                                  or exists (select 1 from public.expenses e
                                              where e.company_id = f.company_id and e.receipt_file_id = f.id and e.deleted_at is null)
                                  or app.hanging_receipts_count(f.company_id, auth.uid(), f.id, true, null) < 20))))
         -- one row, one object: no second object of the same file under another extension (the office too)
         and not exists (select 1 from storage.objects o
                          where o.bucket_id = 'files' and o.name <> p_name
                            and o.name like p.company_id::text || '/' || p.file_id::text || '.%');
end;
$$;
revoke all on function app.can_write_file_object(text) from public, anon, authenticated;
grant execute on function app.can_write_file_object(text) to authenticated;
