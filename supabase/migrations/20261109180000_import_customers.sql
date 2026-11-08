-- Server import of clients from CSV (step 17 C3; docs/specs/04 §14, map S3e).
-- The phone parses the file and shows the check; the server writes and decides: rows come in batches of ≤ 250
-- (one transaction each) to public.import_customers. Every row is checked again here, by the same rule as the app
-- (features/client/csvImport.ts classifyImportRow; the shared examples apps/mobile/test/fixtures/matchKeys.json — T139).
-- * public.import_jobs / public.import_rows — ImportJob / ImportRow of the domain model. Read by owner/admin/office,
--   written only by the functions below. A repeat of a batch (the answer was lost) returns what is stored: the key of
--   a row is (job, line) + md5 of its cleaned fields.
-- * The keys of a duplicate (docs/specs/04 §13.4, the same as features/clientDuplicates.ts): app.phone_key (it was
--   there), app.email_key, app.address_key; app.customer_keys(company) — every key of a company's cards. Closed: only
--   these definer functions call it with the job's company (security-check §14.9 №2).
-- * customers.match_key stays empty: a card has many people and properties, one key is not enough (§14.5 №3).
-- Rule 16: everything is added. Rule 18: every new function revoke all … from public, anon; grants are explicit.

-- ---- 1. Keys --------------------------------------------------------------------------------------
create or replace function app.email_key(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(lower(regexp_replace(coalesce(p, ''), '^\s+|\s+$', '', 'g')), '');
$$;
revoke all on function app.email_key(text) from public, anon, authenticated;

-- the words of an address: letters and digits, the usual abbreviations, apt / suite / unit dropped (addressKey WORDS)
create or replace function app.address_words(p text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(string_agg(w, ' ' order by n), '')
    from (select n, case x
                   when 'street' then 'st' when 'avenue' then 'ave' when 'av' then 'ave' when 'road' then 'rd'
                   when 'drive' then 'dr' when 'lane' then 'ln' when 'court' then 'ct' when 'boulevard' then 'blvd'
                   when 'place' then 'pl' when 'terrace' then 'ter' when 'circle' then 'cir' when 'highway' then 'hwy'
                   when 'parkway' then 'pkwy' when 'north' then 'n' when 'south' then 's' when 'east' then 'e'
                   when 'west' then 'w'
                   when 'apartment' then '' when 'apt' then '' when 'suite' then '' when 'ste' then '' when 'unit' then ''
                   else x end as w
            from regexp_split_to_table(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9 ]+', ' ', 'g'), '\s+')
                 with ordinality as t(x, n)
           where x <> '') s
   where w <> '';
$$;
revoke all on function app.address_words(text) from public, anon, authenticated;

-- «123 Main Street, Apt 4» in 91101 = «123 main st. #4» in 91101; without a digit in the street or without a zip / city — null
create or replace function app.address_key(p_street text, p_unit text, p_city text, p_zip text)
returns text language sql immutable set search_path = '' as $$
  select case when s.street ~ '[0-9]' and s.place <> '' then s.street || '|' || app.address_words(p_unit) || '|' || s.place end
    from (select app.address_words(p_street) as street,
                 coalesce(nullif(left(btrim(coalesce(p_zip, '')), 5), ''),
                          substring(coalesce(p_city, '') from '(?:^|[^0-9a-zA-Z_])([0-9]{5})(?:$|[^0-9a-zA-Z_])'),
                          app.address_words(split_part(coalesce(p_city, ''), ',', 1))) as place) s;
$$;
revoke all on function app.address_key(text, text, text, text) from public, anon, authenticated;

-- every key of the company's cards that are not deleted and not merged: p (phone), e (email) of every person;
-- a (address) of every property of a live card (not archived). Closed — only the import functions call it.
create or replace function app.customer_keys(p_company uuid)
returns table (customer_id uuid, kind text, key text)
language sql stable security definer set search_path = '' as $$
  with cards as (
    select c.id, c.status from public.customers c
     where c.company_id = p_company and c.deleted_at is null and c.merged_into_customer_id is null
  ), people as (
    select k.id as contact_id, k.customer_id, k.phone, k.email from public.contacts k
      join cards on cards.id = k.customer_id
     where k.company_id = p_company and k.deleted_at is null
  )
  select customer_id, 'p', app.phone_key(phone) from people where app.phone_key(phone) is not null
  union
  select people.customer_id, 'p', app.phone_key(x.number) from public.contact_phones x join people on people.contact_id = x.contact_id
   where x.company_id = p_company and x.deleted_at is null and app.phone_key(x.number) is not null
  union
  select customer_id, 'e', app.email_key(email) from people where position('@' in coalesce(email, '')) > 1
  union
  select people.customer_id, 'e', app.email_key(x.address) from public.contact_emails x join people on people.contact_id = x.contact_id
   where x.company_id = p_company and x.deleted_at is null and app.email_key(x.address) is not null
  union
  select p.customer_id, 'a', app.address_key(p.address_line1, p.address_unit, p.address_city, p.address_zip)
    from public.properties p join cards on cards.id = p.customer_id and cards.status <> 'archived'
   where p.company_id = p_company and p.deleted_at is null
     and app.address_key(p.address_line1, p.address_unit, p.address_city, p.address_zip) is not null;
$$;
revoke all on function app.customer_keys(uuid) from public, anon, authenticated;

-- ---- 2. Jobs and rows -----------------------------------------------------------------------------
create table public.import_jobs (
  id              uuid primary key,                              -- made on the phone: a repeated start is the same job
  company_id      uuid not null references public.companies (id),
  target          text not null default 'customers' check (target in ('customers')),
  source_kind     text not null default 'csv' check (source_kind in ('csv')),
  file_name       text not null check (char_length(file_name) between 1 and 200),
  file_sha256     text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  total_rows      int not null check (total_rows between 1 and 5000),
  lead_source_id  uuid not null,
  status          text not null default 'applying' check (status in ('applying', 'applied', 'undone')),
  counts          jsonb not null default '{}',
  last_batch_at   timestamptz not null default now(),
  applied_at      timestamptz,
  undo_until      timestamptz,
  undone_at       timestamptz,
  undone_by       uuid references public.users (id),
  created_at timestamptz not null default now(), created_by uuid not null references public.users (id),
  unique (company_id, id),
  foreign key (company_id, lead_source_id) references public.lead_sources (company_id, id)
);
-- one open import per company (two phones, two taps): the second start is import_busy (§14.9 №4)
create unique index import_jobs_one_open_idx on public.import_jobs (company_id) where status = 'applying';
create index import_jobs_company_idx on public.import_jobs (company_id, created_at desc);
create index import_jobs_sha_idx on public.import_jobs (company_id, file_sha256);
create index import_jobs_source_idx on public.import_jobs (company_id, lead_source_id);
create index import_jobs_created_by_idx on public.import_jobs (created_by);
create index import_jobs_undone_by_idx on public.import_jobs (undone_by) where undone_by is not null;
create trigger t11_company_id_immutable before update on public.import_jobs
  for each row execute function app.tg_company_id_immutable();

create table public.import_rows (
  company_id     uuid not null references public.companies (id),
  job_id         uuid not null,
  line           int not null check (line between 2 and 5001),
  row_key        text not null check (row_key ~ '^[0-9a-f]{32}$'),
  name           text check (char_length(name) <= 200),          -- shown in «повтор строки N» of the same file
  result         text not null check (result in ('added', 'dup_added', 'skipped')),
  reason         text check (reason in ('noName', 'noContact', 'badPhone', 'badEmail', 'dupClient', 'dupFile')),
  customer_id    uuid,                                           -- the new card, or the one it matched
  created        boolean not null default false,                -- this row made customer_id (only these are undone)
  undone         boolean not null default false,
  created_at     timestamptz not null default now(),
  primary key (job_id, line),
  foreign key (company_id, job_id) references public.import_jobs (company_id, id),
  foreign key (company_id, customer_id) references public.customers (company_id, id),
  check (created = (result in ('added', 'dup_added'))),
  check ((result = 'skipped') = (reason is not null))
);
create index import_rows_company_job_idx on public.import_rows (company_id, job_id);
create index import_rows_customer_idx on public.import_rows (company_id, customer_id) where customer_id is not null;
create trigger t11_company_id_immutable before update on public.import_rows
  for each row execute function app.tg_company_id_immutable();

alter table public.import_jobs enable row level security;
alter table public.import_jobs force row level security;
alter table public.import_rows enable row level security;
alter table public.import_rows force row level security;
create policy import_jobs_select on public.import_jobs for select to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office']));
create policy import_rows_select on public.import_rows for select to authenticated
  using (app.has_role(company_id, array['owner', 'admin', 'office']));
revoke all on public.import_jobs from anon, authenticated;
revoke all on public.import_rows from anon, authenticated;
grant select on public.import_jobs to authenticated;
grant select on public.import_rows to authenticated;

-- ---- 3. Helpers -----------------------------------------------------------------------------------
-- a cell of a row: control and bidi characters out, trimmed; longer than 200 — import_too_big (the app cuts at 200)
create or replace function app.import_cell(p_row jsonb, p_key text)
returns text language plpgsql immutable set search_path = '' as $$
declare v text;
begin
  if jsonb_typeof(p_row -> p_key) not in ('string', 'null') and p_row ? p_key then
    raise exception 'import_bad_row' using errcode = 'P0001';
  end if;
  v := btrim(regexp_replace(coalesce(p_row ->> p_key, ''),
         '[[:cntrl:]' || chr(8206) || chr(8207) || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || chr(65279) || ']', '', 'g'));
  if char_length(v) > 200 then raise exception 'import_too_big' using errcode = 'P0001'; end if;
  return v;
end;
$$;
revoke all on function app.import_cell(jsonb, text) from public, anon, authenticated;

create or replace function app.import_counts(p_job uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'added', count(*) filter (where result = 'added'),
    'dup_added', count(*) filter (where result = 'dup_added'),
    'skipped', count(*) filter (where result = 'skipped'),
    'undone', count(*) filter (where undone),
    'kept', count(*) filter (where created and not undone and (select j.status from public.import_jobs j where j.id = p_job) = 'undone'))
    from public.import_rows where job_id = p_job;
$$;
-- the job state the app shows: status, rows received, the next line to send, counts
create or replace function app.import_state(p_job public.import_jobs)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p_job.id, 'status', p_job.status, 'total', p_job.total_rows,
           'received', (select count(*) from public.import_rows r where r.job_id = p_job.id),
           'next_line', coalesce((select max(r.line) from public.import_rows r where r.job_id = p_job.id), 1) + 1,
           'counts', app.import_counts(p_job.id), 'applied_at', p_job.applied_at, 'undo_until', p_job.undo_until,
           'undone_at', p_job.undone_at);
$$;

revoke all on function app.import_counts(uuid) from public, anon, authenticated;
revoke all on function app.import_state(public.import_jobs) from public, anon, authenticated;

-- an open import with no batch for a day closes itself with what it has (a phone lost in the middle never holds the company)
create or replace function app.import_close_stale(p_company uuid)
returns void language sql security definer set search_path = '' as $$
  update public.import_jobs set status = 'applied', applied_at = now(), undo_until = now() + interval '30 days',
         counts = app.import_counts(id)
   where company_id = p_company and status = 'applying' and last_batch_at < now() - interval '24 hours';
$$;
revoke all on function app.import_close_stale(uuid) from public, anon, authenticated;

-- ---- 4. Start -------------------------------------------------------------------------------------
create or replace function public.import_customers_start(p_company uuid, p_job uuid, p_file_name text, p_sha256 text,
                                                         p_total int, p_source uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.import_jobs; v_same timestamptz;
begin
  if auth.uid() is null or not app.has_role(p_company, array['owner', 'admin', 'office']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into j from public.import_jobs where id = p_job;
  if found then
    -- the same start again (the answer was lost): its state; somebody else's job — nothing about it
    if j.company_id <> p_company or j.created_by <> auth.uid() then raise exception 'not allowed' using errcode = '42501'; end if;
    return app.import_state(j);
  end if;
  if p_total is null or p_total < 1 or p_total > 5000 then raise exception 'import_too_big' using errcode = 'P0001'; end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or coalesce(char_length(btrim(p_file_name)), 0) not between 1 and 200 then
    raise exception 'import_bad_file' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.lead_sources s where s.id = p_source and s.company_id = p_company and s.deleted_at is null) then
    raise exception 'import_bad_source' using errcode = 'P0001';
  end if;
  perform app.import_close_stale(p_company);
  if (select count(*) from public.import_jobs where company_id = p_company and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'import_daily_limit' using errcode = 'P0001';
  end if;
  select max(applied_at) into v_same from public.import_jobs
   where company_id = p_company and file_sha256 = p_sha256 and status = 'applied';
  insert into public.import_jobs (id, company_id, file_name, file_sha256, total_rows, lead_source_id, created_by)
  values (p_job, p_company, btrim(p_file_name), p_sha256, p_total, p_source, auth.uid())
  on conflict do nothing;
  select * into j from public.import_jobs where id = p_job;
  if not found then raise exception 'import_busy' using errcode = 'P0001'; end if;
  if j.company_id <> p_company or j.created_by <> auth.uid() then raise exception 'not allowed' using errcode = '42501'; end if;
  return app.import_state(j) || jsonb_build_object('same_file_at', v_same);
end;
$$;
revoke all on function public.import_customers_start(uuid, uuid, text, text, int, uuid) from public, anon;
grant execute on function public.import_customers_start(uuid, uuid, text, text, int, uuid) to authenticated;

-- ---- 5. A batch -----------------------------------------------------------------------------------
-- p_rows: [{line, name, first_name, last_name, company, phone, email, address, city}], ≤ 250.
-- Returns [{line, result, reason, who, who_status, customer_id}] — the same order of reasons as classifyImportRow:
-- noName → badPhone → badEmail → noContact → dupClient → dupFile → added (only the address matched a live card — dup_added).
create or replace function public.import_customers(p_job uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j public.import_jobs;
  r jsonb; v_line int; v_key text; v_old public.import_rows;
  v_name text; v_first text; v_last text; v_comp text; v_phone text; v_email text; v_addr text; v_city text;
  v_digits text; v_pk text; v_ek text; v_ak text;
  v_reason text; v_result text; v_hit uuid; v_who text; v_status text; v_cust uuid; v_contact uuid;
  v_out jsonb := '[]';
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'import_bad_row' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_rows) > 250 then raise exception 'import_too_big' using errcode = 'P0001'; end if;
  select * into j from public.import_jobs where id = p_job for update;
  if not found or auth.uid() is null or j.created_by <> auth.uid()
     or not app.has_role(j.company_id, array['owner', 'admin', 'office']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if j.status <> 'applying' then raise exception 'import_closed' using errcode = 'P0001'; end if;

  -- the company's keys once per batch (+ the cards this batch adds, as it adds them)
  drop table if exists pg_temp.import_keys;
  create temp table import_keys on commit drop as select * from app.customer_keys(j.company_id);
  create index on pg_temp.import_keys (key);

  for r in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(r) <> 'object' or jsonb_typeof(r -> 'line') <> 'number' then raise exception 'import_bad_row' using errcode = 'P0001'; end if;
    v_line := (r ->> 'line')::numeric::int;
    if v_line < 2 or v_line > j.total_rows + 1 then raise exception 'import_bad_line' using errcode = 'P0001'; end if;
    v_name := app.import_cell(r, 'name'); v_first := app.import_cell(r, 'first_name'); v_last := app.import_cell(r, 'last_name');
    v_comp := app.import_cell(r, 'company'); v_phone := app.import_cell(r, 'phone'); v_email := app.import_cell(r, 'email');
    v_addr := app.import_cell(r, 'address'); v_city := app.import_cell(r, 'city');
    v_key := md5(concat_ws(chr(31), v_name, v_first, v_last, v_comp, v_phone, v_email, v_addr, v_city));

    select * into v_old from public.import_rows where job_id = j.id and line = v_line;
    if found then
      -- a repeat of a batch whose answer was lost: what is stored; the same line with other content — refused
      if v_old.row_key <> v_key then raise exception 'row_changed' using errcode = 'P0001'; end if;
      v_out := v_out || jsonb_build_object('line', v_line, 'result', v_old.result, 'reason', v_old.reason, 'customer_id', v_old.customer_id,
                         'who', (select c.display_name from public.customers c where c.id = v_old.customer_id and v_old.result <> 'added'));
      continue;
    end if;

    v_digits := regexp_replace(v_phone, '\D', '', 'g');
    v_pk := case when length(v_digits) = 10 or (length(v_digits) = 11 and left(v_digits, 1) = '1') then right(v_digits, 10) end;
    v_ek := app.email_key(v_email);
    v_reason := null; v_hit := null; v_who := null; v_status := null; v_cust := null;
    if v_name = '' then v_reason := 'noName';
    elsif v_digits <> '' and v_pk is null then v_reason := 'badPhone';
    elsif v_ek is not null and v_ek !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then v_reason := 'badEmail';
    elsif v_pk is null and v_ek is null then v_reason := 'noContact';
    else
      -- the oldest card with this phone or email
      select c.id, c.display_name, c.status into v_hit, v_who, v_status
        from pg_temp.import_keys k join public.customers c on c.id = k.customer_id
       where (k.kind = 'p' and k.key = v_pk) or (k.kind = 'e' and k.key = v_ek)
       order by c.created_at, c.id limit 1;
      if v_hit is not null then
        -- a card this same import made: a repeat of an earlier row of the file
        v_reason := case when exists (select 1 from public.import_rows x where x.job_id = j.id and x.customer_id = v_hit and x.created)
                         then 'dupFile' else 'dupClient' end;
        if v_reason = 'dupFile' then
          select x.name into v_who from public.import_rows x where x.job_id = j.id and x.customer_id = v_hit and x.created order by x.line limit 1;
          v_status := null;
        end if;
      end if;
    end if;

    if v_reason is not null then
      v_result := 'skipped';
      v_cust := v_hit;
    else
      v_ak := app.address_key(v_addr, null, v_city, null);
      v_hit := null;
      if v_ak is not null and (select count(distinct k.customer_id) from pg_temp.import_keys k where k.kind = 'a' and k.key = v_ak) between 1 and 5 then
        select c.id, c.display_name into v_hit, v_who from pg_temp.import_keys k join public.customers c on c.id = k.customer_id
         where k.kind = 'a' and k.key = v_ak order by c.created_at, c.id limit 1;
      end if;
      v_result := case when v_hit is null then 'added' else 'dup_added' end;
      -- the same rows as createCustomer in cloud/ops.ts, plus the parts of the name and the company
      insert into public.customers (company_id, display_name, first_name, last_name, company_name, lead_source_id, status)
      values (j.company_id, v_name, nullif(v_first, ''), nullif(v_last, ''), nullif(v_comp, ''), j.lead_source_id, 'active')
      returning id into v_cust;
      insert into public.contacts (company_id, customer_id, name, phone, email, is_primary)
      values (j.company_id, v_cust, v_name, nullif(v_phone, ''), v_ek, true)
      returning id into v_contact;
      update public.customers set primary_contact_id = v_contact where id = v_cust;
      insert into public.properties (company_id, customer_id, address_line1, address_city, stories)
      values (j.company_id, v_cust, coalesce(nullif(v_addr, ''), nullif(v_city, ''), '—'), coalesce(nullif(v_city, ''), '—'), 1);
      insert into pg_temp.import_keys (customer_id, kind, key)
      select v_cust, x.kind, x.key from (values ('p', v_pk), ('e', v_ek), ('a', v_ak)) x(kind, key) where x.key is not null;
    end if;

    insert into public.import_rows (company_id, job_id, line, row_key, name, result, reason, customer_id, created)
    values (j.company_id, j.id, v_line, v_key, nullif(left(v_name, 200), ''), v_result, v_reason, v_cust, v_result <> 'skipped');
    v_out := v_out || jsonb_build_object('line', v_line, 'result', v_result, 'reason', v_reason, 'customer_id', v_cust,
                       'who', case when v_result = 'added' then null else v_who end,
                       'who_status', case when v_status in ('archived', 'do_not_service') then v_status end);
  end loop;

  if (select count(*) from public.import_rows where job_id = j.id) > j.total_rows then
    raise exception 'import_too_big' using errcode = 'P0001';
  end if;
  update public.import_jobs set last_batch_at = now(), counts = app.import_counts(j.id) where id = j.id;
  return v_out;
end;
$$;
revoke all on function public.import_customers(uuid, jsonb) from public, anon;
grant execute on function public.import_customers(uuid, jsonb) to authenticated;

-- ---- 6. Finish ------------------------------------------------------------------------------------
-- the author, or the company's owner / admin (closes a phone's import left open); a repeat — the same state
create or replace function public.import_customers_finish(p_job uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.import_jobs;
begin
  select * into j from public.import_jobs where id = p_job for update;
  if not found or auth.uid() is null or not app.has_role(j.company_id, array['owner', 'admin', 'office'])
     or (j.created_by <> auth.uid() and not app.has_role(j.company_id, array['owner', 'admin'])) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if j.status = 'applying' then
    update public.import_jobs set status = 'applied', applied_at = now(), undo_until = now() + interval '30 days',
           counts = app.import_counts(id)
     where id = j.id returning * into j;
    -- one line for the import; no file name, no rows (a file name is often a person's name — §14.9 №10)
    insert into public.audit_log (company_id, actor_type, actor_id, entity_type, entity_id, action, after)
    values (j.company_id, 'user', auth.uid(), 'import_job', j.id, 'apply',
            jsonb_build_object('job_id', j.id, 'total', j.total_rows, 'counts', j.counts));
  end if;
  return app.import_state(j);
end;
$$;
revoke all on function public.import_customers_finish(uuid) from public, anon;
grant execute on function public.import_customers_finish(uuid) to authenticated;

-- ---- 7. Undo --------------------------------------------------------------------------------------
-- ≤ 30 days: the cards THIS import made (created) and nothing was added to since — deleted_at with their person and
-- property. A card with a lead, a document, money, a note, a task, a call, a tag, another person or property, a
-- change of its own, a merge — stays (kept). A matched card is never touched. A repeat — the same state.
create or replace function public.undo_customer_import(p_job uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.import_jobs; x record; c public.customers; v_now timestamptz := now();
begin
  select * into j from public.import_jobs where id = p_job for update;
  if not found or auth.uid() is null or not app.has_role(j.company_id, array['owner', 'admin', 'office']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if j.status = 'undone' then return app.import_state(j); end if;
  if j.status = 'applied' and j.undo_until < v_now then raise exception 'import_undo_expired' using errcode = 'P0001'; end if;
  for x in select r.line, r.customer_id from public.import_rows r where r.job_id = j.id and r.created and not r.undone order by r.line loop
    select * into c from public.customers where id = x.customer_id and company_id = j.company_id for update;
    if not found or c.deleted_at is not null then continue; end if;
    -- row_version: insert = 1, our primary_contact_id = 2; anything after that is somebody's change
    if c.row_version > 2 or c.status <> 'active' or c.merged_into_customer_id is not null
       or exists (select 1 from public.customers m where m.merged_into_customer_id = c.id)
       or (select count(*) from public.contacts k where k.customer_id = c.id) <> 1
       or exists (select 1 from public.contacts k where k.customer_id = c.id and k.row_version > 1)
       or (select count(*) from public.properties p where p.customer_id = c.id) <> 1
       or exists (select 1 from public.properties p where p.customer_id = c.id and p.row_version > 1)
       or exists (select 1 from public.contact_phones p join public.contacts k on k.id = p.contact_id where k.customer_id = c.id)
       or exists (select 1 from public.contact_emails e join public.contacts k on k.id = e.contact_id where k.customer_id = c.id)
       or exists (select 1 from public.leads l where l.customer_id = c.id or l.referred_by_customer_id = c.id)
       or exists (select 1 from public.estimates e where e.customer_id = c.id)
       or exists (select 1 from public.jobs w where w.customer_id = c.id)
       or exists (select 1 from public.invoices i where i.customer_id = c.id)
       or exists (select 1 from public.payments p where p.customer_id = c.id)
       or exists (select 1 from public.payment_attempts p where p.customer_id = c.id)
       or exists (select 1 from public.expenses e where e.customer_id = c.id)
       or exists (select 1 from public.files f where f.customer_id = c.id)
       or exists (select 1 from public.lead_sources s where s.customer_id = c.id)
       or exists (select 1 from public.customer_tags t where t.customer_id = c.id)
       or exists (select 1 from public.custom_field_values v where v.entity_id = c.id)
       or exists (select 1 from public.activities a where a.subject_type = 'customer' and a.subject_id = c.id and a.company_id = c.company_id)
       or exists (select 1 from public.notes n where n.subject_type = 'customer' and n.subject_id = c.id and n.company_id = c.company_id)
       or exists (select 1 from public.tasks t where t.subject_type = 'customer' and t.subject_id = c.id and t.company_id = c.company_id) then
      continue;
    end if;
    update public.properties set deleted_at = v_now where customer_id = c.id and deleted_at is null;
    update public.customers set primary_contact_id = null where id = c.id;
    update public.contacts set deleted_at = v_now, is_primary = false where customer_id = c.id and deleted_at is null;
    update public.customers set deleted_at = v_now where id = c.id;
    update public.import_rows set undone = true where job_id = j.id and line = x.line;
  end loop;
  update public.import_jobs set status = 'undone', undone_at = v_now, undone_by = auth.uid(),
         applied_at = coalesce(applied_at, v_now), counts = '{}' where id = j.id;
  update public.import_jobs set counts = app.import_counts(id) where id = j.id returning * into j;
  insert into public.audit_log (company_id, actor_type, actor_id, entity_type, entity_id, action, after)
  values (j.company_id, 'user', auth.uid(), 'import_job', j.id, 'undo', jsonb_build_object('job_id', j.id, 'counts', j.counts));
  return app.import_state(j);
end;
$$;
revoke all on function public.undo_customer_import(uuid) from public, anon;
grant execute on function public.undo_customer_import(uuid) to authenticated;
