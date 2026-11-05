-- =============================================================================
-- Тесты ядра: RLS, переходы статусов, номера документов, защита денег.
-- Обычный SQL (без pgTAP). Запуск: supabase/tests/run.sh
-- Порядок: auth_stub.sql → migrations/*.sql → этот файл.
-- Любая ошибка = провал (psql -v ON_ERROR_STOP=1).
-- =============================================================================
\set ON_ERROR_STOP 1
\if :{?verbose}
set client_min_messages = notice;     -- VERBOSE=1 run.sh: показать текст каждой ожидаемой ошибки
\else
set client_min_messages = warning;
\endif

-- Заглушка auth повторно (идемпотентна) — файл самодостаточен для чтения.
\ir auth_stub.sql

-- ---- Хелперы ------------------------------------------------------------------
drop schema if exists tst cascade;
create schema tst;
grant usage on schema tst to authenticated, anon;

create function tst.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FAILED: %', p_msg;
  end if;
end $$;

-- Число строк, которые видит текущая роль
create function tst.cnt(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') s' into n;
  return n;
end $$;

-- Оператор должен упасть с ошибкой
create function tst.fails(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'EXPECTED [%] % -> %', p_msg, sqlstate, sqlerrm;
    return;
  end;
  raise exception 'FAILED (expected error): % — %', p_msg, p_sql;
end $$;

-- Запись должна упасть ИЛИ не затронуть ни одной строки (RLS молча отфильтровала)
create function tst.blocked(p_sql text, p_msg text) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
  exception when others then
    raise notice 'BLOCKED-ERR [%] % -> %', p_msg, sqlstate, sqlerrm;
    return;
  end;
  raise notice 'BLOCKED-0ROWS [%] rows=%', p_msg, n;
  if n > 0 then
    raise exception 'FAILED (expected 0 rows / error, got % rows): % — %', n, p_msg, p_sql;
  end if;
end $$;

-- fixtures: the client link token as send_estimate would set it (the app cannot set it directly since E2a)
create function tst.set_expires(p_id uuid, p_date date) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.signing_estimate', p_id::text, true);
  update public.estimates set expires_at = p_date where id = p_id;
  perform set_config('app.signing_estimate', '', true);
end;
$$;
create function tst.set_token(p_id uuid, p_token text) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.signing_estimate', p_id::text, true);
  update public.estimates set public_token = p_token where id = p_id;
  perform set_config('app.signing_estimate', '', true);
end;
$$;
grant execute on all functions in schema tst to authenticated, anon;

-- ---- Переключение пользователя (как PostgREST: роль + sub из JWT) -------------
\set as_owner_a  'reset role; set request.jwt.claim.sub = ''a0000000-0000-0000-0000-000000000001''; set role authenticated;'
\set as_office_a 'reset role; set request.jwt.claim.sub = ''a0000000-0000-0000-0000-000000000002''; set role authenticated;'
\set as_tech_a   'reset role; set request.jwt.claim.sub = ''a0000000-0000-0000-0000-000000000003''; set role authenticated;'
\set as_tech2_a  'reset role; set request.jwt.claim.sub = ''a0000000-0000-0000-0000-000000000004''; set role authenticated;'
\set as_owner_b  'reset role; set request.jwt.claim.sub = ''b0000000-0000-0000-0000-000000000001''; set role authenticated;'
\set as_super    'reset role; reset request.jwt.claim.sub;'

-- =============================================================================
-- SEED
-- =============================================================================
:as_super
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'owner@a.test',  '{"full_name":"Owner A","locale":"ru"}'),
  ('a0000000-0000-0000-0000-000000000002', 'office@a.test', '{"full_name":"Dispatcher A"}'),
  ('a0000000-0000-0000-0000-000000000003', 'tech@a.test',   '{"full_name":"Mike Tech"}'),
  ('a0000000-0000-0000-0000-000000000004', 'tech2@a.test',  '{"full_name":"Luis Tech"}'),
  ('b0000000-0000-0000-0000-000000000001', 'owner@b.test',  '{"full_name":"Owner B"}');

do $$ begin
  perform tst.ok((select count(*) from public.users) = 5, 'auth.users trigger creates public.users');
  perform tst.ok((select locale from public.users where email = 'owner@a.test') = 'ru', 'locale from metadata');
end $$;

-- Компании создают их владельцы (онбординг): создатель автоматически owner
:as_owner_a
insert into public.companies (id, name) values ('ca000000-0000-0000-0000-000000000000', 'Bonpoc Gutters');
:as_owner_b
insert into public.companies (id, name) values ('cb000000-0000-0000-0000-000000000000', 'Rival Roofing');

:as_owner_a
do $$ begin
  perform tst.ok(tst.cnt($q$select 1 from public.memberships
                            where company_id = 'ca000000-0000-0000-0000-000000000000' and role = 'owner' and status = 'active'$q$) = 1,
                 'creator becomes active owner');
end $$;

insert into public.memberships (company_id, user_id, role, status) values
  ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'office', 'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'tech',   'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000004', 'tech',   'active');

insert into public.lead_sources (id, company_id, name, kind) values
  ('1a000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'Thumbtack (test)', 'marketplace');

insert into public.customers (id, company_id, display_name, lead_source_id) values
  ('c1a00000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'Yuri Petrov', '1a000000-0000-0000-0000-000000000001'),
  ('c1a00000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'Glendale HOA', null);
insert into public.contacts (company_id, customer_id, name, phone, is_primary) values
  ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'Yuri Petrov', '+13235550101', true);
insert into public.properties (id, company_id, customer_id, address_line1, address_city, stories) values
  ('d1a00000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', '1 Elm St', 'Pasadena', 2),
  ('d1a00000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000002', '9 Oak Ave', 'Glendale', 1);

insert into public.leads (company_id, source_id, contact_name, phone, cost_cents) values
  ('ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'Neighbor', '+13235550199', 4500);

-- номер, присланный клиентом, игнорируется
insert into public.jobs (id, company_id, number, title, customer_id, property_id, status) values
  ('e1a00000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'HACK-9', 'Seamless gutters', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'scheduled');
insert into public.jobs (id, company_id, title, customer_id, property_id, status) values
  ('e1a00000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'HOA cleaning', 'c1a00000-0000-0000-0000-000000000002', 'd1a00000-0000-0000-0000-000000000002', 'scheduled');

insert into public.visits (id, company_id, job_id, starts_at, ends_at) values
  ('f1a00000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e1a00000-0000-0000-0000-000000000001', now(), now() + interval '3 hours'),
  ('f1a00000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'e1a00000-0000-0000-0000-000000000002', now(), now() + interval '2 hours'),
  ('f1a00000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'e1a00000-0000-0000-0000-000000000001', now() + interval '1 day', null);
insert into public.visit_assignees (company_id, visit_id, user_id) values
  ('ca000000-0000-0000-0000-000000000000', 'f1a00000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003'),
  ('ca000000-0000-0000-0000-000000000000', 'f1a00000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003'),
  ('ca000000-0000-0000-0000-000000000000', 'f1a00000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004');

insert into public.estimates (id, company_id, number, customer_id, property_id, title) values
  ('0e1a0000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'EST-9999', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'Gutters 2 story'),
  ('0e1a0000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000000', null,       'c1a00000-0000-0000-0000-000000000002', 'd1a00000-0000-0000-0000-000000000002', 'HOA gutters');
insert into public.estimate_versions (id, company_id, estimate_id, version_no) values
  ('0e2a0000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000000', '0e1a0000-0000-0000-0000-000000000001', 1);
update public.estimates set current_version_id = '0e2a0000-0000-0000-0000-000000000001'
 where id = '0e1a0000-0000-0000-0000-000000000001';
insert into public.estimate_options (id, company_id, version_id, name, is_recommended) values
  ('0e3a0000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000000', '0e2a0000-0000-0000-0000-000000000001', 'Better', true);
insert into public.estimate_line_items (id, company_id, option_id, name, quantity, unit, unit_price_cents) values
  ('0e4a0000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000000', '0e3a0000-0000-0000-0000-000000000001', '6" K-style seamless', 148.5, 'ft', 1250);
insert into public.estimate_line_costs (line_item_id, company_id, unit_cost_cents) values
  ('0e4a0000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000000', 420);

insert into public.invoices (id, company_id, customer_id, job_id, kind, total_cents, paid_cents, payment_status) values
  ('01a00000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001',
   'e1a00000-0000-0000-0000-000000000001', 'final', 120000, 999999, 'paid');   -- paid_* от клиента игнорируются
update public.invoices set status = 'sent', sent_at = now() where id = '01a00000-0000-0000-0000-000000000001';

-- Компания B
:as_owner_b
insert into public.lead_sources (id, company_id, name, kind) values
  ('1b000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000000', 'Yelp (test)', 'marketplace');
insert into public.customers (id, company_id, display_name) values
  ('c1b00000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000000', 'B Customer');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
  ('d1b00000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000000', 'c1b00000-0000-0000-0000-000000000001', '5 Pine', 'Burbank');
insert into public.jobs (id, company_id, customer_id, property_id) values
  ('e1b00000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000000', 'c1b00000-0000-0000-0000-000000000001', 'd1b00000-0000-0000-0000-000000000001');
insert into public.estimates (id, company_id, customer_id, property_id) values
  ('0e1b0000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000000', 'c1b00000-0000-0000-0000-000000000001', 'd1b00000-0000-0000-0000-000000000001');
insert into public.invoices (id, company_id, customer_id, job_id, total_cents) values
  ('01b00000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000000', 'c1b00000-0000-0000-0000-000000000001', 'e1b00000-0000-0000-0000-000000000001', 5000);

\echo '-- seed ok'

-- =============================================================================
-- T1. Номера документов: присваивает сервер, отдельный счётчик на компанию
-- =============================================================================
:as_super
do $$ begin
  perform tst.ok((select number from public.estimates where id = '0e1a0000-0000-0000-0000-000000000001') = 'EST-0001', 'A EST-0001 (client value ignored)');
  perform tst.ok((select number from public.estimates where id = '0e1a0000-0000-0000-0000-000000000002') = 'EST-0002', 'A EST-0002');
  perform tst.ok((select number from public.estimates where id = '0e1b0000-0000-0000-0000-000000000001') = 'EST-0001', 'B EST-0001 (own counter)');
  perform tst.ok((select number from public.jobs where id = 'e1a00000-0000-0000-0000-000000000001') = 'JOB-0001', 'A JOB-0001 (client value ignored)');
  perform tst.ok((select number from public.jobs where id = 'e1a00000-0000-0000-0000-000000000002') = 'JOB-0002', 'A JOB-0002');
  perform tst.ok((select number from public.jobs where id = 'e1b00000-0000-0000-0000-000000000001') = 'JOB-0001', 'B JOB-0001');
  perform tst.ok((select number from public.invoices where id = '01a00000-0000-0000-0000-000000000001') = 'INV-0001', 'A INV-0001');
  perform tst.ok((select number from public.invoices where id = '01b00000-0000-0000-0000-000000000001') = 'INV-0001', 'B INV-0001');
  perform tst.ok((select paid_cents from public.invoices where id = '01a00000-0000-0000-0000-000000000001') = 0, 'paid_cents not settable by client');
  perform tst.ok((select payment_status from public.invoices where id = '01a00000-0000-0000-0000-000000000001') = 'unpaid', 'payment_status not settable by client');
end $$;
:as_owner_a
update public.estimates set number = 'EST-0777' where id = '0e1a0000-0000-0000-0000-000000000001';
do $$ begin
  perform tst.ok((select number from public.estimates where id = '0e1a0000-0000-0000-0000-000000000001') = 'EST-0001', 'number immutable');
  perform tst.ok((select row_version from public.estimates where id = '0e1a0000-0000-0000-0000-000000000001') = 3, 'row_version increments');
  perform tst.ok((select updated_by from public.estimates where id = '0e1a0000-0000-0000-0000-000000000001') = 'a0000000-0000-0000-0000-000000000001', 'updated_by from JWT');
  perform tst.ok((select line_total_cents from public.estimate_line_items where id = '0e4a0000-0000-0000-0000-000000000001') = 185625, 'line_total = round(148.5 * 1250)');
end $$;
\echo 'T1 numbering ok'

-- =============================================================================
-- T2. Изоляция компаний: B не видит и не меняет A
-- =============================================================================
:as_owner_b
do $$
declare a constant text := 'ca000000-0000-0000-0000-000000000000';
begin
  perform tst.ok(tst.cnt('select 1 from public.companies') = 1, 'B sees only own company');
  perform tst.ok(tst.cnt(format('select 1 from public.customers where company_id = %L', a)) = 0, 'B: 0 customers of A');
  perform tst.ok(tst.cnt(format('select 1 from public.contacts where company_id = %L', a)) = 0, 'B: 0 contacts of A');
  perform tst.ok(tst.cnt(format('select 1 from public.properties where company_id = %L', a)) = 0, 'B: 0 properties of A');
  perform tst.ok(tst.cnt(format('select 1 from public.leads where company_id = %L', a)) = 0, 'B: 0 leads of A');
  perform tst.ok(tst.cnt(format('select 1 from public.jobs where company_id = %L', a)) = 0, 'B: 0 jobs of A');
  perform tst.ok(tst.cnt(format('select 1 from public.visits where company_id = %L', a)) = 0, 'B: 0 visits of A');
  perform tst.ok(tst.cnt(format('select 1 from public.visit_assignees where company_id = %L', a)) = 0, 'B: 0 assignees of A');
  perform tst.ok(tst.cnt(format('select 1 from public.estimates where company_id = %L', a)) = 0, 'B: 0 estimates of A');
  perform tst.ok(tst.cnt(format('select 1 from public.estimate_versions where company_id = %L', a)) = 0, 'B: 0 versions of A');
  perform tst.ok(tst.cnt(format('select 1 from public.estimate_line_items where company_id = %L', a)) = 0, 'B: 0 lines of A');
  perform tst.ok(tst.cnt(format('select 1 from public.estimate_line_costs where company_id = %L', a)) = 0, 'B: 0 costs of A');
  perform tst.ok(tst.cnt(format('select 1 from public.invoices where company_id = %L', a)) = 0, 'B: 0 invoices of A');
  perform tst.ok(tst.cnt(format('select 1 from public.payments where company_id = %L', a)) = 0, 'B: 0 payments of A');
  perform tst.ok(tst.cnt(format('select 1 from public.memberships where company_id = %L', a)) = 0, 'B: 0 memberships of A');
  perform tst.ok(tst.cnt(format('select 1 from public.status_events where company_id = %L', a)) = 0, 'B: 0 status events of A');
  perform tst.ok(tst.cnt(format('select 1 from public.audit_log where company_id = %L', a)) = 0, 'B: 0 audit rows of A');
  perform tst.ok(tst.cnt(format('select 1 from public.customer_balances where company_id = %L', a)) = 0, 'B: 0 balances of A');
  perform tst.ok(tst.cnt('select 1 from public.users') = 1, 'B sees only own user');
  perform tst.ok(tst.cnt('select 1 from public.customers') = 1, 'B sees own customer');

  perform tst.blocked(format($q$update public.customers set display_name = 'pwned' where company_id = %L$q$, a), 'B updates A customer');
  perform tst.blocked(format($q$update public.companies set name = 'pwned' where id = %L$q$, a), 'B updates A company');
  perform tst.blocked(format($q$update public.visits set status = 'cancelled' where company_id = %L$q$, a), 'B updates A visits');
  perform tst.blocked(format($q$update public.invoices set total_cents = 1 where company_id = %L$q$, a), 'B updates A invoices');
  perform tst.fails(format($q$insert into public.customers (company_id, display_name) values (%L, 'x')$q$, a), 'B inserts customer into A');
  perform tst.fails(format($q$insert into public.memberships (company_id, user_id, role, status)
                              values (%L, 'b0000000-0000-0000-0000-000000000001', 'tech', 'active')$q$, a), 'B joins A');
  perform tst.fails(format($q$insert into public.invoices (company_id, customer_id, total_cents)
                              values (%L, 'c1a00000-0000-0000-0000-000000000001', 1)$q$, a), 'B inserts invoice into A');
  -- своя компания, но ссылка на объект A: составной FK не пускает
  perform tst.fails($q$insert into public.properties (company_id, customer_id, address_line1, address_city)
                       values ('cb000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'x', 'y')$q$,
                    'B links own property to A customer');
  perform tst.fails($q$insert into public.visit_assignees (company_id, visit_id, user_id)
                       values ('cb000000-0000-0000-0000-000000000000', 'f1a00000-0000-0000-0000-000000000001',
                               'b0000000-0000-0000-0000-000000000001')$q$, 'B attaches itself to A visit');
  perform tst.fails($q$insert into public.payments (company_id, customer_id, method, amount_cents, status, idempotency_key)
                       values ('cb000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001',
                               'cash', 100, 'succeeded', 'b-op-1')$q$, 'B pays against A customer');
  perform tst.fails($q$update public.customers set company_id = 'ca000000-0000-0000-0000-000000000000'
                       where id = 'c1b00000-0000-0000-0000-000000000001'$q$, 'B moves own row into A');
end $$;
:as_super
do $$ begin
  perform tst.ok((select display_name from public.customers where id = 'c1a00000-0000-0000-0000-000000000001') = 'Yuri Petrov', 'A customer unchanged');
  perform tst.ok((select name from public.companies where id = 'ca000000-0000-0000-0000-000000000000') = 'Bonpoc Gutters', 'A company unchanged');
end $$;
-- anon не видит ничего
reset role; set role anon;
do $$ begin
  perform tst.fails('select * from public.customers', 'anon reads customers');
  perform tst.fails('select * from public.invoices', 'anon reads invoices');
end $$;
\echo 'T2 cross-company isolation ok'

-- =============================================================================
-- T3. Мастер видит только свои визиты и связанные с ними работы/клиентов
-- =============================================================================
:as_tech_a
do $$ begin
  perform tst.ok(tst.cnt('select 1 from public.visits') = 2, 'tech sees 2 own visits');
  perform tst.ok(tst.cnt($q$select 1 from public.visits where id = 'f1a00000-0000-0000-0000-000000000002'$q$) = 0, 'tech does not see other tech visit');
  perform tst.ok(tst.cnt('select 1 from public.jobs') = 1, 'tech sees 1 job');
  perform tst.ok(tst.cnt('select 1 from public.customers') = 1, 'tech sees only customer of own job');
  perform tst.ok(tst.cnt('select 1 from public.contacts') = 1, 'tech sees contact of own customer');
  perform tst.ok(tst.cnt('select 1 from public.properties') = 1, 'tech sees 1 property');
  perform tst.ok(tst.cnt('select 1 from public.leads') = 0, 'tech sees no leads (cost_cents)');
  perform tst.ok(tst.cnt('select 1 from public.invoices') = 1, 'tech sees invoice of own job');
  perform tst.ok(tst.cnt('select 1 from public.estimates') = 1, 'tech sees estimate of own property');
  perform tst.ok(tst.cnt('select 1 from public.estimate_line_items') = 1, 'tech sees client lines');
  perform tst.ok(tst.cnt('select 1 from public.estimate_line_costs') = 0, 'tech does not see costs');
  perform tst.ok(tst.cnt('select 1 from public.audit_log') = 0, 'tech does not see audit log');
  perform tst.ok(tst.cnt('select 1 from public.memberships') = 4, 'tech sees team');

  perform tst.blocked($q$update public.visits set notes = 'x' where id = 'f1a00000-0000-0000-0000-000000000002'$q$, 'tech updates other visit');
  perform tst.blocked($q$update public.customers set display_name = 'x'$q$, 'tech updates customers');
  perform tst.fails($q$insert into public.visits (company_id, job_id) values ('ca000000-0000-0000-0000-000000000000', 'e1a00000-0000-0000-0000-000000000001')$q$, 'tech creates visit');
  perform tst.fails($q$insert into public.invoices (company_id, customer_id, job_id, total_cents)
                       values ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'e1a00000-0000-0000-0000-000000000001', 100)$q$, 'tech creates invoice');
  perform tst.fails($q$insert into public.visit_assignees (company_id, visit_id, user_id)
                       values ('ca000000-0000-0000-0000-000000000000', 'f1a00000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003')$q$, 'tech assigns self');
  perform tst.fails($q$insert into public.memberships (company_id, user_id, role, status)
                       values ('ca000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'tech', 'active')$q$, 'tech invites');
  -- черновик сметы: можно по своему объекту, нельзя по чужому, нельзя отправить
  insert into public.estimates (id, company_id, customer_id, property_id, title) values
    ('0e1a0000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'Tech draft');
  perform tst.fails($q$insert into public.estimates (company_id, customer_id, property_id)
                       values ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000002', 'd1a00000-0000-0000-0000-000000000002')$q$, 'tech estimate on foreign property');
  perform tst.blocked($q$update public.estimates set status = 'sent' where id = '0e1a0000-0000-0000-0000-000000000003'$q$, 'tech sends estimate');
end $$;
:as_tech2_a
do $$ begin
  perform tst.ok(tst.cnt('select 1 from public.visits') = 1, 'tech2 sees 1 own visit');
  perform tst.ok(tst.cnt('select 1 from public.customers') = 1, 'tech2 sees only own customer');
  perform tst.ok(tst.cnt('select 1 from public.invoices') = 0, 'tech2 sees no invoices of other jobs');
  perform tst.ok(tst.cnt('select 1 from public.estimates') = 1, 'tech2 sees estimate of own property only');
end $$;
:as_office_a
do $$ begin
  perform tst.ok(tst.cnt('select 1 from public.visits') = 3, 'office sees all visits');
  perform tst.ok(tst.cnt('select 1 from public.leads') = 1, 'office sees leads');
  perform tst.ok(tst.cnt('select 1 from public.estimate_line_costs') = 1, 'office sees costs');
  perform tst.ok(tst.cnt('select 1 from public.audit_log') = 0, 'office does not see audit log');
  perform tst.fails($q$insert into public.memberships (company_id, user_id, role, status)
                       values ('ca000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'tech', 'active')$q$, 'office invites');
end $$;
\echo 'T3 tech visibility ok'

-- =============================================================================
-- T4. Переходы визита (state machine) + StatusEvent + оплата на объекте
-- =============================================================================
:as_tech_a
do $$
declare v1 constant text := 'f1a00000-0000-0000-0000-000000000001';
begin
  perform tst.fails(format($q$update public.visits set status = 'completed' where id = %L$q$, v1), 'scheduled -> completed');
  perform tst.fails(format($q$update public.visits set status = 'bogus' where id = %L$q$, v1), 'unknown status');
  perform tst.fails(format($q$update public.visits set work_started_at = now() where id = %L$q$, v1), 'work before on_site');
  update public.visits set status = 'en_route' where id = v1::uuid;
  perform tst.fails(format($q$update public.visits set status = 'scheduled' where id = %L$q$, v1), 'en_route -> scheduled');
  update public.visits set status = 'on_site' where id = v1::uuid;
  perform tst.fails(format($q$update public.visits set status = 'en_route' where id = %L$q$, v1), 'on_site -> en_route');
  perform tst.fails(format($q$update public.visits set signed_at = now() where id = %L$q$, v1), 'signature before work');
  update public.visits set work_started_at = now() where id = v1::uuid;            -- app: working
  update public.visits set signed_at = now(), signature_file_id = gen_random_uuid() where id = v1::uuid;  -- app: signed
  perform tst.fails(format($q$update public.visits set signed_at = null where id = %L$q$, v1), 'un-sign');
  perform tst.fails(format($q$update public.visits set work_started_at = null where id = %L$q$, v1), 'un-start work');

  -- app: paid — мастер записывает оплату на своём визите
  insert into public.payments (company_id, invoice_id, customer_id, visit_id, method, amount_cents, status, idempotency_key, received_by, reference)
  values ('ca000000-0000-0000-0000-000000000000', '01a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001',
          v1::uuid, 'check', 50000, 'succeeded', 'dev1-op-0001', 'a0000000-0000-0000-0000-000000000003', 'CHK 1042');
  perform tst.fails($q$insert into public.payments (company_id, invoice_id, customer_id, visit_id, method, amount_cents, status, idempotency_key, received_by)
                       values ('ca000000-0000-0000-0000-000000000000', null, 'c1a00000-0000-0000-0000-000000000002',
                               'f1a00000-0000-0000-0000-000000000002', 'cash', 100, 'succeeded', 'dev1-op-0002', 'a0000000-0000-0000-0000-000000000003')$q$,
                    'tech payment on other tech visit');
  perform tst.fails($q$insert into public.payments (company_id, customer_id, visit_id, method, amount_cents, status, idempotency_key, received_by)
                       values ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000002',
                               'f1a00000-0000-0000-0000-000000000001', 'cash', 100, 'succeeded', 'dev1-op-0003', 'a0000000-0000-0000-0000-000000000003')$q$,
                    'tech payment for foreign customer');
  perform tst.fails($q$insert into public.payments (company_id, customer_id, visit_id, method, amount_cents, status, idempotency_key, received_by)
                       values ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001',
                               'f1a00000-0000-0000-0000-000000000003', 'cash', 100, 'succeeded', 'dev1-op-0004', 'a0000000-0000-0000-0000-000000000003')$q$,
                    'tech payment on visit not yet on site');
  -- повтор операции с тем же idempotency_key не создаёт дубль
  perform tst.fails($q$insert into public.payments (company_id, invoice_id, customer_id, visit_id, method, amount_cents, status, idempotency_key, received_by)
                       values ('ca000000-0000-0000-0000-000000000000', '01a00000-0000-0000-0000-000000000001', 'c1a00000-0000-0000-0000-000000000001',
                               'f1a00000-0000-0000-0000-000000000001', 'check', 50000, 'succeeded', 'dev1-op-0001', 'a0000000-0000-0000-0000-000000000003')$q$,
                    'duplicate idempotency_key');
  perform tst.ok(tst.cnt('select 1 from public.payments') = 1, 'tech sees own payment');

  update public.visits set status = 'completed' where id = v1::uuid;
  perform tst.fails(format($q$update public.visits set status = 'on_site' where id = %L$q$, v1), 'completed -> on_site');
  perform tst.fails(format($q$update public.visits set status = 'cancelled' where id = %L$q$, v1), 'completed -> cancelled');

  -- отменяет только офис (docs/specs/03 §4.1, П1a); мастер — нет
  perform tst.fails($q$update public.visits set status = 'cancelled' where id = 'f1a00000-0000-0000-0000-000000000003'$q$, 'tech cannot cancel a visit');
  perform tst.ok(tst.cnt(format($q$select 1 from public.status_events where entity_type = 'visit' and entity_id = %L$q$, v1)) = 4,
                 'status_events: created + en_route + on_site + completed (tech sees own)');
end $$;

:as_owner_a
-- отмена разрешена из открытого состояния; из отменённого — никуда
select public.cancel_visit('f1a00000-0000-0000-0000-000000000003', 'we_cancelled') is not null as cancelled_by_office;
select tst.fails($q$update public.visits set status = 'scheduled' where id = 'f1a00000-0000-0000-0000-000000000003'$q$, 'cancelled -> scheduled');
do $$ begin
  perform tst.ok((select paid_cents from public.invoices where id = '01a00000-0000-0000-0000-000000000001') = 50000, 'invoice paid_cents recalculated');
  perform tst.ok((select payment_status from public.invoices where id = '01a00000-0000-0000-0000-000000000001') = 'partially_paid', 'invoice partially_paid');
  perform tst.ok((select balance_cents from public.invoices where id = '01a00000-0000-0000-0000-000000000001') = 70000, 'invoice balance');
  perform tst.ok((select balance_cents from public.customer_balances where customer_id = 'c1a00000-0000-0000-0000-000000000001') = 70000, 'customer balance view');
  perform tst.ok((select receipt_number from public.payments where idempotency_key = 'dev1-op-0001') = 'RCT-0001', 'receipt number RCT-0001');
  perform tst.ok((select to_status from public.status_events
                   where entity_id = 'f1a00000-0000-0000-0000-000000000003' order by at desc, id desc limit 1) = 'cancelled', 'cancel logged');
  perform tst.ok((select actor_id from public.status_events
                   where entity_id = 'f1a00000-0000-0000-0000-000000000001' and to_status = 'on_site') = 'a0000000-0000-0000-0000-000000000003', 'actor recorded');
  -- другие машины состояний
  perform tst.fails($q$update public.jobs set status = 'closed' where id = 'e1a00000-0000-0000-0000-000000000002'$q$, 'job scheduled -> closed');
  update public.jobs set status = 'in_progress' where id = 'e1a00000-0000-0000-0000-000000000002';
  perform tst.fails($q$update public.estimates set status = 'approved' where id = '0e1a0000-0000-0000-0000-000000000002'$q$, 'estimate draft -> approved');
  -- lead new -> won: разрешено с волны 8 (ручной перевод в клиенты, won_via = manual) — см. T10
  update public.leads set status = 'inspection_scheduled' where true;
  perform tst.fails($q$update public.leads set status = 'lost' where true$q$, 'lead lost without reason');
  update public.leads set status = 'lost', lost_reason = 'price_too_high' where true;
  update public.leads set status = 'contacted' where true;
end $$;
\echo 'T4 visit state machine + on-site payment ok'

-- =============================================================================
-- T5. Деньги: инвойсы и платежи не удаляются; платёж — только void/refund
-- =============================================================================
:as_owner_a
do $$
declare inv constant text := '01a00000-0000-0000-0000-000000000001';
begin
  perform tst.fails(format('delete from public.invoices where id = %L', inv), 'owner deletes invoice');
  perform tst.fails(format('delete from public.payments where invoice_id = %L', inv), 'owner deletes payment');
  perform tst.fails(format('update public.invoices set deleted_at = now() where id = %L', inv), 'owner soft-deletes invoice');
  perform tst.fails(format('update public.payments set deleted_at = now() where invoice_id = %L', inv), 'owner soft-deletes payment');
  perform tst.fails(format('update public.payments set amount_cents = 1 where invoice_id = %L', inv), 'owner edits payment amount');
  perform tst.fails(format($q$update public.payments set method = 'cash' where invoice_id = %L$q$, inv), 'owner edits payment method');
  perform tst.fails(format($q$update public.invoices set status = 'void', void_reason = 'test' where id = %L$q$, inv), 'void invoice with payments');
end $$;

:as_office_a
do $$ begin
  perform tst.blocked($q$update public.payments set status = 'voided', void_reason = 'typo' where idempotency_key = 'dev1-op-0001'$q$, 'office voids payment');
  perform tst.fails($q$update public.invoices set status = 'void', void_reason = 'x' where id = '01a00000-0000-0000-0000-000000000001'$q$, 'office voids invoice');
  -- офис создаёт инвойс и принимает оплату
  insert into public.invoices (id, company_id, customer_id, job_id, kind, total_cents)
  values ('01a00000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000002',
          'e1a00000-0000-0000-0000-000000000002', 'deposit', 30000);
  perform tst.fails($q$insert into public.invoices (company_id, customer_id, job_id, kind, total_cents)
                       values ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000002',
                               'e1a00000-0000-0000-0000-000000000002', 'deposit', 1)$q$, 'second non-void deposit on job');
  perform tst.ok((select number from public.invoices where id = '01a00000-0000-0000-0000-000000000002') = 'INV-0002', 'A INV-0002');
end $$;

:as_owner_a
do $$ begin
  update public.payments set status = 'voided', void_reason = 'entered twice' where idempotency_key = 'dev1-op-0001';
  perform tst.ok((select voided_by from public.payments where idempotency_key = 'dev1-op-0001') = 'a0000000-0000-0000-0000-000000000001', 'voided_by');
  perform tst.ok((select paid_cents from public.invoices where id = '01a00000-0000-0000-0000-000000000001') = 0, 'void payment -> paid 0');
  perform tst.ok((select payment_status from public.invoices where id = '01a00000-0000-0000-0000-000000000001') = 'unpaid', 'void payment -> unpaid');
  perform tst.fails($q$update public.payments set status = 'succeeded' where idempotency_key = 'dev1-op-0001'$q$, 'voided -> succeeded');
  perform tst.fails($q$update public.invoices set status = 'void' where id = '01a00000-0000-0000-0000-000000000001'$q$, 'void without reason');
  update public.invoices set status = 'void', void_reason = 'customer cancelled' where id = '01a00000-0000-0000-0000-000000000001';
  perform tst.fails($q$update public.invoices set total_cents = 1 where id = '01a00000-0000-0000-0000-000000000001'$q$, 'edit void invoice');
  perform tst.fails($q$update public.invoices set status = 'sent' where id = '01a00000-0000-0000-0000-000000000001'$q$, 'void -> sent');
  perform tst.ok(tst.cnt($q$select 1 from public.audit_log where entity_type = 'payments'$q$) >= 2, 'payments audited');
  perform tst.ok(tst.cnt($q$select 1 from public.audit_log where entity_type = 'invoices' and after ->> 'status' = 'void'$q$) = 1, 'invoice void audited');
end $$;

-- даже суперпользователь / service_role не удаляет деньги и журналы
:as_super
do $$ begin
  perform tst.fails('delete from public.invoices', 'superuser deletes invoices');
  perform tst.fails('delete from public.payments', 'superuser deletes payments');
  perform tst.fails('delete from public.status_events', 'superuser deletes status_events');
  perform tst.fails('update public.audit_log set action = $x$x$x$', 'superuser edits audit_log');
  perform tst.ok((select count(*) from public.invoices) = 3, 'invoices intact');
  perform tst.ok((select count(*) from public.payments) = 1, 'payments intact');
end $$;
\echo 'T5 money safety ok'

-- =============================================================================
-- T6. Отправленная версия сметы неизменяема; доступ к ролям
-- =============================================================================
:as_owner_a
do $$ begin
  perform tst.fails($q$insert into public.estimate_line_items (company_id, option_id, name, unit_price_cents, client_visible)
                       values ('ca000000-0000-0000-0000-000000000000', '0e3a0000-0000-0000-0000-000000000001', 'BOM', 100, false)$q$, 'BOM line with price');
  update public.estimate_versions set locked_at = now(), sent_at = now() where id = '0e2a0000-0000-0000-0000-000000000001';
  perform tst.fails($q$update public.estimate_versions set intro_text = 'changed' where id = '0e2a0000-0000-0000-0000-000000000001'$q$, 'edit locked version');
  perform tst.fails($q$update public.estimate_line_items set unit_price_cents = 1 where id = '0e4a0000-0000-0000-0000-000000000001'$q$, 'edit line of locked version');
  perform tst.fails($q$delete from public.estimate_line_items where id = '0e4a0000-0000-0000-0000-000000000001'$q$, 'delete line of locked version');
  perform tst.fails($q$insert into public.estimate_line_items (company_id, option_id, name, unit_price_cents)
                       values ('ca000000-0000-0000-0000-000000000000', '0e3a0000-0000-0000-0000-000000000001', 'Extra', 100)$q$, 'add line to locked version');
  update public.estimates set status = 'sent', sent_version_id = '0e2a0000-0000-0000-0000-000000000001' where id = '0e1a0000-0000-0000-0000-000000000001';
  -- approved only when an employee signs for the company (docs/specs/07 §4, S8b): a direct update is refused
  perform tst.fails($q$update public.estimates set status = 'approved' where id = '0e1a0000-0000-0000-0000-000000000001'$q$, 'direct approve without the company signature');
  -- admin/owner: роль owner может выдать только owner; свою роль менять нельзя
  perform tst.fails($q$update public.memberships set role = 'admin' where user_id = 'a0000000-0000-0000-0000-000000000001'$q$, 'owner changes own role');
  update public.memberships set role = 'admin' where user_id = 'a0000000-0000-0000-0000-000000000002';
end $$;
:as_super
-- fixture for the tests below (as a signing function would: definer role + this estimate marked)
select set_config('app.signing_estimate', '0e1a0000-0000-0000-0000-000000000001', false);
update public.estimates set status = 'approved' where id = '0e1a0000-0000-0000-0000-000000000001';
select set_config('app.signing_estimate', '', false);
:as_office_a   -- теперь admin
do $$ begin
  perform tst.fails($q$update public.memberships set role = 'owner' where user_id = 'a0000000-0000-0000-0000-000000000003'$q$, 'admin grants owner');
  perform tst.fails($q$update public.memberships set status = 'suspended' where user_id = 'a0000000-0000-0000-0000-000000000001'$q$, 'admin suspends owner');
  update public.memberships set status = 'suspended' where user_id = 'a0000000-0000-0000-0000-000000000004';
end $$;
:as_tech2_a    -- отключён: не видит ничего
do $$ begin
  perform tst.ok(tst.cnt('select 1 from public.visits') = 0, 'suspended member sees no visits');
  perform tst.ok(tst.cnt('select 1 from public.customers') = 0, 'suspended member sees no customers');
end $$;
\echo 'T6 estimate lock + roles ok'

-- ---------------------------------------------------------------- T7: app fields
:as_owner_a
do $$ begin
  perform tst.ok(tst.cnt($q$select 1 from public.lead_sources where company_id = 'ca000000-0000-0000-0000-000000000000' and is_system$q$) = 10,
                 'new company gets 10 standard lead sources');
  insert into public.expenses (company_id, vendor, amount_cents, category)
  values ('ca000000-0000-0000-0000-000000000000', 'Home Depot', 21240, 'materials');
end $$;
:as_owner_b
do $$ begin
  perform tst.ok(tst.cnt('select 1 from public.expenses') = 0, 'company B does not see company A expenses');
end $$;
:as_tech_a
do $$ begin
  perform tst.ok(tst.cnt('select 1 from public.expenses') = 0, 'tech does not see expenses of others');
  insert into public.expenses (company_id, vendor, amount_cents, category)
  values ('ca000000-0000-0000-0000-000000000000', 'Chevron', 7850, 'fuel');
  perform tst.ok(tst.cnt('select 1 from public.expenses') = 1, 'tech sees own expense');
end $$;
\echo 'T7 expenses, files, seeded sources ok'

-- ---------------------------------------------------------------- T8: universal estimate, catalog, client page
:as_owner_a
do $$ begin
  insert into public.catalog_items (company_id, kind, name, unit, unit_price_cents, unit_cost_cents, vendor_tax_bps, markup_bps, is_placeholder_price)
  values ('ca000000-0000-0000-0000-000000000000', 'material', 'Railing bracket (test)', 'ea', 1213, 1000, 1025, 1000, true);
  insert into public.estimates (id, company_id, number, customer_id, property_id, title) values
    ('0e1a0000-0000-0000-0000-000000000010', 'ca000000-0000-0000-0000-000000000000', '', 'c1a00000-0000-0000-0000-000000000001',
     'd1a00000-0000-0000-0000-000000000001', 'Handyman visit');
  perform tst.set_token('0e1a0000-0000-0000-0000-000000000010', 'tok_test_0123456789abcdef');
  insert into public.estimate_versions (id, company_id, estimate_id, version_no, tax_enabled, tax_rate_bps, deposit_rule, calc_inputs) values
    ('0e2a0000-0000-0000-0000-000000000010', 'ca000000-0000-0000-0000-000000000000', '0e1a0000-0000-0000-0000-000000000010', 1,
     true, 950, '{"kind":"pct","bps":1000}', '{"options":[]}');
  update public.estimates set current_version_id = '0e2a0000-0000-0000-0000-000000000010' where id = '0e1a0000-0000-0000-0000-000000000010';
  insert into public.estimate_options (id, company_id, version_id, name, is_recommended, discount_mode, discount_value) values
    ('0e3a0000-0000-0000-0000-000000000010', 'ca000000-0000-0000-0000-000000000000', '0e2a0000-0000-0000-0000-000000000010', 'Standard', true, 'fixed', 1000);
  insert into public.estimate_line_items (id, company_id, option_id, line_group, name, quantity, unit_price_cents, taxable, is_optional) values
    ('0e4a0000-0000-0000-0000-000000000011', 'ca000000-0000-0000-0000-000000000000', '0e3a0000-0000-0000-0000-000000000010', 'labor', 'Install railing', 1, 25000, false, false),
    ('0e4a0000-0000-0000-0000-000000000012', 'ca000000-0000-0000-0000-000000000000', '0e3a0000-0000-0000-0000-000000000010', 'material', 'Bracket', 12, 1213, true, false),
    ('0e4a0000-0000-0000-0000-000000000013', 'ca000000-0000-0000-0000-000000000000', '0e3a0000-0000-0000-0000-000000000010', 'service', 'Deep clean', 1, 9000, false, true);
  update public.estimate_versions set locked_at = now(), sent_at = now() where id = '0e2a0000-0000-0000-0000-000000000010';
  update public.estimates set status = 'sent', sent_version_id = '0e2a0000-0000-0000-0000-000000000010' where id = '0e1a0000-0000-0000-0000-000000000010';
  -- сотрудник открывает ссылку — статус не меняется
  perform tst.ok((public.portal_estimate('tok_test_0123456789abcdef') ->> 'status') = 'sent', 'member preview keeps status sent');
end $$;
:as_tech_a
do $$ begin
  perform tst.ok(tst.cnt('select 1 from public.catalog_items') = 1, 'tech reads catalog');
  perform tst.fails($q$insert into public.catalog_items (company_id, kind, name) values ('ca000000-0000-0000-0000-000000000000', 'labor', 'x')$q$, 'tech edits catalog');
end $$;
:as_owner_b
do $$ begin
  perform tst.ok(tst.cnt('select 1 from public.catalog_items') = 0, 'company B does not see A catalog');
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
do $$
declare r jsonb;
begin
  perform tst.fails('select 1 from public.estimates', 'anon reads estimates table');
  perform tst.fails('select 1 from public.catalog_items', 'anon reads catalog');
  perform tst.ok(public.portal_estimate('no-such-token-000000000') is null, 'unknown token → null');
  r := public.portal_estimate('tok_test_0123456789abcdef');
  perform tst.ok(r ->> 'status' = 'viewed', 'client view: sent → viewed');
  perform tst.ok(r -> 'customer' ->> 'name' = 'Yuri Petrov', 'portal shows customer');
  perform tst.ok(r::text not like '%cost%', 'portal has no cost fields');
  perform tst.fails($q$select public.portal_accept('tok_test_0123456789abcdef', '0e3a0000-0000-0000-0000-000000000010', null, 'Yuri', 'M0 0', false)$q$, 'accept without consent');
  perform tst.fails($q$select public.portal_accept('tok_test_0123456789abcdef', '0e3a0000-0000-0000-0000-000000000001', null, 'Yuri', 'M0 0', true)$q$, 'accept foreign option');
  perform tst.fails($q$select public.portal_accept('tok_test_0123456789abcdef', '0e3a0000-0000-0000-0000-000000000010', null, 'Yuri', 'M0 0', true, 'on_site')$q$, 'anon on-site');
  -- 25000 + 12×1213 = 39556; +addon 9000 = 48556; discount 1000 → taxable share round(1000×14556/48556)=300;
  -- tax round((14556−300)×9.5%) = 1354; total 48556 − 1000 + 1354 = 48910; deposit 10% = 4891
  r := public.portal_accept('tok_test_0123456789abcdef', '0e3a0000-0000-0000-0000-000000000010',
                            array['0e4a0000-0000-0000-0000-000000000013']::uuid[], 'Yuri Petrov', 'M0 0 L10 10', true);
  perform tst.ok(r ->> 'status' = 'awaiting_countersign', 'client signed: awaiting the company (S8, docs/specs/07 §4)');
  perform tst.ok((r -> 'approval' -> 'selection' ->> 'total')::bigint = 48910, 'server total with add-on, discount and tax');
  perform tst.ok((r -> 'approval' -> 'selection' ->> 'deposit')::bigint = 4891, 'server deposit 10%');
  r := public.portal_accept('tok_test_0123456789abcdef', '0e3a0000-0000-0000-0000-000000000010', null, 'Yuri Petrov', 'M0 0', true);
  perform tst.ok(r ->> 'status' = 'awaiting_countersign', 'repeat accept is idempotent');
end $$;
reset role;
do $$ begin
  perform tst.ok((select count(*) from public.jobs where estimate_id = '0e1a0000-0000-0000-0000-000000000010') = 0, 'no job before the company signs');
end $$;
:as_owner_a
select public.countersign_estimate('0e1a0000-0000-0000-0000-000000000010', 'M0 0 L3 3') = 'approved' as countersigned;
reset role;
do $$ begin
  perform tst.ok((select count(*) from public.estimate_approvals where estimate_id = '0e1a0000-0000-0000-0000-000000000010' and party = 'customer') = 1, 'one client approval');
  perform tst.ok((select status from public.jobs where estimate_id = '0e1a0000-0000-0000-0000-000000000010') = 'draft', 'job waits for a date');
  perform tst.ok((select contract_total_cents from public.jobs where estimate_id = '0e1a0000-0000-0000-0000-000000000010') = 48910, 'job total');
  perform tst.ok((select count(*) from public.visits v join public.jobs j on j.id = v.job_id
                   where j.estimate_id = '0e1a0000-0000-0000-0000-000000000010') = 0, 'no automatic visit: contractor schedules');
  perform tst.ok((select count(*) from public.notifications where estimate_id = '0e1a0000-0000-0000-0000-000000000010') = 3, 'viewed + client signed + approved notifications');
end $$;
:as_tech_a
do $$ begin
  perform tst.ok(tst.cnt('select 1 from public.notifications') = 0, 'tech sees no notifications');
end $$;
:as_owner_a
do $$ begin
  perform tst.ok(tst.cnt('select 1 from public.notifications') = 3, 'owner sees notifications');
end $$;
\echo 'T8 universal estimate, catalog, client page ok'

-- ---------------------------------------------------------------- T9: company profile, licenses, people, EIN, notes
:as_owner_a
do $$ begin
  update public.companies set dba = 'A-Team Handyman', website = 'https://example.com', trades = array['handyman', 'plumbing']
   where id = 'ca000000-0000-0000-0000-000000000000';
  insert into public.company_secrets (company_id, ein) values ('ca000000-0000-0000-0000-000000000000', '12-3456789');
  insert into public.company_licenses (company_id, kind, number, classes) values ('ca000000-0000-0000-0000-000000000000', 'cslb', '1234567', array['B']);
  perform tst.fails($q$insert into public.company_licenses (company_id, kind, number) values ('ca000000-0000-0000-0000-000000000000', 'cslb', ' 1234567 ')$q$, 'duplicate license');
  insert into public.company_contacts (company_id, name, title, phone, is_primary) values ('ca000000-0000-0000-0000-000000000000', 'Alex', 'Owner', '+13235550100', true);
  perform tst.fails($q$insert into public.company_contacts (company_id, name, is_primary) values ('ca000000-0000-0000-0000-000000000000', 'Bob', true)$q$, 'two primary contacts');
  insert into public.notes (company_id, subject_type, subject_id, body, visibility) values
    ('ca000000-0000-0000-0000-000000000000', 'customer', 'c1a00000-0000-0000-0000-000000000001', 'Gate code 1234', 'team'),
    ('ca000000-0000-0000-0000-000000000000', 'customer', 'c1a00000-0000-0000-0000-000000000001', 'Owner only: tough negotiator', 'private');
  update public.customers set status = 'prospect' where id = 'c1a00000-0000-0000-0000-000000000002';
  perform tst.ok((public.portal_estimate('tok_test_0123456789abcdef') -> 'company' ->> 'name') = 'A-Team Handyman', 'portal shows DBA');
  perform tst.ok(jsonb_array_length(public.portal_estimate('tok_test_0123456789abcdef') -> 'company' -> 'licenses') = 1, 'portal shows license');
  perform tst.ok((public.portal_estimate('tok_test_0123456789abcdef'))::text not like '%3456789%', 'portal has no EIN');
end $$;
:as_tech_a
do $$ begin
  perform tst.ok(tst.cnt('select 1 from public.company_secrets') = 0, 'tech does not see EIN');
  perform tst.ok(tst.cnt('select 1 from public.company_licenses') = 1, 'tech sees licenses');
  perform tst.ok(tst.cnt('select 1 from public.notes') = 1, 'tech sees team note only');
  perform tst.blocked($q$update public.company_licenses set number = '999' where company_id = 'ca000000-0000-0000-0000-000000000000'$q$, 'tech edits license');
  perform tst.fails($q$insert into public.company_contacts (company_id, name) values ('ca000000-0000-0000-0000-000000000000', 'X')$q$, 'tech adds company contact');
end $$;
:as_owner_b
do $$ begin
  perform tst.ok(tst.cnt('select 1 from public.company_licenses') = 0, 'company B does not see A licenses');
  perform tst.ok(tst.cnt('select 1 from public.notes') = 0, 'company B does not see A notes');
end $$;
\echo 'T9 company profile, licenses, people, EIN, notes ok'

-- ---------------------------------------------------------------- T10: lead → estimate → client
:as_owner_a
do $$
declare v_lead uuid;
begin
  insert into public.leads (company_id, source_id, contact_name, phone) values
    ('ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'Lead to client', '+13235550177') returning id into v_lead;
  insert into public.customers (id, company_id, display_name, status) values
    ('c1a00000-0000-0000-0000-000000000077', 'ca000000-0000-0000-0000-000000000000', 'Lead to client', 'prospect');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
    ('d1a00000-0000-0000-0000-000000000077', 'ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000077', '7 Pine St', 'Pasadena');
  update public.leads set customer_id = 'c1a00000-0000-0000-0000-000000000077', property_id = 'd1a00000-0000-0000-0000-000000000077', status = 'estimate_sent' where id = v_lead;
  insert into public.estimates (id, company_id, number, customer_id, property_id, lead_id, title) values
    ('0e1a0000-0000-0000-0000-000000000077', 'ca000000-0000-0000-0000-000000000000', '', 'c1a00000-0000-0000-0000-000000000077',
     'd1a00000-0000-0000-0000-000000000077', v_lead, 'From lead');
  perform tst.set_token('0e1a0000-0000-0000-0000-000000000077', 'tok_lead_0123456789abcdef');
  insert into public.estimate_versions (id, company_id, estimate_id, version_no, deposit_rule) values
    ('0e2a0000-0000-0000-0000-000000000077', 'ca000000-0000-0000-0000-000000000000', '0e1a0000-0000-0000-0000-000000000077', 1, '{"kind":"none"}');
  update public.estimates set current_version_id = '0e2a0000-0000-0000-0000-000000000077' where id = '0e1a0000-0000-0000-0000-000000000077';
  insert into public.estimate_options (id, company_id, version_id, name) values
    ('0e3a0000-0000-0000-0000-000000000077', 'ca000000-0000-0000-0000-000000000000', '0e2a0000-0000-0000-0000-000000000077', 'Standard');
  insert into public.estimate_line_items (company_id, option_id, line_group, name, quantity, unit_price_cents, taxable) values
    ('ca000000-0000-0000-0000-000000000000', '0e3a0000-0000-0000-0000-000000000077', 'labor', 'Fix door', 1, 15000, false);
  update public.estimate_versions set locked_at = now(), sent_at = now() where id = '0e2a0000-0000-0000-0000-000000000077';
  update public.estimates set status = 'sent', sent_version_id = '0e2a0000-0000-0000-0000-000000000077' where id = '0e1a0000-0000-0000-0000-000000000077';
  -- manual conversion from an open status is allowed now
  insert into public.leads (company_id, source_id, contact_name, phone, status) values
    ('ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'Paper contract', '+13235550178', 'contacted') returning id into v_lead;
  update public.leads set status = 'won', won_via = 'manual' where id = v_lead;
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
select public.portal_accept('tok_lead_0123456789abcdef', '0e3a0000-0000-0000-0000-000000000077', null, 'Lead Person', 'M0 0 L5 5', true);
reset role;
do $$ begin
  perform tst.ok((select status from public.leads where contact_name = 'Lead to client') = 'estimate_sent', 'client signed: the lead is not won yet (both must sign)');
end $$;
:as_owner_a
select public.countersign_estimate('0e1a0000-0000-0000-0000-000000000077', 'M0 0 L3 3') = 'approved' as countersigned;
reset role;
do $$ begin
  perform tst.ok((select status || '/' || won_via from public.leads where contact_name = 'Lead to client') = 'won/approval', 'signature: lead won via approval');
  perform tst.ok((select status from public.customers where id = 'c1a00000-0000-0000-0000-000000000077') = 'active', 'prospect became active client');
  perform tst.ok((select won_via from public.leads where contact_name = 'Paper contract') = 'manual', 'manual conversion recorded');
  perform tst.fails($q$update public.leads set status = 'new' where contact_name = 'Paper contract'$q$, 'won lead cannot go back to new');
end $$;
\echo 'T10 lead → estimate → client ok'

-- ---------------------------------------------------------------- T11: contract → invoices → receipts
reset role;
do $$
declare v_job uuid; v_inv uuid; v_fin uuid; v_rct text;
begin
  -- T8 estimate had a 10% deposit: the deposit invoice must exist only if signed after this migration;
  -- sign a fresh estimate with a deposit
  insert into public.estimates (id, company_id, number, customer_id, property_id, title) values
    ('0e1a0000-0000-0000-0000-000000000088', 'ca000000-0000-0000-0000-000000000000', '', 'c1a00000-0000-0000-0000-000000000001',
     'd1a00000-0000-0000-0000-000000000001', 'Bathroom');
  perform tst.set_token('0e1a0000-0000-0000-0000-000000000088', 'tok_inv_0123456789abcdef');
  insert into public.estimate_versions (id, company_id, estimate_id, version_no, deposit_rule) values
    ('0e2a0000-0000-0000-0000-000000000088', 'ca000000-0000-0000-0000-000000000000', '0e1a0000-0000-0000-0000-000000000088', 1, '{"kind":"pct","bps":1000}');
  update public.estimates set current_version_id = '0e2a0000-0000-0000-0000-000000000088' where id = '0e1a0000-0000-0000-0000-000000000088';
  insert into public.estimate_options (id, company_id, version_id, name) values
    ('0e3a0000-0000-0000-0000-000000000088', 'ca000000-0000-0000-0000-000000000000', '0e2a0000-0000-0000-0000-000000000088', 'Standard');
  insert into public.estimate_line_items (company_id, option_id, line_group, name, quantity, unit_price_cents, taxable) values
    ('ca000000-0000-0000-0000-000000000000', '0e3a0000-0000-0000-0000-000000000088', 'labor', 'Remodel', 1, 340000, false);
  update public.estimate_versions set locked_at = now(), sent_at = now() where id = '0e2a0000-0000-0000-0000-000000000088';
  update public.estimates set status = 'sent', sent_version_id = '0e2a0000-0000-0000-0000-000000000088' where id = '0e1a0000-0000-0000-0000-000000000088';
end $$;
set role anon;
select public.portal_accept('tok_inv_0123456789abcdef', '0e3a0000-0000-0000-0000-000000000088', null, 'Client', 'M0 0 L5 5', true) is not null as signed;
reset role;
:as_owner_a
select public.countersign_estimate('0e1a0000-0000-0000-0000-000000000088', 'M0 0 L3 3') = 'approved' as countersigned;
reset role;
:as_owner_a
do $$
declare v_job uuid; v_inv uuid; v_fin uuid;
begin
  select id into v_job from public.jobs where estimate_id = '0e1a0000-0000-0000-0000-000000000088';
  select id into v_inv from public.invoices where job_id = v_job and kind = 'deposit';
  perform tst.ok(v_inv is not null, 'deposit invoice created at signing');
  perform tst.ok((select total_cents from public.invoices where id = v_inv) = 34000, 'deposit invoice = 10% of $3,400');
  perform tst.ok((select status from public.invoices where id = v_inv) = 'sent', 'deposit invoice is sent');
  perform tst.ok((select number from public.invoices where id = v_inv) like 'INV-%', 'invoice number from server');
  -- partial payment → receipt number, partially paid
  insert into public.payments (company_id, invoice_id, customer_id, method, amount_cents, status, idempotency_key)
  values ('ca000000-0000-0000-0000-000000000000', v_inv, 'c1a00000-0000-0000-0000-000000000001', 'zelle', 10000, 'succeeded', 't11-p1');
  perform tst.ok((select payment_status from public.invoices where id = v_inv) = 'partially_paid', 'partially paid');
  perform tst.ok((select receipt_number from public.payments where idempotency_key = 't11-p1') like 'RCT-%', 'receipt number on payment');
  insert into public.payments (company_id, invoice_id, customer_id, method, amount_cents, status, idempotency_key)
  values ('ca000000-0000-0000-0000-000000000000', v_inv, 'c1a00000-0000-0000-0000-000000000001', 'cash', 24000, 'succeeded', 't11-p2');
  perform tst.ok((select payment_status from public.invoices where id = v_inv) = 'paid', 'deposit paid in two parts');
  perform tst.fails($q$update public.payments set amount_cents = 1 where idempotency_key = 't11-p2'$q$, 'payment amount immutable');
  -- final balance invoice; a second final invoice for the job is refused
  insert into public.invoices (company_id, number, customer_id, job_id, kind, status, title, subtotal_cents, total_cents)
  values ('ca000000-0000-0000-0000-000000000000', '', 'c1a00000-0000-0000-0000-000000000001', v_job, 'final', 'sent', 'Final balance', 306000, 306000)
  returning id into v_fin;
  perform tst.fails(format($q$insert into public.invoices (company_id, number, customer_id, job_id, kind, status, subtotal_cents, total_cents)
                     values ('ca000000-0000-0000-0000-000000000000', '', 'c1a00000-0000-0000-0000-000000000001', %L, 'final', 'sent', 1, 1)$q$, v_job), 'second final invoice');
end $$;
\echo 'T11 contract → invoices → receipts ok'

-- ---------------------------------------------------------------- T12: simulated card payment on the client page
reset role; reset request.jwt.claim.sub; set role anon;
do $$
declare r jsonb; v_inv uuid;
begin
  r := public.portal_estimate('tok_inv_0123456789abcdef');
  perform tst.ok(jsonb_array_length(r -> 'invoices') = 2, 'client page lists the job invoices');
  select (x ->> 'id')::uuid into v_inv from jsonb_array_elements(r -> 'invoices') x where x ->> 'kind' = 'final';
  r := public.portal_pay_simulated('tok_inv_0123456789abcdef', v_inv);
  perform tst.ok((select (x ->> 'paid')::bigint from jsonb_array_elements(r -> 'invoices') x where x ->> 'kind' = 'final') = 306000, 'final invoice paid by simulated card');
  -- paying again does nothing (balance 0)
  r := public.portal_pay_simulated('tok_inv_0123456789abcdef', v_inv);
  perform tst.fails($q$select public.portal_pay_simulated('tok_lead_0123456789abcdef', '00000000-0000-0000-0000-000000000000')$q$, 'foreign invoice');
end $$;
reset role;
do $$ begin
  perform tst.ok((select count(*) from public.payments where reference = 'stripe-simulated') = 1, 'one simulated payment');
  perform tst.ok((select receipt_number from public.payments where reference = 'stripe-simulated') like 'RCT-%', 'simulated payment has a receipt');
end $$;
\echo 'T12 simulated card payment ok'

-- ---------------------------------------------------------------- T13: no overpayment on the server
:as_owner_a
do $$
declare v_fin uuid;
begin
  select i.id into v_fin from public.invoices i join public.jobs j on j.id = i.job_id
   where j.estimate_id = '0e1a0000-0000-0000-0000-000000000088' and i.kind = 'deposit';
  perform tst.fails(format($q$insert into public.payments (company_id, invoice_id, customer_id, method, amount_cents, status, idempotency_key)
                     values ('ca000000-0000-0000-0000-000000000000', %L, 'c1a00000-0000-0000-0000-000000000001', 'cash', 1, 'succeeded', 't13-over')$q$, v_fin),
                    'payment on a fully paid invoice');
end $$;
\echo 'T13 no overpayment ok'

-- ---------------------------------------------------------------- T14: full lead (sources, declined, contacts, tasks, activities, cost)
:as_owner_a
do $$
declare v_src uuid; v_person uuid; v_lead uuid; v_lead2 uuid;
begin
  perform tst.ok((select count(*) from public.lead_sources where company_id = 'ca000000-0000-0000-0000-000000000000' and kind = 'marketplace') >= 3, 'standard marketplaces seeded');
  -- custom source: a person
  insert into public.lead_sources (company_id, name, kind, phone) values ('ca000000-0000-0000-0000-000000000000', 'Kolya (contractor)', 'person', '(818) 555-0101') returning id into v_person;
  perform tst.fails($q$insert into public.lead_sources (company_id, name, kind) values ('ca000000-0000-0000-0000-000000000000', 'X', 'paid_per_lead')$q$, 'old source kind refused');
  insert into public.leads (company_id, source_id, contact_name, phone, address_line1, address_city, timeframe, budget_cents)
  values ('ca000000-0000-0000-0000-000000000000', v_person, 'Neighbor Joe', '(818) 555-0177', '12 Elm St', 'Glendale', 'this_week', 50000) returning id into v_lead;
  -- the source with a lead cannot be deleted, only hidden
  perform tst.fails(format($q$update public.lead_sources set deleted_at = now() where id = %L$q$, v_person), 'source with leads cannot be deleted');
  update public.lead_sources set is_active = false where id = v_person;
  -- first outgoing call: first response time + new → contacted (server)
  insert into public.activities (company_id, subject_type, subject_id, kind, direction) values ('ca000000-0000-0000-0000-000000000000', 'lead', v_lead, 'call', 'out');
  perform tst.ok((select status from public.leads where id = v_lead) = 'contacted', 'first call moves new → contacted');
  perform tst.ok((select first_response_at is not null and first_response_kind = 'call' from public.leads where id = v_lead), 'first response recorded');
  -- extra contact, task, cost
  insert into public.lead_contacts (company_id, lead_id, name, role, phone) values ('ca000000-0000-0000-0000-000000000000', v_lead, 'Mary Joe', 'spouse', '(818) 555-0178');
  insert into public.tasks (company_id, subject_type, subject_id, title, due_at, assignee_id)
  values ('ca000000-0000-0000-0000-000000000000', 'lead', v_lead, 'Call back', now() + interval '1 day', 'a0000000-0000-0000-0000-000000000001');
  insert into public.lead_costs (lead_id, company_id, cost_cents) values (v_lead, 'ca000000-0000-0000-0000-000000000000', 4500);
  -- declined needs a contractor reason; lost needs a client reason; "other" needs text
  perform tst.fails(format($q$update public.leads set status = 'declined', lost_reason = 'no_response' where id = %L$q$, v_lead), 'declined with a client reason');
  perform tst.fails(format($q$update public.leads set status = 'declined', lost_reason = 'other' where id = %L$q$, v_lead), 'other without text');
  update public.leads set status = 'declined', lost_reason = 'not_profitable' where id = v_lead;
  update public.leads set status = 'contacted', lost_reason = null where id = v_lead;     -- back to work
  perform tst.fails(format($q$update public.leads set status = 'lost', lost_reason = 'junk_spam' where id = %L$q$, v_lead), 'lost with a contractor reason');
  update public.leads set status = 'lost', lost_reason = 'chose_competitor' where id = v_lead;
  -- a lead assigned to tech A
  insert into public.leads (company_id, source_id, contact_name, phone, assigned_to)
  values ('ca000000-0000-0000-0000-000000000000', v_person, 'For tech', '(818) 555-0179', 'a0000000-0000-0000-0000-000000000003') returning id into v_lead2;
  insert into public.lead_costs (lead_id, company_id, cost_cents) values (v_lead2, 'ca000000-0000-0000-0000-000000000000', 3000);
end $$;
-- tech A: sees only own / assigned leads, never the cost
:as_tech_a
do $$
declare v_mine uuid;
begin
  perform tst.ok((select count(*) from public.leads where contact_name = 'For tech') = 1, 'tech sees the lead assigned to him');
  perform tst.ok((select count(*) from public.leads where contact_name = 'Neighbor Joe') = 0, 'tech does not see other leads');
  perform tst.ok((select count(*) from public.lead_costs) = 0, 'tech never sees lead cost');
  perform tst.fails($q$insert into public.lead_costs (lead_id, company_id, cost_cents) select id, company_id, 1 from public.leads where contact_name = 'For tech'$q$, 'tech cannot set cost');
  -- lead from a neighbor on site: tech creates it and keeps seeing it
  insert into public.leads (company_id, source_id, contact_name, phone)
  select 'ca000000-0000-0000-0000-000000000000', id, 'Neighbor of job', '(818) 555-0180' from public.lead_sources where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'Referral'
  returning id into v_mine;
  perform tst.ok((select count(*) from public.leads where id = v_mine) = 1, 'tech sees the lead he created');
  insert into public.activities (company_id, subject_type, subject_id, kind, direction) values ('ca000000-0000-0000-0000-000000000000', 'lead', v_mine, 'sms', 'out');
end $$;
:as_tech2_a
do $$ begin
  perform tst.ok((select count(*) from public.leads where contact_name in ('For tech', 'Neighbor of job')) = 0, 'another tech sees neither');
  perform tst.ok((select count(*) from public.activities where subject_type = 'lead') = 0, 'nor their activities');
end $$;
:as_owner_b
do $$ begin
  perform tst.ok((select count(*) from public.lead_sources where name = 'Kolya (contractor)') = 0, 'sources isolated between companies');
  perform tst.ok((select count(*) from public.tasks) = 0, 'tasks isolated');
  perform tst.ok((select count(*) from public.lead_costs) = 0, 'costs isolated');
end $$;
\echo 'T14 full lead ok'

-- ---------------------------------------------------------------- T15: leads L1 (number, interest, snooze, call attempts)
:as_owner_a
do $$
declare v_src uuid; v_a uuid; v_b uuid; n_a text; n_b text;
begin
  select id into v_src from public.lead_sources where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'Referral';
  insert into public.leads (company_id, source_id, contact_name, phone) values ('ca000000-0000-0000-0000-000000000000', v_src, 'Number one', '(818) 555-0190') returning id, number into v_a, n_a;
  insert into public.leads (company_id, source_id, contact_name, phone, number) values ('ca000000-0000-0000-0000-000000000000', v_src, 'Number two', '(818) 555-0191', 'LEA-9999') returning id, number into v_b, n_b;
  perform tst.ok(n_a ~ '^LEA-\d{4,}$', 'lead gets a server number LEA-0001');
  perform tst.ok(n_b <> 'LEA-9999' and n_b > n_a, 'the client cannot pick the number; numbers grow');
  update public.leads set number = 'LEA-0000' where id = v_a;
  perform tst.ok((select number from public.leads where id = v_a) = n_a, 'the number never changes');
  perform tst.ok((select count(*) from public.leads where company_id = 'ca000000-0000-0000-0000-000000000000' and number is null) = 0, 'every lead has a number (old ones numbered by the migration)');
  -- interest: only hot / warm / cold
  update public.leads set interest = 'hot' where id = v_a;
  perform tst.fails(format($q$update public.leads set interest = 'boiling' where id = %L$q$, v_a), 'unknown interest refused');
  -- unanswered calls count up; a real conversation resets them
  insert into public.activities (company_id, subject_type, subject_id, kind, direction, meta) values ('ca000000-0000-0000-0000-000000000000', 'lead', v_b, 'call', 'out', '{"outcome":"no_answer"}');
  insert into public.activities (company_id, subject_type, subject_id, kind, direction, meta) values ('ca000000-0000-0000-0000-000000000000', 'lead', v_b, 'call', 'out', '{"outcome":"voicemail"}');
  perform tst.ok((select status = 'new' and first_response_at is null and call_attempts = 2 and last_outbound_at is not null from public.leads where id = v_b), 'unanswered calls: attempts, the reply timer keeps running');
  insert into public.activities (company_id, subject_type, subject_id, kind, direction, meta) values ('ca000000-0000-0000-0000-000000000000', 'lead', v_b, 'call', 'out', '{"outcome":"answered"}');
  perform tst.ok((select status = 'contacted' and first_response_at is not null and call_attempts = 0 from public.leads where id = v_b), 'answered call: contacted, attempts reset');
  update public.leads set call_attempts = call_attempts + 1 where id = v_a;
  update public.leads set call_attempts = call_attempts + 1 where id = v_a;
  perform tst.ok((select call_attempts from public.leads where id = v_a) = 2, 'two unanswered calls');
  perform tst.fails(format($q$update public.leads set call_attempts = -1 where id = %L$q$, v_a), 'negative attempts refused');
  insert into public.activities (company_id, subject_type, subject_id, kind, direction) values ('ca000000-0000-0000-0000-000000000000', 'lead', v_a, 'call', 'out');
  perform tst.ok((select call_attempts = 0 and status = 'contacted' from public.leads where id = v_a), 'answered call (old activity, no outcome) resets the attempts');
  -- attempts after the first answer are reset again by the next real contact (not only the first one)
  insert into public.activities (company_id, subject_type, subject_id, kind, direction, meta) values ('ca000000-0000-0000-0000-000000000000', 'lead', v_a, 'call', 'out', '{"outcome":"no_answer"}');
  perform tst.ok((select call_attempts from public.leads where id = v_a) = 1, 'missed call after contact counts');
  insert into public.activities (company_id, subject_type, subject_id, kind, direction) values ('ca000000-0000-0000-0000-000000000000', 'lead', v_a, 'sms', 'out');
  perform tst.ok((select call_attempts from public.leads where id = v_a) = 0, 'any real contact resets the attempts, like the app');
  -- snooze keeps the funnel status; closing the lead clears the snooze
  update public.leads set snoozed_until = now() + interval '90 days', snooze_reason = 'call in spring' where id = v_a;
  perform tst.ok((select status from public.leads where id = v_a) = 'contacted', 'snooze is not a status');
  update public.leads set status = 'lost', lost_reason = 'not_ready_timing' where id = v_a;
  perform tst.ok((select snoozed_until is null and snooze_reason is null from public.leads where id = v_a), 'closed lead is not snoozed');
  -- lead settings live on the company
  update public.companies set lead_settings = '{"replyWarnMin": 10}'::jsonb where id = 'ca000000-0000-0000-0000-000000000000';
end $$;
:as_owner_b
do $$ declare v_src uuid; n text;
begin
  select id into v_src from public.lead_sources where company_id = 'cb000000-0000-0000-0000-000000000000' limit 1;
  insert into public.leads (company_id, source_id, contact_name, phone) values ('cb000000-0000-0000-0000-000000000000', v_src, 'B first', '(818) 555-0192') returning number into n;
  perform tst.ok(n = 'LEA-0001', 'each company has its own lead counter');
  perform tst.ok((select count(*) from public.leads where contact_name = 'Number one') = 0, 'leads isolated');
end $$;
\echo 'T15 leads L1 ok'

-- ---------------------------------------------------------------- T16: clients C1 (number, people phones/emails, tags)
:as_owner_a
do $$
declare v_c uuid; v_c2 uuid; n1 text; n2 text; v_p uuid; v_tag uuid; v_tag2 uuid;
begin
  insert into public.customers (company_id, display_name, number) values ('ca000000-0000-0000-0000-000000000000', 'Client numbered', 'CLT-9999') returning id, number into v_c, n1;
  insert into public.customers (company_id, display_name) values ('ca000000-0000-0000-0000-000000000000', 'Client numbered 2') returning id, number into v_c2, n2;
  perform tst.ok(n1 ~ '^CLT-\d{4,}$' and n1 <> 'CLT-9999', 'client gets a server number CLT-0001; the app cannot pick it');
  perform tst.ok(n2 > n1, 'client numbers grow');
  update public.customers set number = 'CLT-0000' where id = v_c;
  perform tst.ok((select number from public.customers where id = v_c) = n1, 'the client number never changes');
  perform tst.ok((select count(*) from public.customers where company_id = 'ca000000-0000-0000-0000-000000000000' and number is null) = 0, 'every client has a number (old ones numbered by the migration)');
  -- a person with two phones and an email; one primary of each
  insert into public.contacts (company_id, customer_id, name, role, is_primary) values ('ca000000-0000-0000-0000-000000000000', v_c, 'Anna Cee', 'main', true) returning id into v_p;
  insert into public.contact_phones (company_id, contact_id, number, label, is_primary) values ('ca000000-0000-0000-0000-000000000000', v_p, '(818) 555-0101', 'mobile', true);
  insert into public.contact_phones (company_id, contact_id, number, label) values ('ca000000-0000-0000-0000-000000000000', v_p, '(818) 555-0102', 'work');
  insert into public.contact_emails (company_id, contact_id, address, is_primary) values ('ca000000-0000-0000-0000-000000000000', v_p, 'anna@example.com', true);
  perform tst.ok((select count(*) from public.contact_phones where contact_id = v_p) = 2, 'two phones on one person');
  perform tst.fails(format($q$insert into public.contact_phones (company_id, contact_id, number, is_primary) values ('ca000000-0000-0000-0000-000000000000', %L, '(818) 555-0103', true)$q$, v_p), 'only one primary phone per person');
  perform tst.fails(format($q$insert into public.contact_phones (company_id, contact_id, number, label) values ('ca000000-0000-0000-0000-000000000000', %L, '1', 'fax')$q$, v_p), 'unknown phone label refused');
  perform tst.fails(format($q$insert into public.contact_emails (company_id, contact_id, address) values ('ca000000-0000-0000-0000-000000000000', %L, 'not-an-email')$q$, v_p), 'email without @ refused');
  perform tst.fails(format($q$insert into public.contacts (company_id, customer_id, name, role) values ('ca000000-0000-0000-0000-000000000000', %L, 'X', 'cousin')$q$, v_c), 'unknown person role refused');
  insert into public.contacts (company_id, customer_id, name, role) values ('ca000000-0000-0000-0000-000000000000', v_c, 'Bob Cee', 'assistant');
  -- tags: default list seeded; set on the client; no duplicates by name
  perform tst.ok((select count(*) from public.tags where company_id = 'ca000000-0000-0000-0000-000000000000' and is_system) = 4, 'four default tags');
  select id into v_tag from public.tags where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'VIP';
  insert into public.tags (company_id, name) values ('ca000000-0000-0000-0000-000000000000', 'Pool owner') returning id into v_tag2;
  perform tst.fails($q$insert into public.tags (company_id, name) values ('ca000000-0000-0000-0000-000000000000', 'vip')$q$, 'tag names are unique (any case)');
  insert into public.customer_tags (company_id, customer_id, tag_id) values ('ca000000-0000-0000-0000-000000000000', v_c, v_tag), ('ca000000-0000-0000-0000-000000000000', v_c, v_tag2);
  perform tst.ok((select count(*) from public.customer_tags where customer_id = v_c) = 2, 'client has two tags');
  delete from public.customer_tags where customer_id = v_c and tag_id = v_tag2;
  perform tst.ok((select count(*) from public.customer_tags where customer_id = v_c) = 1, 'tag removed from the client');
  update public.tags set is_active = false where id = v_tag2;
end $$;
-- one-transaction writes (RPC), deleted rows, system and hidden tags
:as_owner_a
do $$
declare v_c uuid; v_p uuid; v_tc uuid; v_tp uuid; v_vip uuid; v_off uuid; v_q uuid := 'a1600000-0000-4000-8000-000000000001';
begin
  select id into v_c from public.customers where display_name = 'Client numbered';
  select id into v_vip from public.tags where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'VIP';
  select id into v_off from public.tags where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'Pool owner';
  -- people saved in one call: Anna (2 phones) stays main, Bob removed, Quinn added
  perform public.save_customer_people(v_c, jsonb_build_array(
    jsonb_build_object('id', (select id from public.contacts where customer_id = v_c and name = 'Anna Cee'), 'name', 'Anna Cee', 'role', 'main',
      'phones', jsonb_build_array(jsonb_build_object('number', '(818) 555-0111', 'label', 'mobile', 'primary', true), jsonb_build_object('number', '(818) 555-0112', 'label', 'home')),
      'emails', jsonb_build_array(jsonb_build_object('address', 'anna@example.com', 'primary', true))),
    jsonb_build_object('id', v_q, 'name', 'Quinn Cee', 'role', 'tenant', 'phones', jsonb_build_array(jsonb_build_object('number', '(818) 555-0113', 'label', 'mobile', 'primary', true)), 'emails', '[]'::jsonb)));
  perform tst.ok((select count(*) from public.contacts where customer_id = v_c and deleted_at is null) = 2, 'people replaced: Bob removed, Quinn added');
  perform tst.ok((select name from public.contacts where id = (select primary_contact_id from public.customers where id = v_c)) = 'Anna Cee', 'first person is the main one');
  perform tst.ok((select phone from public.contacts where name = 'Anna Cee' and customer_id = v_c) = '(818) 555-0111', 'contact keeps the main phone for search');
  perform tst.ok((select count(*) from public.contact_phones p join public.contacts c on c.id = p.contact_id where c.customer_id = v_c and p.deleted_at is null) = 3, 'live phones: 2 + 1; old ones soft-deleted');
  perform tst.ok((select count(*) from public.contact_phones p join public.contacts c on c.id = p.contact_id where c.name = 'Bob Cee' and p.deleted_at is null) = 0, 'removed person has no live phones');
  -- a refused email rolls the whole call back: nothing lost
  perform tst.fails(format($q$select public.save_customer_people(%L, '[{"id":"%s","name":"Quinn Cee","role":"tenant","phones":[],"emails":[{"address":"bad"}]}]'::jsonb)$q$, v_c, v_q), 'invalid email refused');
  perform tst.ok((select count(*) from public.contact_phones p join public.contacts c on c.id = p.contact_id where c.customer_id = v_c and p.deleted_at is null) = 3, 'refused save changed nothing');
  -- a person of another client cannot be taken over
  select id into v_tc from public.customers where display_name = 'Client numbered 2';
  perform tst.fails(format($q$select public.save_customer_people(%L, '[{"id":"%s","name":"Thief","role":"main","phones":[],"emails":[]}]'::jsonb)$q$, v_tc, v_q), 'person of another client refused');
  -- tags in one call; hidden tag cannot be put on a client; standard tag keeps its name
  perform public.set_customer_tags(v_c, array[v_vip, v_vip]);
  perform tst.ok((select count(*) from public.customer_tags where customer_id = v_c) = 1, 'tags set in one call (duplicates folded)');
  perform tst.fails(format($q$select public.set_customer_tags(%L, array[%L]::uuid[])$q$, v_c, v_off), 'hidden tag refused');
  perform tst.ok((select count(*) from public.customer_tags where customer_id = v_c) = 1, 'refused tags changed nothing');
  perform tst.fails(format($q$update public.tags set name = 'Very important' where id = %L$q$, v_vip), 'standard tag keeps its name');
  perform tst.fails($q$insert into public.tags (company_id, name, is_system) values ('ca000000-0000-0000-0000-000000000000', 'Fake system', true)$q$, 'nobody makes a system tag by hand');
  perform tst.fails(format($q$insert into public.customer_tags (company_id, customer_id, tag_id, created_by) values ('ca000000-0000-0000-0000-000000000000', %L, %L, 'a0000000-0000-0000-0000-000000000003')$q$, v_c, v_vip), 'author of a client tag cannot be faked');
  -- the tech's own client: a live and a deleted phone
  select distinct j.customer_id into v_tc from public.jobs j join public.visits v on v.job_id = j.id join public.visit_assignees a on a.visit_id = v.id
   where a.user_id = 'a0000000-0000-0000-0000-000000000003' and j.company_id = 'ca000000-0000-0000-0000-000000000000' limit 1;
  select id into v_tp from public.contacts where customer_id = v_tc and deleted_at is null limit 1;
  insert into public.contact_phones (company_id, contact_id, number, label) values ('ca000000-0000-0000-0000-000000000000', v_tp, 'LIVE-1', 'mobile');
  insert into public.contact_phones (company_id, contact_id, number, label, deleted_at) values ('ca000000-0000-0000-0000-000000000000', v_tp, 'DELETED-OLD', 'mobile', now());
end $$;
-- tech: sees live phones only of clients of own visits, cannot write phones or tags
:as_tech_a
do $$ begin
  perform tst.ok(tst.cnt($q$select 1 from public.contact_phones where number = 'LIVE-1'$q$) = 1, 'tech sees the phone of own client');
  perform tst.ok(tst.cnt($q$select 1 from public.contact_phones where number = 'DELETED-OLD'$q$) = 0, 'tech does not see a deleted phone');
  perform tst.ok(tst.cnt($q$select 1 from public.contact_phones where number = '(818) 555-0111'$q$) = 0, 'tech does not see phones of other clients');
  perform tst.ok(tst.cnt('select 1 from public.tags') >= 4, 'tech reads the tag list');
  perform tst.fails($q$insert into public.tags (company_id, name) values ('ca000000-0000-0000-0000-000000000000', 'Tech tag')$q$, 'tech cannot add tags');
  perform tst.fails($q$insert into public.contact_phones (company_id, contact_id, number) select company_id, contact_id, 'X' from public.contact_phones where number = 'LIVE-1'$q$, 'tech cannot add phones');
  perform tst.fails($q$select public.set_customer_tags((select id from public.customers limit 1), '{}')$q$, 'tech cannot set client tags');
  perform tst.ok(tst.cnt($q$select 1 from public.customer_tags ct join public.customers c on c.id = ct.customer_id where c.display_name = 'Client numbered'$q$) = 0, 'tech does not see tags of other clients');
end $$;
:as_owner_b
do $$ declare n text;
begin
  insert into public.customers (company_id, display_name) values ('cb000000-0000-0000-0000-000000000000', 'B client') returning number into n;
  perform tst.ok(n ~ '^CLT-\d{4,}$', 'company B numbers its own clients');
  perform tst.ok((select count(*) from public.contact_phones where number = '(818) 555-0101') = 0, 'phones isolated between companies');
  perform tst.ok((select count(*) from public.tags where name = 'Pool owner') = 0, 'tags isolated between companies');
  perform tst.ok((select count(*) from public.tags where company_id = 'cb000000-0000-0000-0000-000000000000') = 4, 'company B has its own default tags');
  perform tst.ok((select count(*) from public.contact_emails where address = 'anna@example.com') = 0, 'emails isolated between companies');
  perform tst.ok((select count(*) from public.customer_tags) = 0, 'client tags isolated between companies');
  perform tst.fails($q$insert into public.contact_phones (company_id, contact_id, number) select 'cb000000-0000-0000-0000-000000000000', id, 'X' from public.contacts where false union all select 'cb000000-0000-0000-0000-000000000000', 'ca000000-0000-0000-0000-0000000000ff'::uuid, 'X'$q$, 'company B cannot add a phone to a contact it cannot see');
end $$;
\echo 'T16 clients C1 ok'

-- ---------------------------------------------------------------- T17: lead people (L2 part 2), people move to the client (S3)
:as_owner_a
do $$
declare v_src uuid; v_l uuid; v_l2 uuid; v_main uuid; v_pat uuid := 'a1700000-0000-4000-8000-000000000001'; v_c text;
begin
  select id into v_src from public.lead_sources where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'Referral';
  insert into public.leads (company_id, source_id, contact_name, phone, phone2, phone2_label, email)
  values ('ca000000-0000-0000-0000-000000000000', v_src, 'People Lead', '(818) 555-0601', '(818) 555-0602', 'work', 'people@example.com') returning id into v_l;
  select id into v_main from public.contacts where lead_id = v_l and customer_id is null and is_primary and deleted_at is null;
  perform tst.ok(v_main is not null, 'a new lead gets its main person');
  perform tst.ok((select count(*) from public.contact_phones where contact_id = v_main and deleted_at is null) = 2, 'main person has both phones of the lead');
  perform tst.ok((select count(*) from public.contact_emails where contact_id = v_main and is_primary) = 1, 'main person has the lead email');
  update public.leads set contact_name = 'People Lead Renamed' where id = v_l;
  perform tst.ok((select name from public.contacts where id = v_main) = 'People Lead Renamed', 'renaming the lead renames its main person');
  -- all people in one call: main (2 phones, the second primary), spouse Pat
  perform public.save_lead_people(v_l, jsonb_build_array(
    jsonb_build_object('id', v_main, 'name', 'ignored', 'role', 'main',
      'phones', jsonb_build_array(jsonb_build_object('number', '(818) 555-0611', 'label', 'home'), jsonb_build_object('number', '(818) 555-0612', 'label', 'mobile', 'primary', true)),
      'emails', '[]'::jsonb),
    jsonb_build_object('id', v_pat, 'name', 'Pat People', 'role', 'spouse',
      'phones', jsonb_build_array(jsonb_build_object('number', '(818) 555-0613', 'label', 'mobile', 'primary', true)), 'emails', '[]'::jsonb)));
  perform tst.ok((select count(*) from public.contacts where lead_id = v_l and customer_id is null and deleted_at is null) = 2, 'lead has two people');
  perform tst.ok((select name from public.contacts where id = v_main) = 'People Lead Renamed', 'the main person keeps the lead name');
  perform tst.ok((select phone = '(818) 555-0612' and email is null and phone2 is null from public.leads where id = v_l), 'lead caches the main primary phone; email cleared; phone2 retired');
  perform tst.fails(format($q$select public.save_lead_people(%L, '[{"id":"%s","name":"x","phones":[],"emails":[{"address":"bad"}]}]'::jsonb)$q$, v_l, v_main), 'invalid email refused');
  perform tst.ok((select count(*) from public.contact_phones p join public.contacts c on c.id = p.contact_id where c.lead_id = v_l and p.deleted_at is null) = 3, 'refused save changed nothing');
  insert into public.leads (company_id, source_id, contact_name, phone) values ('ca000000-0000-0000-0000-000000000000', v_src, 'Other Lead', '(818) 555-0620') returning id into v_l2;
  perform tst.fails(format($q$select public.save_lead_people(%L, '[{"id":"%s","name":"Thief","phones":[],"emails":[]}]'::jsonb)$q$, v_l2, v_pat), 'person of another lead refused');
  perform tst.fails($q$insert into public.contacts (company_id, name) values ('ca000000-0000-0000-0000-000000000000', 'Nobody')$q$, 'a person belongs to a client or a lead');
end $$;
-- another company sees nothing and cannot write
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.contacts where lead_id = (select id from public.leads where contact_name = 'People Lead Renamed')$q$) = 0, 'other company: no lead people');
select tst.ok(tst.cnt($q$select 1 from public.contacts c join public.leads l on l.id = c.lead_id where l.company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0, 'other company: no lead people at all');
-- a tech sees the people of a lead only when the lead is theirs, and then edits them
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.contacts c join public.contact_phones p on p.contact_id = c.id where c.name = 'Pat People'$q$) = 0, 'tech: not their lead, no people');
:as_owner_a
update public.leads set assigned_to = 'a0000000-0000-0000-0000-000000000003' where contact_name = 'People Lead Renamed';
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.contacts where name = 'Pat People' and deleted_at is null$q$) = 1, 'tech: their lead, sees its people');
select tst.ok(tst.cnt($q$select 1 from public.contact_phones p join public.contacts c on c.id = p.contact_id where c.name = 'Pat People' and p.deleted_at is null$q$) = 1, 'tech: sees their phones');
select public.save_lead_people((select id from public.leads where contact_name = 'People Lead Renamed'), jsonb_build_array(
  jsonb_build_object('id', (select id from public.contacts where name = 'People Lead Renamed' and deleted_at is null), 'role', 'main',
    'phones', jsonb_build_array(jsonb_build_object('number', '(818) 555-0611', 'label', 'home'), jsonb_build_object('number', '(818) 555-0612', 'label', 'mobile', 'primary', true)),
    'emails', jsonb_build_array(jsonb_build_object('address', 'people@example.com', 'primary', true))),
  jsonb_build_object('id', 'a1700000-0000-4000-8000-000000000001', 'name', 'Pat People', 'role', 'spouse',
    'phones', jsonb_build_array(jsonb_build_object('number', '(818) 555-0613', 'label', 'mobile', 'primary', true)), 'emails', '[]'::jsonb)));
select tst.ok((select email from public.leads where contact_name = 'People Lead Renamed') = 'people@example.com', 'tech saved the people of their lead');
-- lead → client (S3): the client made from the lead has the lead phone (as the app makes it); people merge, the spouse moves
:as_owner_a
do $$
declare v_l uuid; v_cust uuid; v_cp uuid; v_c text; v_l3 uuid; v_cust3 uuid;
begin
  select id into v_l from public.leads where contact_name = 'People Lead Renamed';
  insert into public.customers (company_id, display_name, status) values ('ca000000-0000-0000-0000-000000000000', 'People Lead Renamed', 'prospect') returning id into v_cust;
  insert into public.contacts (company_id, customer_id, name, phone, is_primary) values ('ca000000-0000-0000-0000-000000000000', v_cust, 'People Lead Renamed', '818.555.0612', true) returning id into v_cp;
  update public.customers set primary_contact_id = v_cp where id = v_cust;
  update public.leads set customer_id = v_cust where id = v_l;
  perform tst.ok((select count(*) from public.contacts where lead_id = v_l and customer_id is null and deleted_at is null) = 0, 'S3: the lead keeps no people of its own');
  perform tst.ok((select count(*) from public.contacts where customer_id = v_cust and deleted_at is null) = 2, 'S3: client has the merged main person and the spouse');
  select string_agg(number || ':' || is_primary, ',' order by position) into v_c from public.contact_phones where contact_id = v_cp and deleted_at is null;
  perform tst.ok(v_c = '818.555.0612:true,(818) 555-0611:false', format('S3: client person gets the missing phone, no duplicate (%s)', v_c));
  perform tst.ok((select count(*) from public.contact_emails where contact_id = v_cp and address = 'people@example.com' and is_primary) = 1, 'S3: and the email');
  perform tst.ok((select role = 'spouse' and not is_primary from public.contacts where name = 'Pat People' and customer_id = v_cust), 'S3: spouse moved, not primary');
  perform tst.ok((select primary_contact_id from public.customers where id = v_cust) = v_cp, 'S3: the client keeps its main person');
  perform tst.fails(format($q$select public.save_lead_people(%L, '[]'::jsonb)$q$, v_l), 'a lead with a client: edit the client''s people');
  -- a client without people (made elsewhere): the lead's main person becomes its main person
  insert into public.leads (company_id, source_id, contact_name, phone)
  select 'ca000000-0000-0000-0000-000000000000', id, 'Fresh Lead', '(818) 555-0630' from public.lead_sources where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'Referral'
  returning id into v_l3;
  insert into public.customers (company_id, display_name) values ('ca000000-0000-0000-0000-000000000000', 'Fresh Lead') returning id into v_cust3;
  update public.leads set customer_id = v_cust3 where id = v_l3;
  perform tst.ok((select c.name = 'Fresh Lead' and c.is_primary and c.role = 'main' from public.customers u join public.contacts c on c.id = u.primary_contact_id where u.id = v_cust3), 'S3: lead main person is the new client main person');
end $$;
\echo 'T17 lead people ok'

-- ---------------------------------------------------------------- T17b: client language (company default for documents)
:as_owner_a
select tst.ok((select doc_language from public.companies where id = 'ca000000-0000-0000-0000-000000000000') = 'en', 'documents to clients are in English by default');
update public.companies set doc_language = 'es' where id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select doc_language from public.companies where id = 'ca000000-0000-0000-0000-000000000000') = 'es', 'owner sets Spanish for client documents');
update public.companies set doc_language = 'ru' where id = 'ca000000-0000-0000-0000-000000000000';
select tst.fails($q$update public.companies set doc_language = 'fr' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'client documents: English, Spanish or Russian only');
select tst.ok((select count(*) from pg_constraint where conname in ('contacts_preferred_language_check', 'leads_language_check') and pg_get_constraintdef(oid) like '%ru%') = 2, 'a person and a lead can read Russian too');
update public.contacts set preferred_language = 'ru' where name = 'Pat People';
select tst.fails($q$update public.contacts set preferred_language = 'fr' where name = 'Pat People'$q$, 'unknown person language refused');
update public.companies set doc_language = 'en' where id = 'ca000000-0000-0000-0000-000000000000';
:as_tech_a
select tst.blocked($q$update public.companies set doc_language = 'es' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'tech cannot change the company document language');
:as_owner_a
select tst.ok((select doc_language from public.companies where id = 'ca000000-0000-0000-0000-000000000000') = 'en', 'still English after the tech tried');
\echo 'T17b client language ok'

-- ---------------------------------------------------------------- T20: properties C2 — people of a property, gate code by the day
:as_owner_a
do $$
declare v_c uuid := 'c2000000-0000-4000-8000-000000000001'; k int; v_p uuid; v_j uuid; v_v uuid;
  -- property → visit offset in days for tech 3 (null: no visit), status
  plan text[][] := array[['0','scheduled'], ['1','scheduled'], ['3','scheduled'], ['-1','scheduled'], ['0','cancelled']];
begin
  insert into public.customers (id, company_id, display_name) values (v_c, 'ca000000-0000-0000-0000-000000000000', 'Gate Client');
  for k in 1..5 loop
    v_p := ('d2000000-0000-4000-8000-00000000000' || k)::uuid;
    v_j := ('e2000000-0000-4000-8000-00000000000' || k)::uuid;
    v_v := ('f2000000-0000-4000-8000-00000000000' || k)::uuid;
    insert into public.properties (id, company_id, customer_id, address_line1, address_city, stories) values (v_p, 'ca000000-0000-0000-0000-000000000000', v_c, k || ' Gate St', 'Pasadena', 1);
    insert into public.property_secrets (company_id, property_id, gate_code) values ('ca000000-0000-0000-0000-000000000000', v_p, '#' || k || '42');
    insert into public.jobs (id, company_id, title, customer_id, property_id, status) values (v_j, 'ca000000-0000-0000-0000-000000000000', 'Gate job ' || k, v_c, v_p, 'scheduled');
    insert into public.visits (id, company_id, job_id, starts_at) values (v_v, 'ca000000-0000-0000-0000-000000000000', v_j, now() + (plan[k][1] || ' days')::interval);
    if plan[k][2] = 'cancelled' then perform public.cancel_visit(v_v, 'we_cancelled'); end if;
    insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', v_v, 'a0000000-0000-0000-0000-000000000003');
  end loop;
  perform tst.ok((select count(*) from public.property_secrets where property_id::text like 'd2000000%') = 5, 'office sees every gate code');
  -- people of a property: links to the client's people
  update public.properties set contact_ids = array['a1700000-0000-4000-8000-000000000001'::uuid], access_notes = 'Dog in the yard' where id = 'd2000000-0000-4000-8000-000000000001';
  perform tst.ok((select cardinality(contact_ids) from public.properties where id = 'd2000000-0000-4000-8000-000000000001') = 1, 'a property keeps its people');
  perform tst.fails($q$insert into public.property_secrets (company_id, property_id, gate_code) values ('ca000000-0000-0000-0000-000000000000', 'd2000000-0000-4000-8000-000000000001', 'again')$q$, 'one gate code per property');
end $$;
:as_office_a
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id::text like 'd2000000%'$q$) = 5, 'office role sees every gate code');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000001'$q$) = 1, 'tech: visit today → sees the code');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000002'$q$) = 1, 'tech: visit tomorrow → sees the code the day before');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000003'$q$) = 0, 'tech: visit in 3 days → no code yet');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000004'$q$) = 0, 'tech: visit was yesterday → no code');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000005'$q$) = 0, 'tech: cancelled visit today → no code');
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd2000000-0000-4000-8000-000000000001' and access_notes = 'Dog in the yard'$q$) = 1, 'tech sees access notes of their property');
select tst.blocked($q$update public.property_secrets set gate_code = 'tech' where property_id = 'd2000000-0000-4000-8000-000000000001'$q$, 'tech cannot change a gate code');
select tst.fails($q$insert into public.property_secrets (company_id, property_id, gate_code) values ('ca000000-0000-0000-0000-000000000000', 'd2000000-0000-4000-8000-000000000003', 'x')$q$, 'tech cannot set a gate code');
:as_tech2_a
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000001'$q$) = 0, 'another tech, not on the visit → no code');
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id::text like 'd2000000%'$q$) = 0, 'other company sees no gate codes');
select tst.fails($q$insert into public.property_secrets (company_id, property_id, gate_code) values ('ca000000-0000-0000-0000-000000000000', 'd2000000-0000-4000-8000-000000000003', 'x')$q$, 'other company cannot set a gate code');
:as_owner_a
select tst.ok((select gate_code from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000001') = '#142', 'gate code unchanged by others');

-- T20 (security review): every way the code could leak
:as_super
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000005', 'sales@a.test', '{"full_name":"Sam Sales"}'),
  ('b0000000-0000-0000-0000-000000000002', 'tech@b.test', '{"full_name":"Rival Tech"}');
:as_owner_a
insert into public.memberships (company_id, user_id, role, status) values ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000005', 'sales', 'active');
:as_owner_b
insert into public.memberships (company_id, user_id, role, status) values ('cb000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'tech', 'active');
:as_owner_a
do $$
declare k int; v_p uuid; v_j uuid; v_v uuid; v_c uuid := 'c2000000-0000-4000-8000-000000000001';
begin
  -- 6: +2 days, 7: completed today, 8: no_show today, 9: tech removed from today's visit, 10: deleted visit today,
  -- 11: deleted job, 12: cancelled job, 13: deleted code, 14: 00:30 company time today (time zone check)
  for k in 6..14 loop
    v_p := ('d2000000-0000-4000-8000-0000000000' || lpad(k::text, 2, '0'))::uuid;
    v_j := ('e2000000-0000-4000-8000-0000000000' || lpad(k::text, 2, '0'))::uuid;
    v_v := ('f2000000-0000-4000-8000-0000000000' || lpad(k::text, 2, '0'))::uuid;
    insert into public.properties (id, company_id, customer_id, address_line1, address_city, stories) values (v_p, 'ca000000-0000-0000-0000-000000000000', v_c, k || ' Gate St', 'Pasadena', 1);
    insert into public.property_secrets (company_id, property_id, gate_code) values ('ca000000-0000-0000-0000-000000000000', v_p, '#' || k || '42');
    insert into public.jobs (id, company_id, title, customer_id, property_id, status) values (v_j, 'ca000000-0000-0000-0000-000000000000', 'Gate job ' || k, v_c, v_p, 'scheduled');
    insert into public.visits (id, company_id, job_id, starts_at) values (v_v, 'ca000000-0000-0000-0000-000000000000', v_j, case when k = 6 then now() + interval '2 days' else now() end);
    insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', v_v, 'a0000000-0000-0000-0000-000000000003');
  end loop;
  update public.visits set status = 'en_route' where id = 'f2000000-0000-4000-8000-000000000007';
  update public.visits set status = 'on_site' where id = 'f2000000-0000-4000-8000-000000000007';
  update public.visits set status = 'completed' where id = 'f2000000-0000-4000-8000-000000000007';
  perform public.cancel_visit('f2000000-0000-4000-8000-000000000008', 'no_show');
  update public.visit_assignees set deleted_at = now() where visit_id = 'f2000000-0000-4000-8000-000000000009';
  update public.visits set deleted_at = now() where id = 'f2000000-0000-4000-8000-000000000010';
  update public.jobs set deleted_at = now() where id = 'e2000000-0000-4000-8000-000000000011';
  update public.jobs set status = 'cancelled' where id = 'e2000000-0000-4000-8000-000000000012';
  update public.property_secrets set deleted_at = now() where property_id = 'd2000000-0000-4000-8000-000000000013';
end $$;
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000006'$q$) = 0, 'tech: visit in 2 days → no code yet');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000007'$q$) = 0, 'tech: completed visit → no code');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000008'$q$) = 0, 'tech: no-show visit → no code');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000009'$q$) = 0, 'tech taken off the visit → no code');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000010'$q$) = 0, 'deleted visit → no code');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000011'$q$) = 0, 'deleted job → no code');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000012'$q$) = 0, 'cancelled job → no code');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000013'$q$) = 0, 'deleted code → nothing to see');
-- the bypass from the review: a tech cannot move their visit to today, or onto another job
select tst.fails($q$update public.visits set starts_at = now() where id = 'f2000000-0000-4000-8000-000000000003'$q$, 'tech cannot move a visit to today');
select tst.fails($q$update public.visits set job_id = 'e2000000-0000-4000-8000-000000000001' where id = 'f2000000-0000-4000-8000-000000000003'$q$, 'tech cannot point a visit at another job');
select tst.fails($q$update public.visits set deleted_at = now() where id = 'f2000000-0000-4000-8000-000000000003'$q$, 'tech cannot delete a visit');
select tst.fails($q$update public.visits set arrival_window_start = now() where id = 'f2000000-0000-4000-8000-000000000003'$q$, 'tech cannot change the arrival window');
select tst.fails($q$update public.visits set sequence_in_route = 1 where id = 'f2000000-0000-4000-8000-000000000003'$q$, 'tech cannot change the route order');
select tst.fails($q$update public.visits set notify_customer = false where id = 'f2000000-0000-4000-8000-000000000003'$q$, 'tech cannot switch off the client notice');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000003'$q$) = 0, 'after the attempts: still no code in 3 days');
select tst.ok((select count(*) from public.visits where id = 'f2000000-0000-4000-8000-000000000001') = 1, 'tech still moves their visit through its steps');
update public.visits set status = 'en_route' where id = 'f2000000-0000-4000-8000-000000000001';
select tst.ok((select status from public.visits where id = 'f2000000-0000-4000-8000-000000000001') = 'en_route', 'tech: "on my way" still works');
-- a server job (no user) may move a visit: the guard is only for people
:as_super
update public.visits set starts_at = starts_at + interval '1 hour' where id = 'f2000000-0000-4000-8000-000000000003';
select tst.ok((select count(*) from public.visits where id = 'f2000000-0000-4000-8000-000000000003' and starts_at > now() + interval '3 days') = 1, 'no user (server, cron): the visit moves');
-- sales is office staff (app.is_staff): sees the code like the dispatcher
reset role; set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000005'; set role authenticated;
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000003'$q$) = 1, 'sales (office staff) sees the gate code');
-- a tech of another company sees nothing; another company cannot change a code
reset role; set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002'; set role authenticated;
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id::text like 'd2000000%'$q$) = 0, 'tech of another company: no codes');
:as_owner_b
select tst.blocked($q$update public.property_secrets set gate_code = 'stolen' where property_id = 'd2000000-0000-4000-8000-000000000001'$q$, 'other company cannot change a gate code');
-- time zone: 00:30 today in a company far ahead of UTC is today for the company (yesterday in UTC)
:as_owner_a
update public.companies set timezone = 'Pacific/Kiritimati' where id = 'ca000000-0000-0000-0000-000000000000';
update public.visits set starts_at = (date_trunc('day', now() at time zone 'Pacific/Kiritimati') + interval '30 minutes') at time zone 'Pacific/Kiritimati'
 where id = 'f2000000-0000-4000-8000-000000000014';
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000014'$q$) = 1, 'visit at 00:30 company time today → code (company time zone, not UTC)');
:as_owner_a
-- 2 days ahead by the company's calendar (not by UTC) → no code
update public.visits set starts_at = (date_trunc('day', now() at time zone 'Pacific/Kiritimati') + interval '2 days 30 minutes') at time zone 'Pacific/Kiritimati'
 where id = 'f2000000-0000-4000-8000-000000000014';
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000014'$q$) = 0, 'visit at 00:30 company time in 2 days → no code yet');
:as_owner_a
update public.companies set timezone = 'America/Los_Angeles' where id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select gate_code from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000001') = '#142', 'no one else changed a code');
\echo 'T20 properties C2 ok'
-- ---------------------------------------------------------------- T18: estimate status (docs/specs/07 §4, S8b, edit after send)
-- Signing statuses are set only by the signing functions (security-check 05.11); edit after send = back to draft.
:as_owner_a
do $$
declare e uuid; e2 uuid;
begin
  perform tst.fails($q$insert into public.estimates (company_id, customer_id, property_id, title, status)
                       values ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'x', 'approved')$q$,
                    'an estimate cannot be created already approved');
  insert into public.estimates (company_id, customer_id, property_id, title)
  values ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'T18 status')
  returning id into e;
  update public.estimates set status = 'sent' where id = e;
  perform tst.fails(format($q$update public.estimates set status = 'awaiting_countersign' where id = %L$q$, e), 'sent -> awaiting only through a client signature');
  perform tst.fails(format($q$select set_config('app.signing_estimate', %L, true); update public.estimates set status = 'awaiting_countersign' where id = %L$q$, e, e),
                    'the session flag alone does not open it');
  perform tst.fails(format($q$update public.estimates set status = 'approved' where id = %L$q$, e), 'sent -> approved only through countersign');
  update public.estimates set status = 'draft' where id = e;
  perform tst.ok((select status from public.estimates where id = e) = 'draft', 'edit after send: back to draft');
  -- the T8 estimate was approved by countersign_estimate: signed by both, no edits
  perform tst.fails($q$update public.estimates set status = 'draft' where id = '0e1a0000-0000-0000-0000-000000000010'$q$, 'approved -> draft (signed by both: no edits)');
  insert into public.estimates (company_id, customer_id, property_id, title)
  values ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'T18 draft')
  returning id into e2;
  perform tst.fails(format($q$update public.estimates set status = 'awaiting_countersign' where id = %L$q$, e2), 'draft -> awaiting_countersign (client signs a sent version)');
end $$;
\echo 'T18 estimate status ok'

-- ---------------------------------------------------------------- T21: tasks of a property (C2b)
:as_owner_a
insert into public.tasks (company_id, subject_type, subject_id, title) values
  ('ca000000-0000-0000-0000-000000000000', 'property', 'd2000000-0000-4000-8000-000000000001', 'Replace the side gate latch'),
  ('ca000000-0000-0000-0000-000000000000', 'property', 'd2000000-0000-4000-8000-000000000003', 'Trim the tree over the roof');
select tst.fails($q$insert into public.tasks (company_id, subject_type, subject_id, title) values ('ca000000-0000-0000-0000-000000000000', 'house', 'd2000000-0000-4000-8000-000000000001', 'x')$q$, 'unknown subject type refused');
:as_tech_a
-- tech 3 is on visits at properties 1 and 3 (today, in 3 days): sees both properties' tasks, like the properties themselves
select tst.ok(tst.cnt($q$select 1 from public.tasks where subject_type = 'property' and subject_id = 'd2000000-0000-4000-8000-000000000001'$q$) = 1, 'tech: task of a property with their visit');
select tst.ok(tst.cnt($q$select 1 from public.tasks where subject_type = 'property' and subject_id = 'd2000000-0000-4000-8000-000000000003'$q$) = 1, 'tech: task of their property even with no code that day');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd2000000-0000-4000-8000-000000000003'$q$) = 0, 'tech: still no gate code there');
insert into public.tasks (company_id, subject_type, subject_id, title) values ('ca000000-0000-0000-0000-000000000000', 'property', 'd2000000-0000-4000-8000-000000000001', 'Gate sticks in the rain');
select tst.ok(tst.cnt($q$select 1 from public.tasks where title = 'Gate sticks in the rain'$q$) = 1, 'tech adds a task to their property');
:as_tech2_a
select tst.ok(tst.cnt($q$select 1 from public.tasks where subject_type = 'property' and subject_id::text like 'd2000000%'$q$) = 0, 'another tech: no tasks of properties they have no visit at');
select tst.fails($q$insert into public.tasks (company_id, subject_type, subject_id, title) values ('ca000000-0000-0000-0000-000000000000', 'property', 'd2000000-0000-4000-8000-000000000001', 'x')$q$, 'another tech cannot add a task there');
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.tasks where subject_type = 'property'$q$) = 0, 'other company: no property tasks');
:as_office_a
select tst.ok(tst.cnt($q$select 1 from public.tasks where subject_type = 'property' and subject_id::text like 'd2000000%'$q$) = 3, 'office sees every property task');

-- T21 (security review): no task planted from another company; a tech closes, never re-points
:as_owner_b
select tst.fails($q$insert into public.tasks (company_id, subject_type, subject_id, title) values ('cb000000-0000-0000-0000-000000000000', 'property', 'd2000000-0000-4000-8000-000000000001', 'Call 555-0000 now')$q$, 'other company cannot plant a task on our property');
select tst.fails($q$insert into public.tasks (company_id, subject_type, subject_id, title) values ('ca000000-0000-0000-0000-000000000000', 'property', 'd2000000-0000-4000-8000-000000000001', 'Call 555-0000 now')$q$, 'nor as our company');
:as_owner_a
insert into public.tasks (company_id, subject_type, subject_id, title) values
  ('ca000000-0000-0000-0000-000000000000', 'customer', 'c2000000-0000-4000-8000-000000000001', 'Customer follow-up'),
  ('ca000000-0000-0000-0000-000000000000', 'job', 'e2000000-0000-4000-8000-000000000001', 'Job follow-up'),
  ('ca000000-0000-0000-0000-000000000000', 'estimate', '0e1a0000-0000-0000-0000-000000000001', 'Estimate follow-up'),
  ('ca000000-0000-0000-0000-000000000000', 'property', 'd2000000-0000-4000-8000-000000000006', 'Task of a property that goes away');
update public.properties set deleted_at = now() where id = 'd2000000-0000-4000-8000-000000000006';
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.tasks where title like 'Call 555%'$q$) = 0, 'tech sees no planted task');
select tst.ok(tst.cnt($q$select 1 from public.tasks where title in ('Customer follow-up', 'Job follow-up', 'Estimate follow-up')$q$) = 0, 'tech: no tasks of a client, job or estimate they neither wrote nor got');
select tst.ok(tst.cnt($q$select 1 from public.tasks where title = 'Task of a property that goes away'$q$) = 0, 'deleted property: its tasks are gone for the tech');
-- closes the office's task of their property, but cannot rewrite or re-point it
update public.tasks set done_at = now(), done_by = 'a0000000-0000-0000-0000-000000000003' where title = 'Replace the side gate latch';
select tst.ok((select done_at is not null from public.tasks where title = 'Replace the side gate latch'), 'tech marks the office task of their property done');
select tst.fails($q$update public.tasks set title = 'Ignore this' where title = 'Replace the side gate latch'$q$, 'tech cannot rewrite the office task');
select tst.fails($q$update public.tasks set subject_id = 'd2000000-0000-4000-8000-000000000004' where title = 'Gate sticks in the rain'$q$, 'tech cannot move even their own task to another property');
select tst.fails($q$update public.tasks set subject_type = 'customer', subject_id = 'c2000000-0000-4000-8000-000000000001' where title = 'Gate sticks in the rain'$q$, 'tech cannot move their task to a client');
update public.tasks set title = 'Gate sticks when it rains' where title = 'Gate sticks in the rain';
select tst.ok(tst.cnt($q$select 1 from public.tasks where title = 'Gate sticks when it rains'$q$) = 1, 'the author edits their own task');
reset role; set role anon;
select tst.fails($q$select 1 from public.tasks$q$, 'anon cannot read tasks');
\echo 'T21 property tasks ok'

-- ---------------------------------------------------------------- T22: what a tech sees (security review of #67)
-- docs/specs/04 §8: a tech sees properties of their visits today, in the future and in the last 14 days, never
-- through a cancelled or no-show visit; team notes only of subjects they see (no office note with a gate code)
:as_owner_a
do $$
declare k int; v_p uuid; v_j uuid; v_v uuid; v_c uuid := 'c2000000-0000-4000-8000-000000000001';
begin
  -- 15: 15 days ago, 16: cancelled tomorrow, 17: tomorrow, 18: completed 10 days ago, 19: no-show tomorrow
  for k in 15..19 loop
    v_p := ('d2000000-0000-4000-8000-0000000000' || k)::uuid;
    v_j := ('e2000000-0000-4000-8000-0000000000' || k)::uuid;
    v_v := ('f2000000-0000-4000-8000-0000000000' || k)::uuid;
    insert into public.properties (id, company_id, customer_id, address_line1, address_city, stories) values (v_p, 'ca000000-0000-0000-0000-000000000000', v_c, k || ' Window St', 'Pasadena', 1);
    insert into public.jobs (id, company_id, title, customer_id, property_id, status) values (v_j, 'ca000000-0000-0000-0000-000000000000', 'Window job ' || k, v_c, v_p, 'scheduled');
    insert into public.visits (id, company_id, job_id, starts_at) values (v_v, 'ca000000-0000-0000-0000-000000000000', v_j,
      case k when 15 then now() - interval '15 days' when 18 then now() - interval '10 days' else now() + interval '1 day' end);
    insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', v_v, 'a0000000-0000-0000-0000-000000000003');
  end loop;
  perform public.cancel_visit('f2000000-0000-4000-8000-000000000016', 'client_cancelled');
  update public.visits set status = 'en_route' where id = 'f2000000-0000-4000-8000-000000000018';
  update public.visits set status = 'on_site' where id = 'f2000000-0000-4000-8000-000000000018';
  update public.visits set status = 'completed' where id = 'f2000000-0000-4000-8000-000000000018';
  perform public.cancel_visit('f2000000-0000-4000-8000-000000000019', 'no_show');
  -- a client the tech has never been sent to; the office writes the gate code in team notes
  insert into public.customers (id, company_id, display_name) values ('c2200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T22 Other Client');
end $$;
:as_office_a
insert into public.notes (company_id, subject_type, subject_id, body) values
  ('ca000000-0000-0000-0000-000000000000', 'customer', 'c2200000-0000-4000-8000-000000000001', 'T22 gate code #9911 (other client)'),
  ('ca000000-0000-0000-0000-000000000000', 'property', 'd2000000-0000-4000-8000-000000000015', 'T22 gate code #9915 (old visit)'),
  ('ca000000-0000-0000-0000-000000000000', 'property', 'd2000000-0000-4000-8000-000000000016', 'T22 note of a cancelled visit'),
  ('ca000000-0000-0000-0000-000000000000', 'property', 'd2000000-0000-4000-8000-000000000017', 'T22 dog in the yard (tomorrow)'),
  ('ca000000-0000-0000-0000-000000000000', 'job', 'e2000000-0000-4000-8000-000000000015', 'T22 note of an old job'),
  ('ca000000-0000-0000-0000-000000000000', 'job', 'e2000000-0000-4000-8000-000000000017', 'T22 note of tomorrow''s job'),
  ('ca000000-0000-0000-0000-000000000000', 'customer', 'c2000000-0000-4000-8000-000000000001', 'T22 note of their client');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd2000000-0000-4000-8000-000000000015'$q$) = 0, 'tech: visit 15 days ago → property not visible');
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd2000000-0000-4000-8000-000000000016'$q$) = 0, 'tech: cancelled visit → property not visible');
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd2000000-0000-4000-8000-000000000019'$q$) = 0, 'tech: no-show visit → property not visible');
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd2000000-0000-4000-8000-000000000017'$q$) = 1, 'tech: visit tomorrow → property visible');
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd2000000-0000-4000-8000-000000000018'$q$) = 1, 'tech: completed visit 10 days ago → property visible');
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd2000000-0000-4000-8000-000000000001'$q$) = 1, 'tech: visit today → property visible');
select tst.ok(not app.can_see_property('d2000000-0000-4000-8000-000000000015', 'ca000000-0000-0000-0000-000000000000'), 'can_see_property follows the window');
select tst.ok(tst.cnt($q$select 1 from public.notes where body like 'T22 gate code%'$q$) = 0, 'tech: office gate-code notes of a client or old property are hidden');
select tst.ok(tst.cnt($q$select 1 from public.notes where body = 'T22 note of a cancelled visit'$q$) = 0, 'tech: note of a property of a cancelled visit hidden');
select tst.ok(tst.cnt($q$select 1 from public.notes where body = 'T22 note of an old job'$q$) = 0, 'tech: note of an old job hidden');
select tst.ok(tst.cnt($q$select 1 from public.notes where body = 'T22 dog in the yard (tomorrow)'$q$) = 1, 'tech: note of their property visible');
select tst.ok(tst.cnt($q$select 1 from public.notes where body = 'T22 note of tomorrow''s job'$q$) = 1, 'tech: note of their job visible');
select tst.ok(tst.cnt($q$select 1 from public.notes where body = 'T22 note of their client'$q$) = 1, 'tech: note of the client of their visit visible');
insert into public.notes (company_id, subject_type, subject_id, body) values ('ca000000-0000-0000-0000-000000000000', 'property', 'd2000000-0000-4000-8000-000000000017', 'T22 tech own note');
select tst.ok(tst.cnt($q$select 1 from public.notes where body = 'T22 tech own note'$q$) = 1, 'tech: sees their own note');
:as_office_a
select tst.ok(tst.cnt($q$select 1 from public.notes where body like 'T22%'$q$) = 8, 'office sees every team note');
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.notes where body like 'T22%'$q$) = 0, 'other company: no notes');
reset role; set role anon;
select tst.fails($q$select 1 from public.notes$q$, 'anon cannot read notes');
select tst.fails($q$select app.tech_visit_counts(gen_random_uuid())$q$, 'anon cannot call the visit window helper');
-- T22 (security-check of #72): edges of the window, the job's status, undated visits, crew changes, lead and estimate
-- notes, private office notes, estimates and tasks of a property outside the window
:as_owner_a
do $$
declare k int; v_p uuid; v_j uuid; v_v uuid; v_c uuid := 'c2000000-0000-4000-8000-000000000001';
begin
  -- 20: window edge in a far time zone, 21: cancelled job with a live visit, 22: closed job, 23: undated visit made today,
  -- 24: undated visit made 20 days ago, 25: tech taken off a visit tomorrow
  for k in 20..25 loop
    v_p := ('d2000000-0000-4000-8000-0000000000' || k)::uuid;
    v_j := ('e2000000-0000-4000-8000-0000000000' || k)::uuid;
    v_v := ('f2000000-0000-4000-8000-0000000000' || k)::uuid;
    insert into public.properties (id, company_id, customer_id, address_line1, address_city, stories) values (v_p, 'ca000000-0000-0000-0000-000000000000', v_c, k || ' Edge St', 'Pasadena', 1);
    insert into public.jobs (id, company_id, title, customer_id, property_id, status) values (v_j, 'ca000000-0000-0000-0000-000000000000', 'Edge job ' || k, v_c, v_p, 'scheduled');
    insert into public.visits (id, company_id, job_id, starts_at) values (v_v, 'ca000000-0000-0000-0000-000000000000', v_j,
      case when k in (23, 24) then null else now() + interval '1 day' end);
    insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', v_v, 'a0000000-0000-0000-0000-000000000003');
  end loop;
  update public.jobs set status = 'cancelled' where id = 'e2000000-0000-4000-8000-000000000021';
  update public.jobs set status = 'in_progress' where id = 'e2000000-0000-4000-8000-000000000022';
  update public.jobs set status = 'completed' where id = 'e2000000-0000-4000-8000-000000000022';
  update public.jobs set status = 'closed' where id = 'e2000000-0000-4000-8000-000000000022';
  update public.visit_assignees set deleted_at = now() where visit_id = 'f2000000-0000-4000-8000-000000000025';
  -- lead of the tech and a lead of nobody; estimates inside and outside the window; a task outside the window
  insert into public.leads (id, company_id, source_id, contact_name, phone, assigned_to)
  select 'b2200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', id, 'T22 Lead Mine', '(818) 555-0221', 'a0000000-0000-0000-0000-000000000003'
    from public.lead_sources where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'Referral';
  insert into public.leads (id, company_id, source_id, contact_name, phone)
  select 'b2200000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', id, 'T22 Lead Other', '(818) 555-0222'
    from public.lead_sources where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'Referral';
  insert into public.estimates (id, company_id, customer_id, property_id, title) values
    ('0e220000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', v_c, 'd2000000-0000-4000-8000-000000000001', 'T22 estimate today'),
    ('0e220000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', v_c, 'd2000000-0000-4000-8000-000000000015', 'T22 estimate old');
  insert into public.tasks (company_id, subject_type, subject_id, title) values ('ca000000-0000-0000-0000-000000000000', 'property', 'd2000000-0000-4000-8000-000000000015', 'T22 task of an old property');
end $$;
:as_super
-- created_at is kept by the standard trigger; an old row is made by hand
alter table public.visits disable trigger user;
update public.visits set created_at = now() - interval '20 days' where id = 'f2000000-0000-4000-8000-000000000024';
alter table public.visits enable trigger user;
:as_office_a
insert into public.notes (company_id, subject_type, subject_id, body, visibility) values
  ('ca000000-0000-0000-0000-000000000000', 'lead', 'b2200000-0000-4000-8000-000000000001', 'T22b lead note mine', 'team'),
  ('ca000000-0000-0000-0000-000000000000', 'lead', 'b2200000-0000-4000-8000-000000000002', 'T22b lead note other', 'team'),
  ('ca000000-0000-0000-0000-000000000000', 'estimate', '0e220000-0000-4000-8000-000000000001', 'T22b estimate note today', 'team'),
  ('ca000000-0000-0000-0000-000000000000', 'estimate', '0e220000-0000-4000-8000-000000000002', 'T22b estimate note old', 'team'),
  ('ca000000-0000-0000-0000-000000000000', 'property', 'd2000000-0000-4000-8000-000000000017', 'T22b private office note', 'private');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd2000000-0000-4000-8000-000000000021'$q$) = 0, 'tech: cancelled job, live visit → property not visible');
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd2000000-0000-4000-8000-000000000022'$q$) = 0, 'tech: closed job → property not visible');
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd2000000-0000-4000-8000-000000000023'$q$) = 1, 'tech: undated visit made today → property visible');
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd2000000-0000-4000-8000-000000000024'$q$) = 0, 'tech: undated visit made 20 days ago → property not visible');
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd2000000-0000-4000-8000-000000000025'$q$) = 0, 'tech taken off the visit → property not visible');
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd2000000-0000-4000-8000-000000000009'$q$) = 0, 'tech taken off today''s visit → property not visible');
select tst.ok(tst.cnt($q$select 1 from public.notes where body = 'T22b lead note mine'$q$) = 1, 'tech: note of their lead visible');
select tst.ok(tst.cnt($q$select 1 from public.notes where body = 'T22b lead note other'$q$) = 0, 'tech: note of someone else''s lead hidden');
select tst.ok(tst.cnt($q$select 1 from public.notes where body = 'T22b estimate note today'$q$) = 1, 'tech: note of an estimate of today''s property visible');
select tst.ok(tst.cnt($q$select 1 from public.notes where body = 'T22b estimate note old'$q$) = 0, 'tech: note of an estimate outside the window hidden');
select tst.ok(tst.cnt($q$select 1 from public.notes where body = 'T22b private office note'$q$) = 0, 'tech: private office note hidden');
select tst.ok(tst.cnt($q$select 1 from public.estimates where id = '0e220000-0000-4000-8000-000000000001'$q$) = 1, 'tech: estimate of today''s property visible');
select tst.ok(tst.cnt($q$select 1 from public.estimates where id = '0e220000-0000-4000-8000-000000000002'$q$) = 0, 'tech: estimate of a property outside the window hidden');
select tst.ok(tst.cnt($q$select 1 from public.tasks where title = 'T22 task of an old property'$q$) = 0, 'tech: task of a property outside the window hidden');
select tst.ok(tst.cnt($q$select 1 from public.tasks where subject_type = 'property' and subject_id = 'd2000000-0000-4000-8000-000000000001'$q$) >= 1, 'tech: tasks of today''s property visible');
-- the edge by the company's calendar (far from LA): 14 days ago at 00:30 counts, 15 days ago at 23:30 does not
:as_owner_a
update public.companies set timezone = 'Pacific/Kiritimati' where id = 'ca000000-0000-0000-0000-000000000000';
update public.visits set starts_at = (date_trunc('day', now() at time zone 'Pacific/Kiritimati') - interval '14 days' + interval '30 minutes') at time zone 'Pacific/Kiritimati'
 where id = 'f2000000-0000-4000-8000-000000000020';
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd2000000-0000-4000-8000-000000000020'$q$) = 1, 'visit 14 days ago at 00:30 company time → visible');
:as_owner_a
update public.visits set starts_at = (date_trunc('day', now() at time zone 'Pacific/Kiritimati') - interval '14 days' - interval '30 minutes') at time zone 'Pacific/Kiritimati'
 where id = 'f2000000-0000-4000-8000-000000000020';
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd2000000-0000-4000-8000-000000000020'$q$) = 0, 'visit 15 days ago at 23:30 company time → not visible');
:as_owner_a
update public.companies set timezone = 'America/Los_Angeles' where id = 'ca000000-0000-0000-0000-000000000000';
\echo 'T22 tech visibility ok'

-- ---------------------------------------------------------------- T26: a tech's clients and notes they write (security review of #67)
-- docs/specs/04 §8: clients (and their people) of visits today, in the future, last 14 days; no cancelled / no-show;
-- outside the office a note goes only on a subject the member sees
:as_owner_a
do $$
declare k int; v_c uuid; v_p uuid; v_j uuid; v_v uuid;
begin
  -- 1: only a visit 15 days ago, 2: only a cancelled visit tomorrow, 3: only a no-show, 4: visit tomorrow
  for k in 1..4 loop
    v_c := ('c2600000-0000-4000-8000-00000000000' || k)::uuid;
    v_p := ('d2600000-0000-4000-8000-00000000000' || k)::uuid;
    v_j := ('e2600000-0000-4000-8000-00000000000' || k)::uuid;
    v_v := ('f2600000-0000-4000-8000-00000000000' || k)::uuid;
    insert into public.customers (id, company_id, display_name) values (v_c, 'ca000000-0000-0000-0000-000000000000', 'T26 Client ' || k);
    insert into public.contacts (company_id, customer_id, name, role, is_primary) values ('ca000000-0000-0000-0000-000000000000', v_c, 'T26 Person ' || k, 'main', true);
    insert into public.properties (id, company_id, customer_id, address_line1, address_city, stories) values (v_p, 'ca000000-0000-0000-0000-000000000000', v_c, k || ' T26 St', 'Pasadena', 1);
    insert into public.jobs (id, company_id, title, customer_id, property_id, status) values (v_j, 'ca000000-0000-0000-0000-000000000000', 'T26 job ' || k, v_c, v_p, 'scheduled');
    insert into public.visits (id, company_id, job_id, starts_at) values (v_v, 'ca000000-0000-0000-0000-000000000000', v_j,
      case k when 1 then now() - interval '15 days' else now() + interval '1 day' end);
    insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', v_v, 'a0000000-0000-0000-0000-000000000003');
  end loop;
  perform public.cancel_visit('f2600000-0000-4000-8000-000000000002', 'client_cancelled');
  perform public.cancel_visit('f2600000-0000-4000-8000-000000000003', 'no_show');
end $$;
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.customers where id = 'c2600000-0000-4000-8000-000000000001'$q$) = 0, 'tech: client of a visit 15 days ago not visible');
select tst.ok(tst.cnt($q$select 1 from public.customers where id = 'c2600000-0000-4000-8000-000000000002'$q$) = 0, 'tech: client of a cancelled visit not visible');
select tst.ok(tst.cnt($q$select 1 from public.customers where id = 'c2600000-0000-4000-8000-000000000003'$q$) = 0, 'tech: client of a no-show visit not visible');
select tst.ok(tst.cnt($q$select 1 from public.customers where id = 'c2600000-0000-4000-8000-000000000004'$q$) = 1, 'tech: client of a visit tomorrow visible');
select tst.ok(tst.cnt($q$select 1 from public.contacts where name in ('T26 Person 1', 'T26 Person 2', 'T26 Person 3')$q$) = 0, 'tech: people of those clients not visible');
select tst.ok(tst.cnt($q$select 1 from public.contacts where name = 'T26 Person 4'$q$) = 1, 'tech: people of their client visible');
-- notes: only on subjects the tech sees
select tst.fails($q$insert into public.notes (company_id, subject_type, subject_id, body) values ('ca000000-0000-0000-0000-000000000000', 'customer', 'c2600000-0000-4000-8000-000000000001', 'T26 x')$q$, 'tech cannot note an old client');
select tst.fails($q$insert into public.notes (company_id, subject_type, subject_id, body) values ('ca000000-0000-0000-0000-000000000000', 'property', 'd2600000-0000-4000-8000-000000000002', 'T26 x')$q$, 'tech cannot note a property of a cancelled visit');
select tst.fails($q$insert into public.notes (company_id, subject_type, subject_id, body) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e2600000-0000-4000-8000-000000000003', 'T26 x')$q$, 'tech cannot note a job of a no-show');
select tst.fails($q$insert into public.notes (company_id, subject_type, subject_id, body) values ('ca000000-0000-0000-0000-000000000000', 'lead', gen_random_uuid(), 'T26 x')$q$, 'tech cannot note an unknown lead');
insert into public.notes (company_id, subject_type, subject_id, body) values
  ('ca000000-0000-0000-0000-000000000000', 'customer', 'c2600000-0000-4000-8000-000000000004', 'T26 client note'),
  ('ca000000-0000-0000-0000-000000000000', 'property', 'd2600000-0000-4000-8000-000000000004', 'T26 property note'),
  ('ca000000-0000-0000-0000-000000000000', 'job', 'e2600000-0000-4000-8000-000000000004', 'T26 job note');
select tst.ok(tst.cnt($q$select 1 from public.notes where body like 'T26%'$q$) = 3, 'tech notes their client, property and job');
:as_office_a
insert into public.notes (company_id, subject_type, subject_id, body) values ('ca000000-0000-0000-0000-000000000000', 'customer', 'c2600000-0000-4000-8000-000000000001', 'T26 office note');
select tst.ok(tst.cnt($q$select 1 from public.notes where body like 'T26%'$q$) = 4, 'office notes any client and sees all');
select tst.ok(tst.cnt($q$select 1 from public.customers where id::text like 'c2600000%'$q$) = 4, 'office sees every client');
:as_owner_b
select tst.fails($q$insert into public.notes (company_id, subject_type, subject_id, body) values ('ca000000-0000-0000-0000-000000000000', 'customer', 'c2600000-0000-4000-8000-000000000004', 'T26 x')$q$, 'other company cannot note our client');
\echo 'T26 tech clients and notes ok'

-- ---------------------------------------------------------------- T28: notes keep their subject; phones and emails follow the window
-- (security re-check of #72/#74): outside the office a note never moves to another subject; a client's phones and emails
-- are visible to a tech exactly when the client's people are (visits today / future / last 14 days)
:as_owner_a
do $$
declare k int; v_ct uuid;
begin
  for k in 1..4 loop
    select id into v_ct from public.contacts where name = 'T26 Person ' || k;
    insert into public.contact_phones (company_id, contact_id, number, is_primary) values ('ca000000-0000-0000-0000-000000000000', v_ct, '(818) 555-28' || lpad(k::text, 2, '0'), true);
    insert into public.contact_emails (company_id, contact_id, address, is_primary) values ('ca000000-0000-0000-0000-000000000000', v_ct, 't28-' || k || '@example.com', true);
  end loop;
end $$;
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.contact_phones where number in ('(818) 555-2801', '(818) 555-2802', '(818) 555-2803')$q$) = 0, 'tech: phones of clients outside the window hidden (old, cancelled, no-show)');
select tst.ok(tst.cnt($q$select 1 from public.contact_emails where address in ('t28-1@example.com', 't28-2@example.com', 't28-3@example.com')$q$) = 0, 'tech: emails of clients outside the window hidden');
select tst.ok(tst.cnt($q$select 1 from public.contact_phones where number = '(818) 555-2804'$q$) = 1, 'tech: phone of their client visible');
select tst.ok(tst.cnt($q$select 1 from public.contact_emails where address = 't28-4@example.com'$q$) = 1, 'tech: email of their client visible');
-- the tech's own note (T26) cannot be moved to a subject they do not see, nor to one they do
select tst.fails($q$update public.notes set subject_id = 'c2600000-0000-4000-8000-000000000001' where body = 'T26 client note'$q$, 'tech cannot move their note to an old client');
select tst.fails($q$update public.notes set subject_type = 'property', subject_id = 'd2600000-0000-4000-8000-000000000004' where body = 'T26 client note'$q$, 'tech cannot move their note even to their own property');
update public.notes set body = 'T26 client note (edited)', pinned = true where body = 'T26 client note';
select tst.ok(tst.cnt($q$select 1 from public.notes where body = 'T26 client note (edited)' and pinned$q$) = 1, 'tech still edits and pins their own note');
:as_office_a
insert into public.notes (company_id, subject_type, subject_id, body) values ('ca000000-0000-0000-0000-000000000000', 'customer', 'c2600000-0000-4000-8000-000000000001', 'T28 office note');
update public.notes set subject_id = 'c2600000-0000-4000-8000-000000000004' where body = 'T28 office note';
select tst.ok((select subject_id from public.notes where body = 'T28 office note') = 'c2600000-0000-4000-8000-000000000004', 'office moves its note to another client');
\echo 'T28 notes guard ok'

-- ---------------------------------------------------------------- T19: client page language (rule 7, docs/specs/07 §2.1)
-- order: client's main person → lead's main person → lead → company → en; only doc_language is added
:as_owner_a
do $$
declare v_cust uuid; v_prop uuid; v_lead uuid; v_main uuid; v_lp uuid; v_e uuid;
begin
  insert into public.customers (company_id, display_name) values ('ca000000-0000-0000-0000-000000000000', 'Lang Client') returning id into v_cust;
  insert into public.properties (company_id, customer_id, address_line1, address_city) values ('ca000000-0000-0000-0000-000000000000', v_cust, '1 Lang St', 'Pasadena') returning id into v_prop;
  insert into public.contacts (company_id, customer_id, name, role, is_primary) values ('ca000000-0000-0000-0000-000000000000', v_cust, 'Lang Main', 'main', true) returning id into v_main;
  update public.customers set primary_contact_id = v_main where id = v_cust;
  insert into public.leads (company_id, source_id, contact_name, phone)
  select 'ca000000-0000-0000-0000-000000000000', id, 'Lang Lead', '(818) 555-0700' from public.lead_sources
   where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'Referral'
  returning id into v_lead;
  select id into v_lp from public.contacts where lead_id = v_lead and customer_id is null and is_primary and deleted_at is null;
  perform tst.ok(v_lp is not null, 'the lead has its main person');
  insert into public.estimates (company_id, customer_id, property_id, lead_id, title)
  values ('ca000000-0000-0000-0000-000000000000', v_cust, v_prop, v_lead, 'T19 lang') returning id into v_e;
  perform tst.set_token(v_e, 'tok_lang_0123456789abcdef');
  update public.companies set doc_language = 'en' where id = 'ca000000-0000-0000-0000-000000000000';
  perform tst.ok(public.portal_estimate('tok_lang_0123456789abcdef') ->> 'doc_language' = 'en', 'nobody has a language: company default');
  update public.companies set doc_language = 'es' where id = 'ca000000-0000-0000-0000-000000000000';
  perform tst.ok(public.portal_estimate('tok_lang_0123456789abcdef') ->> 'doc_language' = 'es', 'company default changes the page');
  update public.leads set language = 'ru' where id = v_lead;
  perform tst.ok(public.portal_estimate('tok_lang_0123456789abcdef') ->> 'doc_language' = 'ru', 'the lead beats the company');
  update public.contacts set preferred_language = 'en' where id = v_lp;
  perform tst.ok(public.portal_estimate('tok_lang_0123456789abcdef') ->> 'doc_language' = 'en', 'the lead''s main person beats the lead');
  update public.contacts set preferred_language = 'ru' where id = v_main;
  perform tst.ok(public.portal_estimate('tok_lang_0123456789abcdef') ->> 'doc_language' = 'ru', 'the client''s main person beats everything');
  perform tst.ok((public.portal_estimate('tok_lang_0123456789abcdef') ->> 'title') = 'T19 lang', 'the rest of the page is still there');
  update public.companies set doc_language = 'en' where id = 'ca000000-0000-0000-0000-000000000000';
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
do $$
declare r jsonb;
begin
  perform tst.ok(public.portal_estimate('no-such-token-lang-00000') is null, 'unknown token: nothing, not even a language');
  r := public.portal_estimate('tok_lang_0123456789abcdef');
  perform tst.ok(r ->> 'doc_language' = 'ru', 'client (anon) gets the language');
  perform tst.ok(r::text not like '%preferred_language%' and r::text not like '%Lang Main%', 'only doc_language is added: no people data');
  perform tst.fails($q$select app.portal_estimate_base('tok_lang_0123456789abcdef')$q$, 'anon cannot call the base function');
  perform tst.fails($q$select app.estimate_doc_language(gen_random_uuid())$q$, 'anon cannot call the language helper');
end $$;
-- T19, more (security-check 05.11): signed-in users cannot reach the helpers either; deleted estimate / null token → null;
-- a deleted main person falls through to the next step; the answer = base keys + doc_language; a client view marks viewed once
:as_tech_a
do $$ begin
  perform tst.fails($q$select app.portal_estimate_base('tok_lang_0123456789abcdef')$q$, 'tech A cannot call the base function');
  perform tst.fails($q$select app.estimate_doc_language(gen_random_uuid())$q$, 'tech A cannot call the language helper');
end $$;
:as_owner_b
do $$ begin
  perform tst.fails($q$select app.portal_estimate_base('tok_lang_0123456789abcdef')$q$, 'owner B cannot call the base function');
  perform tst.fails($q$select app.estimate_doc_language(gen_random_uuid())$q$, 'owner B cannot call the language helper');
end $$;
:as_owner_a
do $$
declare v_cust uuid; v_main uuid; v_e uuid; v_prop uuid;
begin
  perform tst.ok(public.portal_estimate(null) is null, 'null token → null');
  select customer_id, property_id into v_cust, v_prop from public.estimates where public_token = 'tok_lang_0123456789abcdef';
  select primary_contact_id into v_main from public.customers where id = v_cust;
  -- the client's main person is deleted: the lead's main person (en) decides
  update public.contacts set deleted_at = now() where id = v_main;
  perform tst.ok(public.portal_estimate('tok_lang_0123456789abcdef') ->> 'doc_language' = 'en', 'deleted main person → the next step (lead''s main person)');
  -- a deleted estimate: nothing
  insert into public.estimates (company_id, customer_id, property_id, title)
  values ('ca000000-0000-0000-0000-000000000000', v_cust, v_prop, 'T19 deleted') returning id into v_e;
  perform tst.set_token(v_e, 'tok_lang_deleted_0123456789');
  update public.estimates set deleted_at = now() where id = v_e;
  perform tst.ok(public.portal_estimate('tok_lang_deleted_0123456789') is null, 'deleted estimate → null');
  -- a sent estimate for the "viewed once" check
  insert into public.estimates (company_id, customer_id, property_id, title)
  values ('ca000000-0000-0000-0000-000000000000', v_cust, v_prop, 'T19 viewed') returning id into v_e;
  perform tst.set_token(v_e, 'tok_lang_viewed_0123456789');
  update public.estimates set status = 'sent' where id = v_e;
end $$;
:as_super
do $$ begin
  perform tst.ok(
    (select array_agg(k order by k) from jsonb_object_keys(public.portal_estimate('tok_lang_0123456789abcdef')) k)
    = (select array_agg(k order by k) from (select jsonb_object_keys(app.portal_estimate_base('tok_lang_0123456789abcdef')) k union all select 'doc_language') x),
    'answer keys = base keys + doc_language, nothing else');
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
do $$ begin
  perform public.portal_estimate('tok_lang_viewed_0123456789');
  perform public.portal_estimate('tok_lang_viewed_0123456789');
end $$;
:as_owner_a
do $$
declare v_e uuid;
begin
  select id into v_e from public.estimates where public_token = 'tok_lang_viewed_0123456789';
  perform tst.ok((select status from public.estimates where id = v_e) = 'viewed', 'client view: sent → viewed');
  perform tst.ok((select count(*) from public.notifications where estimate_id = v_e and kind = 'estimate.viewed') = 1, 'sent → viewed (and its notification) only once');
  perform tst.ok((select viewed_count from public.estimates where id = v_e) = 2, 'two views counted once each: the wrapper does not run the base twice');
end $$;
\echo 'T19 client page language ok'

-- ---------------------------------------------------------------- T23-T25 fixture: a sent estimate with a 10% deposit and a lead
:as_owner_a
do $$
declare v_lead uuid;
begin
  insert into public.leads (company_id, source_id, contact_name, phone)
  select 'ca000000-0000-0000-0000-000000000000', id, 'Sign Lead', '(818) 555-0723' from public.lead_sources
   where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'Referral' returning id into v_lead;
  update public.leads set status = 'estimate_sent' where id = v_lead;
  insert into public.estimates (id, company_id, number, customer_id, property_id, lead_id, title) values
    ('0e1a0000-0000-0000-0000-000000000023', 'ca000000-0000-0000-0000-000000000000', '', 'c1a00000-0000-0000-0000-000000000001',
     'd1a00000-0000-0000-0000-000000000001', v_lead, 'Sign test');
  perform tst.set_token('0e1a0000-0000-0000-0000-000000000023', 'tok_sign_0123456789abcdef');
  insert into public.estimate_versions (id, company_id, estimate_id, version_no, deposit_rule) values
    ('0e2a0000-0000-0000-0000-000000000023', 'ca000000-0000-0000-0000-000000000000', '0e1a0000-0000-0000-0000-000000000023', 1, '{"kind":"pct","bps":1000}');
  update public.estimates set current_version_id = '0e2a0000-0000-0000-0000-000000000023' where id = '0e1a0000-0000-0000-0000-000000000023';
  insert into public.estimate_options (id, company_id, version_id, name) values
    ('0e3a0000-0000-0000-0000-000000000023', 'ca000000-0000-0000-0000-000000000000', '0e2a0000-0000-0000-0000-000000000023', 'Standard');
  insert into public.estimate_line_items (company_id, option_id, line_group, name, quantity, unit_price_cents, taxable) values
    ('ca000000-0000-0000-0000-000000000000', '0e3a0000-0000-0000-0000-000000000023', 'labor', 'Porch', 1, 200000, false);
  update public.estimate_versions set locked_at = now(), sent_at = now() where id = '0e2a0000-0000-0000-0000-000000000023';
  update public.estimates set status = 'sent', sent_version_id = '0e2a0000-0000-0000-0000-000000000023' where id = '0e1a0000-0000-0000-0000-000000000023';
end $$;

-- ---------------------------------------------------------------- T25: the client signs → awaiting the company (S8)
reset role; reset request.jwt.claim.sub; set role anon;
do $$
declare r jsonb;
begin
  perform tst.fails($q$select public.countersign_estimate('0e1a0000-0000-0000-0000-000000000023', 'M0 0 L1 1')$q$, 'anon cannot sign for the company');
  r := public.portal_accept('tok_sign_0123456789abcdef', '0e3a0000-0000-0000-0000-000000000023', null, 'Sign Client', 'M0 0 L5 5', true,
                            'portal', gen_random_uuid(), null, gen_random_uuid());
  perform tst.ok(r ->> 'status' = 'awaiting_countersign', 'client signed: awaiting the company');
  perform tst.ok(r -> 'countersign' = 'null'::jsonb, 'no company signature yet');
  perform tst.ok(r::text not like '%job_id%' and r::text not like '%invoice_id%', 'the page shows no internal ids');
  r := public.portal_accept('tok_sign_0123456789abcdef', '0e3a0000-0000-0000-0000-000000000023', null, 'Sign Client', 'M0 0 L5 5', true);
  perform tst.ok(r ->> 'status' = 'awaiting_countersign', 'repeat signature: nothing doubles');
end $$;
reset role;
do $$ begin
  perform tst.ok((select count(*) from public.estimate_approvals where estimate_id = '0e1a0000-0000-0000-0000-000000000023') = 1, 'one client signature');
  perform tst.ok((select count(*) from public.jobs where estimate_id = '0e1a0000-0000-0000-0000-000000000023') = 0, 'no job before the company signs');
  perform tst.ok((select status from public.leads where contact_name = 'Sign Lead') = 'estimate_sent', 'lead not won before both sign');
  perform tst.ok((select selection ->> 'job_id' from public.estimate_approvals where estimate_id = '0e1a0000-0000-0000-0000-000000000023') is null,
                 'ids from an anonymous caller are ignored');
  perform tst.ok((select count(*) from public.notifications where estimate_id = '0e1a0000-0000-0000-0000-000000000023' and kind = 'estimate.client_signed') = 1,
                 'the company is told: the client signed');
end $$;
\echo 'T25 client signature awaits the company ok'

-- ---------------------------------------------------------------- T23: the company signs (S8b): rights, own signature, one deal
:as_owner_a
do $$ begin
  perform tst.ok((select bool_and(can_sign_contracts) from public.memberships where company_id = 'ca000000-0000-0000-0000-000000000000' and role <> 'subcontractor'),
                 'every employee may sign by default');
  -- the owner takes the right from the tech
  update public.memberships set can_sign_contracts = false where user_id = 'a0000000-0000-0000-0000-000000000003';
  perform tst.fails($q$insert into public.estimate_approvals (company_id, estimate_id, party, signer_user_id, signer_name, signature_svg)
                       values ('ca000000-0000-0000-0000-000000000000', '0e1a0000-0000-0000-0000-000000000023', 'contractor',
                               'a0000000-0000-0000-0000-000000000001', 'Me', 'M0 0')$q$, 'a company signature cannot be inserted directly');
end $$;
:as_office_a   -- admin since T6
do $$ begin
  perform tst.fails($q$update public.memberships set can_sign_contracts = true where user_id = 'a0000000-0000-0000-0000-000000000003'$q$, 'admin cannot give the right to sign');
end $$;
:as_tech_a
do $$ begin
  perform tst.fails($q$select public.countersign_estimate('0e1a0000-0000-0000-0000-000000000023', 'M0 0 L1 1')$q$, 'tech without the right cannot sign');
end $$;
:as_owner_b
do $$ begin
  perform tst.fails($q$select public.countersign_estimate('0e1a0000-0000-0000-0000-000000000023', 'M0 0 L1 1')$q$, 'another company cannot sign');
  perform tst.ok(tst.cnt('select 1 from public.member_signatures') = 0, 'B sees no A signatures');
end $$;
:as_owner_a
do $$
declare v_sig uuid; v_old uuid; v_job uuid;
begin
  -- own saved signature: versions, never edited or deleted
  insert into public.member_signatures (company_id, user_id, svg, name, title)
  values ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'M1 1 L2 2', 'Owner A', 'Owner') returning id into v_old;
  insert into public.member_signatures (company_id, user_id, svg, name, title)
  values ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'M3 3 L4 4', 'Owner A', 'Owner') returning id into v_sig;
  perform tst.ok((select revoked_at is not null from public.member_signatures where id = v_old), 'a new signature revokes the old one');
  perform tst.ok((select count(*) from public.member_signatures where user_id = 'a0000000-0000-0000-0000-000000000001' and revoked_at is null) = 1, 'one current signature');
  perform tst.fails(format($q$update public.member_signatures set svg = 'M9 9' where id = %L$q$, v_sig), 'a signature cannot be changed');
  perform tst.fails(format($q$delete from public.member_signatures where id = %L$q$, v_old), 'a signature cannot be deleted');
  perform tst.fails($q$insert into public.member_signatures (company_id, user_id, svg, name) values ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'M0 0', 'Fake')$q$,
                    'nobody saves a signature for someone else');
  perform tst.fails(format($q$select public.countersign_estimate('0e1a0000-0000-0000-0000-000000000023', null, %L)$q$, v_old), 'an old (revoked) signature cannot sign');
  perform tst.fails($q$select public.countersign_estimate('0e1a0000-0000-0000-0000-000000000023')$q$, 'no signature: refused');
  perform tst.ok(public.countersign_estimate('0e1a0000-0000-0000-0000-000000000023', null, v_sig) = 'approved', 'the owner signs with the saved signature');
  perform tst.ok(public.countersign_estimate('0e1a0000-0000-0000-0000-000000000023', null, v_sig) = 'approved', 'repeat: nothing doubles');
  perform tst.ok((select status from public.estimates where id = '0e1a0000-0000-0000-0000-000000000023') = 'approved', 'S8b: approved');
  perform tst.ok((select count(*) from public.estimate_approvals where estimate_id = '0e1a0000-0000-0000-0000-000000000023' and party = 'contractor') = 1, 'one company signature');
  perform tst.ok((select signer_user_id = 'a0000000-0000-0000-0000-000000000001' and method = 'saved' and member_signature_id = v_sig and signer_name = 'Owner A'
                    from public.estimate_approvals where estimate_id = '0e1a0000-0000-0000-0000-000000000023' and party = 'contractor'), 'signed in their own name');
  perform tst.ok((select count(*) from public.jobs where estimate_id = '0e1a0000-0000-0000-0000-000000000023') = 1, 'S8b: one job');
  select id into v_job from public.jobs where estimate_id = '0e1a0000-0000-0000-0000-000000000023';
  perform tst.ok((select status from public.jobs where id = v_job) = 'draft', 'job waits for a date');
  perform tst.ok((select total_cents from public.invoices where job_id = v_job and kind = 'deposit') = 20000, 'S8b: deposit invoice 10% of $2,000');
  perform tst.ok((select status || '/' || won_via from public.leads where contact_name = 'Sign Lead') = 'won/approval', 'S8b: lead won');
  perform tst.ok((public.portal_estimate('tok_sign_0123456789abcdef') -> 'countersign' ->> 'signer_name') = 'Owner A', 'the client page shows the company signature');
  -- the right comes back only from the owner
  update public.memberships set can_sign_contracts = true where user_id = 'a0000000-0000-0000-0000-000000000003';
end $$;
\echo 'T23 company signature and rights ok'

-- ---------------------------------------------------------------- T24: the link: valid until, revoke (founder 05.11)
:as_owner_a
do $$
declare e uuid; v_exp date; v_today date;
begin
  update public.companies set estimate_settings = estimate_settings || '{"valid_days": 3}' where id = 'ca000000-0000-0000-0000-000000000000';
  insert into public.estimates (company_id, customer_id, property_id, title)
  values ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'T24')
  returning id into e;
  perform tst.set_token(e, 'tok_exp_0123456789abcdef');
  update public.estimates set status = 'sent' where id = e;
  select (now() at time zone timezone)::date into v_today from public.companies where id = 'ca000000-0000-0000-0000-000000000000';
  select expires_at into v_exp from public.estimates where id = e;
  perform tst.ok(v_exp = v_today + 3, 'sent: valid until = today + the company''s days');
  perform tst.ok(public.portal_estimate('tok_exp_0123456789abcdef') is not null, 'open until the date (inclusive)');
  update public.companies set estimate_settings = estimate_settings - 'valid_days' where id = 'ca000000-0000-0000-0000-000000000000';
end $$;
:as_super
insert into public.estimates (company_id, customer_id, property_id, title, public_token, status)
values ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'T24 client signed', 'tok_await_0123456789abcd', 'draft');
update public.estimates set status = 'sent' where public_token = 'tok_await_0123456789abcd';
select set_config('app.signing_estimate', (select id::text from public.estimates where public_token = 'tok_await_0123456789abcd'), false);
update public.estimates set status = 'awaiting_countersign', expires_at = current_date - 2 where public_token = 'tok_await_0123456789abcd';
select set_config('app.signing_estimate', '', false);
select tst.set_expires((select id from public.estimates where public_token = 'tok_exp_0123456789abcdef'), current_date - 2);
select tst.set_expires('0e1a0000-0000-0000-0000-000000000023', current_date - 2);
reset role; reset request.jwt.claim.sub; set role anon;
do $$ begin
  perform tst.ok(public.portal_estimate('tok_exp_0123456789abcdef') ->> 'status' = 'expired'
                 and public.portal_estimate('tok_exp_0123456789abcdef') -> 'doc' is null, 'past valid until: only "expired" and who to call (E2b)');
  perform tst.fails($q$select public.portal_accept('tok_exp_0123456789abcdef', gen_random_uuid(), null, 'X', 'M0 0', true)$q$, 'past valid until: cannot sign');
  perform tst.ok(public.portal_estimate('tok_sign_0123456789abcdef') is not null, 'signed by both: opens always, even past the date');
  perform tst.ok(public.portal_estimate('tok_await_0123456789abcd') is not null, 'signed by the client (awaiting the company): the client keeps the page past the date');
end $$;
:as_super
select set_config('tst.exp_id', (select id::text from public.estimates where public_token = 'tok_exp_0123456789abcdef'), false);
:as_tech_a
do $$ begin
  perform tst.fails(format($q$select public.revoke_estimate_link(%L)$q$, current_setting('tst.exp_id')), 'tech cannot revoke a link');
end $$;
:as_owner_a
do $$
declare e uuid := current_setting('tst.exp_id')::uuid; v_tok text; v_other uuid; v_ver uuid;
begin
  perform tst.fails($q$select public.revoke_estimate_link('0e1a0000-0000-0000-0000-000000000023')$q$, 'a signed estimate keeps its link (copy promised to the client)');
  perform tst.fails(format($q$update public.estimates set link_revoked_at = null, expires_at = current_date + 99 where id = %L$q$, e), 'expiry / revoke only through the functions');
  perform public.revoke_estimate_link(e);
  perform public.revoke_estimate_link(e);  -- again: nothing happens
  perform tst.ok((select public_token is null and link_revoked_at is not null from public.estimates where id = e), 'revoked: token dropped');
  perform tst.ok((select count(*) from public.activities where subject_id = e and meta ->> 'action' = 'link_revoked') = 1, 'revoke is in the estimate history once');
  -- a phone still holding the old token sends again: the server refuses the revoked token and makes a new one
  v_tok := public.send_estimate(e, 'tok_exp_0123456789abcdef');
  perform tst.ok(v_tok is not null and v_tok <> 'tok_exp_0123456789abcdef', 'a revoked token never comes back: the server made a new one');
  perform tst.ok((select link_revoked_at is null from public.estimates where id = e), 'the new link is open');
  perform tst.fails(format($q$update public.estimates set public_token = 'tok_exp_0123456789abcdef' where id = %L$q$, e), 'the token cannot be set directly');
  -- …and not on ANOTHER estimate either: the old SMS link to client X must never open client Y's estimate
  insert into public.estimates (company_id, customer_id, property_id, title) values
    ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000002', 'd1a00000-0000-0000-0000-000000000002', 'Other client') returning id into v_other;
  insert into public.estimate_versions (company_id, estimate_id, version_no) values ('ca000000-0000-0000-0000-000000000000', v_other, 1) returning id into v_ver;
  update public.estimates set current_version_id = v_ver where id = v_other;
  v_tok := public.send_estimate(v_other, 'tok_exp_0123456789abcdef');
  perform tst.ok(v_tok <> 'tok_exp_0123456789abcdef', 'a revoked token of X is not accepted for Y: the server made a new one');
  perform tst.ok((select count(*) from public.estimates where public_token = 'tok_exp_0123456789abcdef') = 0, 'nobody holds the revoked token');
end $$;
:as_owner_a
do $$ begin
  perform tst.fails('select 1 from public.revoked_link_tokens', 'the revoked tokens table is closed to the app');
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
do $$ begin
  perform tst.ok(public.portal_estimate('tok_exp_0123456789abcdef') is null, 'the revoked link: nothing');
  perform tst.ok(public.portal_estimate('tok_sign_0123456789abcdef') is not null, 'the signed estimate still opens');
  perform tst.fails($q$select public.revoke_estimate_link('0e1a0000-0000-0000-0000-000000000023')$q$, 'anon cannot revoke');
  perform tst.fails($q$select public.send_estimate('0e1a0000-0000-0000-0000-000000000023')$q$, 'anon cannot send');
end $$;

-- T23–T25, security-check 05.11: no forged client signature, no company signature without the client's,
-- signatures visible to their owner and the admins, legacy on-site signing and «don't sign — change it» through functions
:as_owner_a
do $$
declare e uuid; v uuid; o uuid;
begin
  perform tst.fails($q$insert into public.estimate_approvals (company_id, estimate_id, party, signer_name, signature_svg, selection)
                       values ('ca000000-0000-0000-0000-000000000000', '0e1a0000-0000-0000-0000-000000000023', 'customer', 'Fake', 'M0 0', '{"total": 1}')$q$,
                    'a client signature cannot be inserted directly (it would set the price)');
  -- a quick estimate: first option, signed on site, then reopened by the office («don't sign — change it»)
  insert into public.estimates (company_id, customer_id, property_id, title) values
    ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'Quick') returning id into e;
  insert into public.estimate_versions (company_id, estimate_id, version_no) values ('ca000000-0000-0000-0000-000000000000', e, 1) returning id into v;
  update public.estimates set current_version_id = v where id = e;
  insert into public.estimate_options (company_id, version_id, name) values ('ca000000-0000-0000-0000-000000000000', v, 'Only') returning id into o;
  insert into public.estimate_line_items (company_id, option_id, line_group, name, quantity, unit_price_cents) values ('ca000000-0000-0000-0000-000000000000', o, 'labor', 'Fix', 1, 15000);
  update public.estimate_versions set locked_at = now(), sent_at = now() where id = v;
  update public.estimates set status = 'sent', sent_version_id = v, expires_at = current_date - 3 where id = e;
  perform tst.ok(public.sign_estimate_on_site(e, 'Walk-in Client', 'M0 0 L2 2') = 'awaiting_countersign', 'on site: the client signs a quick estimate even past the date');
  perform tst.ok(public.sign_estimate_on_site(e, 'Walk-in Client', 'M0 0 L2 2') = 'awaiting_countersign', 'repeat: nothing doubles');
  perform tst.fails(format($q$update public.estimates set status = 'sent' where id = %L$q$, e), 'awaiting_countersign -> sent is not allowed (T18)');
  perform tst.ok((select signer_user_id from public.estimate_approvals where estimate_id = e) = 'a0000000-0000-0000-0000-000000000001',
                 'on site: the client signature records whose device it was');
  perform tst.ok((select count(*) from public.estimate_approvals where estimate_id = e) = 1, 'one client signature');
  perform tst.ok((select (selection ->> 'total')::bigint from public.estimate_approvals where estimate_id = e) = 15000, 'the server set the total');
  perform public.reopen_estimate(e, 'client asked for a gate');
  perform tst.ok((select status from public.estimates where id = e) = 'draft', 'don''t sign — change it: back to draft');
  perform tst.ok((select count(*) from public.estimate_approvals where estimate_id = e) = 1, 'the client signature stays in history');
  perform tst.ok((select body from public.activities where subject_id = e and meta ->> 'action' = 'reopened') = 'client asked for a gate', 'the reason is in the history');
end $$;
:as_tech_a
do $$ begin
  perform tst.fails($q$select public.reopen_estimate('0e1a0000-0000-0000-0000-000000000023')$q$, 'tech cannot reopen');
  perform tst.ok(tst.cnt($q$select 1 from public.member_signatures where user_id <> 'a0000000-0000-0000-0000-000000000003'$q$) = 0, 'tech does not see other people''s signatures');
end $$;
:as_owner_a
do $$ begin
  perform tst.ok(tst.cnt('select 1 from public.member_signatures') >= 2, 'the owner sees the team''s signatures');
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
do $$ begin
  perform tst.fails($q$select public.sign_estimate_on_site(gen_random_uuid(), 'X', 'M0 0')$q$, 'anon cannot sign on site');
  perform tst.fails($q$select public.reopen_estimate(gen_random_uuid())$q$, 'anon cannot reopen');
end $$;
-- a company signature needs the client's on the sent version (an "awaiting" without it is refused)
:as_super
do $$
declare e uuid;
begin
  insert into public.estimates (company_id, customer_id, property_id, title) values
    ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'No client') returning id into e;
  update public.estimates set status = 'sent' where id = e;
  perform set_config('app.signing_estimate', e::text, true);
  update public.estimates set status = 'awaiting_countersign' where id = e;
  perform set_config('app.signing_estimate', '', true);
  perform set_config('tst.no_client', e::text, false);
end $$;
:as_owner_a
do $$ begin
  perform tst.fails(format($q$select public.countersign_estimate(%L, 'M0 0 L1 1')$q$, current_setting('tst.no_client')), 'no client signature: the company cannot sign');
end $$;

-- T25, independent security-check 05.11 — the attack: the client signs $100, the office changes the price and the client,
-- then signs for the company. Every step must be refused.
:as_office_a   -- admin since T6
do $$
declare e uuid; v uuid; o uuid; li uuid; r jsonb;
begin
  insert into public.estimates (company_id, customer_id, property_id, title) values
    ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'Attack') returning id into e;
  insert into public.estimate_versions (company_id, estimate_id, version_no) values ('ca000000-0000-0000-0000-000000000000', e, 1) returning id into v;
  update public.estimates set current_version_id = v where id = e;
  insert into public.estimate_options (company_id, version_id, name) values ('ca000000-0000-0000-0000-000000000000', v, 'Only') returning id into o;
  insert into public.estimate_line_items (company_id, option_id, line_group, name, quantity, unit_price_cents)
  values ('ca000000-0000-0000-0000-000000000000', o, 'labor', 'Small fix', 1, 10000) returning id into li;
  -- "sent" without locking the version (the old app path): the client must not be able to sign it
  update public.estimates set status = 'sent' where id = e;
  perform tst.set_token(e, 'tok_attack_0123456789ab');
  perform set_config('tst.attack', e::text || ',' || o::text || ',' || li::text || ',' || v::text, false);
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
do $$ begin
  perform tst.fails(format($q$select public.portal_accept('tok_attack_0123456789ab', %L, null, 'Victim', 'M0 0 L1 1', true)$q$, split_part(current_setting('tst.attack'), ',', 2)),
                    'a version that was never locked cannot be signed');
end $$;
:as_office_a
do $$
declare e uuid := split_part(current_setting('tst.attack'), ',', 1)::uuid; v uuid := split_part(current_setting('tst.attack'), ',', 4)::uuid;
begin
  -- the proper send locks the version
  update public.estimates set status = 'draft' where id = e;
  perform set_config('tst.attack_tok', public.send_estimate(e), false);
  perform tst.ok((select locked_at is not null from public.estimate_versions where id = v), 'send_estimate locks the version');
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
do $$ begin
  perform public.portal_accept(current_setting('tst.attack_tok'),
                               split_part(current_setting('tst.attack'), ',', 2)::uuid, null, 'Victim', 'M0 0 L1 1', true);
end $$;
:as_office_a
do $$
declare e uuid := split_part(current_setting('tst.attack'), ',', 1)::uuid; li uuid := split_part(current_setting('tst.attack'), ',', 3)::uuid;
        v2 uuid;
begin
  perform tst.ok((select status from public.estimates where id = e) = 'awaiting_countersign', 'the client signed $100');
  perform tst.fails(format($q$update public.estimate_line_items set unit_price_cents = 999900 where id = %L$q$, li), 'the signed line cannot change');
  perform tst.fails(format($q$update public.estimates set customer_id = 'c1a00000-0000-0000-0000-000000000002' where id = %L$q$, e), 'the signed client cannot change');
  perform tst.fails(format($q$update public.estimates set property_id = 'd1a00000-0000-0000-0000-000000000002' where id = %L$q$, e), 'the signed property cannot change');
  insert into public.estimate_versions (company_id, estimate_id, version_no) values ('ca000000-0000-0000-0000-000000000000', e, 2) returning id into v2;
  perform tst.fails(format($q$update public.estimates set current_version_id = %L, sent_version_id = %L where id = %L$q$, v2, v2, e), 'the signed version cannot be swapped');
  perform tst.ok(public.countersign_estimate(e, 'M0 0 L3 3') = 'approved', 'the company signs what the client signed');
  perform tst.ok((select contract_total_cents from public.jobs where estimate_id = e) = 10000, 'the job is the $100 the client signed');
  perform tst.ok((select customer_id from public.jobs where estimate_id = e) = 'c1a00000-0000-0000-0000-000000000001', 'the job is for the client who signed');
end $$;
-- on site only for someone who may sign contracts (the tech's right was given back in T23; take it again)
:as_owner_a
update public.memberships set can_sign_contracts = false where user_id = 'a0000000-0000-0000-0000-000000000003';
:as_tech_a
do $$ begin
  perform tst.fails($q$select public.sign_estimate_on_site(gen_random_uuid(), 'X', 'M0 0')$q$, 'a tech without the right cannot take an on-site signature');
end $$;
:as_owner_a
update public.memberships set can_sign_contracts = true where user_id = 'a0000000-0000-0000-0000-000000000003';
\echo 'T24 link valid until and revoke ok'

-- ---------------------------------------------------------------- T27: direction of the business (docs/specs/11-trade.md, S16)
\set as_sales_a 'reset role; set request.jwt.claim.sub = ''a0000000-0000-0000-0000-000000000005''; set role authenticated;'
:as_owner_a
do $$
declare v_gut uuid; v_roof uuid; v_lead uuid; v_lead2 uuid; v_e uuid; v_e2 uuid; v_j uuid; v_c uuid := 'c2000000-0000-4000-8000-000000000001';
  v_p uuid := 'd2000000-0000-4000-8000-000000000001'; v_src uuid;
begin
  perform tst.ok((select count(*) from public.service_categories where company_id = 'ca000000-0000-0000-0000-000000000000') = 0, 'no directions yet');
  select id into v_src from public.lead_sources where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'Referral';
  -- one direction: a lead without one gets it
  insert into public.service_categories (company_id, seed_key) values ('ca000000-0000-0000-0000-000000000000', 'gutters') returning id into v_gut;
  insert into public.leads (company_id, source_id, contact_name, phone) values ('ca000000-0000-0000-0000-000000000000', v_src, 'T27 One', '(818) 555-2701') returning id into v_lead;
  perform tst.ok((select service_category_id from public.leads where id = v_lead) = v_gut, 'only direction of the company → the lead');
  -- two directions: a lead stays empty
  insert into public.service_categories (company_id, name, position) values ('ca000000-0000-0000-0000-000000000000', 'Pressure washing', 1) returning id into v_roof;
  insert into public.leads (company_id, source_id, contact_name, phone) values ('ca000000-0000-0000-0000-000000000000', v_src, 'T27 Two', '(818) 555-2702') returning id into v_lead2;
  perform tst.ok((select service_category_id from public.leads where id = v_lead2) is null, 'two directions → the lead stays empty');
  -- estimate of a lead takes the lead's; a set value is never overwritten
  update public.leads set service_category_id = v_roof where id = v_lead2;
  insert into public.estimates (company_id, customer_id, property_id, lead_id, title) values ('ca000000-0000-0000-0000-000000000000', v_c, v_p, v_lead2, 'T27 e1') returning id into v_e;
  perform tst.ok((select service_category_id from public.estimates where id = v_e) = v_roof, 'estimate ← lead');
  insert into public.estimates (company_id, customer_id, property_id, lead_id, service_category_id, title) values ('ca000000-0000-0000-0000-000000000000', v_c, v_p, v_lead2, v_gut, 'T27 e2') returning id into v_e2;
  perform tst.ok((select service_category_id from public.estimates where id = v_e2) = v_gut, 'an explicit direction is kept');
  -- job ← estimate (an app insert like estimate.approve; portal_accept and countersign insert the same way)
  insert into public.jobs (company_id, title, customer_id, property_id, estimate_id) values ('ca000000-0000-0000-0000-000000000000', 'T27 job', v_c, v_p, v_e) returning id into v_j;
  perform tst.ok((select service_category_id from public.jobs where id = v_j) = v_roof, 'job ← estimate');
  -- a change never goes back or forward
  update public.estimates set service_category_id = v_gut where id = v_e;
  perform tst.ok((select service_category_id from public.leads where id = v_lead2) = v_roof, 'estimate change does not touch the lead');
  perform tst.ok((select service_category_id from public.jobs where id = v_j) = v_roof, 'estimate change does not touch the job');
  -- a second estimate of the same lead takes the lead's again
  insert into public.estimates (company_id, customer_id, property_id, lead_id, title) values ('ca000000-0000-0000-0000-000000000000', v_c, v_p, v_lead2, 'T27 e3') returning id into v_e2;
  perform tst.ok((select service_category_id from public.estimates where id = v_e2) = v_roof, 'second estimate of the lead ← the lead again');
  -- estimate without a lead ← the client's latest estimate or job
  insert into public.estimates (company_id, customer_id, property_id, title) values ('ca000000-0000-0000-0000-000000000000', v_c, v_p, 'T27 e4') returning id into v_e2;
  perform tst.ok((select service_category_id from public.estimates where id = v_e2) = v_roof, 'estimate without a lead ← client''s latest');
  -- a job of an estimate "without a direction" gets none
  insert into public.estimates (company_id, customer_id, property_id, lead_id, title) values ('ca000000-0000-0000-0000-000000000000', v_c, v_p, v_lead, 'T27 e5') returning id into v_e2;
  update public.estimates set service_category_id = null where id = v_e2;
  insert into public.jobs (company_id, title, customer_id, property_id, estimate_id) values ('ca000000-0000-0000-0000-000000000000', 'T27 job none', v_c, v_p, v_e2) returning id into v_j;
  perform tst.ok((select service_category_id from public.jobs where id = v_j) is null, 'estimate without a direction → job without one');
  -- archive: not chosen anew, stays where it is, a job may still take its estimate's
  update public.service_categories set archived_at = now() where id = v_roof;
  perform tst.fails(format($q$update public.leads set service_category_id = %L where id = %L$q$, v_roof, v_lead), 'archived direction is not chosen anew');
  perform tst.fails(format($q$insert into public.estimates (company_id, customer_id, property_id, service_category_id, title) values ('ca000000-0000-0000-0000-000000000000', %L, %L, %L, 'x')$q$, v_c, v_p, v_roof), 'archived direction not set on a new estimate');
  update public.leads set contact_name = 'T27 Two (renamed)' where id = v_lead2;
  perform tst.ok((select service_category_id from public.leads where id = v_lead2) = v_roof, 'archived direction stays on an edited lead');
  insert into public.estimates (company_id, customer_id, property_id, lead_id, title) values ('ca000000-0000-0000-0000-000000000000', v_c, v_p, v_lead2, 'T27 e6') returning id into v_e2;
  perform tst.ok((select service_category_id from public.estimates where id = v_e2) = v_roof, 'estimate of the lead keeps the archived direction of its lead');
  insert into public.jobs (company_id, title, customer_id, property_id, estimate_id, service_category_id) values ('ca000000-0000-0000-0000-000000000000', 'T27 job arch', v_c, v_p, v_e2, v_roof) returning id into v_j;
  perform tst.ok((select service_category_id from public.jobs where id = v_j) = v_roof, 'the app may send the archived direction of the parent');
  -- only one active now: a new lead gets it
  insert into public.leads (company_id, source_id, contact_name, phone) values ('ca000000-0000-0000-0000-000000000000', v_src, 'T27 Three', '(818) 555-2703') returning id into v_lead;
  perform tst.ok((select service_category_id from public.leads where id = v_lead) = v_gut, 'archived ones do not count for "only direction"');
  -- uniqueness among active ones; renaming keeps the id
  perform tst.fails($q$insert into public.service_categories (company_id, seed_key) values ('ca000000-0000-0000-0000-000000000000', 'gutters')$q$, 'preset twice');
  insert into public.service_categories (company_id, name) values ('ca000000-0000-0000-0000-000000000000', ' pressure WASHING ');
  perform tst.fails(format($q$update public.service_categories set archived_at = null where id = %L$q$, v_roof), 'cannot bring back a duplicate name');
  update public.service_categories set name = 'Seamless gutters' where id = v_gut;
  perform tst.ok((select count(*) from public.leads where service_category_id = v_gut) = 2, 'rename keeps the leads on the direction');
  perform tst.fails($q$insert into public.service_categories (company_id) values ('ca000000-0000-0000-0000-000000000000')$q$, 'neither preset nor name');
  perform tst.fails($q$insert into public.service_categories (company_id, seed_key) values ('ca000000-0000-0000-0000-000000000000', 'Bad Key')$q$, 'bad preset key');
  perform tst.fails(format($q$update public.service_categories set seed_key = 'roofing' where id = %L$q$, v_gut), 'preset key never changes');
  perform tst.fails(format($q$delete from public.service_categories where id = %L$q$, v_gut), 'owner cannot delete a direction');
end $$;
:as_super
select tst.fails($q$delete from public.service_categories where seed_key = 'gutters'$q$, 'no delete even without a user');
-- a job made by a server function (no user) inherits too
do $$
declare v_e uuid; v_j uuid;
begin
  select id into v_e from public.estimates where title = 'T27 e4';
  insert into public.jobs (company_id, title, customer_id, property_id, estimate_id)
  values ('ca000000-0000-0000-0000-000000000000', 'T27 job server', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', v_e)
  returning id into v_j;
  perform tst.ok((select service_category_id from public.jobs where id = v_j) = (select service_category_id from public.estimates where id = v_e), 'server-made job ← estimate');
end $$;
-- another company's direction cannot be used
:as_owner_b
insert into public.service_categories (company_id, seed_key) values ('cb000000-0000-0000-0000-000000000000', 'roofing');
select tst.ok(tst.cnt($q$select 1 from public.service_categories where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0, 'other company: none of our directions');
:as_owner_a
:as_super
select id as b_cat from public.service_categories where company_id = 'cb000000-0000-0000-0000-000000000000' limit 1 \gset
:as_owner_a
select tst.fails(format($q$update public.leads set service_category_id = %L where contact_name = 'T27 One'$q$, :'b_cat'), 'a direction of another company is refused');
-- rights: everyone reads, only owner and admin change
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.service_categories where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 3, 'tech reads the directions');
select tst.fails($q$insert into public.service_categories (company_id, name) values ('ca000000-0000-0000-0000-000000000000', 'Tech direction')$q$, 'tech cannot add a direction');
select tst.blocked($q$update public.service_categories set name = 'x' where seed_key = 'gutters'$q$, 'tech cannot rename');
:as_sales_a
select tst.ok(tst.cnt($q$select 1 from public.service_categories where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 3, 'office reads the directions');
select tst.fails($q$insert into public.service_categories (company_id, name) values ('ca000000-0000-0000-0000-000000000000', 'Sales direction')$q$, 'office (not admin) cannot add a direction');
select tst.blocked($q$update public.service_categories set position = 9 where name = 'Seamless gutters'$q$, 'office (not admin) cannot reorder');
:as_office_a   -- a0…02 was made admin in T7
update public.service_categories set position = 5 where name = 'Seamless gutters';
select tst.ok((select position from public.service_categories where name = 'Seamless gutters') = 5, 'admin reorders');
-- security-check of #83: a name has a limit; nothing crosses companies
select tst.fails(format($q$insert into public.service_categories (company_id, name) values ('ca000000-0000-0000-0000-000000000000', %L)$q$, repeat('x', 81)), 'name longer than 80 refused');
:as_owner_a
select tst.fails($q$insert into public.service_categories (company_id, seed_key) values ('cb000000-0000-0000-0000-000000000000', 'fencing')$q$, 'owner A cannot add a direction to company B');
select tst.fails(format($q$insert into public.estimates (company_id, customer_id, property_id, service_category_id, title) values ('ca000000-0000-0000-0000-000000000000', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', %L, 'x')$q$, :'b_cat'), 'estimate with a direction of company B refused');
select tst.fails(format($q$insert into public.jobs (company_id, title, customer_id, property_id, service_category_id) values ('ca000000-0000-0000-0000-000000000000', 'x', 'c2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', %L)$q$, :'b_cat'), 'job with a direction of company B refused');
:as_owner_b
select tst.blocked($q$update public.service_categories set name = 'Stolen' where company_id = 'ca000000-0000-0000-0000-000000000000'$q$, 'owner B cannot rename our directions');
select tst.blocked($q$update public.service_categories set archived_at = now() where company_id = 'ca000000-0000-0000-0000-000000000000'$q$, 'owner B cannot archive our directions');
:as_owner_a
select tst.ok((select count(*) from public.service_categories where company_id = 'ca000000-0000-0000-0000-000000000000' and (name = 'Stolen' or (archived_at is not null and seed_key = 'gutters'))) = 0, 'our directions untouched by B');
reset role; reset request.jwt.claim.sub; set role anon;
select tst.fails($q$select 1 from public.service_categories$q$, 'anon cannot read directions');
\echo 'T27 directions ok'

-- ---------------------------------------------------------------- T29–T30 fixture: two client-signed estimates
:as_owner_a
do $$
declare e uuid; v uuid; o uuid; k int;
begin
  for k in 1..2 loop
    insert into public.estimates (company_id, customer_id, property_id, title) values
      ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'E2b ' || k) returning id into e;
    insert into public.estimate_versions (company_id, estimate_id, version_no, deposit_rule) values ('ca000000-0000-0000-0000-000000000000', e, 1, '{"kind":"pct","bps":1000}') returning id into v;
    update public.estimates set current_version_id = v where id = e;
    insert into public.estimate_options (company_id, version_id, name) values ('ca000000-0000-0000-0000-000000000000', v, 'Only') returning id into o;
    insert into public.estimate_line_items (company_id, option_id, line_group, name, quantity, unit_price_cents) values ('ca000000-0000-0000-0000-000000000000', o, 'labor', 'Work', 1, 50000);
    perform set_config('tst.e2b_' || k, e::text || ',' || o::text || ',' || public.send_estimate(e), false);
  end loop;
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
do $$
declare k int;
begin
  for k in 1..2 loop
    perform public.portal_accept(split_part(current_setting('tst.e2b_' || k), ',', 3), split_part(current_setting('tst.e2b_' || k), ',', 2)::uuid,
                                 null, 'E2b Client', 'M0 0 L4 4', true);
  end loop;
end $$;

-- ---------------------------------------------------------------- T29: the company declines a client-signed estimate
:as_tech_a
do $$ begin
  perform tst.fails(format($q$select public.decline_countersign(%L, 'no')$q$, split_part(current_setting('tst.e2b_1'), ',', 1)), 'tech cannot decline');
end $$;
:as_owner_b
do $$ begin
  perform tst.fails(format($q$select public.decline_countersign(%L, 'no')$q$, split_part(current_setting('tst.e2b_1'), ',', 1)), 'another company''s owner cannot decline');
end $$;
:as_sales_a
do $$ begin
  perform tst.fails(format($q$select public.decline_countersign(%L, 'no')$q$, split_part(current_setting('tst.e2b_1'), ',', 1)), 'sales cannot decline');
end $$;
:as_owner_a
do $$
declare e uuid := split_part(current_setting('tst.e2b_1'), ',', 1)::uuid; e_ok uuid := split_part(current_setting('tst.e2b_2'), ',', 1)::uuid;
begin
  perform tst.fails(format($q$select public.decline_countersign(%L, '  ')$q$, e), 'a reason is required');
  perform tst.fails(format($q$select public.decline_countersign(%L, %L)$q$, e, repeat('x', 501)), 'a reason longer than 500 characters is refused');
  perform public.decline_countersign(e, 'we cannot do it this month');
  perform public.decline_countersign(e, 'we cannot do it this month');   -- repeat: nothing doubles
  perform tst.ok((select status || '/' || declined_reason || '/' || declined_reason_text from public.estimates where id = e) = 'declined/other/we cannot do it this month',
                 'declined with the reason in words');
  perform tst.ok((select count(*) from public.activities where subject_id = e and meta ->> 'action' = 'declined_by_company') = 1, 'the decline is in the history once');
  perform tst.fails(format($q$select public.countersign_estimate(%L, 'M0 0 L1 1')$q$, e), 'after a decline the company cannot sign');
  -- the other one is approved first: then a decline is refused
  perform tst.ok(public.countersign_estimate(e_ok, 'M0 0 L1 1') = 'approved', 'the second estimate is signed by both');
  perform tst.fails(format($q$select public.decline_countersign(%L, 'too late')$q$, e_ok), 'an approved estimate cannot be declined');
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
do $$ begin
  perform tst.fails(format($q$select public.portal_accept(%L, %L, null, 'X', 'M0 0', true)$q$, split_part(current_setting('tst.e2b_1'), ',', 3), split_part(current_setting('tst.e2b_1'), ',', 2)),
                    'a declined estimate cannot be signed again');
  perform tst.ok(public.portal_estimate(split_part(current_setting('tst.e2b_1'), ',', 3)) ->> 'status' = 'declined', 'the client page shows the decline (until valid until)');
  perform tst.ok((select r -> 'doc' is null and r -> 'approval' is null and r -> 'countersign' is null and r -> 'customer' is null and r -> 'invoices' is null
                    and r -> 'company' ->> 'name' is not null and r ->> 'doc_language' is not null
                    from (select public.portal_estimate(split_part(current_setting('tst.e2b_1'), ',', 3)) r) x),
                 'declined: only who declined and who to call (no document, no signatures)');
  perform tst.fails(format($q$select public.decline_countersign(%L, 'x')$q$, split_part(current_setting('tst.e2b_1'), ',', 1)), 'anon cannot decline');
end $$;
\echo 'T29 company decline ok'

-- ---------------------------------------------------------------- T30: the client page answers; two employees sign at once
:as_owner_a
do $$
declare e uuid := split_part(current_setting('tst.e2b_2'), ',', 1)::uuid;
begin
  -- a second employee signs right after (two phones): one job, one deposit invoice
  perform tst.ok(public.countersign_estimate(e, 'M0 0 L2 2') = 'approved', 'the second signature returns approved');
  perform tst.ok((select count(*) from public.jobs where estimate_id = e) = 1, 'one job');
  perform tst.ok((select count(*) from public.invoices i join public.jobs j on j.id = i.job_id where j.estimate_id = e and i.kind = 'deposit') = 1, 'one deposit invoice');
  perform tst.ok((select count(*) from public.estimate_approvals where estimate_id = e and party = 'contractor') = 1, 'one company signature');
  perform tst.ok(public.portal_estimate(split_part(current_setting('tst.e2b_2'), ',', 3)) -> 'company' ->> 'timezone' = 'America/Los_Angeles', 'the page has the company time zone');
end $$;
:as_super
select tst.set_expires(split_part(current_setting('tst.e2b_1'), ',', 1)::uuid, current_date - 3);
reset role; reset request.jwt.claim.sub; set role anon;
do $$
declare r jsonb;
begin
  r := public.portal_estimate(split_part(current_setting('tst.e2b_1'), ',', 3));
  perform tst.ok(r ->> 'status' = 'expired', 'past valid until: the page says expired');
  perform tst.ok(r -> 'company' ->> 'name' is not null, 'expired: who to call');
  perform tst.ok(r -> 'doc' is null and r -> 'customer' is null and r -> 'approval' is null and r -> 'invoices' is null and r ->> 'title' is null,
                 'expired: nothing of the estimate or the client');
  perform tst.ok(r ->> 'doc_language' is not null, 'expired: still in the client''s language');
  perform tst.ok(public.portal_estimate('tok_exp_0123456789abcdef') is null, 'revoked: nothing at all');
  perform tst.ok(public.portal_estimate(split_part(current_setting('tst.e2b_2'), ',', 3)) ->> 'status' = 'approved', 'signed by both: opens');
end $$;
\echo 'T30 client page answers, two signers ok'

-- ---------------------------------------------------------------- T32: a visit is at a property (docs/specs/03 §3.1, §4; S4, S4a, S9a)
:as_owner_a
do $$
declare v_src uuid; v_lead uuid; v_c uuid; v_p uuid; v_v uuid; v_j uuid; v_v2 uuid;
begin
  select id into v_src from public.lead_sources where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'Referral';
  insert into public.customers (id, company_id, display_name) values ('c3200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T32 Client') returning id into v_c;
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('d3200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', v_c, '32 Inspect St', 'Pasadena') returning id into v_p;
  insert into public.leads (id, company_id, source_id, contact_name, phone, customer_id, property_id)
  values ('b3200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', v_src, 'T32 Lead', '(818) 555-3201', v_c, v_p) returning id into v_lead;
  -- S4: an inspection — a visit of the lead at the property, no job
  insert into public.visits (id, company_id, lead_id, property_id, kind, starts_at) values ('f3200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', v_lead, v_p, 'inspection', now() + interval '1 day') returning id into v_v;
  perform tst.ok((select job_id is null and property_id = v_p from public.visits where id = v_v), 'inspection: a visit at the property without a job');
  -- the current app sends no property: it comes from the lead, or from the job
  insert into public.visits (id, company_id, lead_id, starts_at) values ('f3200000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', v_lead, now() + interval '2 days') returning id into v_v2;
  perform tst.ok((select property_id from public.visits where id = v_v2) = v_p, 'no property sent: taken from the lead');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values ('e3200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T32 job', v_c, v_p, 'draft') returning id into v_j;
  insert into public.visits (id, company_id, job_id, starts_at) values ('f3200000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', v_j, now() + interval '3 days');
  perform tst.ok((select property_id from public.visits where id = 'f3200000-0000-4000-8000-000000000003') = v_p, 'no property sent: taken from the job');
  -- no property at all: refused
  insert into public.leads (id, company_id, source_id, contact_name, phone) values ('b3200000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', v_src, 'T32 No Place', '(818) 555-3202');
  perform tst.fails($q$insert into public.visits (company_id, lead_id, starts_at) values ('ca000000-0000-0000-0000-000000000000', 'b3200000-0000-4000-8000-000000000002', now())$q$, 'a visit without a property is refused');
  -- a property of another company is refused
  perform tst.fails($q$insert into public.visits (company_id, lead_id, property_id, starts_at) values ('cb000000-0000-0000-0000-000000000000', 'b3200000-0000-4000-8000-000000000001', 'd3200000-0000-4000-8000-000000000001', now())$q$, 'a property of another company is refused');
  -- cancel reason "other" needs a text
  perform tst.fails(format($q$update public.visits set status = 'cancelled', cancel_reason = 'other' where id = %L$q$, v_v2), 'cancel reason other needs a text');
  perform public.cancel_visit(v_v2, 'client_cancelled');
  perform tst.ok((select cancel_reason from public.visits where id = v_v2) = 'client_cancelled', 'office cancels with a reason');
  -- S4a: the lead goes back from "inspection scheduled" to "contacted"
  update public.leads set status = 'inspection_scheduled' where id = v_lead;
  update public.leads set status = 'contacted' where id = v_lead;
  perform tst.ok((select status from public.leads where id = v_lead) = 'contacted', 'S4a: inspection_scheduled → contacted allowed');
  -- S9a: a job goes back from scheduled to draft ("waits for a date")
  update public.jobs set status = 'scheduled' where id = v_j;
  update public.jobs set status = 'draft' where id = v_j;
  perform tst.ok((select status from public.jobs where id = v_j) = 'draft', 'S9a: scheduled → draft allowed');
  -- a visit on site is no longer cancelled
  update public.visits set status = 'on_site' where id = 'f3200000-0000-4000-8000-000000000003';
  perform tst.fails($q$update public.visits set status = 'cancelled' where id = 'f3200000-0000-4000-8000-000000000003'$q$, 'on_site → cancelled refused');
  insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', v_v, 'a0000000-0000-0000-0000-000000000003');
end $$;
-- the tech of the inspection: cannot cancel, no-show or move it
:as_tech_a
select tst.fails($q$update public.visits set status = 'cancelled' where id = 'f3200000-0000-4000-8000-000000000001'$q$, 'tech cannot cancel the inspection');
select tst.fails($q$update public.visits set status = 'no_show' where id = 'f3200000-0000-4000-8000-000000000001'$q$, 'tech cannot mark no-show');
select tst.fails($q$update public.visits set property_id = 'd2000000-0000-4000-8000-000000000001' where id = 'f3200000-0000-4000-8000-000000000001'$q$, 'tech cannot move the visit to another property');
select tst.fails($q$update public.visits set cancel_reason = 'we_cancelled' where id = 'f3200000-0000-4000-8000-000000000001'$q$, 'tech cannot set a cancel reason');
update public.visits set status = 'en_route' where id = 'f3200000-0000-4000-8000-000000000001';
select tst.ok((select status from public.visits where id = 'f3200000-0000-4000-8000-000000000001') = 'en_route', 'tech still moves the inspection through its steps');
\echo 'T32 visit at a property ok'
-- T32 (security check of П1a): the place of a visit follows its job and lead; nobody outside the office plants one
:as_owner_a
do $$
declare v_c2 uuid; v_p2 uuid; v_j uuid := 'e3200000-0000-4000-8000-000000000001';
begin
  insert into public.customers (id, company_id, display_name) values ('c3200000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T32 Tenant Owner') returning id into v_c2;
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('d3200000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', v_c2, '32 Moved St', 'Pasadena') returning id into v_p2;
  -- the job moves to another property: its visits follow
  update public.jobs set property_id = v_p2 where id = v_j;
  perform tst.ok((select property_id from public.visits where id = 'f3200000-0000-4000-8000-000000000003') = v_p2, 'job moved: its visit follows');
  -- a visit re-pointed to another lead without a new property takes the lead's
  insert into public.visits (id, company_id, job_id, starts_at) values ('f3200000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', v_j, now() + interval '4 days');
  update public.visits set job_id = null, lead_id = 'b3200000-0000-4000-8000-000000000001' where id = 'f3200000-0000-4000-8000-000000000004';
  perform tst.ok((select property_id from public.visits where id = 'f3200000-0000-4000-8000-000000000004') = 'd3200000-0000-4000-8000-000000000001', 're-pointed to a lead: takes the lead''s property');
  -- the server stamps who cancelled and when
  perform public.cancel_visit('f3200000-0000-4000-8000-000000000004', 'we_cancelled');
  perform tst.ok((select cancelled_by = 'a0000000-0000-0000-0000-000000000001' and cancelled_at > now() - interval '1 minute' from public.visits where id = 'f3200000-0000-4000-8000-000000000004'), 'cancellation stamped by the server');
end $$;
-- a property of another company, in our own company: refused by the key (the id is known, RLS does not hide it here)
:as_owner_b
insert into public.customers (id, company_id, display_name) values ('c3200000-0000-4000-8000-0000000000b1', 'cb000000-0000-0000-0000-000000000000', 'T32 B Client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('d3200000-0000-4000-8000-0000000000b1', 'cb000000-0000-0000-0000-000000000000', 'c3200000-0000-4000-8000-0000000000b1', '1 B St', 'Pasadena');
:as_owner_a
select tst.fails($q$insert into public.visits (company_id, property_id, starts_at) values ('ca000000-0000-0000-0000-000000000000', 'd3200000-0000-4000-8000-0000000000b1', now())$q$, 'our visit at another company''s property refused (key)');
:as_tech_a
-- a tech cannot plant a client or property on a lead, nor roll back S4a by hand
select tst.fails($q$insert into public.leads (company_id, source_id, contact_name, phone, property_id) select 'ca000000-0000-0000-0000-000000000000', id, 'Planted', '(818) 555-3299', 'd2000000-0000-4000-8000-000000000020' from public.lead_sources where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'Referral'$q$, 'tech cannot create a lead at a property');
select tst.fails($q$update public.leads set property_id = 'd2000000-0000-4000-8000-000000000020' where id = 'b2200000-0000-4000-8000-000000000001'$q$, 'tech cannot point their lead at a property');
select tst.fails($q$update public.leads set customer_id = 'c2000000-0000-4000-8000-000000000001' where id = 'b2200000-0000-4000-8000-000000000001'$q$, 'tech cannot point their lead at a client');
:as_owner_a
update public.leads set status = 'inspection_scheduled' where id = 'b2200000-0000-4000-8000-000000000001';
:as_tech_a
select tst.fails($q$update public.leads set status = 'contacted' where id = 'b2200000-0000-4000-8000-000000000001'$q$, 'tech cannot roll the lead back from inspection_scheduled');
\echo 'T32 place of a visit ok'
-- T32 (security check of #97): a tech with the right to sign signs the contract for the company; the signing function
-- links the lead to the client although a tech may not do it by hand
:as_owner_a
do $$
declare v_lead uuid;
begin
  insert into public.leads (id, company_id, source_id, contact_name, phone)
  select 'b3200000-0000-4000-8000-000000000032', 'ca000000-0000-0000-0000-000000000000', id, 'T32 Sign Lead', '(818) 555-3232' from public.lead_sources
   where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'Referral' returning id into v_lead;
  update public.leads set status = 'estimate_sent' where id = v_lead;
  insert into public.estimates (id, company_id, number, customer_id, property_id, lead_id, title) values
    ('0e1a0000-0000-0000-0000-000000000032', 'ca000000-0000-0000-0000-000000000000', '', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', v_lead, 'T32 sign');
  perform tst.set_token('0e1a0000-0000-0000-0000-000000000032', 'tok_t32_0123456789abcdefg');
  insert into public.estimate_versions (id, company_id, estimate_id, version_no) values
    ('0e2a0000-0000-0000-0000-000000000032', 'ca000000-0000-0000-0000-000000000000', '0e1a0000-0000-0000-0000-000000000032', 1);
  update public.estimates set current_version_id = '0e2a0000-0000-0000-0000-000000000032' where id = '0e1a0000-0000-0000-0000-000000000032';
  insert into public.estimate_options (id, company_id, version_id, name) values
    ('0e3a0000-0000-0000-0000-000000000032', 'ca000000-0000-0000-0000-000000000000', '0e2a0000-0000-0000-0000-000000000032', 'Standard');
  insert into public.estimate_line_items (company_id, option_id, line_group, name, quantity, unit_price_cents, taxable) values
    ('ca000000-0000-0000-0000-000000000000', '0e3a0000-0000-0000-0000-000000000032', 'labor', 'Gutters', 1, 100000, false);
  update public.estimate_versions set locked_at = now(), sent_at = now() where id = '0e2a0000-0000-0000-0000-000000000032';
  update public.estimates set status = 'sent', sent_version_id = '0e2a0000-0000-0000-0000-000000000032' where id = '0e1a0000-0000-0000-0000-000000000032';
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
select public.portal_accept('tok_t32_0123456789abcdefg', '0e3a0000-0000-0000-0000-000000000032', null, 'T32 Client', 'M0 0 L5 5', true) ->> 'status' = 'awaiting_countersign' as client_signed;
:as_owner_a
update public.memberships set can_sign_contracts = true where user_id = 'a0000000-0000-0000-0000-000000000003';
:as_tech_a
select public.countersign_estimate('0e1a0000-0000-0000-0000-000000000032', 'M0 0 L3 3') = 'approved' as tech_countersigned;
:as_owner_a
select tst.ok((select status = 'won' and customer_id = 'c1a00000-0000-0000-0000-000000000001' from public.leads where id = 'b3200000-0000-4000-8000-000000000032'), 'tech countersign: lead won and linked to the client');
select tst.ok(tst.cnt($q$select 1 from public.jobs where estimate_id = '0e1a0000-0000-0000-0000-000000000032'$q$) = 1, 'tech countersign: the job is made');
-- the same tech still cannot link a lead by hand
:as_tech_a
select tst.fails($q$update public.leads set customer_id = 'c1a00000-0000-0000-0000-000000000001' where id = 'b2200000-0000-4000-8000-000000000001'$q$, 'outside a signing function the tech still cannot link a lead');
\echo 'T32 signing links the lead ok'

-- ---------------------------------------------------------------- T33: what a tech sees through an inspection without a job
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd3200000-0000-4000-8000-000000000001'$q$) = 1, 'tech sees the property of their inspection (no job)');
select tst.ok(tst.cnt($q$select 1 from public.customers where id = 'c3200000-0000-4000-8000-000000000001'$q$) = 1, 'tech sees the client of their inspection');
:as_office_a
insert into public.property_secrets (company_id, property_id, gate_code) values ('ca000000-0000-0000-0000-000000000000', 'd3200000-0000-4000-8000-000000000001', '#3232');
insert into public.notes (company_id, subject_type, subject_id, body) values
  ('ca000000-0000-0000-0000-000000000000', 'property', 'd3200000-0000-4000-8000-000000000001', 'T33 dog at the inspection'),
  ('ca000000-0000-0000-0000-000000000000', 'customer', 'c3200000-0000-4000-8000-000000000001', 'T33 client note');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd3200000-0000-4000-8000-000000000001'$q$) = 1, 'tech: gate code of tomorrow''s inspection (no job)');
select tst.ok(tst.cnt($q$select 1 from public.notes where body in ('T33 dog at the inspection', 'T33 client note')$q$) = 2, 'tech: notes of the inspection''s property and client');
:as_tech2_a
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd3200000-0000-4000-8000-000000000001'$q$) = 0, 'another tech: not their inspection, no property');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd3200000-0000-4000-8000-000000000001'$q$) = 0, 'another tech: no gate code');
-- the inspection moves to next week (office): no code, still visible; cancelled: nothing
:as_owner_a
update public.visits set starts_at = now() + interval '5 days' where id = 'f3200000-0000-4000-8000-000000000001';
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd3200000-0000-4000-8000-000000000001'$q$) = 0, 'inspection in 5 days: no gate code yet');
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd3200000-0000-4000-8000-000000000001'$q$) = 1, 'inspection in 5 days: property still visible');
:as_owner_a
select public.cancel_visit('f3200000-0000-4000-8000-000000000001', 'we_cancelled') is not null as cancelled_by_office;
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd3200000-0000-4000-8000-000000000001'$q$) = 0, 'cancelled inspection: property hidden');
select tst.ok(tst.cnt($q$select 1 from public.customers where id = 'c3200000-0000-4000-8000-000000000001'$q$) = 0, 'cancelled inspection: client hidden');
select tst.ok(tst.cnt($q$select 1 from public.notes where body like 'T33%'$q$) = 0, 'cancelled inspection: notes hidden');
\echo 'T33 tech and inspections ok'
-- T33 (security check of П1a): the client a tech sees is the client of the job, not whoever owns the property
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values ('c3300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T33 Job Client');
  insert into public.customers (id, company_id, display_name) values ('c3300000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T33 Landlord');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('d3300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c3300000-0000-4000-8000-000000000002', '33 Rented St', 'Pasadena');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values ('e3300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T33 tenant job', 'c3300000-0000-4000-8000-000000000001', 'd3300000-0000-4000-8000-000000000001', 'draft');
  insert into public.visits (id, company_id, job_id, starts_at) values ('f3300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e3300000-0000-4000-8000-000000000001', now() + interval '1 day');
  insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', 'f3300000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000003');
end $$;
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.customers where id = 'c3300000-0000-4000-8000-000000000001'$q$) = 1, 'tech sees the client of the job');
select tst.ok(tst.cnt($q$select 1 from public.customers where id = 'c3300000-0000-4000-8000-000000000002'$q$) = 0, 'tech does not see the owner of the property instead');
\echo 'T33 client of the visit ok'
-- an inspection of a lead that has no client yet: the client a tech sees is the owner of the property
:as_owner_a
do $$
declare v_src uuid;
begin
  select id into v_src from public.lead_sources where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'Referral';
  insert into public.customers (id, company_id, display_name) values ('c3300000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'T33 Owner');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('d3300000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'c3300000-0000-4000-8000-000000000003', '33 Owner St', 'Pasadena');
  insert into public.leads (id, company_id, source_id, contact_name, phone, property_id) values ('b3300000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', v_src, 'T33 No Client', '(818) 555-3303', 'd3300000-0000-4000-8000-000000000003');
  insert into public.visits (id, company_id, lead_id, kind, starts_at) values ('f3300000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'b3300000-0000-4000-8000-000000000003', 'inspection', now() + interval '1 day');
  insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', 'f3300000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000003');
end $$;
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.customers where id = 'c3300000-0000-4000-8000-000000000003'$q$) = 1, 'inspection of a lead without a client: the tech sees the owner of the property');
\echo 'T33 lead without a client ok'

-- ---------------------------------------------------------------- T34: cancel a visit — one server function for S4a / S9a
:as_owner_a
do $$
declare v_src uuid; r jsonb;
begin
  select id into v_src from public.lead_sources where company_id = 'ca000000-0000-0000-0000-000000000000' and name = 'Referral';
  insert into public.customers (id, company_id, display_name) values ('c3400000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T34 Client');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('d3400000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c3400000-0000-4000-8000-000000000001', '34 Cancel St', 'Pasadena');
  insert into public.leads (id, company_id, source_id, contact_name, phone, customer_id, property_id) values
    ('b3400000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', v_src, 'T34 Lead', '(818) 555-3401', 'c3400000-0000-4000-8000-000000000001', 'd3400000-0000-4000-8000-000000000001');
  update public.leads set status = 'inspection_scheduled' where id = 'b3400000-0000-4000-8000-000000000001';
  -- two inspections of the lead, a job with two visits
  insert into public.visits (id, company_id, lead_id, property_id, kind, starts_at) values
    ('f3400000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'b3400000-0000-4000-8000-000000000001', 'd3400000-0000-4000-8000-000000000001', 'inspection', now() + interval '1 day'),
    ('f3400000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'b3400000-0000-4000-8000-000000000001', 'd3400000-0000-4000-8000-000000000001', 'inspection', now() + interval '2 days');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values ('e3400000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T34 job', 'c3400000-0000-4000-8000-000000000001', 'd3400000-0000-4000-8000-000000000001', 'draft');
  insert into public.visits (id, company_id, job_id, starts_at) values
    ('f3400000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'e3400000-0000-4000-8000-000000000001', now() + interval '3 days'),
    ('f3400000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'e3400000-0000-4000-8000-000000000001', now() + interval '4 days');
  update public.jobs set status = 'scheduled' where id = 'e3400000-0000-4000-8000-000000000001';
  insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', 'f3400000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000003');
end $$;
-- not the office: refused
:as_tech_a
select tst.fails($q$select public.cancel_visit('f3400000-0000-4000-8000-000000000001', 'we_cancelled')$q$, 'tech cannot cancel through the function');
:as_owner_b
select tst.fails($q$select public.cancel_visit('f3400000-0000-4000-8000-000000000001', 'we_cancelled')$q$, 'another company cannot cancel our visit');
reset role; reset request.jwt.claim.sub; set role anon;
select tst.fails($q$select public.cancel_visit('f3400000-0000-4000-8000-000000000001', 'we_cancelled')$q$, 'anon cannot cancel');
:as_office_a
do $$
declare r jsonb;
begin
  perform tst.fails($q$select public.cancel_visit('f3400000-0000-4000-8000-000000000001', 'other', '  ')$q$, '"other" needs a text');
  perform tst.fails($q$select public.cancel_visit('f3400000-0000-4000-8000-000000000001', 'because')$q$, 'unknown reason refused');
  -- S4a: one of two inspections — the lead stays
  r := public.cancel_visit('f3400000-0000-4000-8000-000000000001', 'client_cancelled');
  perform tst.ok(r ->> 'lead_back' is null and (select status from public.leads where id = 'b3400000-0000-4000-8000-000000000001') = 'inspection_scheduled', 'S4a: another inspection open — lead stays');
  perform tst.ok((select status = 'cancelled' and cancel_reason = 'client_cancelled' and cancelled_by = 'a0000000-0000-0000-0000-000000000002' from public.visits where id = 'f3400000-0000-4000-8000-000000000001'), 'cancelled with reason and who');
  -- the last one (client not home → no_show): the lead goes back
  r := public.cancel_visit('f3400000-0000-4000-8000-000000000002', 'no_show');
  perform tst.ok((r ->> 'lead_back')::uuid = 'b3400000-0000-4000-8000-000000000001' and (select status from public.leads where id = 'b3400000-0000-4000-8000-000000000001') = 'contacted', 'S4a: last inspection cancelled — lead back to contacted');
  perform tst.ok((select status from public.visits where id = 'f3400000-0000-4000-8000-000000000002') = 'no_show', '"client not home" is no_show');
  perform tst.ok((select reason from public.status_events where entity_type = 'lead' and entity_id = 'b3400000-0000-4000-8000-000000000001' order by at desc limit 1) = 'no_show', 'the journal keeps the reason');
  -- S9a: one of two job visits — the job stays; the last one — the job waits for a date again
  r := public.cancel_visit('f3400000-0000-4000-8000-000000000003', 'reschedule_later');
  perform tst.ok(r ->> 'job_back' is null and (select status from public.jobs where id = 'e3400000-0000-4000-8000-000000000001') = 'scheduled', 'S9a: another visit open — job stays');
  r := public.cancel_visit('f3400000-0000-4000-8000-000000000004', 'other', 'roof under snow');
  perform tst.ok((r ->> 'job_back')::uuid = 'e3400000-0000-4000-8000-000000000001' and (select status from public.jobs where id = 'e3400000-0000-4000-8000-000000000001') = 'draft', 'S9a: last visit cancelled — job waits for a date');
  -- a repeat (offline queue) changes nothing
  r := public.cancel_visit('f3400000-0000-4000-8000-000000000004', 'other', 'roof under snow');
  perform tst.ok((r ->> 'repeat')::boolean, 'repeat: nothing happens twice');
end $$;
-- on site: not cancelled
:as_owner_a
do $$ begin
  insert into public.visits (id, company_id, job_id, starts_at) values ('f3400000-0000-4000-8000-000000000005', 'ca000000-0000-0000-0000-000000000000', 'e3400000-0000-4000-8000-000000000001', now());
  update public.visits set status = 'on_site' where id = 'f3400000-0000-4000-8000-000000000005';
  perform tst.fails($q$select public.cancel_visit('f3400000-0000-4000-8000-000000000005', 'we_cancelled')$q$, 'a visit on site is not cancelled');
end $$;
\echo 'T34 cancel visit ok'
-- T34 (security check of П2): refusals leave everything as it was; sales does not plan; en_route; an inspection
-- without a lead; «told the client» is the office's and the server's time
:as_owner_a
do $$ begin
  insert into public.visits (id, company_id, property_id, kind, starts_at) values ('f3400000-0000-4000-8000-000000000006', 'ca000000-0000-0000-0000-000000000000', 'd3400000-0000-4000-8000-000000000001', 'inspection', now() + interval '1 day');
  insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', 'f3400000-0000-4000-8000-000000000006', 'a0000000-0000-0000-0000-000000000003');
end $$;
:as_tech_a
select tst.fails($q$select public.cancel_visit('f3400000-0000-4000-8000-000000000006', 'we_cancelled')$q$, 'tech cannot cancel the inspection without a lead');
select tst.fails($q$update public.visits set customer_notified_at = now() where id = 'f3400000-0000-4000-8000-000000000006'$q$, 'tech cannot mark the client as told');
:as_sales_a
select tst.fails($q$select public.cancel_visit('f3400000-0000-4000-8000-000000000006', 'we_cancelled')$q$, 'sales does not cancel visits (owner, admin, office only)');
select tst.fails($q$update public.visits set status = 'cancelled' where id = 'f3400000-0000-4000-8000-000000000006'$q$, 'sales cannot cancel with a direct update (visits_update_staff)');
select tst.fails($q$update public.visits set status = 'no_show' where id = 'f3400000-0000-4000-8000-000000000006'$q$, 'sales cannot mark no-show with a direct update');
select tst.fails($q$update public.visits set customer_notified_at = now() where id = 'f3400000-0000-4000-8000-000000000006'$q$, 'sales cannot mark the client as told');
:as_office_a
select tst.fails($q$update public.visits set status = 'cancelled' where id = 'f3400000-0000-4000-8000-000000000006'$q$, 'office cannot cancel with a direct update either (only cancel_visit)');
select tst.fails($q$update public.visits set cancel_reason = 'other', cancel_reason_text = 'x' where id = 'f3400000-0000-4000-8000-000000000006'$q$, 'office cannot write the cancel fields directly');
select tst.fails($q$do $x$ begin perform set_config('app.cancelling_visit', 'f3400000-0000-4000-8000-000000000006', true); update public.visits set status = 'cancelled' where id = 'f3400000-0000-4000-8000-000000000006'; end $x$$q$, 'a forged cancelling flag does not help outside the function');
:as_owner_b
select tst.fails($q$select public.cancel_visit(gen_random_uuid(), 'we_cancelled')$q$, 'an unknown visit gives the same refusal as a foreign one');
:as_owner_a
select tst.ok((select status = 'scheduled' and customer_notified_at is null from public.visits where id = 'f3400000-0000-4000-8000-000000000006'), 'after the refusals the visit is untouched');
-- the office marks «told»: the server's time, not the sent one
update public.visits set customer_notified_at = '2020-01-01' where id = 'f3400000-0000-4000-8000-000000000006';
select tst.ok((select customer_notified_at > now() - interval '1 minute' from public.visits where id = 'f3400000-0000-4000-8000-000000000006'), '«told the client» is stamped by the server');
-- en_route is still cancellable; an inspection without a lead rolls nothing back
update public.visits set status = 'en_route' where id = 'f3400000-0000-4000-8000-000000000006';
:as_office_a
select (public.cancel_visit('f3400000-0000-4000-8000-000000000006', 'we_cancelled') ->> 'lead_back') is null as no_lead_back;
select tst.ok((select status from public.visits where id = 'f3400000-0000-4000-8000-000000000006') = 'cancelled', 'en_route → cancelled through the function');
\echo 'T34 refusals and notified ok'

:as_super
\echo 'ALL TESTS PASSED'
