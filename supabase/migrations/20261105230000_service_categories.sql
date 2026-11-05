-- Direction of the business (docs/specs/11-trade.md, wave T1): ServiceCategory of docs/04-domain-model.md §3, top level only.
-- A lead, an estimate and a job point at one direction of their company (service_category_id) for the stats.
-- * service_categories: preset (seed_key, translated in the app) or own name; archive instead of delete.
-- * leads.service_category_id is new; estimates/jobs.service_category_id existed empty, now get a company-safe key.
-- * companies.trades[] moves here (trim, no blanks, no duplicates, array order). primary_trade is not moved: every company
--   has the default there, it would invent a direction. Both columns are dropped by a later migration.
-- * On insert an empty direction comes from the previous step (company → lead → estimate → job), whatever path makes
--   the row (app, portal_accept, countersign, web form, service role). Never back, never forward.

-- ---- table --------------------------------------------------------------------------------
create table public.service_categories (
  id            uuid primary key default public.uuid_generate_v7(),
  company_id    uuid not null references public.companies (id),
  seed_key      text check (seed_key ~ '^[a-z][a-z0-9_]*$'),
  name          text check (name is null or btrim(name) <> ''),
  parent_id     uuid check (parent_id is null),            -- "kind of work" level comes later
  position      int not null default 0 check (position >= 0),
  archived_at   timestamptz,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  row_version bigint not null default 1,
  unique (company_id, id),
  check (seed_key is not null or name is not null),
  foreign key (company_id, parent_id) references public.service_categories (company_id, id)
);
create unique index service_categories_seed_key_uq on public.service_categories (company_id, seed_key)
  where archived_at is null and seed_key is not null;
create unique index service_categories_name_uq on public.service_categories (company_id, lower(btrim(name)))
  where archived_at is null and name is not null;
do $$ begin perform app.attach_standard_triggers('public.service_categories'); end $$;

-- no delete, even for the service role: archive instead (history and stats keep the id)
create or replace function app.tg_service_category_no_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'a direction is never deleted: archive it' using errcode = '42501';
end;
$$;
create trigger t05_no_delete before delete on public.service_categories
  for each row execute function app.tg_service_category_no_delete();

-- ---- the field on a lead; old empty-by-design values of estimates and jobs cleared ---------
alter table public.leads add column if not exists service_category_id uuid;
-- nothing pointed at a real direction before this table existed; clear without bumping row_version / updated_at
alter table public.estimates disable trigger user;
update public.estimates set service_category_id = null where service_category_id is not null;
alter table public.estimates enable trigger user;
alter table public.jobs disable trigger user;
update public.jobs set service_category_id = null where service_category_id is not null;
alter table public.jobs enable trigger user;

-- ---- move companies.trades[] --------------------------------------------------------------
-- preset keys: same list as TRADES in apps/mobile/src/features/companySetup.ts
insert into public.service_categories (company_id, seed_key, name, position)
select company_id, seed_key, name, (row_number() over (partition by company_id order by ord)) - 1
  from (
    select distinct on (company_id, k) company_id, seed_key, name, ord, k
      from (
        select c.id as company_id, x.ord,
               case when lower(btrim(x.t)) in ('handyman', 'plumbing', 'electrical', 'hvac', 'painting', 'cleaning', 'remodeling',
                                               'flooring', 'roofing', 'gutters', 'landscaping', 'fencing', 'pest', 'other')
                    then lower(btrim(x.t)) end as seed_key,
               case when lower(btrim(x.t)) in ('handyman', 'plumbing', 'electrical', 'hvac', 'painting', 'cleaning', 'remodeling',
                                               'flooring', 'roofing', 'gutters', 'landscaping', 'fencing', 'pest', 'other')
                    then null else btrim(x.t) end as name,
               lower(btrim(x.t)) as k
          from public.companies c
          cross join lateral unnest(c.trades) with ordinality as x(t, ord)
         where x.t is not null and btrim(x.t) <> ''
           and not exists (select 1 from public.service_categories s where s.company_id = c.id)
      ) raw
     order by company_id, k, ord
  ) dedup;

-- ---- keys: a direction of the same company only ---------------------------------------------
alter table public.leads add constraint leads_service_category_fk
  foreign key (company_id, service_category_id) references public.service_categories (company_id, id);
alter table public.estimates add constraint estimates_service_category_fk
  foreign key (company_id, service_category_id) references public.service_categories (company_id, id);
alter table public.jobs add constraint jobs_service_category_fk
  foreign key (company_id, service_category_id) references public.service_categories (company_id, id);
create index leads_service_category_idx on public.leads (company_id, service_category_id) where service_category_id is not null;
create index estimates_service_category_idx on public.estimates (company_id, service_category_id) where service_category_id is not null;
create index jobs_service_category_idx on public.jobs (company_id, service_category_id) where service_category_id is not null;

