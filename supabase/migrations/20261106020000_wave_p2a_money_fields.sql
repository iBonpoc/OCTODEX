-- Wave П-2a (docs/specs/13-app-structure.md §5): money fields.
-- * customers.tax_exempt (+ note): a client without sales tax. A snapshot on the document: an estimate version that is
--   not locked yet and a job without an estimate get no tax while the client is exempt; signed documents never change.
-- * job_line_items: lines of a job made without an estimate (13 §3.4 «Деньги»). Line total as estimate lines
--   (floor(qty × price + 0.5)); the job total is counted by the server with the same rule as @octo/estimating-engine
--   jobLinesTotals (subtotal, tax on taxable lines half up, total). A job from an estimate takes no lines of its own.
-- * jobs.tax_enabled, tax_rate_bps: the tax of a job without an estimate (the company has no default rate yet: off).
-- * job_tags: tags of a job, same list as the clients' tags.

-- ---- a client without sales tax ---------------------------------------------------------------
alter table public.customers add column if not exists tax_exempt boolean not null default false;
alter table public.customers add column if not exists tax_exempt_note text
  check (tax_exempt_note is null or char_length(tax_exempt_note) <= 200);

create or replace function app.customer_tax_exempt(p_company uuid, p_customer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select c.tax_exempt from public.customers c where c.id = p_customer and c.company_id = p_company), false);
$$;
revoke all on function app.customer_tax_exempt(uuid, uuid) from public, anon, authenticated;

-- an open estimate version of an exempt client takes no tax: it is refused (not silently changed), so the phone's totals
-- and the client page never differ from what the client signs. A version that was locked before is never touched;
-- locking itself (send_estimate) is checked too, because the client may have become exempt after the draft.
create or replace function app.tg_estimate_version_exempt()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT' or old.locked_at is null) and new.tax_enabled and app.customer_tax_exempt(new.company_id,
       (select e.customer_id from public.estimates e where e.id = new.estimate_id and e.company_id = new.company_id)) then
    raise exception 'the client is tax exempt: turn the tax off on the estimate' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger t17_tax_exempt before insert or update on public.estimate_versions
  for each row execute function app.tg_estimate_version_exempt();
revoke all on function app.tg_estimate_version_exempt() from public, anon, authenticated;

-- ---- the tax and the lines of a job without an estimate ----------------------------------------
alter table public.jobs add column if not exists tax_enabled boolean not null default false;
alter table public.jobs add column if not exists tax_rate_bps int not null default 0 check (tax_rate_bps between 0 and 10000);

create table public.job_line_items (
  id                uuid primary key default public.uuid_generate_v7(),
  company_id        uuid not null references public.companies (id),
  job_id            uuid not null,
  position          int not null default 0 check (position >= 0),
  name              text not null check (btrim(name) <> '' and char_length(name) <= 200),
  description       text check (description is null or char_length(description) <= 2000),
  catalog_item_id   uuid,
  quantity          numeric(14,4) not null default 1 check (quantity > 0),
  unit_price_cents  bigint not null default 0 check (unit_price_cents >= 0),
  taxable           boolean not null default false,
  line_total_cents  bigint generated always as (floor(quantity * unit_price_cents + 0.5)::bigint) stored,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  foreign key (company_id, job_id) references public.jobs (company_id, id),
  foreign key (company_id, catalog_item_id) references public.catalog_items (company_id, id)
);
create index job_line_items_job_idx on public.job_line_items (company_id, job_id, position);
do $$ begin perform app.attach_standard_triggers('public.job_line_items'); end $$;

-- the totals of a job's own lines: the same rule as jobLinesTotals in @octo/estimating-engine (the one place of the formula)
create or replace function app.job_lines_totals_with(p_job uuid, p_tax_enabled boolean, p_rate_bps int)
returns table (lines int, subtotal bigint, tax bigint, total bigint) language sql stable security definer set search_path = '' as $$
  with l as (
    select count(*)::int as n, coalesce(sum(li.line_total_cents), 0) as sub,
           coalesce(sum(li.line_total_cents) filter (where li.taxable), 0) as taxable
      from public.job_line_items li where li.job_id = p_job and li.deleted_at is null
  ), t as (select l.n, l.sub, case when p_tax_enabled then floor(l.taxable::numeric * p_rate_bps / 10000 + 0.5)::bigint else 0 end as tx from l)
  select t.n, t.sub::bigint, t.tx, (t.sub + t.tx)::bigint from t;
$$;
create or replace function app.job_lines_totals(p_job uuid)
returns table (lines int, subtotal bigint, tax bigint, total bigint) language sql stable security definer set search_path = '' as $$
  select x.* from public.jobs j, app.job_lines_totals_with(j.id, j.tax_enabled, j.tax_rate_bps) x where j.id = p_job;
$$;
revoke all on function app.job_lines_totals_with(uuid, boolean, int) from public, anon, authenticated;
revoke all on function app.job_lines_totals(uuid) from public, anon, authenticated;

-- a job from an estimate takes no lines of its own (its lines are the approved option's); a closed, cancelled or
-- removed job keeps its lines as they are
create or replace function app.tg_job_line_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.jobs j where j.id = new.job_id and j.company_id = new.company_id and j.estimate_id is not null) then
    raise exception 'a job from an estimate has the lines of its estimate' using errcode = '42501';
  end if;
  if exists (select 1 from public.jobs j where j.id = new.job_id and j.company_id = new.company_id
              and (j.deleted_at is not null or j.status in ('closed', 'cancelled'))) then
    raise exception 'the job is closed: its lines do not change' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.job_id is distinct from old.job_id then
    raise exception 'a line does not move to another job' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger t20_job_line_guard before insert or update on public.job_line_items
  for each row execute function app.tg_job_line_guard();

