-- #1694: receipts a person outside the office keeps without an expense. The app (cloud/ops.ts expense.add) inserts the
-- receipt's row, then its expense (receipt_file_id set once, at the insert), then the bytes; #1558's file.send sends the
-- bytes later, also after the expense. So an honest receipt with bytes always has its live expense.
-- Rule 16: nothing renamed or dropped (functions replaced with the same signatures, the triggers stay as they are).
-- Rule 18: the new counts — revoke from everyone, execute for the app's role only (the triggers and the storage rule run
-- as the caller).

-- 1 ------------------------------------------------------------------------------------------------
-- my receipts in the company that no live expense points at (only the caller's own: another person's count is never told)
--   p_with_bytes — only those with stored bytes (a removed one with bytes too: upload, remove, upload again is no limit)
--   p_since — only those made or changed since then, by the server's clock (updated_at; created_at comes from the
--   phone), removed ones too (a row without bytes left by a refused expense ages out)
create or replace function app.hanging_receipts_count(p_company_id uuid, p_user_id uuid, p_except uuid, p_with_bytes boolean, p_since timestamptz)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int
    from public.files f
   where p_user_id = auth.uid()
     and f.company_id = p_company_id and f.created_by = p_user_id and f.kind = 'receipt'
     and f.id is distinct from p_except
     and (not p_with_bytes or f.storage_key is not null or f.upload_status = 'uploaded')
     and (p_with_bytes or p_since is not null or f.deleted_at is null or f.storage_key is not null or f.upload_status = 'uploaded')
     and (p_since is null or greatest(f.created_at, f.updated_at) >= p_since)
     and not exists (select 1 from public.expenses e
                      where e.company_id = f.company_id and e.receipt_file_id = f.id and e.deleted_at is null);
$$;
revoke all on function app.hanging_receipts_count(uuid, uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
grant execute on function app.hanging_receipts_count(uuid, uuid, uuid, boolean, timestamptz) to authenticated;

-- 2 ------------------------------------------------------------------------------------------------
-- bytes: a receipt of mine gets them when my live expense points at it (the queue's way), otherwise only while fewer
-- than 20 of my receipts hold bytes without one. The rest as in 20261115180000.
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

-- 3 ------------------------------------------------------------------------------------------------
-- rows: at most 50 of my receipts without a live expense made in a day (the queue's receipts get their expense at once;
-- a refused expense's row ages out — never a lifelong quota). Only owner, admin and office are not limited (sales are
-- not the office for receipts). The rest as in 20261115180000.
create or replace function app.tg_files_bare_limit()
returns trigger language plpgsql set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  -- #1694: a receipt — tied to a job or not, inserted removed or brought back
  if new.kind = 'receipt'
     and (tg_op = 'INSERT' or old.kind is distinct from 'receipt' or (old.deleted_at is not null and new.deleted_at is null)) then
    -- the queue sends an insert again (on conflict do nothing): the row is there already — nothing new
    if tg_op = 'INSERT' and exists (select 1 from public.files f where f.id = new.id) then return new; end if;
    if app.has_role(new.company_id, array['owner', 'admin', 'office']) then return new; end if;
    if v_uid is null then
      raise exception 'at most 50 receipts waiting for their expense' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtext('hanging_receipts:' || new.company_id::text || ':' || v_uid::text));
    if app.hanging_receipts_count(new.company_id, v_uid, new.id, false, now() - interval '1 day') >= 50 then
      raise exception 'at most 50 receipts waiting for their expense' using errcode = 'P0001';
    end if;
    return new;
  end if;
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
  -- a receipt is limited above
  if new.kind = 'receipt' then return new; end if;
  -- two inserts at once never both see the room for one
  perform pg_advisory_xact_lock(hashtext('bare_files:' || new.company_id::text || ':' || v_uid::text));
  if app.bare_files_count(new.company_id, v_uid, new.id) >= 3 then
    raise exception 'at most 3 files with nothing attached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_files_bare_limit() from public, anon, authenticated;

-- 4 ------------------------------------------------------------------------------------------------
-- an expense's receipt: as in 20261115120000; and outside owner, admin and office a receipt once set stays (the app sets
-- it only when the expense is made) — never moved to another receipt or taken off
create or replace function app.tg_expenses_receipt_own()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and new.receipt_file_id is not null
     and (tg_op = 'INSERT' or new.receipt_file_id is distinct from old.receipt_file_id)
     and not exists (select 1 from public.files f
                      where f.id = new.receipt_file_id and f.company_id = new.company_id and f.kind = 'receipt'
                        and f.deleted_at is null
                        and (f.created_by = auth.uid() or app.has_role(f.company_id, array['owner', 'admin', 'office']))) then
    raise exception 'an expense''s receipt is a receipt of its own' using errcode = '42501';
  end if;
  if current_user in ('authenticated', 'anon') and tg_op = 'UPDATE'
     and old.receipt_file_id is not null and new.receipt_file_id is distinct from old.receipt_file_id
     and not app.has_role(new.company_id, array['owner', 'admin', 'office']) then
    raise exception 'an expense''s receipt stays' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_expenses_receipt_own() from public, anon, authenticated;
