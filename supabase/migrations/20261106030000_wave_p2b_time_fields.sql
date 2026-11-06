-- Wave П-2b (docs/specs/13-app-structure.md §5, §3.7, §3.10): time and own fields.
-- * tasks: starts_at, ends_at, all_day, description (13 §3.7: a task with a time shows in the Plan). due_at stays.
-- * calendar_events: an event or a day off of a person (user_id) or of the whole company (user_id null). The office
--   sees and changes all; a tech sees his own and the company's, and keeps his own (an event, a day off he asks for).
-- * custom_fields + custom_field_values: the company's own fields of a client or a job (13 §3.10). Definitions:
--   owner and admin (company settings, 13 §5а). Values: whoever sees the client / job reads them; staff writes
--   (a tech only reads in v1). The server checks the value against the field's type.

-- ---- tasks with a time ---------------------------------------------------------------------------
alter table public.tasks add column if not exists starts_at timestamptz;
alter table public.tasks add column if not exists ends_at timestamptz;
alter table public.tasks add column if not exists all_day boolean not null default false;
alter table public.tasks add column if not exists description text check (description is null or char_length(description) <= 4000);
alter table public.tasks add constraint tasks_time_order check (ends_at is null or (starts_at is not null and ends_at >= starts_at));
create index if not exists tasks_starts_idx on public.tasks (company_id, starts_at) where starts_at is not null and deleted_at is null;

-- ---- events and days off -------------------------------------------------------------------------
create table public.calendar_events (
  id            uuid primary key default public.uuid_generate_v7(),
  company_id    uuid not null references public.companies (id),
  kind          text not null check (kind in ('event', 'time_off')),
  user_id       uuid references public.users (id),
  title         text check (title is null or (btrim(title) <> '' and char_length(title) <= 200)),
  description   text check (description is null or char_length(description) <= 4000),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  all_day       boolean not null default false,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  check (ends_at >= starts_at),
  check (kind = 'event' or user_id is not null),            -- a day off is always someone's
  check (kind = 'time_off' or title is not null)            -- an event has a name
);
create index calendar_events_time_idx on public.calendar_events (company_id, starts_at) where deleted_at is null;
create index calendar_events_user_idx on public.calendar_events (company_id, user_id, starts_at) where deleted_at is null;
do $$ begin perform app.attach_standard_triggers('public.calendar_events'); end $$;

-- the person of an event is a member of the same company; an event does not move to another person
create or replace function app.tg_calendar_event_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null and not exists (
       select 1 from public.memberships m where m.company_id = new.company_id and m.user_id = new.user_id and m.deleted_at is null) then
    raise exception 'the person is not in this company' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id and not app.is_staff(new.company_id) then
    raise exception 'only the office moves an event to another person' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger t20_calendar_event_guard before insert or update on public.calendar_events
  for each row execute function app.tg_calendar_event_guard();
revoke all on function app.tg_calendar_event_guard() from public, anon, authenticated;

-- ---- own fields ----------------------------------------------------------------------------------
create table public.custom_fields (
  id            uuid primary key default public.uuid_generate_v7(),
  company_id    uuid not null references public.companies (id),
  entity        text not null check (entity in ('customer', 'job')),
  label         text not null check (btrim(label) <> '' and char_length(label) <= 80),
  type          text not null check (type in ('text', 'long_text', 'number', 'checkbox', 'select', 'date', 'file', 'multiselect')),
  options       jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  group_name    text check (group_name is null or (btrim(group_name) <> '' and char_length(group_name) <= 80)),
  searchable    boolean not null default false,
  position      int not null default 0 check (position >= 0),
  archived_at   timestamptz,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  row_version bigint not null default 1,
  unique (company_id, id),
  -- a list has choices; other types have none
  check ((type in ('select', 'multiselect')) = (jsonb_array_length(options) > 0))
);
create unique index custom_fields_label_uq on public.custom_fields (company_id, entity, lower(btrim(label))) where archived_at is null;
do $$ begin perform app.attach_standard_triggers('public.custom_fields'); end $$;

