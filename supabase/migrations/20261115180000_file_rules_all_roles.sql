-- #1656, #1657: who writes a file's bytes, how many files with nothing attached a person keeps, and a file stays where it
-- was added for every role outside the office. The app (cloud/ops.ts photo.add, expense.add; gutters/data.ts) inserts a
-- visit photo {visit_id, job_id of the visit}, a receipt {job_id or none} followed by its expense, a measurement photo;
-- afterwards it changes only upload_status / storage_key / mime / size and deleted_at — never what a file is tied to.
-- Rule 16: nothing renamed or dropped (functions replaced with the same signatures, the trigger recreated by its name).

-- 1 ------------------------------------------------------------------------------------------------
-- #1656: a subcontractor writes bytes only into a row his rule allows (a row of his added before 20261115170000 with a
-- client or a document gets none); the rest as in 20261115120000
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
                             and (not app.has_role(f.company_id, array['subcontractor'])
                                  or app.sub_file_ok(f.kind, f.customer_id, f.job_id, f.visit_id, f.measurement_id, false))
                             -- a row with nothing attached made before the limit (#1656): bytes only within it
                             and (f.visit_id is not null or f.job_id is not null or f.customer_id is not null or f.measurement_id is not null
                                  or app.bare_files_count(f.company_id, auth.uid(), f.id) < 3))))
         -- one row, one object: no second object of the same file under another extension (the office too)
         and not exists (select 1 from storage.objects o
                          where o.bucket_id = 'files' and o.name <> p_name
                            and o.name like p.company_id::text || '/' || p.file_id::text || '.%');
end;
$$;
revoke all on function app.can_write_file_object(text) from public, anon, authenticated;
grant execute on function app.can_write_file_object(text) to authenticated;

-- 2 ------------------------------------------------------------------------------------------------
-- #1656: files with nothing attached (no visit, job, client or measurement) cost the company's storage. A person outside
-- the office keeps at most 3 such photos (a profile picture and a spare). A receipt is not counted: the queue inserts its
-- row and then its expense (cloud/ops.ts expense.add), and an expense that keeps failing while the queue goes on would
-- leave several receipts waiting — the 4th would be refused and lost (the director's review; receipts: #1694). A removed one still counts while its bytes are stored (the
-- bytes stay: upload, remove, upload again would be no limit). A document, a drawing or a signature with nothing
-- attached — not at all (the app never makes one). The office (app.is_staff) and the server are not limited.
-- the count of the person's such files in the company (security definer: whatever the caller's read rule; only a number)
-- (only the caller's own: another person's count is never told — p_user_id must be the caller)
create or replace function app.bare_files_count(p_company_id uuid, p_user_id uuid, p_except uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int
    from public.files f
   where p_user_id = auth.uid()
     and f.company_id = p_company_id and f.created_by = p_user_id and f.id is distinct from p_except
     and f.visit_id is null and f.job_id is null and f.customer_id is null and f.measurement_id is null
     and (f.deleted_at is null or f.storage_key is not null or f.upload_status = 'uploaded')
     and f.kind = 'photo';
$$;
revoke all on function app.bare_files_count(uuid, uuid, uuid) from public, anon, authenticated;
-- called from the trigger below, which runs as the caller (current_user tells the app's roles from the server)
grant execute on function app.bare_files_count(uuid, uuid, uuid) to authenticated;

-- not security definer: current_user is the caller ('authenticated' from the app; the server and definer functions pass)
create or replace function app.tg_files_bare_limit()
returns trigger language plpgsql set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  -- still tied to something, or removed: nothing to limit
  if new.visit_id is not null or new.job_id is not null or new.customer_id is not null or new.measurement_id is not null
     or new.deleted_at is not null then
    return new;
  end if;
  -- a change that leaves it as it was (the queue marks it uploaded): not counted again
  if tg_op = 'UPDATE' and old.visit_id is null and old.job_id is null and old.customer_id is null and old.measurement_id is null
     and old.deleted_at is null and old.kind = new.kind then
    return new;
  end if;
  -- the queue sends an insert again (on conflict do nothing): the row is there already — nothing new
  if tg_op = 'INSERT' and exists (select 1 from public.files f where f.id = new.id) then return new; end if;
  -- the office (sales included) — not limited; a suspended member is not staff either (has_role needs active)
  if app.is_staff(new.company_id) then return new; end if;
  -- the app's role with no person behind it: not counted for anyone — refused
  if v_uid is null then
    raise exception 'at most 3 files with nothing attached' using errcode = 'P0001';
  end if;
  if new.kind not in ('photo', 'receipt') then
    raise exception 'a file with nothing attached is a photo or a receipt' using errcode = 'P0001';
  end if;
  -- a receipt waits for its expense (see above): never refused here
  if new.kind = 'receipt' then return new; end if;
  -- two inserts at once never both see the room for one
  perform pg_advisory_xact_lock(hashtext('bare_files:' || new.company_id::text || ':' || v_uid::text));
  if app.bare_files_count(new.company_id, v_uid, new.id) >= 3 then
    raise exception 'at most 3 files with nothing attached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
-- rule 18 (T52): a trigger function; nobody calls it
revoke all on function app.tg_files_bare_limit() from public, anon, authenticated;
drop trigger if exists t12_bare_limit on public.files;
create trigger t12_bare_limit before insert or update of visit_id, job_id, customer_id, measurement_id, deleted_at, kind on public.files
  for each row execute function app.tg_files_bare_limit();

-- 3 ------------------------------------------------------------------------------------------------
-- #1657: a file stays tied to what it was added to for every role outside the office (a tech's «before / after» photo is
-- evidence: not carried to another visit, job or client of his). The office (app.is_staff: owner, admin, office, sales)
-- as before; the server and definer functions (merge_customers moves a client's files) pass: current_user is not the
-- app's. A measurement is fixed for everyone already (t06_measurement_fixed). Not security definer — current_user.
create or replace function app.tg_files_sub_attach_fixed()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.visit_id is distinct from old.visit_id or new.job_id is distinct from old.job_id
          or new.customer_id is distinct from old.customer_id)
     and not app.is_staff(new.company_id) then
    raise exception 'a file stays where it was added' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_files_sub_attach_fixed() from public, anon, authenticated;
