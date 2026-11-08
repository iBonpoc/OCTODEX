-- CH1a (docs/specs/08-checklists.md §3, §8, §11.3): checklist templates of a company and the checklist of a visit as
-- rows, photo rules of the company, «Просмотрено» of the office.
--   checklist_templates     a company's list of what to do on a visit; comes into a visit as a snapshot (§1)
--   visit_checklist_items   the items of one visit: one row each, so a tech's tick and an office edit never overwrite
--                           each other (before: the whole array in visits.checklist, last write wins)
--   companies.visit_settings  photos before / after required and their minimum (app.valid_visit_settings)
--   companies.checklist_since the visits the «not done» card looks at start here (no flood of old visits, §11.5 №26)
--   visits.checklist_reviewed_at/_by  the office pressed «Просмотрено» on the «not done» card
-- Who (§8, founder В2 05.11): templates — the office reads (owner, admin, office, sales), owner/admin/office write.
-- Items — the office does anything except: a REQUIRED item is removed or made optional only by owner/admin. A tech
-- (assigned to the visit) ticks, skips and attaches photos; adds only an optional item; removes only his own optional
-- item; changes nothing once the client signed. Who ticked / skipped is the server's word (auth.uid()).
-- Rule 16, step 1: visits.checklist (jsonb) stays. Rows → mirror into it ({id,label,done}) for old app versions; an old
-- version writing the whole array moves only «done» of known items into the rows and adds its new optional items;
-- anything else it writes is replaced by the mirror (that also closes the hole: a tech could rewrite the whole list).
-- Step 2 (drop the column and the mirror) is a separate PR when no old version is in use.
-- New tables are empty: plain indexes block nobody. No DELETE for the app: deleted_at (undo 5 s, offline sync).

-- ---- company settings ---------------------------------------------------------------------------------------------
alter table public.companies add column if not exists visit_settings jsonb not null default '{}'::jsonb;
-- existing companies: from this migration on; a new company: from its creation
alter table public.companies add column if not exists checklist_since timestamptz not null default now();