-- ---- inheritance and the archive guard -----------------------------------------------------
-- security definer: the result must not depend on who inserts (a tech does not see every job of the client; anon
-- inserts through portal functions). Reads only rows of new.company_id; the composite key stops a foreign id.
create or replace function app.service_category_only(p_company uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select case when count(*) = 1 then min(id::text)::uuid end
    from public.service_categories where company_id = p_company and archived_at is null;
$$;

create or replace function app.service_category_last_of_customer(p_company uuid, p_customer uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select x.cat from (
    select e.service_category_id as cat, e.created_at, e.id from public.estimates e
     where e.company_id = p_company and e.customer_id = p_customer and e.deleted_at is null and e.service_category_id is not null
    union all
    select j.service_category_id, j.created_at, j.id from public.jobs j
     where j.company_id = p_company and j.customer_id = p_customer and j.deleted_at is null and j.service_category_id is not null
  ) x
  join public.service_categories c on c.id = x.cat and c.archived_at is null
  order by x.created_at desc, x.id desc
  limit 1;
$$;

-- the direction of the row's direct parent (estimate ← lead, job ← estimate), archived or not: the same deal
create or replace function app.service_category_parent(p_kind text, p_company uuid, p_lead uuid, p_estimate uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'estimate' then (select l.service_category_id from public.leads l where l.id = p_lead and l.company_id = p_company)
    when 'job' then (select e.service_category_id from public.estimates e where e.id = p_estimate and e.company_id = p_company)
  end;
$$;

-- BEFORE INSERT; tg_argv[0] = lead | estimate | job. A filled field is never touched (repeat-safe).
create or replace function app.tg_service_category_inherit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare k text := tg_argv[0]; j jsonb := to_jsonb(new);
begin
  if new.service_category_id is not null then return new; end if;
  if k = 'lead' then
    new.service_category_id := app.service_category_only(new.company_id);
  elsif k = 'estimate' then
    if (j ->> 'lead_id') is not null then
      new.service_category_id := app.service_category_parent('estimate', new.company_id, (j ->> 'lead_id')::uuid, null);
    end if;
    if new.service_category_id is null and (j ->> 'lead_id') is null then
      new.service_category_id := coalesce(app.service_category_last_of_customer(new.company_id, (j ->> 'customer_id')::uuid),
                                          app.service_category_only(new.company_id));
    end if;
  elsif k = 'job' then
    if (j ->> 'estimate_id') is not null then
      -- an estimate deliberately "without a direction" gives a job without one
      new.service_category_id := app.service_category_parent('job', new.company_id, null, (j ->> 'estimate_id')::uuid);
    else
      new.service_category_id := coalesce(app.service_category_last_of_customer(new.company_id, (j ->> 'customer_id')::uuid),
                                          app.service_category_only(new.company_id));
    end if;
  end if;
  return new;
end;
$$;

-- an archived direction is not chosen anew; it stays where it already is, and a row may take its direct parent's
create or replace function app.tg_service_category_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare k text := tg_argv[0]; j jsonb := to_jsonb(new); v_parent uuid;
begin
  if new.service_category_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.service_category_id is not distinct from old.service_category_id then return new; end if;
  if exists (select 1 from public.service_categories c where c.id = new.service_category_id and c.archived_at is not null) then
    if tg_op = 'INSERT' and k in ('estimate', 'job') then
      v_parent := app.service_category_parent(k, new.company_id, (j ->> 'lead_id')::uuid, (j ->> 'estimate_id')::uuid);
      if v_parent is not distinct from new.service_category_id then return new; end if;
    end if;
    raise exception 'this direction is archived' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger t15_service_category_inherit before insert on public.leads
  for each row execute function app.tg_service_category_inherit('lead');
create trigger t15_service_category_inherit before insert on public.estimates
  for each row execute function app.tg_service_category_inherit('estimate');
create trigger t15_service_category_inherit before insert on public.jobs
  for each row execute function app.tg_service_category_inherit('job');
create trigger t16_service_category_guard before insert or update of service_category_id on public.leads
  for each row execute function app.tg_service_category_guard('lead');
create trigger t16_service_category_guard before insert or update of service_category_id on public.estimates
  for each row execute function app.tg_service_category_guard('estimate');
create trigger t16_service_category_guard before insert or update of service_category_id on public.jobs
  for each row execute function app.tg_service_category_guard('job');

-- ---- rights ---------------------------------------------------------------------------------
alter table public.service_categories enable row level security;
alter table public.service_categories force row level security;
create policy service_categories_select on public.service_categories for select to authenticated
  using (app.is_member(company_id));
create policy service_categories_insert on public.service_categories for insert to authenticated
  with check (app.has_role(company_id, array['owner', 'admin']));
create policy service_categories_update on public.service_categories for update to authenticated
  using (app.has_role(company_id, array['owner', 'admin']))
  with check (app.has_role(company_id, array['owner', 'admin']));

revoke all on public.service_categories from anon, authenticated;
grant select on public.service_categories to authenticated;
grant insert (id, company_id, seed_key, name, position, archived_at, created_at_device, origin_device_id) on public.service_categories to authenticated;
grant update (name, position, archived_at) on public.service_categories to authenticated;

revoke all on function app.tg_service_category_no_delete() from public, anon, authenticated;
revoke all on function app.tg_service_category_inherit() from public, anon, authenticated;
revoke all on function app.tg_service_category_guard() from public, anon, authenticated;
revoke all on function app.service_category_only(uuid) from public, anon, authenticated;
revoke all on function app.service_category_last_of_customer(uuid, uuid) from public, anon, authenticated;
revoke all on function app.service_category_parent(text, uuid, uuid, uuid) from public, anon, authenticated;
