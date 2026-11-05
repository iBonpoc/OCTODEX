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

  -- отмена разрешена из открытого состояния; из отменённого — никуда
  update public.visits set status = 'cancelled' where id = 'f1a00000-0000-0000-0000-000000000003';
  perform tst.fails($q$update public.visits set status = 'scheduled' where id = 'f1a00000-0000-0000-0000-000000000003'$q$, 'cancelled -> scheduled');
  perform tst.ok(tst.cnt(format($q$select 1 from public.status_events where entity_type = 'visit' and entity_id = %L$q$, v1)) = 4,
                 'status_events: created + en_route + on_site + completed (tech sees own)');
end $$;

:as_owner_a
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
  update public.estimates set status = 'approved' where id = '0e1a0000-0000-0000-0000-000000000001';
  -- admin/owner: роль owner может выдать только owner; свою роль менять нельзя
  perform tst.fails($q$update public.memberships set role = 'admin' where user_id = 'a0000000-0000-0000-0000-000000000001'$q$, 'owner changes own role');
  update public.memberships set role = 'admin' where user_id = 'a0000000-0000-0000-0000-000000000002';
end $$;
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
  insert into public.estimates (id, company_id, number, customer_id, property_id, title, public_token) values
    ('0e1a0000-0000-0000-0000-000000000010', 'ca000000-0000-0000-0000-000000000000', '', 'c1a00000-0000-0000-0000-000000000001',
     'd1a00000-0000-0000-0000-000000000001', 'Handyman visit', 'tok_test_0123456789abcdef');
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
  perform tst.ok(r ->> 'status' = 'approved', 'client approved');
  perform tst.ok((r -> 'approval' -> 'selection' ->> 'total')::bigint = 48910, 'server total with add-on, discount and tax');
  perform tst.ok((r -> 'approval' -> 'selection' ->> 'deposit')::bigint = 4891, 'server deposit 10%');
  r := public.portal_accept('tok_test_0123456789abcdef', '0e3a0000-0000-0000-0000-000000000010', null, 'Yuri Petrov', 'M0 0', true);
  perform tst.ok(r ->> 'status' = 'approved', 'repeat accept is idempotent');
end $$;
reset role;
do $$ begin
  perform tst.ok((select count(*) from public.estimate_approvals where estimate_id = '0e1a0000-0000-0000-0000-000000000010') = 1, 'one approval');
  perform tst.ok((select status from public.jobs where estimate_id = '0e1a0000-0000-0000-0000-000000000010') = 'draft', 'job waits for a date');
  perform tst.ok((select contract_total_cents from public.jobs where estimate_id = '0e1a0000-0000-0000-0000-000000000010') = 48910, 'job total');
  perform tst.ok((select count(*) from public.visits v join public.jobs j on j.id = v.job_id
                   where j.estimate_id = '0e1a0000-0000-0000-0000-000000000010') = 0, 'no automatic visit: contractor schedules');
  perform tst.ok((select count(*) from public.notifications where estimate_id = '0e1a0000-0000-0000-0000-000000000010') = 2, 'viewed + approved notifications');
end $$;
:as_tech_a
do $$ begin
  perform tst.ok(tst.cnt('select 1 from public.notifications') = 0, 'tech sees no notifications');
end $$;
:as_owner_a
do $$ begin
  perform tst.ok(tst.cnt('select 1 from public.notifications') = 2, 'owner sees notifications');
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
  insert into public.estimates (id, company_id, number, customer_id, property_id, lead_id, title, public_token) values
    ('0e1a0000-0000-0000-0000-000000000077', 'ca000000-0000-0000-0000-000000000000', '', 'c1a00000-0000-0000-0000-000000000077',
     'd1a00000-0000-0000-0000-000000000077', v_lead, 'From lead', 'tok_lead_0123456789abcdef');
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
  insert into public.estimates (id, company_id, number, customer_id, property_id, title, public_token) values
    ('0e1a0000-0000-0000-0000-000000000088', 'ca000000-0000-0000-0000-000000000000', '', 'c1a00000-0000-0000-0000-000000000001',
     'd1a00000-0000-0000-0000-000000000001', 'Bathroom', 'tok_inv_0123456789abcdef');
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
    if plan[k][2] <> 'scheduled' then update public.visits set status = plan[k][2] where id = v_v; end if;
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
  update public.visits set status = 'no_show' where id = 'f2000000-0000-4000-8000-000000000008';
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
:as_owner_a
do $$
declare e uuid; e2 uuid;
begin
  insert into public.estimates (company_id, customer_id, property_id, title)
  values ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'T18 status')
  returning id into e;
  update public.estimates set status = 'sent' where id = e;
  update public.estimates set status = 'awaiting_countersign' where id = e;
  perform tst.ok((select status from public.estimates where id = e) = 'awaiting_countersign', 'client signed: awaiting our signature');
  perform tst.fails(format($q$update public.estimates set status = 'sent' where id = %L$q$, e), 'awaiting_countersign -> sent (a new version goes through draft)');
  update public.estimates set status = 'draft' where id = e;
  perform tst.ok((select status from public.estimates where id = e) = 'draft', '"don''t sign — change it": back to draft');
  update public.estimates set status = 'sent' where id = e;
  update public.estimates set status = 'draft' where id = e;
  perform tst.ok((select status from public.estimates where id = e) = 'draft', 'edit after send: back to draft');
  update public.estimates set status = 'sent' where id = e;
  update public.estimates set status = 'awaiting_countersign' where id = e;
  update public.estimates set status = 'approved' where id = e;
  perform tst.ok((select status from public.estimates where id = e) = 'approved', 'employee signed for the company: approved');
  perform tst.fails(format($q$update public.estimates set status = 'draft' where id = %L$q$, e), 'approved -> draft (signed by both: no edits)');
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

:as_super
\echo 'ALL TESTS PASSED'