create or replace function app.valid_visit_settings(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
       where e.key not in ('photosBeforeRequired', 'photosAfterRequired', 'minPhotosBefore', 'minPhotosAfter')
          or case
               when e.key in ('photosBeforeRequired', 'photosAfterRequired') then jsonb_typeof(e.value) <> 'boolean'
               else jsonb_typeof(e.value) <> 'number'
                    or (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric)
                    or (e.value #>> '{}')::numeric not between 1 and 20
             end)
$$;
revoke all on function app.valid_visit_settings(jsonb) from public, anon, authenticated;
-- the check runs as the user who saves the company (owner / admin) and for server code: a pure validator
grant execute on function app.valid_visit_settings(jsonb) to authenticated, service_role;
alter table public.companies drop constraint if exists companies_visit_settings_valid;
alter table public.companies add constraint companies_visit_settings_valid check (app.valid_visit_settings(visit_settings));

-- ---- templates ------------------------------------------------------------------------------------------------------
-- items of a template: [{id, label, kind, required, hint?}], at most 100
create or replace function app.valid_checklist_items(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) <= 100
     and octet_length(p::text) <= 65536
     and not exists (
       select 1 from jsonb_array_elements(p) x
       where jsonb_typeof(x) <> 'object'
          or exists (select 1 from jsonb_object_keys(x) k where k not in ('id', 'label', 'kind', 'required', 'hint'))
          or jsonb_typeof(x -> 'id') is distinct from 'string'
          or (x ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or jsonb_typeof(x -> 'label') is distinct from 'string'
          or length(x ->> 'label') not between 1 and 300 or (x ->> 'label') ~ '[[:cntrl:]]'
          or (x ->> 'kind') is distinct from 'check' and (x ->> 'kind') is distinct from 'photo'
          or jsonb_typeof(x -> 'required') is distinct from 'boolean'
          or (x ? 'hint' and not (jsonb_typeof(x -> 'hint') = 'null'
                                  or (jsonb_typeof(x -> 'hint') = 'string' and length(x ->> 'hint') <= 300 and (x ->> 'hint') !~ '[[:cntrl:]]'))))
     and (select count(distinct x ->> 'id') from jsonb_array_elements(p) x) = jsonb_array_length(p)
$$;
revoke all on function app.valid_checklist_items(jsonb) from public, anon, authenticated;
grant execute on function app.valid_checklist_items(jsonb) to authenticated, service_role;

create table public.checklist_templates (
  id                      uuid primary key default public.uuid_generate_v7(),
  company_id              uuid not null references public.companies (id) on delete cascade,
  name                    text not null check (length(name) between 1 and 120 and name !~ '[[:cntrl:]]'),
  items                   jsonb not null default '[]'::jsonb check (app.valid_checklist_items(items)),
  -- when it comes into a visit (§2): every visit / by kind (inspection, any visit of a job) / by catalog services
  applies_every_visit     boolean not null default false,
  applies_visit_kinds     text[] not null default '{}' check (applies_visit_kinds <@ array['inspection', 'work']::text[]),
  applies_catalog_item_ids uuid[] not null default '{}' check (cardinality(applies_catalog_item_ids) <= 200),
  -- raise the company's minimum of photos for visits with this template (never lower it)
  min_photos_before       integer check (min_photos_before between 1 and 20),
  min_photos_after        integer check (min_photos_after between 1 and 20),
  -- a starter template of a module (the module's key); null = the company's own
  module_key              text check (module_key ~ '^[a-z][a-z0-9_]{1,30}$'),
  archived_at             timestamptz,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id)
);
create index checklist_templates_company_idx on public.checklist_templates (company_id, updated_at desc);

-- ---- items of a visit -----------------------------------------------------------------------------------------------
create table public.visit_checklist_items (
  id             uuid primary key default public.uuid_generate_v7(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  visit_id       uuid not null,
  position       integer not null default 0 check (position between 0 and 100000),
  label          text not null check (length(label) between 1 and 300 and label !~ '[[:cntrl:]]'),
  kind           text not null default 'check' check (kind in ('check', 'photo')),
  required       boolean not null default false,
  hint           text check (hint is null or (length(hint) <= 300 and hint !~ '[[:cntrl:]]')),
  -- where it came from (the snapshot keeps the name: a template renamed later does not rewrite history)
  template_id    uuid,
  template_name  text check (template_name is null or (length(template_name) between 1 and 120 and template_name !~ '[[:cntrl:]]')),
  done           boolean not null default false,
  done_by        uuid,
  done_at        timestamptz,
  -- skipped (§2 «Пропустить»): skipped is NOT done; the reason is optional
  skipped        boolean not null default false,
  na_reason      text check (na_reason in ('not_on_site', 'client_refused', 'unsafe', 'other')),
  na_text        text check (na_text is null or (length(na_text) <= 300 and na_text !~ '[[:cntrl:]]')),
  na_by          uuid,
  na_at          timestamptz,
  -- a photo item: ids of the visit's photos attached to it
  photo_ids      uuid[] not null default '{}' check (cardinality(photo_ids) <= 20),
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  check (not (done and skipped)),
  check (skipped or (na_reason is null and na_text is null)),
  foreign key (company_id, visit_id) references public.visits (company_id, id) on delete cascade,
  foreign key (company_id, template_id) references public.checklist_templates (company_id, id)
);
create index visit_checklist_items_visit_idx on public.visit_checklist_items (company_id, visit_id);
create index visit_checklist_items_company_idx on public.visit_checklist_items (company_id, updated_at desc);
create index visit_checklist_items_template_idx on public.visit_checklist_items (company_id, template_id);

-- ---- visits: «Просмотрено» -----------------------------------------------------------------------------------------
alter table public.visits add column if not exists checklist_reviewed_at timestamptz;
alter table public.visits add column if not exists checklist_reviewed_by uuid;

-- ---- move the old arrays into rows (before the triggers: nobody is signed in here) ---------------------------------
-- An item becomes required (the app held the signature until every item was ticked) and a tick. An id that is not a
-- uuid, or the same id in two visits, gets a new id; the mirror below then gives old phones the new ids.
insert into public.visit_checklist_items (id, company_id, visit_id, position, label, kind, required, done, created_at, updated_at)
select case when s.rn = 1 and s.raw_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then s.raw_id::uuid else public.uuid_generate_v7() end,
       s.company_id, s.visit_id, s.pos, s.label, 'check', true, s.done, coalesce(s.created_at, now()), now()
  from (
    select v.company_id, v.id as visit_id, v.created_at, (e.n - 1)::integer as pos,
           lower(e.x ->> 'id') as raw_id,
           left(regexp_replace(btrim(e.x ->> 'label'), '[[:cntrl:]]', ' ', 'g'), 300) as label,
           coalesce(case when jsonb_typeof(e.x -> 'done') = 'boolean' then (e.x ->> 'done')::boolean end, false) as done,
           row_number() over (partition by lower(e.x ->> 'id') order by v.created_at, v.id, e.n) as rn
      from public.visits v
      cross join lateral jsonb_array_elements(case when jsonb_typeof(v.checklist) = 'array' then v.checklist else '[]'::jsonb end)
                 with ordinality as e(x, n)
     where jsonb_typeof(e.x) = 'object' and jsonb_typeof(e.x -> 'label') = 'string'
       and length(btrim(e.x ->> 'label')) > 0
  ) s;

-- ---- the mirror: rows → visits.checklist ----------------------------------------------------------------------------
create or replace function app.chk_items_json(p_visit_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'label', i.label, 'done', i.done) order by i.position, i.created_at, i.id), '[]'::jsonb)
    from public.visit_checklist_items i
   where i.visit_id = p_visit_id and i.deleted_at is null;
$$;
revoke all on function app.chk_items_json(uuid) from public, anon, authenticated;

-- old phones read what is there now; only rows that differ are touched (row_version moves only for them)
update public.visits v set checklist = app.chk_items_json(v.id)
 where v.checklist is distinct from app.chk_items_json(v.id)
   and (jsonb_array_length(case when jsonb_typeof(v.checklist) = 'array' then v.checklist else '[]'::jsonb end) > 0
        or exists (select 1 from public.visit_checklist_items i where i.visit_id = v.id));

create or replace function app.chk_mirror(p_visit_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- the visit's own trigger (t04) must not read this write as an old phone's array
  perform set_config('app.chk_mirror', 'on', true);
  update public.visits set checklist = app.chk_items_json(p_visit_id)
   where id = p_visit_id and checklist is distinct from app.chk_items_json(p_visit_id);
  perform set_config('app.chk_mirror', '', true);
end;
$$;
revoke all on function app.chk_mirror(uuid) from public, anon, authenticated;

create or replace function app.tg_chk_item_mirror()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.chk_mirror', true), '') = 'on' then return null; end if;
  perform app.chk_mirror(new.visit_id);
  return null;
end;
$$;
revoke all on function app.tg_chk_item_mirror() from public, anon, authenticated;

-- ---- an old phone writes the whole array into visits.checklist ------------------------------------------------------
create or replace function app.tg_visit_checklist_legacy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  e jsonb;
  v_id text;
  v_label text;
  v_pos integer;
  v_finish_only boolean;
begin
  if coalesce(current_setting('app.chk_mirror', true), '') = 'on' then return new; end if;
  if tg_op = 'UPDATE' and new.checklist is not distinct from old.checklist then return new; end if;
  -- an old phone never gets a refusal here (its queue would retry forever): what the rows' rules forbid is left out.
  -- After the client signed a tech only finishes (ticks); the office and the server always may.
  v_finish_only := auth.uid() is not null and not app.is_staff(new.company_id) and new.signed_at is not null;
  perform set_config('app.chk_mirror', 'on', true);
  if jsonb_typeof(new.checklist) = 'array' then
    for e in select x from jsonb_array_elements(new.checklist) x where jsonb_typeof(x) = 'object' loop
      v_id := lower(e ->> 'id');
      if v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then continue; end if;
      if exists (select 1 from public.visit_checklist_items i where i.id = v_id::uuid) then
        -- only «done» of a live item of this visit; label, order and the rest stay as the rows say
        if jsonb_typeof(e -> 'done') = 'boolean' and not (v_finish_only and not (e ->> 'done')::boolean) then
          update public.visit_checklist_items i
             set done = (e ->> 'done')::boolean, skipped = false, na_reason = null, na_text = null
           where i.id = v_id::uuid and i.visit_id = new.id and i.deleted_at is null and i.done is distinct from (e ->> 'done')::boolean;
        end if;
      else
        -- an item the old phone added on site (store addCheckItem): always optional
        v_label := left(regexp_replace(btrim(coalesce(e ->> 'label', '')), '[[:cntrl:]]', ' ', 'g'), 300);
        if length(v_label) = 0 or v_finish_only then continue; end if;
        if (select count(*) from public.visit_checklist_items i where i.visit_id = new.id and i.deleted_at is null) >= 200 then continue; end if;
        select coalesce(max(i.position) + 1, 0) into v_pos from public.visit_checklist_items i where i.visit_id = new.id;
        insert into public.visit_checklist_items (id, company_id, visit_id, position, label, kind, required, done)
        values (v_id::uuid, new.company_id, new.id, least(v_pos, 100000), v_label, 'check', false,
                coalesce(case when jsonb_typeof(e -> 'done') = 'boolean' then (e ->> 'done')::boolean end, false));
      end if;
    end loop;
  end if;
  -- whatever the array said, it now says what the rows say (an old phone cannot rewrite labels or drop items)
  new.checklist := app.chk_items_json(new.id);
  perform set_config('app.chk_mirror', '', true);
  return new;
end;
$$;
revoke all on function app.tg_visit_checklist_legacy() from public, anon, authenticated;
create trigger t04_visit_checklist_legacy before update of checklist on public.visits
  for each row execute function app.tg_visit_checklist_legacy();

-- a visit inserted with an array (an old shape): rows after the visit exists (the foreign key), then the mirror
create or replace function app.tg_visit_checklist_legacy_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(new.checklist) <> 'array' or jsonb_array_length(new.checklist) = 0 then return null; end if;
  perform set_config('app.chk_mirror', 'on', true);
  insert into public.visit_checklist_items (id, company_id, visit_id, position, label, kind, required, done)
  select case when lower(x ->> 'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   and not exists (select 1 from public.visit_checklist_items i where i.id = (x ->> 'id')::uuid)
              then (x ->> 'id')::uuid else public.uuid_generate_v7() end,
         new.company_id, new.id, least((n - 1)::integer, 100000),
         left(regexp_replace(btrim(x ->> 'label'), '[[:cntrl:]]', ' ', 'g'), 300), 'check', true,
         coalesce(case when jsonb_typeof(x -> 'done') = 'boolean' then (x ->> 'done')::boolean end, false)
    from jsonb_array_elements(new.checklist) with ordinality as t(x, n)
   where jsonb_typeof(x) = 'object' and jsonb_typeof(x -> 'label') = 'string' and length(btrim(x ->> 'label')) > 0
     and n <= 200;
  perform set_config('app.chk_mirror', '', true);
  perform app.chk_mirror(new.id);
  return null;
end;
$$;
revoke all on function app.tg_visit_checklist_legacy_insert() from public, anon, authenticated;
create trigger t90_visit_checklist_legacy_insert after insert on public.visits
  for each row execute function app.tg_visit_checklist_legacy_insert();

-- ---- rules of an item -----------------------------------------------------------------------------------------------
create or replace function app.tg_visit_item_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_signed timestamptz;
  v_visit_company uuid;
  v_live integer;
begin
  -- done and skipped never both: the newer one wins (ticking a skipped item does it; skipping a ticked one unticks)
  if new.done and new.skipped then
    if tg_op = 'UPDATE' and old.done then new.done := false;
    else new.skipped := false; end if;
  end if;
  if not new.skipped then new.na_reason := null; new.na_text := null; end if;
  -- who ticked and who skipped is the server's word; the time is the phone's (offline), never in the future
  if tg_op = 'INSERT' or new.done is distinct from old.done then
    new.done_by := case when new.done then coalesce(v_uid, new.done_by) end;
    new.done_at := case when new.done then least(coalesce(new.done_at, now()), now()) end;
  end if;
  if tg_op = 'INSERT' or new.skipped is distinct from old.skipped then
    new.na_by := case when new.skipped then coalesce(v_uid, new.na_by) end;
    new.na_at := case when new.skipped then least(coalesce(new.na_at, now()), now()) end;
  end if;
  if tg_op = 'UPDATE' and new.visit_id is distinct from old.visit_id then
    raise exception 'an item stays on its visit' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    select count(*) into v_live from public.visit_checklist_items i where i.visit_id = new.visit_id and i.deleted_at is null;
    if v_live >= 200 then
      raise exception 'a visit has at most 200 checklist items' using errcode = '54000';
    end if;
  end if;
  -- the server (no user) writes as it is
  if v_uid is null then return new; end if;

  if app.is_staff(new.company_id) then
    -- a required item is the company's rule: only the director (owner, admin) removes it or makes it optional
    if not app.has_role(new.company_id, array['owner', 'admin']) and tg_op = 'UPDATE' and old.required
       and ((new.deleted_at is not null and old.deleted_at is null) or not new.required) then
      raise exception 'only the director removes a required item' using errcode = '42501';
    end if;
    return new;
  end if;

  -- a tech of the visit (RLS let him in). After the client signed he may only finish what was left (§8: tick a missed
  -- item, send a missing photo later) — never untick, skip, add or remove
  select v.signed_at, v.company_id into v_signed, v_visit_company from public.visits v where v.id = new.visit_id;
  if v_signed is not null and (tg_op = 'INSERT'
       or (old.done and not new.done) or (new.skipped and not old.skipped)
       or not (new.photo_ids @> old.photo_ids)
       or new.deleted_at is distinct from old.deleted_at
       or new.na_reason is distinct from old.na_reason and new.skipped
       or new.na_text is distinct from old.na_text and new.skipped) then
    raise exception 'the client signed: a technician only finishes what was left' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.required or new.template_id is not null or new.template_name is not null then
      raise exception 'a technician adds only an optional item of his own' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.label is distinct from old.label or new.kind is distinct from old.kind or new.required is distinct from old.required
     or new.position is distinct from old.position or new.hint is distinct from old.hint
     or new.template_id is distinct from old.template_id or new.template_name is distinct from old.template_name then
    raise exception 'only the office changes what an item says' using errcode = '42501';
  end if;
  if new.deleted_at is distinct from old.deleted_at
     and (old.required or old.created_by is distinct from v_uid) then
    raise exception 'a technician removes only an optional item he added' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_visit_item_guard() from public, anon, authenticated;
-- after t10/t11 would be wrong for created_by on insert: t10 (service fields) runs first by name, so created_by is set
create trigger t20_visit_item_guard before insert or update on public.visit_checklist_items
  for each row execute function app.tg_visit_item_guard();
create trigger t90_visit_item_mirror after insert or update on public.visit_checklist_items
  for each row execute function app.tg_chk_item_mirror();

select app.attach_standard_triggers('public.checklist_templates');
select app.attach_standard_triggers('public.visit_checklist_items');

-- ---- «Просмотрено»: who pressed it is the server's word ------------------------------------------------------------
create or replace function app.tg_visit_checklist_review()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.checklist_reviewed_by := case when new.checklist_reviewed_at is null then null else auth.uid() end;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_visit_checklist_review() from public, anon, authenticated;
create trigger t04_visit_checklist_review before update of checklist_reviewed_at on public.visits
  for each row execute function app.tg_visit_checklist_review();

-- the technician's guard (20261107030000) + «Просмотрено» (the office's)
create or replace function app.tg_visit_tech_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or app.is_staff(old.company_id) then return new; end if;
  if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
     or new.all_day is distinct from old.all_day
     or new.job_id is distinct from old.job_id or new.lead_id is distinct from old.lead_id
     or new.property_id is distinct from old.property_id
     or new.company_id is distinct from old.company_id or new.kind is distinct from old.kind
     or new.deleted_at is distinct from old.deleted_at
     or new.arrival_window_start is distinct from old.arrival_window_start or new.arrival_window_end is distinct from old.arrival_window_end
     or new.notify_customer is distinct from old.notify_customer or new.customer_notified_at is distinct from old.customer_notified_at
     or new.crew_id is distinct from old.crew_id
     or new.subcontractor_assignment_id is distinct from old.subcontractor_assignment_id or new.schedule_mode is distinct from old.schedule_mode
     or new.flex_week_start is distinct from old.flex_week_start or new.sequence_in_route is distinct from old.sequence_in_route
     or new.cancel_reason is distinct from old.cancel_reason or new.cancel_reason_text is distinct from old.cancel_reason_text
     or new.cancelled_at is distinct from old.cancelled_at or new.cancelled_by is distinct from old.cancelled_by
     or new.legacy_no_property is distinct from old.legacy_no_property
     or new.checklist_reviewed_at is distinct from old.checklist_reviewed_at
     or new.checklist_reviewed_by is distinct from old.checklist_reviewed_by then
    raise exception 'only the office changes the time, job or place of a visit' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and new.status in ('cancelled', 'no_show') then
    raise exception 'only the office cancels a visit' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_visit_tech_guard() from public, anon, authenticated;

-- ---- access ---------------------------------------------------------------------------------------------------------
alter table public.checklist_templates enable row level security;
alter table public.checklist_templates force row level security;
alter table public.visit_checklist_items enable row level security;
alter table public.visit_checklist_items force row level security;

revoke all on public.checklist_templates, public.visit_checklist_items from anon, authenticated;
grant select, insert, update on public.checklist_templates to authenticated;
grant select on public.visit_checklist_items to authenticated;
-- who ticked / skipped (done_by, na_by) is set by the server only: not in the grants
grant insert (id, company_id, visit_id, position, label, kind, required, hint, template_id, template_name,
              done, done_at, skipped, na_reason, na_text, na_at, photo_ids, deleted_at, created_at_device, origin_device_id)
  on public.visit_checklist_items to authenticated;
grant update (position, label, kind, required, hint, done, done_at, skipped, na_reason, na_text, na_at, photo_ids, deleted_at)
  on public.visit_checklist_items to authenticated;

create policy checklist_templates_select on public.checklist_templates for select to authenticated
  using (app.is_staff(company_id));
create policy checklist_templates_insert on public.checklist_templates for insert to authenticated
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));
create policy checklist_templates_update on public.checklist_templates for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office']))
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));

-- a tech sees removed items of his visit too: Postgres refuses a soft delete (deleted_at) the writer could not see
-- afterwards; the app reads live rows only
create policy visit_checklist_items_select on public.visit_checklist_items for select to authenticated
  using (app.is_staff(company_id)
         or (app.has_role(company_id, array['tech']) and app.is_visit_assignee(visit_id)));
create policy visit_checklist_items_insert on public.visit_checklist_items for insert to authenticated
  with check (app.is_staff(company_id)
              or (app.has_role(company_id, array['tech']) and not required and app.is_visit_assignee(visit_id)));
create policy visit_checklist_items_update on public.visit_checklist_items for update to authenticated
  using (app.is_staff(company_id)
         or (app.has_role(company_id, array['tech']) and app.is_visit_assignee(visit_id)))
  with check (app.is_staff(company_id)
              or (app.has_role(company_id, array['tech']) and app.is_visit_assignee(visit_id)));
