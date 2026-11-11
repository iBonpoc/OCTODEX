-- Корзина и правила удаления — ядро (docs/specs/38-deletion.md §4, §6; #747, #750). PR-1 спеки 38.
--
-- Было: «удалено» — это deleted_at, и прямая запись deleted_at из приложения не проходила никаких правил: персонал (и
-- продажи) ставил deleted_at подписанной смете и возвращал любого клиента, автор (и мастер) видел и возвращал свои
-- удалённые лиды, расходы, задачи; продажи отменяли работу прямым update status без проверки оплат (#750).
-- Стало:
--   * страж app.tg_trash_guard на шести таблицах ядра (estimates, tasks, expenses, catalog_items, customers, leads):
--     удалить и вернуть можно только по правилу спеки 38 §4 — владелец, админ, офис — любое; остальные — только своё
--     (created_by), смету — только черновик без отправки; клиента и лид — только «пустые»; вернуть — только то, что
--     лежит в Корзине, не старше app.trash_days() (30 дней), и не при удалённом родителе;
--   * запись Корзины public.trash_entries: кто и когда удалил (её пишет сервер — триггер и функции, не приложение);
--     клиент уходит в Корзину вместе со своими объектами и людьми и возвращается с ними же;
--   * public.trash_items (удалить пачку, ответ по каждой строке), public.trash_restore (вернуть), public.trash_list
--     (что лежит в Корзине — с именем, только если человек видит объект сейчас);
--   * ветки «своё» в select-политиках лидов, расходов, задач и каталога не видят удалённое (свои удалённые — только в
--     trash_list);
--   * страж app.tg_job_cancel_guard: работу отменяет только владелец, админ или офис, без оплат; офис — только без
--     счёта (аванс аннулирует только владелец или админ, tg_invoice_guard).
-- Только прямые записи телефона (current_user «authenticated») проходят стражи и попадают в Корзину. Функции сервера
-- (security definer: отмена импорта, склейка клиентов, удаление аккаунта, cancel_visit) идут мимо: их удаления — не
-- «Удалить» человека, и «Вернуть» из Корзины не должно их обходить. service_role доверенный.
-- Правило 16: только шаг 1 — новое добавлено, ничего не переименовано и не удалено; политики сужены alter policy
-- (старые телефоны и так читают только deleted_at is null, cloud/repo.ts). Правило 18: каждая новая функция — revoke
-- all from public, anon, затем явный grant. Срок хранения строк в базе (стирание) — не здесь: #628, 7а-3.

-- ---- 0. Срок Корзины ------------------------------------------------------------------------------------------------
create or replace function app.trash_days()
returns int language sql immutable set search_path = '' as $$ select 30 $$;
revoke all on function app.trash_days() from public, anon, authenticated;

-- ---- 1. Запись Корзины ----------------------------------------------------------------------------------------------
create table if not exists public.trash_entries (
  id           uuid primary key default public.uuid_generate_v7(),
  company_id   uuid not null references public.companies (id),
  kind         text not null check (kind in ('estimate', 'task', 'expense', 'catalog_item', 'customer', 'lead')),
  object_id    uuid not null,
  deleted_by   uuid references public.users (id),
  deleted_at   timestamptz not null,
  restored_by  uuid references public.users (id),
  restored_at  timestamptz,
  created_at   timestamptz not null default now()
);
-- одна открытая запись на объект: два удаления наперегонки — одна строка
create unique index if not exists trash_entries_open_uq on public.trash_entries (company_id, kind, object_id) where restored_at is null;
create index if not exists trash_entries_list_idx on public.trash_entries (company_id, deleted_at desc);
-- the keys to a person (T61): the person's row is never deleted (S22 anonymises it), the index serves the check
create index if not exists trash_entries_deleted_by_idx on public.trash_entries (deleted_by) where deleted_by is not null;
create index if not exists trash_entries_restored_by_idx on public.trash_entries (restored_by) where restored_by is not null;
create trigger t11_company_id_immutable before update on public.trash_entries
  for each row execute function app.tg_company_id_immutable();
alter table public.trash_entries enable row level security;
alter table public.trash_entries force row level security;
revoke all on public.trash_entries from anon, authenticated;
grant select on public.trash_entries to authenticated;
-- владелец, админ, офис видят всё удалённое компанией; остальные — то, что удалили сами
create policy trash_entries_select on public.trash_entries for select to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office'])
         or (app.is_member(company_id) and deleted_by = (select auth.uid())));

-- ---- 2. Правило: можно ли удалить / вернуть (одно для стража и функций) --------------------------------------------
-- Ответ — код причины спеки 38 §4.3 или null (можно). Нет строки, чужая компания, нет права — один ответ noRight.
-- security definer: читает строку и её документы мимо RLS, а права проверяет сам по auth.uid().
create or replace function app.trash_reason(p_kind text, p_id uuid, p_deleting boolean)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_by      uuid;
  v_del     timestamptz;
  v_status  text;
  v_sent    uuid;
  v_parent  uuid;
  v_entry   timestamptz;
  v_lead    uuid;
begin
  if v_uid is null or p_id is null then return 'noRight'; end if;
  case p_kind
    when 'estimate' then
      select company_id, created_by, deleted_at, status, sent_version_id, customer_id, lead_id
        into v_company, v_by, v_del, v_status, v_sent, v_parent, v_lead from public.estimates where id = p_id;
    when 'task' then
      select company_id, created_by, deleted_at into v_company, v_by, v_del from public.tasks where id = p_id;
    when 'expense' then
      select company_id, created_by, deleted_at into v_company, v_by, v_del from public.expenses where id = p_id;
    when 'catalog_item' then
      select company_id, created_by, deleted_at into v_company, v_by, v_del from public.catalog_items where id = p_id;
    when 'customer' then
      select company_id, created_by, deleted_at into v_company, v_by, v_del from public.customers where id = p_id;
    when 'lead' then
      select company_id, created_by, deleted_at, customer_id into v_company, v_by, v_del, v_parent from public.leads where id = p_id;
    else
      return 'noRight';
  end case;
  if v_company is null or not app.is_member(v_company) then return 'noRight'; end if;
  -- чужое — владелец, админ, офис; остальные (продажи, мастер, субподрядчик) — только своё (основатель 11.11)
  -- notYours — тому, кто видит всю компанию (продажи); мастер и субподрядчик чужого не видят: им один ответ noRight
  if not app.has_role(v_company, array['owner', 'admin', 'office']) and v_by is distinct from v_uid then
    return case when app.is_staff(v_company) then 'notYours' else 'noRight' end;
  end if;

  if p_deleting then
    -- уже удалённое: повтор своего удаления (запись Корзины есть) — можно; удалённое сервером (отмена импорта, склейка)
    -- «удалить ещё раз» нельзя — иначе появилась бы запись Корзины и «Вернуть» обошло бы сервер (security-check PR-1 №1)
    if v_del is not null then
      return case when exists (select 1 from public.trash_entries t where t.company_id = v_company and t.kind = p_kind
                                  and t.object_id = p_id and t.restored_at is null) then null else 'noRight' end;
    end if;
    if p_kind = 'estimate' then
      if v_status in ('awaiting_countersign', 'approved') then return 'signed'; end if;
      -- черновик — это ни разу не отправленная смета: правка после отправки тоже draft (ход sent → draft)
      if v_status <> 'draft' or v_sent is not null then return 'sentOnce'; end if;
    elsif p_kind = 'customer' then
      if exists (select 1 from public.leads x where x.company_id = v_company and x.customer_id = p_id and x.deleted_at is null)
         or exists (select 1 from public.estimates x where x.company_id = v_company and x.customer_id = p_id and x.deleted_at is null)
         or exists (select 1 from public.jobs x where x.company_id = v_company and x.customer_id = p_id and x.deleted_at is null)
         or exists (select 1 from public.invoices x where x.company_id = v_company and x.customer_id = p_id)
         or exists (select 1 from public.payments x where x.company_id = v_company and x.customer_id = p_id) then
        return 'hasDocs';
      end if;
    elsif p_kind = 'lead' then
      if exists (select 1 from public.estimates x where x.company_id = v_company and x.lead_id = p_id and x.deleted_at is null)
         or exists (select 1 from public.visits x where x.company_id = v_company and x.lead_id = p_id and x.deleted_at is null) then
        return 'hasDocs';
      end if;
    end if;
    return null;
  end if;

  -- вернуть: только то, что лежит в Корзине (удалено человеком, не отменой импорта или склейкой), не старше 30 дней.
  -- Каталог — исключение: «добавить снова» удалённую позицию было и до Корзины (ops.ts catalog.save), без срока.
  if v_del is null then return null; end if;
  if p_kind = 'catalog_item' then return null; end if;
  select t.deleted_at into v_entry from public.trash_entries t
   where t.company_id = v_company and t.kind = p_kind and t.object_id = p_id and t.restored_at is null;
  if v_entry is null then return 'noRight'; end if;
  if v_entry < now() - make_interval(days => app.trash_days()) then return 'expired'; end if;
  if v_parent is not null and exists (select 1 from public.customers c where c.id = v_parent and c.deleted_at is not null) then
    return 'parentDeleted';
  end if;
  if v_lead is not null and exists (select 1 from public.leads l where l.id = v_lead and l.deleted_at is not null) then
    return 'parentDeleted';
  end if;
  return null;
end;
$$;
revoke all on function app.trash_reason(text, uuid, boolean) from public, anon;
-- зовёт страж (он не definer и идёт под правами телефона), как app.is_staff в политиках
grant execute on function app.trash_reason(text, uuid, boolean) to authenticated;

-- ---- 3. Записать удаление / возврат в Корзину ----------------------------------------------------------------------
-- Читает строку как она есть и записывает правду: удалена — открытая запись (если её нет), возвращена — запись
-- закрыта. Клиент: его объекты и люди уходят тем же временем и возвращаются только те, что ушли с ним.
create or replace function app.trash_note_row(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  v_del     timestamptz;
  v_old     timestamptz;
begin
  case p_kind
    when 'estimate' then select company_id, deleted_at into v_company, v_del from public.estimates where id = p_id;
    when 'task' then select company_id, deleted_at into v_company, v_del from public.tasks where id = p_id;
    when 'expense' then select company_id, deleted_at into v_company, v_del from public.expenses where id = p_id;
    when 'catalog_item' then select company_id, deleted_at into v_company, v_del from public.catalog_items where id = p_id;
    when 'customer' then select company_id, deleted_at into v_company, v_del from public.customers where id = p_id;
    when 'lead' then select company_id, deleted_at into v_company, v_del from public.leads where id = p_id;
    else return;
  end case;
  if v_company is null or not app.is_member(v_company) then return; end if;
  if v_del is not null then
    insert into public.trash_entries (company_id, kind, object_id, deleted_by, deleted_at)
    values (v_company, p_kind, p_id, auth.uid(), v_del)
    on conflict (company_id, kind, object_id) where restored_at is null do nothing;
    if p_kind = 'customer' then
      update public.properties set deleted_at = v_del where company_id = v_company and customer_id = p_id and deleted_at is null;
      update public.contacts set deleted_at = v_del where company_id = v_company and customer_id = p_id and deleted_at is null;
    end if;
  else
    update public.trash_entries set restored_at = now(), restored_by = auth.uid()
     where company_id = v_company and kind = p_kind and object_id = p_id and restored_at is null
    returning deleted_at into v_old;
    if p_kind = 'customer' and v_old is not null then
      update public.properties set deleted_at = null where company_id = v_company and customer_id = p_id and deleted_at = v_old;
      update public.contacts set deleted_at = null where company_id = v_company and customer_id = p_id and deleted_at = v_old;
    end if;
  end if;
end;
$$;
revoke all on function app.trash_note_row(text, uuid) from public, anon, authenticated;
-- the after-trigger runs as the phone (authenticated): this door opens only from inside a trigger
create or replace function app.trash_note(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() < 1 then raise exception 'trash: only from a trigger' using errcode = '42501'; end if;
  perform app.trash_note_row(p_kind, p_id);
end;
$$;
revoke all on function app.trash_note(text, uuid) from public, anon;
grant execute on function app.trash_note(text, uuid) to authenticated;

-- ---- 4. Стражи на таблицах --------------------------------------------------------------------------------------------
-- Не security definer (как tg_job_write_guard): срабатывают только для прямой записи телефона.
create or replace function app.tg_trash_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_why text;
begin
  if current_user <> 'authenticated' then return new; end if;
  if tg_op = 'INSERT' then
    if new.deleted_at is not null then
      raise exception 'trash:noRight (a new row is not born deleted)' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.deleted_at is not distinct from old.deleted_at then return new; end if;
  -- the time of a deletion is the server's (a phone's date could keep a row in the Trash for ever, security-check №2);
  -- a deleted row is not re-dated
  if old.deleted_at is not null and new.deleted_at is not null then
    raise exception 'trash:noRight (a deleted row keeps its time)' using errcode = '42501';
  end if;
  if new.deleted_at is not null then new.deleted_at := now(); end if;
  v_why := app.trash_reason(tg_argv[0], old.id, new.deleted_at is not null);
  if v_why is not null then
    raise exception 'trash:%', v_why using errcode = case when v_why in ('noRight', 'notYours') then '42501' else '23514' end;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_trash_guard() from public, anon, authenticated;

create or replace function app.tg_trash_note()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and new.deleted_at is distinct from old.deleted_at then
    perform app.trash_note(tg_argv[0], new.id);
  end if;
  return null;
end;
$$;
revoke all on function app.tg_trash_note() from public, anon, authenticated;

create trigger t03_trash_guard before insert or update of deleted_at on public.estimates for each row execute function app.tg_trash_guard('estimate');
create trigger t03_trash_guard before insert or update of deleted_at on public.tasks for each row execute function app.tg_trash_guard('task');
create trigger t03_trash_guard before insert or update of deleted_at on public.expenses for each row execute function app.tg_trash_guard('expense');
create trigger t03_trash_guard before insert or update of deleted_at on public.catalog_items for each row execute function app.tg_trash_guard('catalog_item');
create trigger t03_trash_guard before insert or update of deleted_at on public.customers for each row execute function app.tg_trash_guard('customer');
create trigger t03_trash_guard before insert or update of deleted_at on public.leads for each row execute function app.tg_trash_guard('lead');
create trigger t97_trash_note after update of deleted_at on public.estimates for each row execute function app.tg_trash_note('estimate');
create trigger t97_trash_note after update of deleted_at on public.tasks for each row execute function app.tg_trash_note('task');
create trigger t97_trash_note after update of deleted_at on public.expenses for each row execute function app.tg_trash_note('expense');
create trigger t97_trash_note after update of deleted_at on public.catalog_items for each row execute function app.tg_trash_note('catalog_item');
create trigger t97_trash_note after update of deleted_at on public.customers for each row execute function app.tg_trash_note('customer');
create trigger t97_trash_note after update of deleted_at on public.leads for each row execute function app.tg_trash_note('lead');

-- ---- 5. «Своё» не видит удалённого (только сужение; свои удалённые — в trash_list) ------------------------------------
alter policy leads_select on public.leads
  using (app.is_staff(company_id)
         or (app.is_member(company_id) and deleted_at is null
             and (assigned_to = (select auth.uid()) or created_by = (select auth.uid()))));
alter policy leads_update on public.leads
  using (app.is_staff(company_id)
         or (app.is_member(company_id) and deleted_at is null
             and (assigned_to = (select auth.uid()) or created_by = (select auth.uid()))));
alter policy expenses_select on public.expenses
  using (app.is_staff(company_id)
         or (app.has_role(company_id, array['tech']) and deleted_at is null and created_by = (select auth.uid())));
alter policy expenses_update on public.expenses
  using (app.is_staff(company_id)
         or (created_by = (select auth.uid()) and app.is_member(company_id) and deleted_at is null));
alter policy tasks_select on public.tasks
  using (app.is_staff(company_id)
         or (deleted_at is null
             and ((((assignee_id = (select auth.uid())) or (created_by = (select auth.uid()))) and app.is_member(company_id))
                  or ((subject_type = 'lead') and app.task_subject_in_company('lead', subject_id, company_id) and app.can_see_lead(subject_id))
                  or ((subject_type = 'property') and app.can_see_property(subject_id, company_id)))));
alter policy tasks_update on public.tasks
  using (app.is_staff(company_id)
         or (deleted_at is null
             and ((((assignee_id = (select auth.uid())) or (created_by = (select auth.uid()))) and app.is_member(company_id))
                  or ((subject_type = 'property') and app.can_see_property(subject_id, company_id)))));
alter policy catalog_items_select on public.catalog_items
  using (app.is_member(company_id) and (deleted_at is null or app.is_staff(company_id)));

-- ---- 6. Удалить пачку ---------------------------------------------------------------------------------------------------
-- security definer: мастер и автор удаляют своё, а политика select не пускает строку с deleted_at (новая строка должна
-- быть видна) — права решает app.trash_reason по каждой строке, как у возврата. Повтор без вреда: уже удалённое — ok.
-- Ответ по строке, пачка не падает целиком.
create or replace function public.trash_items(p_kind text, p_ids uuid[])
returns table (id uuid, ok boolean, reason text) language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_id  uuid;
  v_why text;
  n     int;
begin
  if auth.uid() is null then raise exception 'trash: sign in' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('estimate', 'task', 'expense', 'catalog_item', 'customer', 'lead') then
    raise exception 'trash: unknown kind %', p_kind using errcode = '22023';
  end if;
  if coalesce(cardinality(p_ids), 0) > 500 then raise exception 'trash: at most 500 at once' using errcode = '22023'; end if;
  foreach v_id in array coalesce(p_ids, '{}'::uuid[]) loop
    id := v_id; ok := false; reason := null;
    v_why := app.trash_reason(p_kind, v_id, true);
    if v_why is not null then
      reason := v_why;
    else
      begin
        case p_kind
          -- the estimate's rule again in the write: sent at the same moment — not deleted (no lock window)
          when 'estimate' then update public.estimates x set deleted_at = now() where x.id = v_id and x.deleted_at is null and x.status = 'draft' and x.sent_version_id is null;
          when 'task' then update public.tasks x set deleted_at = now() where x.id = v_id and x.deleted_at is null;
          when 'expense' then update public.expenses x set deleted_at = now() where x.id = v_id and x.deleted_at is null;
          when 'catalog_item' then update public.catalog_items x set deleted_at = now(), is_active = false where x.id = v_id and x.deleted_at is null;
          when 'customer' then update public.customers x set deleted_at = now() where x.id = v_id and x.deleted_at is null;
          when 'lead' then update public.leads x set deleted_at = now() where x.id = v_id and x.deleted_at is null;
        end case;
        get diagnostics n = row_count;
        if n = 1 then
          perform app.trash_note_row(p_kind, v_id);   -- definer: the trigger of the entry does not fire here (current_user is the owner)
          ok := true;
        elsif exists (select 1 from public.trash_entries t where t.kind = p_kind and t.object_id = v_id and t.restored_at is null) then
          ok := true;                                -- a replay: in the Trash already
        else
          reason := 'refused';                       -- changed meanwhile (sent at the same moment)
        end if;
      exception when others then
        reason := case when sqlerrm like 'trash:%' then split_part(substr(sqlerrm, 7), ' ', 1)
                       when sqlerrm like '%do_not_service%' then 'doNotService' else 'refused' end;
      end;
    end if;
    return next;
  end loop;
end;
$$;
revoke all on function public.trash_items(text, uuid[]) from public, anon;
grant execute on function public.trash_items(text, uuid[]) to authenticated;

-- ---- 7. Вернуть из Корзины ----------------------------------------------------------------------------------------------
-- security definer: удалённое мастер и автор уже не видят политикой — права решает app.trash_reason по каждой строке.
create or replace function public.trash_restore(p_kind text, p_ids uuid[])
returns table (id uuid, ok boolean, reason text) language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_id  uuid;
  v_why text;
begin
  if auth.uid() is null then raise exception 'trash: sign in' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('estimate', 'task', 'expense', 'catalog_item', 'customer', 'lead') then
    raise exception 'trash: unknown kind %', p_kind using errcode = '22023';
  end if;
  if coalesce(cardinality(p_ids), 0) > 500 then raise exception 'trash: at most 500 at once' using errcode = '22023'; end if;
  foreach v_id in array coalesce(p_ids, '{}'::uuid[]) loop
    id := v_id; ok := false; reason := null;
    v_why := app.trash_reason(p_kind, v_id, false);
    if v_why is not null then
      reason := v_why;
    else
      begin
        case p_kind
          when 'estimate' then update public.estimates x set deleted_at = null where x.id = v_id and x.deleted_at is not null;
          when 'task' then update public.tasks x set deleted_at = null where x.id = v_id and x.deleted_at is not null;
          when 'expense' then update public.expenses x set deleted_at = null where x.id = v_id and x.deleted_at is not null;
          when 'catalog_item' then update public.catalog_items x set deleted_at = null, is_active = true where x.id = v_id and x.deleted_at is not null;
          when 'customer' then update public.customers x set deleted_at = null where x.id = v_id and x.deleted_at is not null;
          when 'lead' then update public.leads x set deleted_at = null where x.id = v_id and x.deleted_at is not null;
        end case;
        perform app.trash_note_row(p_kind, v_id);   -- definer: the trigger of the entry does not fire here
        ok := true;
      exception when others then
        reason := case when sqlerrm like '%do_not_service%' then 'doNotService' else 'refused' end;
      end;
    end if;
    return next;
  end loop;
end;
$$;
revoke all on function public.trash_restore(text, uuid[]) from public, anon;
grant execute on function public.trash_restore(text, uuid[]) to authenticated;

-- ---- 8. Что лежит в Корзине -------------------------------------------------------------------------------------------
-- Записи не старше 30 дней, объект всё ещё удалён. Владелец, админ, офис — вся компания; остальные — удалённое ими.
-- Имя объекта читается из таблицы сейчас и не копируется в Корзину (нет второй копии личных данных, CCPA); отдаётся
-- только тому, кто видит объект: владелец, админ, офис — или его автор (офиса понизили до мастера — имён чужих нет).
create or replace function public.trash_list(p_company uuid)
returns table (kind text, object_id uuid, label text, deleted_by uuid, deleted_by_name text, deleted_at timestamptz, days_left int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_all boolean;
begin
  if auth.uid() is null or not app.is_member(p_company) then return; end if;
  v_all := app.has_role(p_company, array['owner', 'admin', 'office']);
  return query
    select t.kind, t.object_id,
           case t.kind
             when 'estimate' then (select coalesce(nullif(concat_ws(' · ', e.number, e.title), ''), e.number) from public.estimates e where e.id = t.object_id and e.deleted_at is not null and (v_all or e.created_by = auth.uid()))
             when 'task' then (select k.title from public.tasks k where k.id = t.object_id and k.deleted_at is not null and (v_all or k.created_by = auth.uid()))
             when 'expense' then (select concat_ws(' · ', x.vendor, x.category) from public.expenses x where x.id = t.object_id and x.deleted_at is not null and (v_all or x.created_by = auth.uid()))
             when 'catalog_item' then (select c.name from public.catalog_items c where c.id = t.object_id and c.deleted_at is not null and (v_all or c.created_by = auth.uid()))
             when 'customer' then (select c.display_name from public.customers c where c.id = t.object_id and c.deleted_at is not null and (v_all or c.created_by = auth.uid()))
             when 'lead' then (select coalesce(l.contact_name, l.number) from public.leads l where l.id = t.object_id and l.deleted_at is not null and (v_all or l.created_by = auth.uid()))
           end,
           t.deleted_by, u.full_name, t.deleted_at,
           greatest(0, app.trash_days() - extract(day from now() - t.deleted_at)::int)
      from public.trash_entries t
      left join public.users u on u.id = t.deleted_by
     where t.company_id = p_company and t.restored_at is null
       and t.deleted_at >= now() - make_interval(days => app.trash_days())
       and (v_all or t.deleted_by = auth.uid())
     order by t.deleted_at desc;
end;
$$;
revoke all on function public.trash_list(uuid) from public, anon;
grant execute on function public.trash_list(uuid) to authenticated;

-- ---- 9. Отмена работы: кто и когда (#750) -----------------------------------------------------------------------------
-- Ответ — код причины или null. Оплата (в том числе платёж в пути) — сначала возврат; офис — только работу без счёта.
create or replace function app.job_cancel_reason(p_company uuid, p_job uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when not app.has_role(p_company, array['owner', 'admin', 'office']) then 'noRight'
    when exists (select 1 from public.payments p join public.invoices i on i.company_id = p.company_id and i.id = p.invoice_id
                  where i.company_id = p_company and i.job_id = p_job
                    and p.status in ('pending', 'succeeded', 'partially_refunded') and p.amount_cents - p.refunded_cents > 0) then 'paid'
    when not app.has_role(p_company, array['owner', 'admin'])
         and exists (select 1 from public.invoices i where i.company_id = p_company and i.job_id = p_job and i.status <> 'void') then 'invoiceOpen'
  end;
$$;
revoke all on function app.job_cancel_reason(uuid, uuid) from public, anon;
grant execute on function app.job_cancel_reason(uuid, uuid) to authenticated;

create or replace function app.tg_job_cancel_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_why text;
begin
  if current_user <> 'authenticated' or new.status <> 'cancelled' or old.status = 'cancelled' then return new; end if;
  v_why := app.job_cancel_reason(new.company_id, new.id);
  if v_why is not null then
    raise exception 'job:%', v_why using errcode = case when v_why = 'noRight' then '42501' else '23514' end;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_job_cancel_guard() from public, anon, authenticated;
create trigger t13_job_cancel_guard before update of status on public.jobs
  for each row execute function app.tg_job_cancel_guard();
