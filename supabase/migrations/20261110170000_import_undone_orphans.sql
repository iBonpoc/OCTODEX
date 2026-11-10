-- #597 (docs/specs/04 §14.11 №4): a note, a task or a feed line that arrives AFTER «Отменить импорт» on a card the undo
-- took away (an old phone's queue, a second phone not yet reloaded) used to land on that card: an orphan nobody sees but
-- support. Now it lands already taken away (deleted_at = now()): the phone gets no «not accepted» for a card nobody has
-- any more, the text stays for support, the shared rules of notes and tasks (can_see_note_subject,
-- task_subject_in_company) are untouched. Only a card taken away by an import's undo (customers.deleted_at and its
-- import_rows.undone) — a card deleted any other way, and every live card, are as before.
-- The undo itself makes no orphans: a card that already has a note, a task or a feed line is kept (undo_customer_import).
-- Only a trigger function and three triggers are added: no column, no table, no grant, no index (import_rows_customer_idx
-- (company_id, customer_id) serves the lookup).
-- A race with the undo itself is closed by a share lock on the card: undo_customer_import locks its cards FOR UPDATE, so
-- a write landing during an undo waits for it and then sees the card taken away; a write that locked first commits
-- before the undo looks for notes, and the undo keeps the card (security-check of #597).
create or replace function app.tg_import_undone_subject()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_card uuid;
begin
  if new.deleted_at is not null or new.subject_type not in ('customer', 'property') then return new; end if;
  v_card := case new.subject_type
              when 'customer' then new.subject_id
              else (select p.customer_id from public.properties p where p.id = new.subject_id and p.company_id = new.company_id)
            end;
  if v_card is null then return new; end if;
  perform 1 from public.customers c where c.id = v_card and c.company_id = new.company_id for share;
  if exists (
       select 1 from public.customers c
        where c.id = v_card and c.company_id = new.company_id and c.deleted_at is not null
          and exists (select 1 from public.import_rows r
                       where r.company_id = new.company_id and r.customer_id = c.id and r.undone)) then
    new.deleted_at := now();
  end if;
  return new;
end;
$$;
-- rule 18 (T52): a trigger function; nobody calls it
revoke all on function app.tg_import_undone_subject() from public, anon, authenticated;

create trigger t12_import_undone_subject before insert on public.notes
  for each row execute function app.tg_import_undone_subject();
create trigger t12_import_undone_subject before insert on public.tasks
  for each row execute function app.tg_import_undone_subject();
create trigger t12_import_undone_subject before insert on public.activities
  for each row execute function app.tg_import_undone_subject();
