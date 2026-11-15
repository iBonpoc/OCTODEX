-- #1538 (G-photo-path Ф-5): a receipt of an expense goes to the cloud. The app sends a files row of kind 'receipt',
-- the expense with receipt_file_id, then the bytes (cloud/ops.ts expense.add). The columns are there since
-- 20261104010000; this migration ties them together and gives a receipt the rights of the expense it belongs to.
-- Rule 16: nothing renamed or dropped; an old build sends expenses without a receipt, as before.

-- 1 ------------------------------------------------------------------------------------------------
-- an expense's receipt is a file of the same company (the column has been empty so far: the app never sent it)
alter table public.expenses drop constraint if exists expenses_receipt_file_fk;
alter table public.expenses add constraint expenses_receipt_file_fk
  foreign key (company_id, receipt_file_id) references public.files (company_id, id) not valid;
-- (expenses is not a big table of migrationGuard; receipt_file_id is null in every row: the check reads nothing)
alter table public.expenses validate constraint expenses_receipt_file_fk;
-- the foreign key's index (T: every foreign key has an index); partial — only expenses with a receipt
create index if not exists expenses_receipt_file_idx on public.expenses (company_id, receipt_file_id) where receipt_file_id is not null;

-- 2 ------------------------------------------------------------------------------------------------
-- the app ties an expense only to a receipt: kind 'receipt', made by the same person (the office: any receipt of the
-- company). Not a visit's photo, not someone else's receipt. The server's roles are not limited.
-- (not security definer: current_user is the caller, and the file is looked up under the caller's own read rule)
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
  return new;
end;
$$;
-- rule 18 (T52): a trigger function; nobody calls it
revoke all on function app.tg_expenses_receipt_own() from public, anon, authenticated;
drop trigger if exists t08_receipt_own on public.expenses;
create trigger t08_receipt_own before insert or update of receipt_file_id on public.expenses
  for each row execute function app.tg_expenses_receipt_own();

-- 3 ------------------------------------------------------------------------------------------------
-- a receipt is read as its expense is (20261111140000): owner, admin, office, and the one who made it. Other files as
-- before (20261110150000): the office (sales included), the author, a tech of the visit, a subcontractor's visit photos,
-- a tech of a measurement.
drop policy if exists files_select on public.files;
create policy files_select on public.files for select to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (app.is_member(company_id) and created_by = (select auth.uid()))
         or (kind <> 'receipt'
             and (app.is_staff(company_id)
                  or (app.has_role(company_id, array['tech'])
                      and visit_id is not null and app.is_visit_assignee(visit_id))
                  or (app.has_role(company_id, array['subcontractor'])
                      and kind = 'photo' and visit_id is not null and app.is_visit_assignee(visit_id))
                  or (app.has_role(company_id, array['tech'])
                      and measurement_id is not null and app.gutter_sees_measurement(measurement_id)))));

-- the Storage object: by the same rule as the row; an object without a files row — the office only, as before
create or replace function app.can_read_file_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare p record;
begin
  p := app.file_object_parts(p_name);
  if p.company_id is null then return false; end if;
  if app.has_role(p.company_id, array['owner', 'admin', 'office']) then return true; end if;
  if not exists (select 1 from public.files f where f.id = p.file_id and f.company_id = p.company_id) then
    return app.is_staff(p.company_id);
  end if;
  return exists (select 1 from public.files f
                  where f.id = p.file_id and f.company_id = p.company_id
                    and ((app.is_member(f.company_id) and f.created_by = auth.uid())
                         or (f.kind <> 'receipt'
                             and (app.is_staff(f.company_id)
                                  or (app.has_role(f.company_id, array['tech'])
                                      and f.visit_id is not null and app.is_visit_assignee(f.visit_id))
                                  or (app.has_role(f.company_id, array['subcontractor'])
                                      and f.kind = 'photo' and f.visit_id is not null and app.is_visit_assignee(f.visit_id))
                                  or (app.has_role(f.company_id, array['tech'])
                                      and f.measurement_id is not null and app.gutter_sees_measurement(f.measurement_id))))));
end;
$$;
revoke all on function app.can_read_file_object(text) from public, anon, authenticated;
grant execute on function app.can_read_file_object(text) to authenticated;