-- after a line changes: the job total follows (the server, not the phone, owns it)
create or replace function app.tg_job_line_total()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_job uuid := coalesce(new.job_id, old.job_id);
begin
  -- always touch the job (no «is distinct» check): two lines saved at once must both reach the total, t18 recounts it
  update public.jobs j set contract_total_cents = t.total from app.job_lines_totals(v_job) t
   where j.id = v_job and j.estimate_id is null;
  return null;
end;
$$;
create trigger t90_job_line_total after insert or update or delete on public.job_line_items
  for each row execute function app.tg_job_line_total();
-- money changes leave a trace: the lines of a job, and «without tax» of a client
create trigger t91_audit after insert or update on public.job_line_items
  for each row execute function app.tg_audit();
create trigger t91_audit_tax_exempt after update of tax_exempt, tax_exempt_note on public.customers
  for each row when (old.tax_exempt is distinct from new.tax_exempt or old.tax_exempt_note is distinct from new.tax_exempt_note)
  execute function app.tg_audit();

-- a job without an estimate: an exempt client → no tax; with own lines the total is always theirs.
-- The estimate of a job never changes after the job is made (a job from an estimate cannot become one with own lines,
-- and a job with own lines cannot take an estimate's total).
create or replace function app.tg_job_money()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  if tg_op = 'UPDATE' and new.estimate_id is distinct from old.estimate_id then
    raise exception 'the estimate of a job does not change' using errcode = '42501';
  end if;
  if new.estimate_id is not null then return new; end if;
  -- the exemption is a snapshot: applied when the job is made or its tax is set, never by an unrelated change
  -- (status, description, a line) — an invoice already issued with tax must keep matching the contract
  if new.tax_enabled and (tg_op = 'INSERT' or new.tax_enabled is distinct from old.tax_enabled or new.tax_rate_bps is distinct from old.tax_rate_bps)
     and app.customer_tax_exempt(new.company_id, new.customer_id) then
    new.tax_enabled := false;
  end if;
  if tg_op = 'UPDATE' then
    select * into t from app.job_lines_totals_with(new.id, new.tax_enabled, new.tax_rate_bps);
    if t.lines > 0 then new.contract_total_cents := t.total; end if;
  end if;
  return new;
end;
$$;
create trigger t18_job_money before insert or update on public.jobs
  for each row execute function app.tg_job_money();
revoke all on function app.tg_job_line_guard() from public, anon, authenticated;
revoke all on function app.tg_job_line_total() from public, anon, authenticated;
revoke all on function app.tg_job_money() from public, anon, authenticated;

-- ---- tags of a job -----------------------------------------------------------------------------
create table public.job_tags (
  company_id  uuid not null references public.companies (id),
  job_id      uuid not null,
  tag_id      uuid not null,
  created_at  timestamptz not null default now(),
  primary key (job_id, tag_id),
  foreign key (company_id, job_id) references public.jobs (company_id, id),
  foreign key (company_id, tag_id) references public.tags (company_id, id)
);
create index job_tags_tag_idx on public.job_tags (company_id, tag_id);

create or replace function public.set_job_tags(p_job_id uuid, p_tag_ids uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare v_company uuid;
begin
  select company_id into v_company from public.jobs where id = p_job_id;
  if v_company is null then raise exception 'job not found' using errcode = 'P0002'; end if;
  if not app.is_staff(v_company) then raise exception 'not allowed' using errcode = '42501'; end if;
  -- only the difference: a tag switched off later stays where it already is (a new one must be active, job_tags_insert)
  delete from public.job_tags where job_id = p_job_id and not (tag_id = any (coalesce(p_tag_ids, '{}')));
  insert into public.job_tags (company_id, job_id, tag_id)
  select v_company, p_job_id, t from unnest(coalesce(p_tag_ids, '{}')) t
   where not exists (select 1 from public.job_tags x where x.job_id = p_job_id and x.tag_id = t)
   group by t;
end;
$$;

-- ---- rights ------------------------------------------------------------------------------------
alter table public.job_line_items enable row level security;
alter table public.job_line_items force row level security;
alter table public.job_tags enable row level security;
alter table public.job_tags force row level security;
-- lines and tags are seen with the job (jobs RLS: staff, a tech of its visits), changed by staff
create policy job_line_items_select on public.job_line_items for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.company_id = job_line_items.company_id));
create policy job_line_items_insert on public.job_line_items for insert to authenticated
  with check (app.is_staff(company_id));
create policy job_line_items_update on public.job_line_items for update to authenticated
  using (app.is_staff(company_id)) with check (app.is_staff(company_id));
create policy job_tags_select on public.job_tags for select to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.company_id = job_tags.company_id));
create policy job_tags_insert on public.job_tags for insert to authenticated
  with check (app.is_staff(company_id)
              and exists (select 1 from public.tags t where t.id = tag_id and t.company_id = job_tags.company_id and t.deleted_at is null and t.is_active));
create policy job_tags_delete on public.job_tags for delete to authenticated
  using (app.is_staff(company_id));

revoke all on public.job_line_items, public.job_tags from anon, authenticated;
grant select on public.job_line_items, public.job_tags to authenticated;
grant insert (id, company_id, job_id, position, name, description, catalog_item_id, quantity, unit_price_cents, taxable, created_at_device, origin_device_id)
  on public.job_line_items to authenticated;
grant update (position, name, description, catalog_item_id, quantity, unit_price_cents, taxable, deleted_at) on public.job_line_items to authenticated;
grant insert (company_id, job_id, tag_id) on public.job_tags to authenticated;
grant delete on public.job_tags to authenticated;
revoke execute on function public.set_job_tags(uuid, uuid[]) from public, anon;
grant execute on function public.set_job_tags(uuid, uuid[]) to authenticated;