create or replace function app.tg_custom_field_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'an own field is never deleted: archive it' using errcode = '42501';
  end if;
  -- the kind of a field and what it belongs to never change (the stored values keep their meaning)
  if tg_op = 'UPDATE' and (new.entity is distinct from old.entity or new.type is distinct from old.type) then
    raise exception 'the type of an own field does not change' using errcode = '42501';
  end if;
  if exists (select 1 from jsonb_array_elements(new.options) o
              where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '' or char_length(o #>> '{}') > 80) then
    raise exception 'a choice is a short text' using errcode = '22023';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger t05_custom_field_guard before insert or update or delete on public.custom_fields
  for each row execute function app.tg_custom_field_guard();
revoke all on function app.tg_custom_field_guard() from public, anon, authenticated;

create table public.custom_field_values (
  id            uuid primary key default public.uuid_generate_v7(),
  company_id    uuid not null references public.companies (id),
  field_id      uuid not null,
  entity_id     uuid not null,
  value         jsonb not null,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  foreign key (company_id, field_id) references public.custom_fields (company_id, id)
);
-- one live value per field and record (a cleared value is marked deleted; a new one can come later)
create unique index custom_field_values_one_uq on public.custom_field_values (field_id, entity_id) where deleted_at is null;
create index custom_field_values_entity_idx on public.custom_field_values (company_id, entity_id);
do $$ begin perform app.attach_standard_triggers('public.custom_field_values'); end $$;

-- the client / job belongs to the field's company and kind; the value matches the field's type
-- (the same rule as apps/mobile/src/data/customFields.ts customValueOk)
create or replace function app.tg_custom_value_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare f public.custom_fields; v jsonb := new.value; ok boolean;
begin
  select * into f from public.custom_fields where id = new.field_id and company_id = new.company_id;
  if not found then raise exception 'field not found' using errcode = '23503'; end if;
  if tg_op = 'UPDATE' and (new.field_id is distinct from old.field_id or new.entity_id is distinct from old.entity_id) then
    raise exception 'a value does not move to another field or record' using errcode = '42501';
  end if;
  if f.archived_at is not null and (tg_op = 'INSERT' or new.value is distinct from old.value) then
    raise exception 'the field is archived' using errcode = '42501';
  end if;
  if (f.entity = 'customer' and not exists (select 1 from public.customers c where c.id = new.entity_id and c.company_id = new.company_id))
     or (f.entity = 'job' and not exists (select 1 from public.jobs j where j.id = new.entity_id and j.company_id = new.company_id)) then
    raise exception 'the record is not a % of this company', f.entity using errcode = '23503';
  end if;
  ok := case f.type
    when 'text' then jsonb_typeof(v) = 'string' and char_length(v #>> '{}') <= 500
    when 'long_text' then jsonb_typeof(v) = 'string' and char_length(v #>> '{}') <= 10000
    when 'number' then jsonb_typeof(v) = 'number'
    when 'checkbox' then jsonb_typeof(v) = 'boolean'
    when 'date' then jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
                     and (v #>> '{}') = to_char(to_date(v #>> '{}', 'YYYY-MM-DD'), 'YYYY-MM-DD')
    when 'select' then jsonb_typeof(v) = 'string' and f.options @> jsonb_build_array(v)
    when 'multiselect' then jsonb_typeof(v) = 'array'
                     and not exists (select 1 from jsonb_array_elements(v) x where not f.options @> jsonb_build_array(x))
    when 'file' then jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[0-9a-f-]{36}$'
                     and exists (select 1 from public.files x where x.id = (v #>> '{}')::uuid and x.company_id = new.company_id)
    else false
  end;
  if not coalesce(ok, false) then
    raise exception 'the value does not fit a % field', f.type using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger t20_custom_value_guard before insert or update on public.custom_field_values
  for each row execute function app.tg_custom_value_guard();
revoke all on function app.tg_custom_value_guard() from public, anon, authenticated;

-- ---- rights --------------------------------------------------------------------------------------
alter table public.calendar_events enable row level security;
alter table public.calendar_events force row level security;
alter table public.custom_fields enable row level security;
alter table public.custom_fields force row level security;
alter table public.custom_field_values enable row level security;
alter table public.custom_field_values force row level security;

create policy calendar_events_select on public.calendar_events for select to authenticated
  using (app.is_staff(company_id)
         or (app.is_member(company_id) and (user_id is null or user_id = (select auth.uid()))));
create policy calendar_events_insert on public.calendar_events for insert to authenticated
  with check (app.is_staff(company_id) or (app.is_member(company_id) and user_id = (select auth.uid())));
create policy calendar_events_update on public.calendar_events for update to authenticated
  using (app.is_staff(company_id) or (app.is_member(company_id) and user_id = (select auth.uid())))
  with check (app.is_staff(company_id) or (app.is_member(company_id) and user_id = (select auth.uid())));

create policy custom_fields_select on public.custom_fields for select to authenticated
  using (app.is_member(company_id));
create policy custom_fields_insert on public.custom_fields for insert to authenticated
  with check (app.has_role(company_id, array['owner', 'admin']));
create policy custom_fields_update on public.custom_fields for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin']))
  with check (app.has_role(company_id, array['owner', 'admin']));

-- a value is seen with its client / job (their own RLS decides: the office, a tech of a visit there)
create policy custom_field_values_select on public.custom_field_values for select to authenticated
  using (app.is_member(company_id) and (
    exists (select 1 from public.customers c where c.id = entity_id and c.company_id = custom_field_values.company_id)
    or exists (select 1 from public.jobs j where j.id = entity_id and j.company_id = custom_field_values.company_id)));
create policy custom_field_values_insert on public.custom_field_values for insert to authenticated
  with check (app.is_staff(company_id));
create policy custom_field_values_update on public.custom_field_values for update to authenticated
  using (app.is_staff(company_id)) with check (app.is_staff(company_id));

revoke all on public.calendar_events, public.custom_fields, public.custom_field_values from anon, authenticated;
grant select on public.calendar_events, public.custom_fields, public.custom_field_values to authenticated;
grant insert (id, company_id, kind, user_id, title, description, starts_at, ends_at, all_day, created_at_device, origin_device_id)
  on public.calendar_events to authenticated;
grant update (kind, user_id, title, description, starts_at, ends_at, all_day, deleted_at) on public.calendar_events to authenticated;
grant insert (id, company_id, entity, label, type, options, group_name, searchable, position, archived_at, created_at_device, origin_device_id)
  on public.custom_fields to authenticated;
grant update (label, options, group_name, searchable, position, archived_at) on public.custom_fields to authenticated;
grant insert (id, company_id, field_id, entity_id, value, created_at_device, origin_device_id) on public.custom_field_values to authenticated;
grant update (value, deleted_at) on public.custom_field_values to authenticated;
