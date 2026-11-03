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
  ('1a000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'Thumbtack', 'paid_per_lead');

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
  ('1b000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000000', 'Yelp', 'paid_ads');
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
  perform tst.fails($q$update public.leads set status = 'won' where true$q$, 'lead new -> won');
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

:as_super
\echo 'ALL TESTS PASSED'
