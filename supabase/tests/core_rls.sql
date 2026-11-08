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
-- migration 20261106100000 takes EXECUTE for PUBLIC off new functions of postgres; the helpers are for every test role
alter default privileges for role postgres in schema tst grant execute on functions to public;

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

-- Оператор должен упасть именно с этой ошибкой (текст по LIKE), а не с какой-то другой
create function tst.fails_like(p_sql text, p_like text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_like then
      raise exception 'FAILED (wrong error): % — got [%] %, expected like %', p_msg, sqlstate, sqlerrm, p_like;
    end if;
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
-- fixtures: a job of an estimate as the server makes it (execute_estimate is security definer; the app cannot insert one, t14)
create function tst.server_job(p_sql text) returns uuid language plpgsql security definer set search_path = '' as $$
declare r uuid;
begin
  execute p_sql into r;
  return r;
end;
$$;
-- fixtures: a person agrees to the current Terms and Privacy the way the app does (accept_legal under their JWT; 7а-1, T49)
create function tst.agree(p_user uuid) returns void language plpgsql as $$
declare v_old text := current_setting('request.jwt.claim.sub', true);
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform public.accept_legal(jsonb_build_object('terms', app.legal_current_version('terms'), 'privacy', app.legal_current_version('privacy')), 'web', 'test');
  perform set_config('request.jwt.claim.sub', coalesce(v_old, ''), true);
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
-- the lock check (migration 20261108190000) stays on for every test (review #415 №1): the fixtures below lock versions
-- written by hand with no document, which it does not check — as the old quick estimate
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

-- Компании создают их владельцы (онбординг): создатель автоматически owner.
-- Since 7а-1 a company needs the current Terms and Privacy accepted first (T49) — the owners agree the way the app does.
:as_owner_a
do $$ begin perform public.accept_legal('{"terms":"2026-11-06","privacy":"2026-11-06"}', 'web', 'test'); end $$;
:as_owner_b
do $$ begin perform public.accept_legal('{"terms":"2026-11-06","privacy":"2026-11-06"}', 'web', 'test'); end $$;
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

-- fixture: the team (since 7-2 nobody inserts a membership directly — people join by an invitation, T48)
:as_super
insert into public.memberships (company_id, user_id, role, status) values
  ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'office', 'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'tech',   'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000004', 'tech',   'active');
:as_owner_a

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

-- (a lead's price lives in lead_costs; leads.cost_cents is retired — 20261108130000, 19 §9 P4)
insert into public.leads (company_id, source_id, contact_name, phone) values
  ('ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'Neighbor', '+13235550199');

-- номер, присланный клиентом, игнорируется
insert into public.jobs (id, company_id, number, title, customer_id, property_id, status) values
  ('e1a00000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'HACK-9', 'Seamless gutters', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'draft');
insert into public.jobs (id, company_id, title, customer_id, property_id, status) values
  ('e1a00000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'HOA cleaning', 'c1a00000-0000-0000-0000-000000000002', 'd1a00000-0000-0000-0000-000000000002', 'draft');
-- a job is born «draft» (t14, 20261106046000); the fixtures are scheduled by the allowed move
update public.jobs set status = 'scheduled' where id in ('e1a00000-0000-0000-0000-000000000001', 'e1a00000-0000-0000-0000-000000000002');

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
  -- rows of the test companies (upgrade/*.sql leave their own: money rows are never deleted)
  perform tst.ok((select count(*) from public.invoices where company_id in ('ca000000-0000-0000-0000-000000000000', 'cb000000-0000-0000-0000-000000000000')) = 3, 'invoices intact');
  perform tst.ok((select count(*) from public.payments where company_id in ('ca000000-0000-0000-0000-000000000000', 'cb000000-0000-0000-0000-000000000000')) = 1, 'payments intact');
end $$;
\echo 'T5 money safety ok'

-- =============================================================================
-- T6. Отправленная версия сметы неизменяема; доступ к ролям
-- =============================================================================
-- the fixture version has lines and no document: locked as setup (no JWT — the lock check of T107 guards a member's send)
:as_super
update public.estimate_versions set locked_at = now(), sent_at = now() where id = '0e2a0000-0000-0000-0000-000000000001';
:as_owner_a
do $$ begin
  perform tst.fails($q$insert into public.estimate_line_items (company_id, option_id, name, unit_price_cents, client_visible)
                       values ('ca000000-0000-0000-0000-000000000000', '0e3a0000-0000-0000-0000-000000000001', 'BOM', 100, false)$q$, 'BOM line with price');
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
  -- 7-2: a role is not a field a client writes (a race of two owners could leave none) — the fixture moves the dispatcher up
  perform tst.fails($q$update public.memberships set role = 'admin' where user_id = 'a0000000-0000-0000-0000-000000000002'$q$, 'no direct role change');
end $$;
:as_super
update public.memberships set role = 'admin' where user_id = 'a0000000-0000-0000-0000-000000000002';
:as_owner_a
:as_super
-- fixture for the tests below (as a signing function would: definer role + this estimate marked)
select set_config('app.signing_estimate', '0e1a0000-0000-0000-0000-000000000001', false);
update public.estimates set status = 'approved' where id = '0e1a0000-0000-0000-0000-000000000001';
select set_config('app.signing_estimate', '', false);
:as_office_a   -- теперь admin
do $$ begin
  perform tst.fails($q$update public.memberships set role = 'owner' where user_id = 'a0000000-0000-0000-0000-000000000003'$q$, 'admin grants owner');
  perform tst.fails($q$update public.memberships set status = 'disabled' where user_id = 'a0000000-0000-0000-0000-000000000001'$q$, 'admin suspends owner');
  -- 7-2: a status changes only through set_member_status (a direct update is refused — T48)
  perform public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000004', 'disabled');
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
     true, 950, '{"kind":"pct","bps":1000}',
     -- the document the page draws = the lines below (T107: a version is locked only when both sides match)
     '{"options":[{"id":"0e3a0000-0000-0000-0000-000000000010","name":"Standard","recommended":true,"lines":[
        {"id":"0e4a0000-0000-0000-0000-000000000011","name":"Install railing","group":"labor","quantity":"1","unit":"ea","unitPriceCents":25000},
        {"id":"0e4a0000-0000-0000-0000-000000000012","name":"Bracket","group":"material","quantity":"12","unit":"ea","unitPriceCents":1213},
        {"id":"0e4a0000-0000-0000-0000-000000000013","name":"Deep clean","group":"service","quantity":"1","unit":"ea","unitPriceCents":9000,"optional":true}]}],
      "settings":{"discount":{"kind":"fixed","cents":1000},"tax":{"enabled":true,"rateBps":950,"groups":{"service":false,"labor":false,"material":true}},
                  "deposit":{"kind":"pct","bps":1000}}}');
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
-- off for every company until the operator marks it a demo (security audit 06.11, item 2; T54)
reset role; reset request.jwt.claim.sub; set role anon;
do $$
declare r jsonb; v_inv uuid;
begin
  r := public.portal_estimate('tok_inv_0123456789abcdef');
  perform tst.ok((r ->> 'simulated_pay')::boolean is false, 'a real company: the page shows no card button');
  select (x ->> 'id')::uuid into v_inv from jsonb_array_elements(r -> 'invoices') x where x ->> 'kind' = 'final';
  perform tst.fails_like(format($q$select public.portal_pay_simulated('tok_inv_0123456789abcdef', %L)$q$, v_inv), 'card payments are not available yet', 'a real company takes no simulated card payment');
end $$;
reset role;
insert into app.company_flags (company_id, simulated_payments) values ('ca000000-0000-0000-0000-000000000000', true);
set role anon;
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
    insert into public.jobs (id, company_id, title, customer_id, property_id, status) values (v_j, 'ca000000-0000-0000-0000-000000000000', 'Gate job ' || k, v_c, v_p, 'draft'); update public.jobs set status = 'scheduled' where id = v_j;
    insert into public.visits (id, company_id, job_id, starts_at) values (v_v, 'ca000000-0000-0000-0000-000000000000', v_j, now() + (plan[k][1] || ' days')::interval);
    insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', v_v, 'a0000000-0000-0000-0000-000000000003');
    if plan[k][2] = 'cancelled' then perform public.cancel_visit(v_v, 'we_cancelled'); end if;
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
-- fixture (7-2: memberships are not inserted by clients)
insert into public.memberships (company_id, user_id, role, status) values ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000005', 'sales', 'active');
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
    insert into public.jobs (id, company_id, title, customer_id, property_id, status) values (v_j, 'ca000000-0000-0000-0000-000000000000', 'Gate job ' || k, v_c, v_p, 'draft'); update public.jobs set status = 'scheduled' where id = v_j;
    insert into public.visits (id, company_id, job_id, starts_at) values (v_v, 'ca000000-0000-0000-0000-000000000000', v_j, case when k = 6 then now() + interval '2 days' else now() end);
    insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', v_v, 'a0000000-0000-0000-0000-000000000003');
  end loop;
  update public.visits set status = 'en_route' where id = 'f2000000-0000-4000-8000-000000000007';
  update public.visits set status = 'on_site' where id = 'f2000000-0000-4000-8000-000000000007';
  update public.visits set status = 'completed' where id = 'f2000000-0000-4000-8000-000000000007';
  perform public.cancel_visit('f2000000-0000-4000-8000-000000000008', 'no_show');
  update public.visit_assignees set deleted_at = now() where visit_id = 'f2000000-0000-4000-8000-000000000009';
  update public.visits set deleted_at = now() where id = 'f2000000-0000-4000-8000-000000000010';
  perform tst.server_job($q$update public.jobs set deleted_at = now() where id = 'e2000000-0000-4000-8000-000000000011' returning id$q$);   -- no app path deletes a job (column grants, 20261107040000)
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
    insert into public.jobs (id, company_id, title, customer_id, property_id, status) values (v_j, 'ca000000-0000-0000-0000-000000000000', 'Window job ' || k, v_c, v_p, 'draft'); update public.jobs set status = 'scheduled' where id = v_j;
    insert into public.visits (id, company_id, job_id, starts_at) values (v_v, 'ca000000-0000-0000-0000-000000000000', v_j,
      case k when 15 then ((now() at time zone 'America/Los_Angeles')::date - 15 + time '12:00') at time zone 'America/Los_Angeles' when 18 then now() - interval '10 days' else now() + interval '1 day' end);
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
    insert into public.jobs (id, company_id, title, customer_id, property_id, status) values (v_j, 'ca000000-0000-0000-0000-000000000000', 'Edge job ' || k, v_c, v_p, 'draft'); update public.jobs set status = 'scheduled' where id = v_j;
    insert into public.visits (id, company_id, job_id, starts_at) values (v_v, 'ca000000-0000-0000-0000-000000000000', v_j,
      case when k in (23, 24) then null else now() + interval '1 day' end);
    insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', v_v, 'a0000000-0000-0000-0000-000000000003');
  end loop;
  update public.jobs set status = 'cancelled' where id = 'e2000000-0000-4000-8000-000000000021';
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
-- job 22: closed while its visit is still open — the app no longer lets the office do this (wave 3c, T46), so the old
-- state is made by hand here
update public.jobs set status = 'in_progress' where id = 'e2000000-0000-4000-8000-000000000022';
update public.jobs set status = 'completed' where id = 'e2000000-0000-4000-8000-000000000022';
update public.jobs set status = 'closed' where id = 'e2000000-0000-4000-8000-000000000022';
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
    insert into public.jobs (id, company_id, title, customer_id, property_id, status) values (v_j, 'ca000000-0000-0000-0000-000000000000', 'T26 job ' || k, v_c, v_p, 'draft'); update public.jobs set status = 'scheduled' where id = v_j;
    insert into public.visits (id, company_id, job_id, starts_at) values (v_v, 'ca000000-0000-0000-0000-000000000000', v_j,
      case k when 1 then ((now() at time zone 'America/Los_Angeles')::date - 15 + time '12:00') at time zone 'America/Los_Angeles' else now() + interval '1 day' end);
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
    = (select array_agg(k order by k) from (select jsonb_object_keys(app.portal_estimate_base('tok_lang_0123456789abcdef')) k union all select 'doc_language' union all select 'simulated_pay') x),
    'answer keys = base keys + doc_language + simulated_pay (T54), nothing else');
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

-- T23, E2b-2 «Команда» → «Сотрудник»: title and HIS under the signature — owner and admin; a tech cannot change even their own
:as_office_a   -- admin since T6
do $$ begin
  update public.memberships set title = 'Field lead', his_registration_number = 'HIS-555'
   where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003';
  perform tst.ok((select title = 'Field lead' and his_registration_number = 'HIS-555' from public.memberships
                   where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003'), 'admin sets title and HIS');
  update public.memberships set can_sign_contracts = true, title = 'Field lead 2'
   where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003';  -- the right unchanged: allowed
end $$;
:as_tech_a
do $$ begin
  update public.memberships set title = 'Boss', his_registration_number = 'FAKE'
   where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003';
  update public.memberships set can_sign_contracts = false where user_id = 'a0000000-0000-0000-0000-000000000003';
end $$;
:as_owner_a
do $$ begin
  perform tst.ok((select title = 'Field lead 2' and his_registration_number = 'HIS-555' from public.memberships
                   where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003'), 'tech cannot change own title or HIS');
  perform tst.ok((select can_sign_contracts from public.memberships
                   where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003'), 'tech cannot take their own right to sign');
end $$;
:as_owner_b
do $$ begin
  update public.memberships set title = 'Hacked' where company_id = 'ca000000-0000-0000-0000-000000000000';
end $$;
:as_owner_a
do $$ begin
  perform tst.ok(not exists (select 1 from public.memberships where company_id = 'ca000000-0000-0000-0000-000000000000' and title = 'Hacked'), 'another company cannot change A''s employees');
end $$;
\echo 'T23 employee title and HIS ok'

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
  -- job ← estimate (portal_accept and countersign insert it in a server function; the app cannot, t14)
  v_j := tst.server_job(format($q$insert into public.jobs (company_id, title, customer_id, property_id, estimate_id) values ('ca000000-0000-0000-0000-000000000000', 'T27 job', %L, %L, %L) returning id$q$, v_c, v_p, v_e));
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
  v_j := tst.server_job(format($q$insert into public.jobs (company_id, title, customer_id, property_id, estimate_id) values ('ca000000-0000-0000-0000-000000000000', 'T27 job none', %L, %L, %L) returning id$q$, v_c, v_p, v_e2));
  perform tst.ok((select service_category_id from public.jobs where id = v_j) is null, 'estimate without a direction → job without one');
  -- archive: not chosen anew, stays where it is, a job may still take its estimate's
  update public.service_categories set archived_at = now() where id = v_roof;
  perform tst.fails(format($q$update public.leads set service_category_id = %L where id = %L$q$, v_roof, v_lead), 'archived direction is not chosen anew');
  perform tst.fails(format($q$insert into public.estimates (company_id, customer_id, property_id, service_category_id, title) values ('ca000000-0000-0000-0000-000000000000', %L, %L, %L, 'x')$q$, v_c, v_p, v_roof), 'archived direction not set on a new estimate');
  update public.leads set contact_name = 'T27 Two (renamed)' where id = v_lead2;
  perform tst.ok((select service_category_id from public.leads where id = v_lead2) = v_roof, 'archived direction stays on an edited lead');
  insert into public.estimates (company_id, customer_id, property_id, lead_id, title) values ('ca000000-0000-0000-0000-000000000000', v_c, v_p, v_lead2, 'T27 e6') returning id into v_e2;
  perform tst.ok((select service_category_id from public.estimates where id = v_e2) = v_roof, 'estimate of the lead keeps the archived direction of its lead');
  v_j := tst.server_job(format($q$insert into public.jobs (company_id, title, customer_id, property_id, estimate_id, service_category_id) values ('ca000000-0000-0000-0000-000000000000', 'T27 job arch', %L, %L, %L, %L) returning id$q$, v_c, v_p, v_e2, v_roof));
  perform tst.ok((select service_category_id from public.jobs where id = v_j) = v_roof, 'a job may take the archived direction of its parent');
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
  -- another property of the job's own client (a job moves only within its client, t14)
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('d3200000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', (select customer_id from public.jobs where id = v_j), '32 Moved St', 'Pasadena') returning id into v_p2;
  -- the job moves to another property: its visits follow
  -- (the app does not move a job; a server path would — column grants, 20261107040000)
  perform tst.server_job(format('update public.jobs set property_id = %L where id = %L returning id', v_p2, v_j));
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
-- (a job at someone else's property cannot be inserted by the app any more — t14, T47; the old data is made as super)
:as_super
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

-- ---------------------------------------------------------------- T35: several people on a visit — public.assign_visit (S9, S9b)
:as_super
insert into auth.users (id, email, raw_user_meta_data) values
  ('a3500000-0000-4000-8000-000000000001', 'tech35@a.test', '{"full_name":"Tess Second"}'),
  ('a3500000-0000-4000-8000-000000000002', 'gone35@a.test', '{"full_name":"Gus Gone"}');
-- fixture (since 7-2 a membership is born only by accepting an invitation, or the company's owner trigger)
:as_super
insert into public.memberships (company_id, user_id, role, status) values
  ('ca000000-0000-0000-0000-000000000000', 'a3500000-0000-4000-8000-000000000001', 'tech', 'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a3500000-0000-4000-8000-000000000002', 'tech', 'invited');
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values ('c3500000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T35 Client');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('d3500000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c3500000-0000-4000-8000-000000000001', '35 Crew St', 'Pasadena');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values ('e3500000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T35 job', 'c3500000-0000-4000-8000-000000000001', 'd3500000-0000-4000-8000-000000000001', 'draft');
  insert into public.visits (id, company_id, job_id, starts_at) values
    ('f3500000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e3500000-0000-4000-8000-000000000001', now() + interval '1 day'),
    ('f3500000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'e3500000-0000-4000-8000-000000000001', now() + interval '2 days');
end $$;
-- the office sets two people at once; a repeat changes nothing
:as_office_a
select tst.ok((public.assign_visit('f3500000-0000-4000-8000-000000000001', array['a0000000-0000-0000-0000-000000000003', 'a3500000-0000-4000-8000-000000000001', 'a3500000-0000-4000-8000-000000000001']::uuid[]) ->> 'added')::int = 2, 'two people on one visit (a doubled id counts once)');
select tst.ok((public.assign_visit('f3500000-0000-4000-8000-000000000001', array['a3500000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000003']::uuid[]) ->> 'added')::int = 0, 'a repeat with the same list changes nothing');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.visits where id = 'f3500000-0000-4000-8000-000000000001'$q$) = 1, 'the first person sees the visit');
reset role; set request.jwt.claim.sub = 'a3500000-0000-4000-8000-000000000001'; set role authenticated;
select tst.ok(tst.cnt($q$select 1 from public.visits where id = 'f3500000-0000-4000-8000-000000000001'$q$) = 1, 'the second person sees the visit too');
-- take one off: marked, not deleted; that person stops seeing the visit
:as_office_a
select tst.ok((public.assign_visit('f3500000-0000-4000-8000-000000000001', array['a0000000-0000-0000-0000-000000000003']::uuid[]) ->> 'removed')::int = 1, 'one person taken off');
select tst.ok((select deleted_at is not null from public.visit_assignees where visit_id = 'f3500000-0000-4000-8000-000000000001' and user_id = 'a3500000-0000-4000-8000-000000000001'), 'taken off with deleted_at, the row stays');
reset role; set request.jwt.claim.sub = 'a3500000-0000-4000-8000-000000000001'; set role authenticated;
select tst.ok(tst.cnt($q$select 1 from public.visits where id = 'f3500000-0000-4000-8000-000000000001'$q$) = 0, 'the person taken off no longer sees the visit');
-- back on: the same row comes back
:as_office_a
select tst.ok((public.assign_visit('f3500000-0000-4000-8000-000000000001', array['a0000000-0000-0000-0000-000000000003', 'a3500000-0000-4000-8000-000000000001']::uuid[]) ->> 'added')::int = 1, 'put back on');
select tst.ok((select count(*) from public.visit_assignees where visit_id = 'f3500000-0000-4000-8000-000000000001' and user_id = 'a3500000-0000-4000-8000-000000000001') = 1, 'one row per person, no doubles');
-- «Снять всех»
select tst.ok((public.assign_visit('f3500000-0000-4000-8000-000000000002', array['a0000000-0000-0000-0000-000000000003']::uuid[]) ->> 'added')::int = 1, 'second visit: one person');
select tst.ok((public.assign_visit('f3500000-0000-4000-8000-000000000002', '{}') ->> 'removed')::int = 1, 'take everyone off');
select tst.ok(tst.cnt($q$select 1 from public.visit_assignees where visit_id = 'f3500000-0000-4000-8000-000000000002' and deleted_at is null$q$) = 0, 'nobody left on the visit');
-- only active members of the same company
select tst.fails($q$select public.assign_visit('f3500000-0000-4000-8000-000000000002', array['a3500000-0000-4000-8000-000000000002']::uuid[])$q$, 'an invited (not active) member is not assigned');
select tst.fails($q$select public.assign_visit('f3500000-0000-4000-8000-000000000002', array['b0000000-0000-0000-0000-000000000002']::uuid[])$q$, 'a person of another company is not assigned');
select tst.fails($q$insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', 'f3500000-0000-4000-8000-000000000002', 'a3500000-0000-4000-8000-000000000002')$q$, 'a direct insert of an invited member is refused too');
-- nothing is deleted; a row does not move to another visit or person
select tst.fails($q$delete from public.visit_assignees where visit_id = 'f3500000-0000-4000-8000-000000000001'$q$, 'a hard delete is refused (deleted_at)');
select tst.fails($q$update public.visit_assignees set user_id = 'a3500000-0000-4000-8000-000000000002' where visit_id = 'f3500000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-0000-0000-000000000003'$q$, 'an assignment does not move to another person');
-- not the office: refused, also directly (visit_assignees_insert lets every staff role in)
:as_sales_a
select tst.fails($q$select public.assign_visit('f3500000-0000-4000-8000-000000000002', array['a0000000-0000-0000-0000-000000000003']::uuid[])$q$, 'sales does not assign (owner, admin, office only)');
select tst.fails($q$insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', 'f3500000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000003')$q$, 'sales cannot assign with a direct insert');
select tst.fails($q$update public.visit_assignees set deleted_at = now() where visit_id = 'f3500000-0000-4000-8000-000000000001'$q$, 'sales cannot take people off directly');
:as_tech_a
select tst.fails($q$select public.assign_visit('f3500000-0000-4000-8000-000000000001', array['a0000000-0000-0000-0000-000000000003']::uuid[])$q$, 'tech does not assign');
:as_owner_b
select tst.fails($q$select public.assign_visit('f3500000-0000-4000-8000-000000000001', array['b0000000-0000-0000-0000-000000000002']::uuid[])$q$, 'another company does not assign on our visit');
select tst.fails($q$select public.assign_visit(gen_random_uuid(), '{}')$q$, 'an unknown visit gives the same refusal');
-- only before "on site"
:as_tech_a
update public.visits set status = 'en_route' where id = 'f3500000-0000-4000-8000-000000000001';
:as_office_a
select tst.ok((public.assign_visit('f3500000-0000-4000-8000-000000000001', array['a0000000-0000-0000-0000-000000000003']::uuid[]) ->> 'removed')::int = 1, 'en_route: people still change');
:as_tech_a
update public.visits set status = 'on_site' where id = 'f3500000-0000-4000-8000-000000000001';
:as_office_a
select tst.fails($q$select public.assign_visit('f3500000-0000-4000-8000-000000000001', array['a0000000-0000-0000-0000-000000000003', 'a3500000-0000-4000-8000-000000000001']::uuid[])$q$, 'on site: people do not change');
select tst.fails($q$insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', 'f3500000-0000-4000-8000-000000000001', 'a3500000-0000-4000-8000-000000000001')$q$, 'on site: a direct insert is refused too');
select tst.ok(tst.cnt($q$select 1 from public.visit_assignees where visit_id = 'f3500000-0000-4000-8000-000000000001' and deleted_at is null$q$) = 1, 'after the refusals the people are as they were');
select tst.ok((public.assign_visit('f3500000-0000-4000-8000-000000000001', array['a0000000-0000-0000-0000-000000000003']::uuid[]) ->> 'added')::int = 0, 'on site: a replay of the same list is not an error (offline queue)');
select tst.fails($q$update public.visit_assignees set visit_id = 'f3500000-0000-4000-8000-000000000002' where visit_id = 'f3500000-0000-4000-8000-000000000001'$q$, 'an assignment does not move to another visit');
-- a member removed with deleted_at (not suspended) is not assigned; a direct «back on» of an inactive one is refused
:as_super
-- fixture: a member removed (7-2: deleted_at is not a field a client writes)
update public.memberships set deleted_at = now() where user_id = 'a3500000-0000-4000-8000-000000000001' and company_id = 'ca000000-0000-0000-0000-000000000000';
:as_office_a
select tst.fails($q$select public.assign_visit('f3500000-0000-4000-8000-000000000002', array['a3500000-0000-4000-8000-000000000001']::uuid[])$q$, 'a deleted member is not assigned');
select tst.fails($q$insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', 'f3500000-0000-4000-8000-000000000002', 'a3500000-0000-4000-8000-000000000001')$q$, 'a direct insert of a deleted member is refused (the visit is still scheduled)');
\echo 'T35 several people on a visit ok'

-- T35 (security check of #105): taken off a visit, a tech loses everything that came with it, not only the visit
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values ('c3500000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T35 Gate Client');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('d3500000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c3500000-0000-4000-8000-000000000002', '35 Gate St', 'Pasadena');
  insert into public.property_secrets (company_id, property_id, gate_code) values ('ca000000-0000-0000-0000-000000000000', 'd3500000-0000-4000-8000-000000000002', '#3535');
  insert into public.notes (company_id, subject_type, subject_id, body, visibility) values
    ('ca000000-0000-0000-0000-000000000000', 'property', 'd3500000-0000-4000-8000-000000000002', 'T35 dog in the yard', 'team'),
    ('ca000000-0000-0000-0000-000000000000', 'customer', 'c3500000-0000-4000-8000-000000000002', 'T35 call before', 'team');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values ('e3500000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T35 gate job', 'c3500000-0000-4000-8000-000000000002', 'd3500000-0000-4000-8000-000000000002', 'draft');
  insert into public.visits (id, company_id, job_id, starts_at) values ('f3500000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'e3500000-0000-4000-8000-000000000002', now() + interval '1 day');
end $$;
:as_office_a
select tst.ok((public.assign_visit('f3500000-0000-4000-8000-000000000003', array['a0000000-0000-0000-0000-000000000003']::uuid[]) ->> 'added')::int = 1, 'the tech is on the gate visit');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd3500000-0000-4000-8000-000000000002'$q$) = 1, 'on the visit: the tech sees the property');
select tst.ok(tst.cnt($q$select 1 from public.customers where id = 'c3500000-0000-4000-8000-000000000002'$q$) = 1, 'on the visit: … the client');
select tst.ok(tst.cnt($q$select 1 from public.notes where body like 'T35 %'$q$) = 2, 'on the visit: … the notes of the property and the client');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd3500000-0000-4000-8000-000000000002'$q$) = 1, 'on the visit (tomorrow): … the gate code');
-- (b) a tech does not put himself on a visit
select tst.fails($q$insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', 'f3500000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000003')$q$, 'a tech does not assign himself (direct insert)');
-- (c) another company does not write an assignment on our visit
:as_owner_b
select tst.fails($q$insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', 'f3500000-0000-4000-8000-000000000002', 'b0000000-0000-0000-0000-000000000002')$q$, 'the owner of B does not assign on a visit of A');
select tst.fails($q$insert into public.visit_assignees (company_id, visit_id, user_id) values ('cb000000-0000-0000-0000-000000000000', 'f3500000-0000-4000-8000-000000000002', 'b0000000-0000-0000-0000-000000000002')$q$, '… not under his own company id either');
-- (a) taken off: nothing of it is left
:as_office_a
select tst.ok((public.assign_visit('f3500000-0000-4000-8000-000000000003', '{}') ->> 'removed')::int = 1, 'the tech is taken off');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.visits where id = 'f3500000-0000-4000-8000-000000000003'$q$) = 0, 'taken off: no visit');
select tst.ok(tst.cnt($q$select 1 from public.properties where id = 'd3500000-0000-4000-8000-000000000002'$q$) = 0, 'taken off: no property');
select tst.ok(tst.cnt($q$select 1 from public.customers where id = 'c3500000-0000-4000-8000-000000000002'$q$) = 0, 'taken off: no client');
select tst.ok(tst.cnt($q$select 1 from public.notes where body like 'T35 %'$q$) = 0, 'taken off: no notes');
select tst.ok(tst.cnt($q$select 1 from public.property_secrets where property_id = 'd3500000-0000-4000-8000-000000000002'$q$) = 0, 'taken off: no gate code');
\echo 'T35 taken off loses everything ok'

:as_super
-- ---------------------------------------------------------------- T23, security-check #98 (migration 20261105330000):
-- the title on the contract is the profile's (owner / admin set it), not the one typed with the employee's own signature
:as_owner_a
do $$
declare e uuid; v uuid; o uuid; k int;
begin
  update public.memberships set title = 'Technician'
   where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003';
  for k in 3..4 loop
    insert into public.estimates (company_id, customer_id, property_id, title) values
      ('ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'E2b ' || k) returning id into e;
    insert into public.estimate_versions (company_id, estimate_id, version_no, deposit_rule) values ('ca000000-0000-0000-0000-000000000000', e, 1, '{"kind":"none"}') returning id into v;
    update public.estimates set current_version_id = v where id = e;
    insert into public.estimate_options (company_id, version_id, name) values ('ca000000-0000-0000-0000-000000000000', v, 'Only') returning id into o;
    insert into public.estimate_line_items (company_id, option_id, line_group, name, quantity, unit_price_cents) values ('ca000000-0000-0000-0000-000000000000', o, 'labor', 'Work', 1, 30000);
    perform set_config('tst.e2b_' || k, e::text || ',' || o::text || ',' || public.send_estimate(e), false);
  end loop;
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
do $$
declare k int;
begin
  for k in 3..4 loop
    perform public.portal_accept(split_part(current_setting('tst.e2b_' || k), ',', 3), split_part(current_setting('tst.e2b_' || k), ',', 2)::uuid,
                                 null, 'Title Client', 'M0 0 L4 4', true);
  end loop;
end $$;
:as_tech_a
do $$
declare v_sig uuid; e uuid := split_part(current_setting('tst.e2b_3'), ',', 1)::uuid;
begin
  insert into public.member_signatures (company_id, user_id, svg, name, title)
  values ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'M5 5 L6 6', 'Tech A', 'President') returning id into v_sig;
  perform tst.ok(public.countersign_estimate(e, null, v_sig) = 'approved', 'the tech signs with their saved signature');
  perform tst.ok((select signer_title from public.estimate_approvals where estimate_id = e and party = 'contractor') = 'Technician',
                 'the contract shows the profile title, not «President» typed with the signature');
end $$;
:as_owner_a
do $$ begin
  update public.memberships set title = null
   where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003';
end $$;
:as_tech_a
do $$
declare e uuid := split_part(current_setting('tst.e2b_4'), ',', 1)::uuid;
begin
  perform tst.ok(public.countersign_estimate(e, null, (select id from public.member_signatures where user_id = 'a0000000-0000-0000-0000-000000000003' and revoked_at is null)) = 'approved', 'signed');
  perform tst.ok((select signer_title from public.estimate_approvals where estimate_id = e and party = 'contractor') = 'President',
                 'no title in the profile: the one typed with the signature');
end $$;
\echo 'T23 contract title from the profile ok'

-- ---------------------------------------------------------------- T37: Почта П1a — the signed copy waits in email_outbox
-- (docs/specs/07-email.md §4, §6, §9; migration 20261105350000; S8b → S8c)
:as_super
insert into public.customers (id, company_id, display_name) values
  ('c3700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T37 Mail Client'),
  ('c3700000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T37 No Mail Client');
insert into public.contacts (id, company_id, customer_id, name, is_primary, preferred_language) values
  ('c3710000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c3700000-0000-4000-8000-000000000001', 'T37 Mail', true, 'es'),
  ('c3710000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c3700000-0000-4000-8000-000000000002', 'T37 No Mail', true, null);
insert into public.contact_emails (company_id, contact_id, address, is_primary, created_by) values
  ('ca000000-0000-0000-0000-000000000000', 'c3710000-0000-4000-8000-000000000001', 'mail37@example.com', true, 'a0000000-0000-0000-0000-000000000002');
update public.customers set primary_contact_id = 'c3710000-0000-4000-8000-000000000001' where id = 'c3700000-0000-4000-8000-000000000001';
update public.customers set primary_contact_id = 'c3710000-0000-4000-8000-000000000002' where id = 'c3700000-0000-4000-8000-000000000002';
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
  ('d3700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c3700000-0000-4000-8000-000000000001', '37 Mail St', 'Pasadena'),
  ('d3700000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c3700000-0000-4000-8000-000000000002', '37 Quiet St', 'Pasadena');
-- an estimate sent and signed by the client (the caller signs on the page by its token); p_both: the company signs too
create function tst.t37_estimate(p_customer uuid, p_property uuid, p_title text, p_both boolean default true)
returns uuid language plpgsql as $$
declare e uuid; v uuid; o uuid; tok text;
begin
  insert into public.estimates (id, company_id, customer_id, property_id, title) values
    (gen_random_uuid(), 'ca000000-0000-0000-0000-000000000000', p_customer, p_property, p_title) returning id into e;
  insert into public.estimate_versions (id, company_id, estimate_id, version_no, deposit_rule) values (gen_random_uuid(), 'ca000000-0000-0000-0000-000000000000', e, 1, '{"kind":"none"}') returning id into v;
  update public.estimates set current_version_id = v where id = e;
  insert into public.estimate_options (id, company_id, version_id, name) values (gen_random_uuid(), 'ca000000-0000-0000-0000-000000000000', v, 'Only') returning id into o;
  insert into public.estimate_line_items (id, company_id, option_id, line_group, name, quantity, unit_price_cents) values (gen_random_uuid(), 'ca000000-0000-0000-0000-000000000000', o, 'labor', 'Work', 1, 40000);
  tok := public.send_estimate(e);
  perform public.portal_accept(tok, o, null, 'T37 Signer', 'M0 0 L7 7', true);
  if p_both then
    perform tst.ok(public.countersign_estimate(e, 'M1 1 L7 7') = 'approved', 'T37 fixture: both signed');
  end if;
  perform set_config('tst.t37_tok_' || p_title, tok, false);
  return e;
end $$;
grant execute on function tst.t37_estimate(uuid, uuid, text, boolean) to authenticated;
grant usage on schema tst to service_role;   -- the edge function's role in 7.
:as_owner_a
do $$
declare e uuid;
begin
  -- 1. the company did not turn the copy on (default, founder В3): one row, skipped_off
  e := tst.t37_estimate('c3700000-0000-4000-8000-000000000001', 'd3700000-0000-4000-8000-000000000001', 't37off');
  perform set_config('tst.t37_off', e::text, false);
  perform tst.ok((select count(*) = 1 and min(status) = 'skipped_off' and bool_and(requested_by is null) from public.email_outbox where estimate_id = e),
                 'new company: the copy is off by default → skipped_off');
end $$;
:as_super
update public.companies set estimate_settings = estimate_settings || '{"autoSendSignedCopy": true}' where id = 'ca000000-0000-0000-0000-000000000000';
:as_owner_a
do $$
declare e uuid; e3 uuid; e4 uuid;
begin
  -- 2. turned on, the client has an email: exactly one queued row, in the client's language
  e := tst.t37_estimate('c3700000-0000-4000-8000-000000000001', 'd3700000-0000-4000-8000-000000000001', 't37on');
  perform set_config('tst.t37_on', e::text, false);
  perform tst.ok((select count(*) = 1 and min(status) = 'queued' and min(lang) = 'es' and bool_and(to_email is null) from public.email_outbox where estimate_id = e),
                 'both signed: one queued row in the client''s language, no address until sending');
  -- a repeat countersign doubles nothing
  perform tst.ok(public.countersign_estimate(e, 'M1 1 L7 7') = 'approved', 'repeat countersign answers approved');
  perform tst.ok((select count(*) from public.email_outbox where estimate_id = e) = 1, 'repeat countersign: still one row');
  -- 3. the client has no email: skipped_no_email, the contract is signed all the same
  e3 := tst.t37_estimate('c3700000-0000-4000-8000-000000000002', 'd3700000-0000-4000-8000-000000000002', 't37nomail');
  perform set_config('tst.t37_nomail', e3::text, false);
  perform tst.ok((select status from public.email_outbox where estimate_id = e3) = 'skipped_no_email', 'no client email → skipped_no_email');
  perform tst.ok((select status from public.estimates where id = e3) = 'approved', 'no client email: the contract is still approved');
  -- a contract signed by the client only: no row yet
  e4 := tst.t37_estimate('c3700000-0000-4000-8000-000000000001', 'd3700000-0000-4000-8000-000000000001', 't37half', false);
  perform set_config('tst.t37_half', e4::text, false);
  perform tst.ok(not exists (select 1 from public.email_outbox where estimate_id = e4), 'client signed only: no copy yet');
  -- nobody writes the queue directly
  perform tst.fails(format($q$insert into public.email_outbox (company_id, estimate_id, kind) values ('ca000000-0000-0000-0000-000000000000', %L, 'signed_copy')$q$, e4), 'owner inserts into the queue');
  perform tst.blocked(format($q$update public.email_outbox set status = 'sent' where estimate_id = %L$q$, e), 'owner marks a row sent');
  perform tst.blocked(format($q$delete from public.email_outbox where estimate_id = %L$q$, e), 'owner deletes a row');
end $$;
-- 4. the queue does not break the signature: a second execute (any path) neither fails nor adds a row
:as_super
do $$
declare e uuid := current_setting('tst.t37_on')::uuid;
begin
  perform app.execute_estimate(e, null, null);
  perform tst.ok((select count(*) from public.email_outbox where estimate_id = e) = 1, 'second execute_estimate: no new row, no error');
  perform tst.ok((select count(*) from public.jobs where estimate_id = e) = 1 and (select status from public.estimates where id = e) = 'approved',
                 'second execute_estimate: the deal stands');
end $$;
-- 5. who sees the journal: owner, office — yes; tech, sales, another company — no; the client page (anon) — no
:as_owner_a
select tst.ok(tst.cnt($q$select 1 from public.email_outbox where estimate_id::text = current_setting('tst.t37_on')$q$) = 1, 'owner sees the journal');
:as_office_a
select tst.ok(tst.cnt($q$select 1 from public.email_outbox where estimate_id::text = current_setting('tst.t37_on')$q$) = 1, 'office sees the journal');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.email_outbox$q$) = 0, 'tech does not see the journal');
:as_sales_a
select tst.ok(tst.cnt($q$select 1 from public.email_outbox$q$) = 0, 'sales does not see the journal');
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.email_outbox$q$) = 0, 'another company does not see the journal');
reset role; reset request.jwt.claim.sub; set role anon;
select tst.fails($q$select 1 from public.email_outbox$q$, 'anon reads the queue');
select tst.fails($q$select public.resend_signed_copy(current_setting('tst.t37_on')::uuid)$q$, 'anon sends again');
select tst.ok(public.portal_estimate(current_setting('tst.t37_tok_t37on')) is not null, 'the signed copy link opens');
\echo 'T37 signed copy queued once, journal for the office ok'

-- 6. «Send again»: role, status, email, 10 minutes, 3 repeats
:as_tech_a
select tst.fails($q$select public.resend_signed_copy(current_setting('tst.t37_on')::uuid)$q$, 'tech sends again');
:as_sales_a
select tst.fails($q$select public.resend_signed_copy(current_setting('tst.t37_on')::uuid)$q$, 'sales sends again');
:as_owner_b
select tst.fails($q$select public.resend_signed_copy(current_setting('tst.t37_on')::uuid)$q$, 'another company sends again');
:as_office_a
select tst.fails($q$select public.resend_signed_copy(current_setting('tst.t37_half')::uuid)$q$, 'not approved: no copy');
select tst.fails($q$select public.resend_signed_copy(current_setting('tst.t37_nomail')::uuid)$q$, 'no client email: no copy');
select tst.fails($q$select public.resend_signed_copy(current_setting('tst.t37_on')::uuid)$q$, 'sooner than 10 minutes after the automatic copy');
:as_super
create function tst.t37_age(p_estimate uuid, p_by interval) returns void language sql as $$
  update public.email_outbox set created_at = created_at - p_by where estimate_id = p_estimate;
$$;
select tst.t37_age(current_setting('tst.t37_on')::uuid, interval '11 minutes');
:as_office_a
select tst.ok(public.resend_signed_copy(current_setting('tst.t37_on')::uuid) = 'queued', 'office sends again: queued');
select tst.ok((select requested_by from public.email_outbox where estimate_id::text = current_setting('tst.t37_on') and requested_by is not null)
              = 'a0000000-0000-0000-0000-000000000002', 'the repeat records who asked (from the session, not from the caller)');
select tst.fails($q$select public.resend_signed_copy(current_setting('tst.t37_on')::uuid)$q$, 'again right away: refused');
:as_super
select tst.t37_age(current_setting('tst.t37_on')::uuid, interval '11 minutes');
:as_owner_a
select tst.ok(public.resend_signed_copy(current_setting('tst.t37_on')::uuid) = 'queued', 'second repeat');
:as_super
select tst.t37_age(current_setting('tst.t37_on')::uuid, interval '11 minutes');
:as_owner_a
select tst.ok(public.resend_signed_copy(current_setting('tst.t37_on')::uuid) = 'queued', 'third repeat');
:as_super
select tst.t37_age(current_setting('tst.t37_on')::uuid, interval '11 minutes');
:as_owner_a
select tst.fails($q$select public.resend_signed_copy(current_setting('tst.t37_on')::uuid)$q$, 'a fourth repeat: refused (3 in all)');
select tst.ok(tst.cnt($q$select 1 from public.email_outbox where estimate_id::text = current_setting('tst.t37_on')$q$) = 4, 'one automatic + three repeats');
\echo 'T37 send again: role, status, email, 10 minutes, 3 repeats ok'

-- 7. The edge function's side: take a row once; sent / failed / final; old rows expire; only the service role
:as_owner_a
select tst.fails($q$select public.email_claim((select id from public.email_outbox limit 1))$q$, 'a member takes a queue row');
select tst.fails($q$select public.email_finish((select id from public.email_outbox limit 1), 'sent')$q$, 'a member marks a row sent');
:as_super
do $$
declare
  e uuid := current_setting('tst.t37_on')::uuid;
  ids uuid[] := (select array_agg(id order by created_at) from public.email_outbox where estimate_id = e);
  j jsonb;
begin
  perform set_config('tst.t37_ids', array_to_string(ids, ','), false);
  -- all four rows are aged 44 minutes or less: bring them back inside the day
  update public.email_outbox set created_at = now() - interval '1 minute' where estimate_id = e;
end $$;
set role service_role;
do $$
declare ids uuid[] := string_to_array(current_setting('tst.t37_ids'), ',')::uuid[]; j jsonb;
begin
  j := public.email_claim(ids[1]);
  perform tst.ok(j ->> 'to' = 'mail37@example.com' and j ->> 'lang' = 'es' and (j ->> 'attempt')::int = 1, 'claim: address read from the client card at sending time');
  perform tst.ok(public.email_claim(ids[1]) is null, 'the same webhook again: nothing to send (one letter)');
  perform public.email_finish(ids[1], 'sent', 'resend_abc');
  -- failed → retried → failed for good (a 4xx)
  perform tst.ok(public.email_claim(ids[2]) is not null, 'claim the first repeat');
  perform public.email_finish(ids[2], 'failed', null, 'http_500');
  perform tst.ok((public.email_claim(ids[2]) ->> 'attempt')::int = 2, 'a failed row is taken again');
  perform public.email_finish(ids[2], 'failed', null, 'http_422', true);
  perform tst.ok(public.email_claim(ids[2]) is null, 'after a 4xx: no retry');
  -- no platform key: final
  perform public.email_finish(ids[3], 'not_configured');
  perform tst.ok(public.email_claim(ids[3]) is null, 'not_configured is final');
  perform tst.fails(format($q$select public.email_finish(%L, 'bogus')$q$, ids[4]), 'unknown status refused');
end $$;
:as_super
do $$
declare ids uuid[] := string_to_array(current_setting('tst.t37_ids'), ',')::uuid[];
begin
  perform tst.ok((select status = 'sent' and to_email = 'mail37@example.com' and provider_id = 'resend_abc' and sent_at is not null
                         and to_email_set_by = 'a0000000-0000-0000-0000-000000000002'
                    from public.email_outbox where id = ids[1]), 'sent: address, provider id, who set the address');
  perform tst.ok((select status = 'failed' and attempts = 3 and error = 'http_422' from public.email_outbox where id = ids[2]), 'failed for good: attempts used up, only the code');
  perform tst.ok((select status from public.email_outbox where id = ids[3]) = 'not_configured', 'not_configured kept');
  update public.email_outbox set created_at = now() - interval '25 hours' where id = ids[4];
end $$;
set role service_role;
select tst.ok(public.email_claim(split_part(current_setting('tst.t37_ids'), ',', 4)::uuid) is null, 'a row older than a day is not sent');
:as_super
select tst.ok((select status from public.email_outbox where id = split_part(current_setting('tst.t37_ids'), ',', 4)::uuid) = 'expired', 'an old row expires');
-- the client lost their email between signing and sending
do $$
declare e uuid; r uuid;
begin
  insert into public.email_outbox (company_id, estimate_id, kind, requested_by) values
    ('ca000000-0000-0000-0000-000000000000', current_setting('tst.t37_nomail')::uuid, 'signed_copy', 'a0000000-0000-0000-0000-000000000001') returning id into r;
  perform set_config('tst.t37_lost', r::text, false);
end $$;
set role service_role;
select tst.ok(public.email_claim(current_setting('tst.t37_lost')::uuid) is null, 'no address at sending time: nothing sent');
:as_super
select tst.ok((select status from public.email_outbox where id = current_setting('tst.t37_lost')::uuid) = 'skipped_no_email', 'no address at sending time → skipped_no_email');
\echo 'T37 claim once, retries, expiry, service role only ok'

-- 8. Addresses: one clean ASCII address only (§9.10)
select tst.ok(app.clean_email('  Ok.Name+1@ex-ample.co ') = 'Ok.Name+1@ex-ample.co', 'clean address trimmed');
select tst.ok(app.clean_email('a@b.com?cc=x@y.com') is null, 'a query in the address');
select tst.ok(app.clean_email(e'a@b.com\r\nBcc: x@y.com') is null, 'CR LF in the address');
select tst.ok(app.clean_email('a@b.com,c@d.com') is null and app.clean_email('a@b.com;c@d.com') is null, 'two addresses');
select tst.ok(app.clean_email('jüri@example.com') is null, 'not ASCII');
select tst.ok(app.clean_email(repeat('a', 243) || '@example.com') is null, 'longer than 254');
select tst.ok(app.clean_email('a..b@example.com') is null and app.clean_email('.a@example.com') is null and app.clean_email('a@example') is null, 'malformed');
select tst.ok(app.clean_email('<a@b.com>') is null and app.clean_email('A <a@b.com>') is null, 'a display name is not an address');
select tst.ok(app.clean_email('a%evil.com@relay.com') is null and app.clean_email('a!b@relay.com') is null, 'no routing characters');
select tst.ok(app.clean_email(repeat('a', 65) || '@example.com') is null and app.clean_email(repeat('a', 64) || '@example.com') is not null, 'local part ≤ 64');
\echo 'T37 clean addresses ok'

-- 9. Limits: 20 a day for a company, 90 a day for the platform → rate_limited; skipped rows do not count
do $$
begin
  insert into public.email_outbox (company_id, estimate_id, kind, status, requested_by)
  select 'ca000000-0000-0000-0000-000000000000', current_setting('tst.t37_off')::uuid, 'signed_copy', 'sent', 'a0000000-0000-0000-0000-000000000001'
    from generate_series(1, 18);
end $$;
:as_owner_a
do $$
declare e uuid;
begin
  -- the company has 20 today: 18 + the sent copy + the failed one (skipped, not_configured and expired do not count)
  e := tst.t37_estimate('c3700000-0000-4000-8000-000000000001', 'd3700000-0000-4000-8000-000000000001', 't37limit');
  perform tst.ok((select status from public.email_outbox where estimate_id = e) = 'rate_limited', 'company over 20 a day → rate_limited');
  perform tst.ok((select status from public.estimates where id = e) = 'approved', 'over the limit: the contract is still signed');
end $$;
:as_super
delete from public.email_outbox where estimate_id = current_setting('tst.t37_off')::uuid and status = 'sent';
-- the platform: 90 letters of other companies today
insert into public.customers (id, company_id, display_name) values ('c3700000-0000-4000-8000-0000000000b1', 'cb000000-0000-0000-0000-000000000000', 'T37 B Client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('d3700000-0000-4000-8000-0000000000b1', 'cb000000-0000-0000-0000-000000000000', 'c3700000-0000-4000-8000-0000000000b1', '37 Rival St', 'Glendale');
insert into public.estimates (id, company_id, customer_id, property_id, title) values ('0e370000-0000-4000-8000-0000000000b1', 'cb000000-0000-0000-0000-000000000000', 'c3700000-0000-4000-8000-0000000000b1', 'd3700000-0000-4000-8000-0000000000b1', 'T37 B');
insert into public.email_outbox (company_id, estimate_id, kind, status, requested_by)
select 'cb000000-0000-0000-0000-000000000000', '0e370000-0000-4000-8000-0000000000b1', 'signed_copy', 'sent', 'b0000000-0000-0000-0000-000000000001'
  from generate_series(1, 90);
select tst.t37_age(current_setting('tst.t37_nomail')::uuid, interval '11 minutes');
-- the client of the no-email contract adds an address later; the office sends the copy by hand
insert into public.contact_emails (company_id, contact_id, address, is_primary) values
  ('ca000000-0000-0000-0000-000000000000', 'c3710000-0000-4000-8000-000000000002', 'late37@example.com', true);
:as_office_a
select tst.ok(public.resend_signed_copy(current_setting('tst.t37_nomail')::uuid) = 'rate_limited', 'platform over 90 a day → rate_limited');
:as_super
delete from public.email_outbox where company_id = 'cb000000-0000-0000-0000-000000000000';
select tst.ok(not app.email_over_limit('ca000000-0000-0000-0000-000000000000'), 'skipped and limited rows do not count');
\echo 'T37 daily limits ok'

-- 10. A new link for a signed estimate (§9.7): director and office; the old link dies for good
:as_tech_a
select tst.fails($q$select public.reissue_estimate_link(current_setting('tst.t37_on')::uuid)$q$, 'tech issues a new link');
:as_owner_b
select tst.fails($q$select public.reissue_estimate_link(current_setting('tst.t37_on')::uuid)$q$, 'another company issues a new link');
:as_owner_a
do $$
declare e uuid; t text;
begin
  insert into public.estimates (id, company_id, customer_id, property_id, title) values
    (gen_random_uuid(), 'ca000000-0000-0000-0000-000000000000', 'c3700000-0000-4000-8000-000000000001', 'd3700000-0000-4000-8000-000000000001', 'T37 draft') returning id into e;
  perform tst.fails(format($q$select public.reissue_estimate_link(%L)$q$, e), 'an unsigned estimate: revoke and send instead');
  t := public.reissue_estimate_link(current_setting('tst.t37_on')::uuid);
  perform tst.ok(t <> current_setting('tst.t37_tok_t37on') and length(t) >= 20, 'a new token');
  perform set_config('tst.t37_newtok', t, false);
  perform tst.fails($q$update public.estimates set public_token = 'tok_t37_planted_0123456789' where id = current_setting('tst.t37_on')::uuid$q$,
                    'the link still changes only through the functions');
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
select tst.ok(public.portal_estimate(current_setting('tst.t37_tok_t37on')) is null, 'the old link no longer opens');
select tst.ok(public.portal_estimate(current_setting('tst.t37_newtok')) ->> 'status' = 'approved', 'the new link opens the signed contract');
:as_super
select tst.ok(exists (select 1 from public.revoked_link_tokens where token_hash = encode(sha256(convert_to(current_setting('tst.t37_tok_t37on'), 'UTF8')), 'hex')),
              'the old token is on the revoked list');
select tst.ok(exists (select 1 from public.activities where subject_id = current_setting('tst.t37_on')::uuid and meta ->> 'action' = 'link_reissued'), 'reissue in the history');
update public.companies set estimate_settings = estimate_settings - 'autoSendSignedCopy' where id = 'ca000000-0000-0000-0000-000000000000';
\echo 'T37 new link for a signed estimate ok'

-- 11. security-check П1a: the queue never rolls a signature back; a row is checked again at sending time; app. functions closed
:as_super
create function tst.t37_boom() returns trigger language plpgsql as $$ begin raise exception 'queue is down'; end $$;
create trigger t37_boom before insert on public.email_outbox for each row execute function tst.t37_boom();
update public.companies set estimate_settings = estimate_settings || '{"autoSendSignedCopy": true}' where id = 'ca000000-0000-0000-0000-000000000000';
:as_owner_a
do $$
declare e uuid;
begin
  e := tst.t37_estimate('c3700000-0000-4000-8000-000000000001', 'd3700000-0000-4000-8000-000000000001', 't37boom');
  perform tst.ok((select status from public.estimates where id = e) = 'approved', 'the queue fails: the contract is still signed');
  perform tst.ok((select count(*) from public.jobs where estimate_id = e) = 1, 'the queue fails: the job is made');
  perform tst.ok(not exists (select 1 from public.email_outbox where estimate_id = e), 'the queue fails: no row, no error');
end $$;
:as_super
drop trigger t37_boom on public.email_outbox;
-- junk in the setting means off and never raises
update public.companies set estimate_settings = estimate_settings || '{"autoSendSignedCopy": "yes"}' where id = 'ca000000-0000-0000-0000-000000000000';
:as_owner_a
do $$
declare e uuid;
begin
  e := tst.t37_estimate('c3700000-0000-4000-8000-000000000001', 'd3700000-0000-4000-8000-000000000001', 't37junk');
  perform set_config('tst.t37_junk', e::text, false);
  perform tst.ok((select status from public.email_outbox where estimate_id = e) = 'skipped_off', 'a junk setting reads as off');
end $$;
:as_super
update public.companies set estimate_settings = estimate_settings || '{"autoSendSignedCopy": true}' where id = 'ca000000-0000-0000-0000-000000000000';
-- queued, then the estimate is deleted / the company turns the copy off: nothing is sent
do $$
declare r1 uuid; r2 uuid;
begin
  insert into public.email_outbox (company_id, estimate_id, kind, status) values
    ('ca000000-0000-0000-0000-000000000000', current_setting('tst.t37_junk')::uuid, 'signed_copy', 'queued')
  on conflict do nothing;
  update public.email_outbox set status = 'queued' where estimate_id = current_setting('tst.t37_junk')::uuid returning id into r1;
  perform set_config('tst.t37_r1', r1::text, false);
end $$;
update public.companies set estimate_settings = estimate_settings - 'autoSendSignedCopy' where id = 'ca000000-0000-0000-0000-000000000000';
set role service_role;
select tst.ok(public.email_claim(current_setting('tst.t37_r1')::uuid) is null, 'turned off after queueing: the automatic copy is not sent');
:as_super
select tst.ok((select status from public.email_outbox where id = current_setting('tst.t37_r1')::uuid) = 'skipped_off', 'turned off after queueing → skipped_off');
update public.email_outbox set status = 'queued', attempts = 0 where id = current_setting('tst.t37_r1')::uuid;
update public.companies set estimate_settings = estimate_settings || '{"autoSendSignedCopy": true}' where id = 'ca000000-0000-0000-0000-000000000000';
update public.estimates set deleted_at = now() where id = current_setting('tst.t37_junk')::uuid;
set role service_role;
select tst.ok(public.email_claim(current_setting('tst.t37_r1')::uuid) is null, 'deleted estimate: nothing sent');
:as_super
select tst.ok((select status from public.email_outbox where id = current_setting('tst.t37_r1')::uuid) = 'expired', 'deleted estimate → expired');
update public.companies set estimate_settings = estimate_settings - 'autoSendSignedCopy' where id = 'ca000000-0000-0000-0000-000000000000';
-- the error column keeps a code only
do $$
declare r uuid;
begin
  insert into public.email_outbox (company_id, estimate_id, kind, status, requested_by) values
    ('ca000000-0000-0000-0000-000000000000', current_setting('tst.t37_on')::uuid, 'signed_copy', 'sending', 'a0000000-0000-0000-0000-000000000001') returning id into r;
  perform set_config('tst.t37_err', r::text, false);
  perform tst.fails(format($q$update public.email_outbox set error = 'bad to: mail37@example.com' where id = %L$q$, r), 'an address in error refused');
end $$;
set role service_role;
select public.email_finish(current_setting('tst.t37_err')::uuid, 'failed', null, E'HTTP 500 for <mail37@example.com>\r\n');
:as_super
select tst.ok((select error from public.email_outbox where id = current_setting('tst.t37_err')::uuid) !~ '[@<> ]', 'email_finish keeps only code characters');
delete from public.email_outbox where id = current_setting('tst.t37_err')::uuid;
-- members cannot call the app. functions of the queue (authenticated has usage on schema app)
:as_owner_a
select tst.fails($q$select app.enqueue_signed_copy(current_setting('tst.t37_on')::uuid)$q$, 'a member queues a copy');
select tst.fails($q$select app.email_over_limit('ca000000-0000-0000-0000-000000000000')$q$, 'a member reads the limits');
select tst.fails($q$select app.email_outbox_purge()$q$, 'a member purges the journal');
select tst.fails($q$select * from app.estimate_client_email(current_setting('tst.t37_on')::uuid)$q$, 'a member reads a client address through app.');
select tst.fails($q$select app.clean_email('a@b.com')$q$, 'a member calls clean_email');
\echo 'T37 security-check: signature safe, checked at sending, app. closed ok'

-- ---------------------------------------------------------------- T36: when the tech left — visits.en_route_at (П3c, migration 20261105360000)
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values ('c3600000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T36 Client');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('d3600000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c3600000-0000-4000-8000-000000000001', '36 Late St', 'Pasadena');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values ('e3600000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T36 job', 'c3600000-0000-4000-8000-000000000001', 'd3600000-0000-4000-8000-000000000001', 'draft');
  insert into public.visits (id, company_id, job_id, starts_at) values
    ('f3600000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e3600000-0000-4000-8000-000000000001', now() - interval '20 minutes'),
    ('f3600000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'e3600000-0000-4000-8000-000000000001', now() - interval '20 minutes'),
    ('f3600000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'e3600000-0000-4000-8000-000000000001', now() - interval '20 minutes');
end $$;
select tst.fails($q$insert into public.visits (company_id, job_id, starts_at, en_route_at) values ('ca000000-0000-0000-0000-000000000000', 'e3600000-0000-4000-8000-000000000001', now(), now())$q$, 'a new visit has no «left at» time');
:as_office_a
select (public.assign_visit(v, array['a0000000-0000-0000-0000-000000000003']::uuid[]) ->> 'added') from unnest(array['f3600000-0000-4000-8000-000000000001', 'f3600000-0000-4000-8000-000000000002', 'f3600000-0000-4000-8000-000000000003']::uuid[]) v;
:as_tech_a
select tst.fails($q$update public.visits set en_route_at = now() where id = 'f3600000-0000-4000-8000-000000000001'$q$, 'the time alone, without the step «on the way», is refused');
-- a time the server cannot believe becomes now(), not a refusal (a refusal would jam the offline queue)
update public.visits set status = 'en_route', en_route_at = now() + interval '5 minutes 1 second' where id = 'f3600000-0000-4000-8000-000000000003';
select tst.ok((select en_route_at between now() - interval '1 minute' and now() from public.visits where id = 'f3600000-0000-4000-8000-000000000003'), 'more than 5 min in the future becomes now()');
update public.visits set status = 'en_route', en_route_at = now() + interval '4 minutes 59 seconds' where id = 'f3600000-0000-4000-8000-000000000001';
select tst.ok((select en_route_at between now() + interval '4 minutes' and now() + interval '5 minutes' from public.visits where id = 'f3600000-0000-4000-8000-000000000001'), 'the phone time (within 5 min) is kept with the step');
-- once set: a repeat of «on the way» with another time (the second person, older data) keeps the first, no error
update public.visits set status = 'en_route', en_route_at = now() - interval '1 minute' where id = 'f3600000-0000-4000-8000-000000000001';
update public.visits set en_route_at = null where id = 'f3600000-0000-4000-8000-000000000001';
select tst.ok((select en_route_at between now() + interval '4 minutes' and now() + interval '5 minutes' from public.visits where id = 'f3600000-0000-4000-8000-000000000001'), 'on the way: another time or a wipe keeps the first time');
-- a replay of the same step (offline queue) is not an error and keeps the first time
update public.visits set status = 'en_route' where id = 'f3600000-0000-4000-8000-000000000001';
select tst.ok((select en_route_at between now() + interval '4 minutes' and now() + interval '5 minutes' from public.visits where id = 'f3600000-0000-4000-8000-000000000001'), 'a replay keeps the first time');
-- an old build sends the step without a time: the server notes now()
update public.visits set status = 'en_route' where id = 'f3600000-0000-4000-8000-000000000002';
select tst.ok((select en_route_at between now() - interval '1 minute' and now() from public.visits where id = 'f3600000-0000-4000-8000-000000000002'), 'no time from the phone: the server notes now()');
-- on site: the time stays and still does not change
update public.visits set status = 'on_site' where id = 'f3600000-0000-4000-8000-000000000002';
select tst.ok((select en_route_at is not null from public.visits where id = 'f3600000-0000-4000-8000-000000000002'), 'on site: the «left at» time stays');
-- before the visit existed (or more than 3 days ago): now(), the time is not antedated
:as_owner_a
insert into public.visits (id, company_id, job_id, starts_at) values
  ('f3600000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'e3600000-0000-4000-8000-000000000001', now() - interval '20 minutes'),
  ('f3600000-0000-4000-8000-000000000005', 'ca000000-0000-0000-0000-000000000000', 'e3600000-0000-4000-8000-000000000001', now() - interval '20 minutes');
:as_office_a
select (public.assign_visit(v, array['a0000000-0000-0000-0000-000000000003']::uuid[]) ->> 'added') from unnest(array['f3600000-0000-4000-8000-000000000004', 'f3600000-0000-4000-8000-000000000005']::uuid[]) v;
:as_tech_a
update public.visits set status = 'en_route', en_route_at = now() - interval '2 hours' where id = 'f3600000-0000-4000-8000-000000000004';
select tst.ok((select en_route_at between now() - interval '1 minute' and now() from public.visits where id = 'f3600000-0000-4000-8000-000000000004'), 'a time before the visit was created becomes now()');
-- straight to on site (step «on the way» skipped): no time, and none can be planted later
update public.visits set status = 'on_site' where id = 'f3600000-0000-4000-8000-000000000005';
select tst.fails($q$update public.visits set en_route_at = now() where id = 'f3600000-0000-4000-8000-000000000005'$q$, 'on site without «on the way»: no time planted later');
-- cancelled while on the way: the time stays
:as_office_a
select public.cancel_visit('f3600000-0000-4000-8000-000000000001', 'we_cancelled', null);
select tst.ok((select en_route_at is not null from public.visits where id = 'f3600000-0000-4000-8000-000000000001'), 'cancelled on the way: the time stays');
-- another company does not reach it; without a user (service role) the rule does not apply
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.visits where id = 'f3600000-0000-4000-8000-000000000002'$q$) = 0, 'another company does not see the visit or its time');
reset role; reset request.jwt.claim.sub;
update public.visits set en_route_at = now() - interval '10 minutes' where id = 'f3600000-0000-4000-8000-000000000002';
select tst.ok((select en_route_at between now() - interval '11 minutes' and now() - interval '9 minutes' from public.visits where id = 'f3600000-0000-4000-8000-000000000002'), 'service role (no user) may correct the time');
-- the office has the same rule
:as_office_a
select tst.fails($q$update public.visits set en_route_at = now() - interval '2 hours' where id = 'f3600000-0000-4000-8000-000000000002'$q$, 'the office does not change the time either');
\echo 'T36 visit left-at time ok'

-- ---------------------------------------------------------------- T38: П4a — «Компания → Расписание»
-- (docs/specs/03 «П4 — этап 0», §6.1; migration 20261105370000). Settings and hours: owner / admin change them, the
-- dispatcher (office), sales and the tech read them; the database refuses what the app would ignore (same limits as unit:scheduleSettings).
:as_owner_a
select tst.ok((select schedule_settings = '{}'::jsonb from public.companies where id = 'ca000000-0000-0000-0000-000000000000'), 'new column: {} by default');
update public.companies set schedule_settings = '{"inspectionMin": 60, "lateAfterMin": 30, "arrivalWindowMin": 0, "stepMin": 15}'::jsonb where id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select (schedule_settings ->> 'inspectionMin')::int = 60 and (schedule_settings ->> 'lateAfterMin')::int = 30 from public.companies where id = 'ca000000-0000-0000-0000-000000000000'), 'owner saves the schedule settings');
update public.companies set business_hours = '{"mon": [420, 960], "sat": null, "sun": null}'::jsonb where id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select business_hours -> 'mon' = '[420, 960]'::jsonb and business_hours -> 'sat' = 'null'::jsonb from public.companies where id = 'ca000000-0000-0000-0000-000000000000'), 'owner saves the hours, a day off is null');
select tst.fails($q$update public.companies set schedule_settings = '{"lateAfterMin": 0}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'late after 0 min');
select tst.fails($q$update public.companies set schedule_settings = '{"lateAfterMin": 65}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'late after 65 min (the screen goes to 60)');
select tst.fails($q$update public.companies set schedule_settings = '{"stepMin": 20}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'step 20');
select tst.fails($q$update public.companies set schedule_settings = '{"arrivalWindowMin": 90}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'window 90');
select tst.fails($q$update public.companies set schedule_settings = '{"jobMin": "120"}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'a length as text');
select tst.fails($q$update public.companies set schedule_settings = '{"jobMin": 50}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'a length not on 15 min');
select tst.fails($q$update public.companies set schedule_settings = '{"jobMin": 60.5}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'a fraction of a minute');
select tst.fails($q$update public.companies set schedule_settings = '{"color": 1}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'an unknown key');
select tst.fails($q$update public.companies set schedule_settings = '[]' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'settings not an object');
select tst.fails($q$update public.companies set business_hours = '{"mon": [1080, 480]}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'hours 18:00–8:00');
select tst.fails($q$update public.companies set business_hours = '{"mon": [480, 1500]}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'hours past midnight');
select tst.fails($q$update public.companies set business_hours = '{"monday": [480, 1080]}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'an unknown day');
select tst.fails($q$update public.companies set business_hours = '{"mon": "8-6"}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'hours as text');
update public.companies set business_hours = null where id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select business_hours is null from public.companies where id = 'ca000000-0000-0000-0000-000000000000'), 'hours back to null = the defaults');
:as_office_a   -- admin since T5: the director in the app, may change them
select tst.ok((select (schedule_settings ->> 'lateAfterMin')::int = 30 from public.companies where id = 'ca000000-0000-0000-0000-000000000000'), 'admin reads the settings');
update public.companies set schedule_settings = schedule_settings || '{"lateAfterMin": 25}'::jsonb where id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select (schedule_settings ->> 'lateAfterMin')::int = 25 and (schedule_settings ->> 'inspectionMin')::int = 60 from public.companies where id = 'ca000000-0000-0000-0000-000000000000'), 'admin saves the settings, the rest kept');
update public.companies set schedule_settings = schedule_settings || '{"lateAfterMin": 30}'::jsonb where id = 'ca000000-0000-0000-0000-000000000000';
-- a real dispatcher (role office): reads, does not change
:as_super
update public.memberships set role = 'office' where user_id = 'a0000000-0000-0000-0000-000000000002' and company_id = 'ca000000-0000-0000-0000-000000000000';
:as_office_a
select tst.ok((select (schedule_settings ->> 'lateAfterMin')::int = 30 from public.companies where id = 'ca000000-0000-0000-0000-000000000000'), 'the dispatcher reads the settings');
select tst.blocked($q$update public.companies set schedule_settings = '{"lateAfterMin": 60}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'the dispatcher changes the settings');
select tst.blocked($q$update public.companies set business_hours = '{"sun": [480, 1080]}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'the dispatcher changes the hours');
:as_super
update public.memberships set role = 'admin' where user_id = 'a0000000-0000-0000-0000-000000000002' and company_id = 'ca000000-0000-0000-0000-000000000000';
:as_sales_a
select tst.ok((select (schedule_settings ->> 'lateAfterMin')::int = 30 from public.companies where id = 'ca000000-0000-0000-0000-000000000000'), 'sales reads the settings');
select tst.blocked($q$update public.companies set schedule_settings = '{"lateAfterMin": 60}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'sales changes the settings');
:as_tech_a
select tst.ok((select (schedule_settings ->> 'lateAfterMin')::int = 30 from public.companies where id = 'ca000000-0000-0000-0000-000000000000'), 'the tech reads the settings');
select tst.blocked($q$update public.companies set schedule_settings = '{"lateAfterMin": 60}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'the tech changes the settings');
select tst.blocked($q$update public.companies set business_hours = '{"sun": [480, 1080]}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'the tech changes the hours');
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.companies where id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0, 'another company does not see the settings');
select tst.blocked($q$update public.companies set schedule_settings = '{}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'another company changes the settings');
reset role; reset request.jwt.claim.sub; set role anon;
select tst.fails($q$select schedule_settings from public.companies$q$, 'anon reads the settings');
:as_super
update public.companies set schedule_settings = '{}'::jsonb where id = 'ca000000-0000-0000-0000-000000000000';
\echo 'T38 schedule settings and hours ok'

-- ---------------------------------------------------------------- T39: wave П-1 — job types, the tech's feed, files of a client
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values
    ('c3900000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T39 Mine'),
    ('c3900000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T39 Other');
  insert into public.contacts (id, company_id, customer_id, name, is_primary) values
    ('c3910000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c3900000-0000-4000-8000-000000000001', 'T39 Mary', true),
    ('c3910000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c3900000-0000-4000-8000-000000000002', 'T39 Otto', true);
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
    ('d3900000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c3900000-0000-4000-8000-000000000001', '39 Mine St', 'Pasadena'),
    ('d3900000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c3900000-0000-4000-8000-000000000002', '39 Other St', 'Pasadena');
  insert into public.jobs (id, company_id, title, description, customer_id, property_id, status) values
    ('e3900000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T39 mine', 'Two downspouts', 'c3900000-0000-4000-8000-000000000001', 'd3900000-0000-4000-8000-000000000001', 'draft'),
    ('e3900000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T39 other', null, 'c3900000-0000-4000-8000-000000000002', 'd3900000-0000-4000-8000-000000000002', 'draft'),
    ('e3900000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'T39 long ago', null, 'c3900000-0000-4000-8000-000000000002', 'd3900000-0000-4000-8000-000000000002', 'draft'),
    ('e3900000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'T39 called off', null, 'c3900000-0000-4000-8000-000000000002', 'd3900000-0000-4000-8000-000000000002', 'draft');
  insert into public.visits (id, company_id, job_id, starts_at) values
    ('f3900000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e3900000-0000-4000-8000-000000000001', now() + interval '1 day'),
    ('f3900000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'e3900000-0000-4000-8000-000000000003', now() - interval '20 days'),
    ('f3900000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'e3900000-0000-4000-8000-000000000004', now() + interval '2 days');
  insert into public.activities (company_id, subject_type, subject_id, kind, direction, contact_id, body) values
    ('ca000000-0000-0000-0000-000000000000', 'job', 'e3900000-0000-4000-8000-000000000001', 'call', 'out', 'c3910000-0000-4000-8000-000000000001', 'T39 job mine'),
    ('ca000000-0000-0000-0000-000000000000', 'customer', 'c3900000-0000-4000-8000-000000000001', 'sms', 'in', 'c3910000-0000-4000-8000-000000000001', 'T39 client mine'),
    ('ca000000-0000-0000-0000-000000000000', 'job', 'e3900000-0000-4000-8000-000000000002', 'call', 'out', null, 'T39 job other'),
    ('ca000000-0000-0000-0000-000000000000', 'customer', 'c3900000-0000-4000-8000-000000000002', 'sms', 'out', null, 'T39 client other'),
    ('ca000000-0000-0000-0000-000000000000', 'job', 'e3900000-0000-4000-8000-000000000003', 'call', 'out', null, 'T39 job long ago'),
    ('ca000000-0000-0000-0000-000000000000', 'job', 'e3900000-0000-4000-8000-000000000004', 'call', 'out', null, 'T39 job called off');
  -- the tech is on both: a visit 20 days ago, and a visit of a job cancelled later
  insert into public.visit_assignees (company_id, visit_id, user_id) values
    ('ca000000-0000-0000-0000-000000000000', 'f3900000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000003'),
    ('ca000000-0000-0000-0000-000000000000', 'f3900000-0000-4000-8000-000000000004', 'a0000000-0000-0000-0000-000000000003');
end $$;
:as_office_a
select tst.ok((public.assign_visit('f3900000-0000-4000-8000-000000000001', array['a0000000-0000-0000-0000-000000000003']::uuid[]) ->> 'added')::int = 1, 'T39 the tech is on the visit of "mine"');
select tst.ok(tst.cnt($q$select 1 from public.activities where body like 'T39 %'$q$) = 6, 'the office sees the whole feed');
update public.jobs set status = 'cancelled' where id = 'e3900000-0000-4000-8000-000000000004';
select tst.ok((select description from public.jobs where id = 'e3900000-0000-4000-8000-000000000001') = 'Two downspouts', 'jobs.description is kept');
-- job types: a new company has the five common ones, in order; the office reads them but does not change the list
:as_super
update public.memberships set role = 'office' where user_id = 'a0000000-0000-0000-0000-000000000002' and company_id = 'ca000000-0000-0000-0000-000000000000';
:as_office_a
select tst.ok(tst.cnt($q$select 1 from public.job_types where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 5, 'the office reads the job types');
select tst.fails($q$insert into public.job_types (company_id, name) values ('ca000000-0000-0000-0000-000000000000', 'T39 office type')$q$, 'the office does not add job types (13 §5а: owner, admin)');
select tst.blocked($q$update public.job_types set position = 9 where company_id = 'ca000000-0000-0000-0000-000000000000'$q$, 'the office does not change job types');
:as_super
update public.memberships set role = 'admin' where user_id = 'a0000000-0000-0000-0000-000000000002' and company_id = 'ca000000-0000-0000-0000-000000000000';
:as_owner_a
select tst.ok((select array_agg(seed_key order by position) from public.job_types where company_id = 'ca000000-0000-0000-0000-000000000000')
              = array['install', 'repair', 'service', 'warranty', 'other'], 'a new company gets the five job types');
insert into public.job_types (id, company_id, name, position) values ('a3920000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'Gutter guards', 5);
update public.jobs set job_type_id = (select id from public.job_types where company_id = 'ca000000-0000-0000-0000-000000000000' and seed_key = 'repair')
 where id = 'e3900000-0000-4000-8000-000000000001';
select tst.ok(tst.cnt($q$select 1 from public.jobs j join public.job_types t on t.id = j.job_type_id where j.id = 'e3900000-0000-4000-8000-000000000001' and t.seed_key = 'repair'$q$) = 1, 'a job takes a type of its company');
select tst.fails($q$insert into public.job_types (company_id, name) values ('ca000000-0000-0000-0000-000000000000', 'gutter GUARDS ')$q$, 'the same name twice is refused');
select tst.fails($q$delete from public.job_types where id = 'a3920000-0000-4000-8000-000000000001'$q$, 'a job type is not deleted');
select tst.fails($q$update public.job_types set seed_key = 'other' where id = 'a3920000-0000-4000-8000-000000000001'$q$, 'the preset key of a job type does not change');
update public.job_types set archived_at = now() where id = 'a3920000-0000-4000-8000-000000000001';
select tst.ok(tst.cnt($q$select 1 from public.job_types where id = 'a3920000-0000-4000-8000-000000000001' and archived_at is not null$q$) = 1, 'a job type is archived instead');
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.job_types where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0, 'another company does not see our job types');
:as_super
select tst.fails($q$update public.jobs set job_type_id = (select id from public.job_types where company_id = 'cb000000-0000-0000-0000-000000000000' limit 1) where id = 'e3900000-0000-4000-8000-000000000001'$q$, 'a job does not take a type of another company');
select tst.fails($q$delete from public.job_types where id = 'a3920000-0000-4000-8000-000000000001'$q$, 'a job type is not deleted even by the service role (archive)');
:as_sales_a
select tst.fails($q$insert into public.job_types (company_id, name) values ('ca000000-0000-0000-0000-000000000000', 'T39 sales type')$q$, 'sales does not add job types');
select tst.blocked($q$update public.job_types set position = 9 where company_id = 'ca000000-0000-0000-0000-000000000000'$q$, 'sales does not change job types');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.job_types where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 6, 'the tech reads the job types');
select tst.fails($q$insert into public.job_types (company_id, name) values ('ca000000-0000-0000-0000-000000000000', 'T39 tech type')$q$, 'the tech does not add job types');
select tst.blocked($q$update public.job_types set name = 'x' where company_id = 'ca000000-0000-0000-0000-000000000000'$q$, 'the tech does not rename job types');
-- the tech's feed: the job and the client of his visit, nothing else
select tst.ok(tst.cnt($q$select 1 from public.activities where body in ('T39 job mine', 'T39 client mine')$q$) = 2, 'the tech sees the feed of the job and the client of his visit');
select tst.ok(tst.cnt($q$select 1 from public.activities where body in ('T39 job other', 'T39 client other')$q$) = 0, 'the tech does not see the feed of other jobs and clients');
select tst.ok(tst.cnt($q$select 1 from public.activities where body = 'T39 job long ago'$q$) = 0, 'a visit older than 14 days does not open the job feed');
select tst.ok(tst.cnt($q$select 1 from public.activities where body = 'T39 job called off'$q$) = 0, 'a cancelled job does not open its feed');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, body) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e3900000-0000-4000-8000-000000000003', 'call', 'T39 x')$q$, 'the tech does not write on a job of an old visit');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, body, actor_id) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e3900000-0000-4000-8000-000000000001', 'call', 'T39 x', 'a0000000-0000-0000-0000-000000000001')$q$, 'the tech does not write an event in the owner''s name');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, body, actor_id) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e3900000-0000-4000-8000-000000000001', 'call', 'T39 x', null)$q$, 'the tech does not write a nameless (system-looking) event');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, meta) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e3900000-0000-4000-8000-000000000001', 'status', '{"to":"done"}')$q$, 'the tech does not fake a status change on a job');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, contact_id) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e3900000-0000-4000-8000-000000000001', 'call', 'c3910000-0000-4000-8000-000000000002')$q$, 'the tech does not put a person of another client on his event');
insert into public.activities (company_id, subject_type, subject_id, kind, contact_id, body) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e3900000-0000-4000-8000-000000000001', 'call', 'c3910000-0000-4000-8000-000000000001', 'T39 called Mary');
select tst.ok(tst.cnt($q$select 1 from public.activities where body = 'T39 called Mary' and actor_id = 'a0000000-0000-0000-0000-000000000003'$q$) = 1, 'the tech logs a call with a person of the job''s client, in his own name');
select tst.ok((select contact_id from public.activities where body = 'T39 client mine') = 'c3910000-0000-4000-8000-000000000001' and (select direction from public.activities where body = 'T39 client mine') = 'in', 'the person and the direction of an event are kept');
insert into public.activities (company_id, subject_type, subject_id, kind, body) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e3900000-0000-4000-8000-000000000001', 'sms', 'T39 on the way');
select tst.ok(tst.cnt($q$select 1 from public.activities where body = 'T39 on the way'$q$) = 1, 'the tech writes an event on the job of his visit');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, body) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e3900000-0000-4000-8000-000000000002', 'sms', 'T39 x')$q$, 'the tech does not write on another job');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, body) values ('ca000000-0000-0000-0000-000000000000', 'customer', 'c3900000-0000-4000-8000-000000000001', 'sms', 'T39 x')$q$, 'the tech does not write on the client');
-- files of a client: the tech only for the client of his visit
insert into public.files (company_id, kind, customer_id) values ('ca000000-0000-0000-0000-000000000000', 'document', 'c3900000-0000-4000-8000-000000000001');
select tst.ok(tst.cnt($q$select 1 from public.files where customer_id = 'c3900000-0000-4000-8000-000000000001'$q$) = 1, 'the tech puts a file on the client of his visit');
select tst.fails($q$insert into public.files (company_id, kind, customer_id) values ('ca000000-0000-0000-0000-000000000000', 'document', 'c3900000-0000-4000-8000-000000000002')$q$, 'the tech does not put a file on another client');
select tst.blocked($q$update public.files set customer_id = 'c3900000-0000-4000-8000-000000000002' where customer_id = 'c3900000-0000-4000-8000-000000000001'$q$, 'the tech does not move his file to another client');
select tst.fails($q$insert into public.files (company_id, kind, job_id) values ('ca000000-0000-0000-0000-000000000000', 'photo', 'e3900000-0000-4000-8000-000000000002')$q$, 'the tech does not put a file on another job');
-- taken off the visit: the feed goes too
:as_office_a
insert into public.files (company_id, kind, customer_id) values ('ca000000-0000-0000-0000-000000000000', 'photo', 'c3900000-0000-4000-8000-000000000002');
select tst.ok(tst.cnt($q$select 1 from public.files where customer_id is not null and company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 2, 'the office puts a file on any client and sees them all');
select tst.ok((public.assign_visit('f3900000-0000-4000-8000-000000000001', '{}') ->> 'removed')::int = 1, 'T39 the tech is taken off');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.activities where body like 'T39 %'$q$) = 0, 'taken off the visit, the tech no longer sees its feed');
-- another company: a person of company B is not put on our event
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.activities where body like 'T39 %'$q$) = 0, 'another company sees nothing');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, body) values ('ca000000-0000-0000-0000-000000000000', 'lead', (select id from public.leads where company_id = 'cb000000-0000-0000-0000-000000000000' limit 1), 'call', 'T39 planted')$q$, 'B does not drop an event of its own lead into company A');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, body) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e3900000-0000-4000-8000-000000000001', 'call', 'T39 planted')$q$, 'B does not write on a job of A');
select tst.fails($q$insert into public.files (company_id, kind, customer_id) values ('ca000000-0000-0000-0000-000000000000', 'document', 'c3900000-0000-4000-8000-000000000001')$q$, 'B does not put a file on a client of A');
reset role; set role anon;
select tst.fails($q$select 1 from public.job_types$q$, 'anon does not read job types');
select tst.fails($q$insert into public.job_types (company_id, name) values ('ca000000-0000-0000-0000-000000000000', 'anon')$q$, 'anon does not add job types');
:as_owner_a
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, contact_id) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e3900000-0000-4000-8000-000000000001', 'call', (select gen_random_uuid()))$q$, 'contact_id must be a person of the same company');
\echo 'T39 wave П-1: job types, the tech feed, files of a client ok'

-- ---------------------------------------------------------------- T40: wave П-1 — a paid notice leads to its invoice
:as_super
do $$ begin
  perform tst.ok((select count(*) from public.notifications x join public.payments p on p.invoice_id = x.invoice_id
                   where p.reference = 'stripe-simulated' and x.kind in ('invoice.paid', 'deposit.paid')) = 1,
                 'portal_pay_simulated writes invoice_id on its notice (T12)');
  perform tst.ok((select count(*) from public.notifications where kind in ('invoice.paid', 'deposit.paid') and (payload ->> 'simulated') = 'true' and invoice_id is null) = 0,
                 'no paid notice of the client page is left without its invoice');
end $$;
:as_office_a
select tst.ok(tst.cnt($q$select 1 from public.notifications where invoice_id is not null$q$) >= 1, 'the office reads invoice_id of a notice');
:as_super
select tst.fails($q$insert into public.notifications (company_id, kind, invoice_id) values ('cb000000-0000-0000-0000-000000000000', 'invoice.paid', (select invoice_id from public.payments where reference = 'stripe-simulated'))$q$, 'a notice does not lead to an invoice of another company');
select tst.fails($q$insert into public.notifications (company_id, kind, visit_id) values ('cb000000-0000-0000-0000-000000000000', 'invoice.paid', 'f3900000-0000-4000-8000-000000000001')$q$, 'a notice does not lead to a visit of another company');
\echo 'T40 paid notice leads to its invoice ok'

-- ---------------------------------------------------------------- T41: wave П-2a — no tax for an exempt client, lines of a job, job tags
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name, tax_exempt, tax_exempt_note) values
    ('c4100000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T41 Church', true, 'Cert 12-345'),
    ('c4100000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T41 Home', false, null);
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
    ('d4100000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c4100000-0000-4000-8000-000000000001', '41 Chapel St', 'Pasadena'),
    ('d4100000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c4100000-0000-4000-8000-000000000002', '41 Home St', 'Pasadena');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status, tax_enabled, tax_rate_bps) values
    ('e4100000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T41 lines', 'c4100000-0000-4000-8000-000000000002', 'd4100000-0000-4000-8000-000000000002', 'draft', true, 1025),
    ('e4100000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T41 exempt', 'c4100000-0000-4000-8000-000000000001', 'd4100000-0000-4000-8000-000000000001', 'draft', true, 1025);
  insert into public.visits (id, company_id, job_id, starts_at) values
    ('f4100000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000001', now() + interval '1 day');
  insert into public.visit_assignees (company_id, visit_id, user_id) values
    ('ca000000-0000-0000-0000-000000000000', 'f4100000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000003');
end $$;
-- the same numbers as packages/estimating-engine/test/jobLines.test.ts (test prices)
:as_office_a
insert into public.job_line_items (id, company_id, job_id, position, name, quantity, unit_price_cents, taxable) values
  ('a4110000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000001', 0, 'Gutter section', 2.5, 1999, true),
  ('a4110000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000001', 1, 'Labor hours', 3, 4500, false),
  ('a4110000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000001', 2, 'Sealant', 0.3333, 1000, true);
select tst.ok((select array_agg(line_total_cents order by position) from public.job_line_items where job_id = 'e4100000-0000-4000-8000-000000000001') = array[4998, 13500, 333]::bigint[], 'line totals half up (engine: 4998, 13500, 333)');
select tst.ok((select contract_total_cents from public.jobs where id = 'e4100000-0000-4000-8000-000000000001') = 19377, 'job total = subtotal 18831 + tax 546 (engine jobLinesTotals)');
update public.jobs set tax_enabled = false where id = 'e4100000-0000-4000-8000-000000000001';
select tst.ok((select contract_total_cents from public.jobs where id = 'e4100000-0000-4000-8000-000000000001') = 18831, 'tax off: total = subtotal (engine)');
update public.jobs set tax_enabled = true where id = 'e4100000-0000-4000-8000-000000000001';
-- since 20261107040000 the phone has no right on the column at all (before, t14 dropped the number)
select tst.fails($q$update public.jobs set contract_total_cents = 1 where id = 'e4100000-0000-4000-8000-000000000001'$q$, 'the phone cannot write the total of a job (no column grant)');
select tst.ok((select contract_total_cents from public.jobs where id = 'e4100000-0000-4000-8000-000000000001') = 19377, 'the phone cannot write another total over the lines');
update public.job_line_items set deleted_at = now() where id = 'a4110000-0000-4000-8000-000000000002';
select tst.ok((select contract_total_cents from public.jobs where id = 'e4100000-0000-4000-8000-000000000001') = 5877, 'a removed line leaves the total (5331 + 546)');
update public.job_line_items set deleted_at = null where id = 'a4110000-0000-4000-8000-000000000002';
-- half a cent of tax rounds up, as in the engine (10 × 5% = 0.5 → 1)
do $$ begin
  insert into public.jobs (id, company_id, title, customer_id, property_id, status, tax_enabled, tax_rate_bps) values
    ('e4100000-0000-4000-8000-000000000005', 'ca000000-0000-0000-0000-000000000000', 'T41 half cent', 'c4100000-0000-4000-8000-000000000002', 'd4100000-0000-4000-8000-000000000002', 'draft', true, 500);
  insert into public.job_line_items (company_id, job_id, name, quantity, unit_price_cents, taxable) values
    ('ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000005', 'Washer', 1, 10, true);
end $$;
select tst.ok((select contract_total_cents from public.jobs where id = 'e4100000-0000-4000-8000-000000000005') = 11, 'half a cent of tax rounds up (engine: 10 + 1)');
update public.job_line_items set deleted_at = now() where job_id = 'e4100000-0000-4000-8000-000000000005';
select tst.ok((select contract_total_cents from public.jobs where id = 'e4100000-0000-4000-8000-000000000005') = 0, 'all lines removed: the total is 0');
update public.job_line_items set deleted_at = null where job_id = 'e4100000-0000-4000-8000-000000000005';
select tst.ok((select contract_total_cents from public.jobs where id = 'e4100000-0000-4000-8000-000000000005') = 11, 'a line brought back (undo) brings its total back');
-- an exempt client: no tax on the job, even if asked
insert into public.job_line_items (company_id, job_id, name, quantity, unit_price_cents, taxable) values
  ('ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000002', 'Gutter section', 2.5, 1999, true);
select tst.ok((select tax_enabled from public.jobs where id = 'e4100000-0000-4000-8000-000000000002') = false, 'a job of an exempt client is stored without tax');
select tst.ok((select contract_total_cents from public.jobs where id = 'e4100000-0000-4000-8000-000000000002') = 4998, 'exempt: total without tax (engine)');
select tst.fails($q$insert into public.job_line_items (company_id, job_id, name, quantity, unit_price_cents) values ('ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000001', 'T41 bad', 0, 100)$q$, 'quantity must be above zero');
select tst.fails($q$insert into public.job_line_items (company_id, job_id, name, quantity, unit_price_cents) values ('ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000001', 'T41 bad', 1, -5)$q$, 'no negative price');
select tst.fails($q$update public.job_line_items set job_id = 'e4100000-0000-4000-8000-000000000002' where id = 'a4110000-0000-4000-8000-000000000001'$q$, 'a line does not move to another job');
select tst.fails($q$update public.job_line_items set line_total_cents = 1 where id = 'a4110000-0000-4000-8000-000000000001'$q$, 'the line total is not written by hand');
select tst.ok(tst.cnt($q$select 1 from public.audit_log where entity_type = 'job_line_items' and entity_id = 'a4110000-0000-4000-8000-000000000002' and action = 'update'$q$) >= 1, 'line changes leave a trace');
-- estimates for the checks below; the job of an estimate takes no lines of its own and keeps its total
do $$ begin
  insert into public.estimates (id, company_id, customer_id, property_id, title) values
    ('0e410000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c4100000-0000-4000-8000-000000000001', 'd4100000-0000-4000-8000-000000000001', 'T41 exempt estimate'),
    ('0e410000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c4100000-0000-4000-8000-000000000002', 'd4100000-0000-4000-8000-000000000002', 'T41 locked estimate'),
    ('0e410000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'c4100000-0000-4000-8000-000000000002', 'd4100000-0000-4000-8000-000000000002', 'T41 draft estimate'),
    ('0e410000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'c4100000-0000-4000-8000-000000000002', 'd4100000-0000-4000-8000-000000000002', 'T41 job estimate');
  perform tst.server_job($q$insert into public.jobs (id, company_id, title, customer_id, property_id, status, estimate_id, contract_total_cents) values
    ('e4100000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'T41 from estimate', 'c4100000-0000-4000-8000-000000000002', 'd4100000-0000-4000-8000-000000000002', 'draft', '0e410000-0000-4000-8000-000000000004', 77700) returning id$q$);
end $$;
select tst.fails($q$insert into public.job_line_items (company_id, job_id, name, quantity, unit_price_cents) values ('ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000003', 'T41 bad', 1, 100)$q$, 'a job from an estimate has no own lines');
select tst.ok((select contract_total_cents from public.jobs where id = 'e4100000-0000-4000-8000-000000000003') = 77700, 'the job of an estimate keeps its total');
select tst.fails($q$update public.jobs set estimate_id = null where id = 'e4100000-0000-4000-8000-000000000003'$q$, 'a job from an estimate does not drop its estimate (to take own lines)');
select tst.fails($q$update public.jobs set estimate_id = '0e410000-0000-4000-8000-000000000003' where id = 'e4100000-0000-4000-8000-000000000001'$q$, 'a job with own lines does not take an estimate (to write its total by hand)');
-- an exempt client's open estimate version with tax is refused (the phone learns); a locked one is never changed
insert into public.estimate_versions (id, company_id, estimate_id, version_no, tax_enabled, tax_rate_bps) values
  ('0e411000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', '0e410000-0000-4000-8000-000000000002', 1, true, 1025),
  ('0e411000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', '0e410000-0000-4000-8000-000000000003', 1, true, 1025);
select tst.fails($q$insert into public.estimate_versions (company_id, estimate_id, version_no, tax_enabled, tax_rate_bps) values ('ca000000-0000-0000-0000-000000000000', '0e410000-0000-4000-8000-000000000001', 1, true, 1025)$q$, 'an estimate of an exempt client with tax is refused');
insert into public.estimate_versions (id, company_id, estimate_id, version_no, tax_enabled, tax_rate_bps) values
  ('0e411000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '0e410000-0000-4000-8000-000000000001', 1, false, 1025);
select tst.ok(tst.cnt($q$select 1 from public.estimate_versions where id = '0e411000-0000-4000-8000-000000000001' and not tax_enabled$q$) = 1, 'an estimate of an exempt client without tax is kept');
select tst.fails($q$update public.estimate_versions set tax_enabled = true where id = '0e411000-0000-4000-8000-000000000001'$q$, 'the tax is not switched on later for an exempt client');
select tst.ok((select tax_enabled from public.estimate_versions where id = '0e411000-0000-4000-8000-000000000002') = true, 'a client with tax keeps it');
update public.estimate_versions set locked_at = now(), sent_at = now() where id = '0e411000-0000-4000-8000-000000000002';
update public.customers set tax_exempt = true where id = 'c4100000-0000-4000-8000-000000000002';
select tst.ok((select tax_enabled from public.estimate_versions where id = '0e411000-0000-4000-8000-000000000002') = true, 'a sent (locked) estimate keeps its tax when the client becomes exempt');
-- a draft with tax made before the client became exempt is not sent with it (sending locks the version)
select tst.fails($q$update public.estimate_versions set locked_at = now(), sent_at = now() where id = '0e411000-0000-4000-8000-000000000003'$q$, 'a draft with tax is not sent once the client is exempt');
update public.estimate_versions set tax_enabled = false where id = '0e411000-0000-4000-8000-000000000003';
update public.estimate_versions set locked_at = now(), sent_at = now() where id = '0e411000-0000-4000-8000-000000000003';
select tst.ok((select locked_at is not null and not tax_enabled from public.estimate_versions where id = '0e411000-0000-4000-8000-000000000003'), 'with the tax off it is sent');
select tst.ok(tst.cnt($q$select 1 from public.audit_log where entity_type = 'customers' and entity_id = 'c4100000-0000-4000-8000-000000000002' and (after ->> 'tax_exempt') = 'true'$q$) = 1, '«without tax» changes leave a trace');
select tst.ok((select contract_total_cents from public.jobs where id = 'e4100000-0000-4000-8000-000000000001') = 19377, 'a job keeps its tax snapshot when the client becomes exempt');
-- unrelated changes (status, description, a line's name) keep the snapshot: an invoice issued with tax still matches
update public.jobs set status = 'scheduled', description = 'T41 moved on' where id = 'e4100000-0000-4000-8000-000000000001';
update public.job_line_items set name = 'Gutter section 5in' where id = 'a4110000-0000-4000-8000-000000000001';
select tst.ok((select tax_enabled and contract_total_cents = 19377 from public.jobs where id = 'e4100000-0000-4000-8000-000000000001'), 'status, description and a line edit keep the tax snapshot');
update public.jobs set tax_rate_bps = 1000 where id = 'e4100000-0000-4000-8000-000000000001';
select tst.ok((select not tax_enabled and contract_total_cents = 18831 from public.jobs where id = 'e4100000-0000-4000-8000-000000000001'), 'setting the tax again applies the exemption');
update public.customers set tax_exempt = false where id = 'c4100000-0000-4000-8000-000000000002';
-- job tags
select public.set_job_tags('e4100000-0000-4000-8000-000000000001', array(select id from public.tags where company_id = 'ca000000-0000-0000-0000-000000000000' and is_active and deleted_at is null order by position limit 2));
select tst.ok(tst.cnt($q$select 1 from public.job_tags where job_id = 'e4100000-0000-4000-8000-000000000001'$q$) = 2, 'the office puts two tags on a job');
select public.set_job_tags('e4100000-0000-4000-8000-000000000001', array(select id from public.tags where company_id = 'ca000000-0000-0000-0000-000000000000' and is_active and deleted_at is null order by position limit 1));
select tst.ok(tst.cnt($q$select 1 from public.job_tags where job_id = 'e4100000-0000-4000-8000-000000000001'$q$) = 1, 'set_job_tags replaces the set');
-- a tag switched off later stays on the job when other tags change; a switched-off tag is not put on anew
insert into public.tags (id, company_id, name, position) values
  ('a4120000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T41 old tag', 90),
  ('a4120000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T41 new tag', 91);
select public.set_job_tags('e4100000-0000-4000-8000-000000000002', array['a4120000-0000-4000-8000-000000000001']::uuid[]);
update public.tags set is_active = false where id = 'a4120000-0000-4000-8000-000000000001';
select public.set_job_tags('e4100000-0000-4000-8000-000000000002', array['a4120000-0000-4000-8000-000000000001', 'a4120000-0000-4000-8000-000000000002']::uuid[]);
select tst.ok(tst.cnt($q$select 1 from public.job_tags where job_id = 'e4100000-0000-4000-8000-000000000002'$q$) = 2, 'a switched-off tag stays when another is added');
select tst.fails($q$select public.set_job_tags('e4100000-0000-4000-8000-000000000001', array['a4120000-0000-4000-8000-000000000001']::uuid[])$q$, 'a switched-off tag is not put on another job');
-- a closed job keeps its lines
update public.jobs set status = 'cancelled' where id = 'e4100000-0000-4000-8000-000000000002';
select tst.fails($q$insert into public.job_line_items (company_id, job_id, name, quantity, unit_price_cents) values ('ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000002', 'T41 late', 1, 100)$q$, 'a cancelled job takes no new lines');
select tst.fails($q$update public.job_line_items set unit_price_cents = 1 where job_id = 'e4100000-0000-4000-8000-000000000002'$q$, 'the lines of a cancelled job do not change');
:as_sales_a
insert into public.job_line_items (company_id, job_id, position, name, quantity, unit_price_cents) values ('ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000001', 3, 'T41 sales line', 1, 100);
select tst.ok((select contract_total_cents from public.jobs where id = 'e4100000-0000-4000-8000-000000000001') = 18931, 'sales adds a line, the total follows');
update public.job_line_items set deleted_at = now() where name = 'T41 sales line';
:as_office_a
:as_super
select tst.fails($q$insert into public.job_tags (company_id, job_id, tag_id) values ('ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000001', (select id from public.tags where company_id = 'cb000000-0000-0000-0000-000000000000' limit 1))$q$, 'a tag of another company does not go on our job');
-- the tech: reads lines and tags of the job of his visit, changes nothing
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.job_line_items where job_id = 'e4100000-0000-4000-8000-000000000001' and deleted_at is null$q$) = 3, 'the tech reads the lines of the job of his visit');
select tst.ok(tst.cnt($q$select 1 from public.job_line_items where job_id = 'e4100000-0000-4000-8000-000000000002'$q$) = 0, 'the tech does not see lines of another job');
select tst.ok(tst.cnt($q$select 1 from public.job_tags where job_id = 'e4100000-0000-4000-8000-000000000001'$q$) = 1, 'the tech reads the tags of his job');
select tst.fails($q$insert into public.job_line_items (company_id, job_id, name, quantity, unit_price_cents) values ('ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000001', 'T41 tech', 1, 100)$q$, 'the tech does not add lines');
select tst.blocked($q$update public.job_line_items set unit_price_cents = 1 where job_id = 'e4100000-0000-4000-8000-000000000001'$q$, 'the tech does not change prices');
select tst.blocked($q$update public.job_line_items set deleted_at = now() where job_id = 'e4100000-0000-4000-8000-000000000001'$q$, 'the tech does not remove lines');
select tst.fails($q$insert into public.job_tags (company_id, job_id, tag_id) values ('ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000001', (select id from public.tags where company_id = 'ca000000-0000-0000-0000-000000000000' and is_active order by position desc limit 1))$q$, 'the tech does not put tags directly');
select tst.blocked($q$delete from public.job_tags where job_id = 'e4100000-0000-4000-8000-000000000001'$q$, 'the tech does not take tags off directly');
select tst.fails($q$select public.set_job_tags('e4100000-0000-4000-8000-000000000001', '{}')$q$, 'the tech does not change job tags');
select tst.blocked($q$update public.customers set tax_exempt = false where id = 'c4100000-0000-4000-8000-000000000001'$q$, 'the tech does not change «without tax»');
-- another company and anon
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.job_line_items where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0, 'another company does not see our lines');
select tst.fails($q$insert into public.job_line_items (company_id, job_id, name, quantity, unit_price_cents) values ('ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000001', 'T41 b', 1, 100)$q$, 'another company does not add lines to our job');
select tst.fails($q$select public.set_job_tags('e4100000-0000-4000-8000-000000000001', '{}')$q$, 'another company does not set our job tags');
select tst.blocked($q$update public.job_line_items set unit_price_cents = 1 where company_id = 'ca000000-0000-0000-0000-000000000000'$q$, 'another company does not change our lines');
select tst.ok(tst.cnt($q$select 1 from public.job_tags where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0, 'another company does not see our job tags');
select tst.fails($q$insert into public.job_tags (company_id, job_id, tag_id) values ('ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000001', (select id from public.tags where company_id = 'cb000000-0000-0000-0000-000000000000' limit 1))$q$, 'another company does not put tags on our job');
reset role; set role anon;
select tst.fails($q$select 1 from public.job_line_items$q$, 'anon does not read job lines');
select tst.fails($q$select 1 from public.job_tags$q$, 'anon does not read job tags');
select tst.fails($q$insert into public.job_line_items (company_id, job_id, name, quantity, unit_price_cents) values ('ca000000-0000-0000-0000-000000000000', 'e4100000-0000-4000-8000-000000000001', 'anon', 1, 1)$q$, 'anon does not add job lines');
select tst.fails($q$select public.set_job_tags('e4100000-0000-4000-8000-000000000001', '{}')$q$, 'anon does not set job tags');
\echo 'T41 wave П-2a: exempt client, job lines, job tags ok'

-- ---------------------------------------------------------------- T45: wave 8 — money lists and reports (docs/specs/18-money-reports.md §9)
-- Sums by method and by person = the engine on the same numbers (packages/estimating-engine/test/reports.test.ts «T45 fixture»);
-- a refund — owner/admin only; the tech and another company do not read these payments; a reminder (S20) is an event of the
-- client's feed written by the office, not by the tech.
:as_super
insert into public.customers (id, company_id, display_name) values ('c4500000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T45 Kim');
insert into public.invoices (id, company_id, number, customer_id, kind, status, due_date, subtotal_cents, total_cents) values
  ('14500000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T45-0001', 'c4500000-0000-4000-8000-000000000001', 'standalone', 'sent', current_date - 9, 30000, 30000);
insert into public.payments (id, company_id, invoice_id, customer_id, method, amount_cents, status, idempotency_key, received_by) values
  ('94500000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '14500000-0000-4000-8000-000000000001', 'c4500000-0000-4000-8000-000000000001', 'zelle', 10000, 'succeeded', 't45-1', 'a0000000-0000-0000-0000-000000000001'),
  ('94500000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', '14500000-0000-4000-8000-000000000001', 'c4500000-0000-4000-8000-000000000001', 'cash', 5000, 'succeeded', 't45-2', 'a0000000-0000-0000-0000-000000000002'),
  ('94500000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', '14500000-0000-4000-8000-000000000001', 'c4500000-0000-4000-8000-000000000001', 'zelle', 4000, 'succeeded', 't45-3', 'a0000000-0000-0000-0000-000000000002');
-- a refund: not sales (staff, but not owner/admin), the owner may. (office_a is an admin by now, see T35/T37)
:as_sales_a
select tst.blocked($q$update public.payments set refunded_cents = 1000, status = 'partially_refunded' where id = '94500000-0000-4000-8000-000000000003'$q$, 'sales does not refund');
:as_owner_a
update public.payments set refunded_cents = 1000, status = 'partially_refunded' where id = '94500000-0000-4000-8000-000000000003';
select tst.ok((select paid_cents = 18000 and balance_cents = 12000 from public.invoices where id = '14500000-0000-4000-8000-000000000001'), 'paid = net of the refund (10000 + 5000 + 3000), balance 12000');
-- staff reads the report (office_a, an admin by now): collected by method and by person, net of refunds (= engine: zelle 13000 ×2, cash 5000 ×1; owner 10000, office 8000)
:as_office_a
select tst.ok((select string_agg(method || ':' || net || ':' || n, ',' order by net desc, method) = 'zelle:13000:2,cash:5000:1'
               from (select method, sum(amount_cents - refunded_cents) as net, count(*) as n from public.payments
                     where invoice_id = '14500000-0000-4000-8000-000000000001' and status in ('succeeded', 'partially_refunded') group by method) x),
              'collected by method = the engine (totalsBy)');
select tst.ok((select string_agg(net::text, ',' order by net desc) = '10000,8000'
               from (select received_by, sum(amount_cents - refunded_cents) as net from public.payments
                     where invoice_id = '14500000-0000-4000-8000-000000000001' and status in ('succeeded', 'partially_refunded') group by received_by) x),
              'collected by person = the engine (totalsBy)');
-- «Напомнить» (S20): the office logs a reminder in the client's feed, linked to the invoice
insert into public.activities (id, company_id, subject_type, subject_id, kind, direction, actor_id, meta) values
  ('a4500000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'customer', 'c4500000-0000-4000-8000-000000000001', 'sms', 'out', 'a0000000-0000-0000-0000-000000000002',
   '{"invoiceId": "14500000-0000-4000-8000-000000000001", "reminder": "1"}');
select tst.ok(tst.cnt($q$select 1 from public.activities where subject_id = 'c4500000-0000-4000-8000-000000000001' and meta ->> 'reminder' = '1'$q$) = 1, 'the office logs a reminder');
-- the tech: not his payments, no reminders
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.payments where invoice_id = '14500000-0000-4000-8000-000000000001'$q$) = 0, 'the tech does not read payments he did not take');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, direction, actor_id, meta) values ('ca000000-0000-0000-0000-000000000000', 'customer', 'c4500000-0000-4000-8000-000000000001', 'sms', 'out', 'a0000000-0000-0000-0000-000000000003', '{"invoiceId": "14500000-0000-4000-8000-000000000001", "reminder": "1"}')$q$, 'the tech does not send reminders');
-- another company
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.payments where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0, 'another company does not read our payments');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, direction, meta) values ('ca000000-0000-0000-0000-000000000000', 'customer', 'c4500000-0000-4000-8000-000000000001', 'sms', 'out', '{"reminder": "1"}')$q$, 'another company does not log reminders for our client');
\echo 'T45 wave 8: collected by method and person, refund rights, reminders ok'
-- ---------------------------------------------------------------- T42: wave П-2b — tasks with a time, events and days off, own fields
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values
    ('c4200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T42 Mine'),
    ('c4200000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T42 Other');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
    ('d4200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c4200000-0000-4000-8000-000000000001', '42 Mine St', 'Pasadena');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values
    ('e4200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T42 job', 'c4200000-0000-4000-8000-000000000001', 'd4200000-0000-4000-8000-000000000001', 'draft');
  insert into public.visits (id, company_id, job_id, starts_at) values
    ('f4200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e4200000-0000-4000-8000-000000000001', now() + interval '1 day');
  insert into public.visit_assignees (company_id, visit_id, user_id) values
    ('ca000000-0000-0000-0000-000000000000', 'f4200000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000003');
end $$;
-- tasks with a time
insert into public.tasks (id, company_id, subject_type, subject_id, title, description, starts_at, ends_at, all_day) values
  ('a4210000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'job', 'e4200000-0000-4000-8000-000000000001', 'T42 order gutters', 'Call the supplier', now() + interval '2 hours', now() + interval '3 hours', false);
select tst.ok(tst.cnt($q$select 1 from public.tasks where id = 'a4210000-0000-4000-8000-000000000001' and description = 'Call the supplier' and not all_day$q$) = 1, 'a task keeps its time and description');
select tst.fails($q$insert into public.tasks (company_id, subject_type, subject_id, title, starts_at, ends_at) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e4200000-0000-4000-8000-000000000001', 'T42 x', now(), now() - interval '1 hour')$q$, 'a task does not end before it starts');
select tst.fails($q$insert into public.tasks (company_id, subject_type, subject_id, title, ends_at) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e4200000-0000-4000-8000-000000000001', 'T42 x', now())$q$, 'a task end needs a start');
-- events and days off: the office for anyone, for the whole company
insert into public.calendar_events (id, company_id, kind, user_id, title, starts_at, ends_at, all_day) values
  ('a4220000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'event', null, 'T42 team meeting', now() + interval '1 day', now() + interval '1 day 1 hour', false),
  ('a4220000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'time_off', 'a0000000-0000-0000-0000-000000000005', null, now() + interval '3 days', now() + interval '4 days', true),
  ('a4220000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'time_off', 'a0000000-0000-0000-0000-000000000003', null, now() + interval '5 days', now() + interval '6 days', true);
select tst.fails($q$insert into public.calendar_events (company_id, kind, starts_at, ends_at) values ('ca000000-0000-0000-0000-000000000000', 'time_off', now(), now())$q$, 'a day off is always someone''s');
select tst.fails($q$insert into public.calendar_events (company_id, kind, starts_at, ends_at) values ('ca000000-0000-0000-0000-000000000000', 'event', now(), now())$q$, 'an event has a name');
select tst.fails($q$insert into public.calendar_events (company_id, kind, title, starts_at, ends_at) values ('ca000000-0000-0000-0000-000000000000', 'event', 'T42 x', now(), now() - interval '1 minute')$q$, 'an event does not end before it starts');
select tst.fails($q$insert into public.calendar_events (company_id, kind, user_id, starts_at, ends_at) values ('ca000000-0000-0000-0000-000000000000', 'time_off', 'b0000000-0000-0000-0000-000000000002', now(), now())$q$, 'a day off of a person of another company is refused');
-- own fields: owner / admin define them
insert into public.custom_fields (id, company_id, entity, label, type, options, group_name, searchable, position) values
  ('a4230000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'customer', 'HOA name', 'text', '[]', 'Property', true, 0),
  ('a4230000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'customer', 'Preferred day', 'select', '["Mon", "Wed", "Fri"]', null, false, 1),
  ('a4230000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'job', 'Permit needed', 'checkbox', '[]', null, false, 0),
  ('a4230000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'job', 'Crew size', 'number', '[]', null, false, 1),
  ('a4230000-0000-4000-8000-000000000005', 'ca000000-0000-0000-0000-000000000000', 'job', 'Start by', 'date', '[]', null, false, 2),
  ('a4230000-0000-4000-8000-000000000006', 'ca000000-0000-0000-0000-000000000000', 'job', 'Materials', 'multiselect', '["Copper", "Aluminum"]', null, false, 3);
select tst.fails($q$insert into public.custom_fields (company_id, entity, label, type) values ('ca000000-0000-0000-0000-000000000000', 'customer', 'Day', 'select')$q$, 'a list needs choices');
select tst.fails($q$insert into public.custom_fields (company_id, entity, label, type, options) values ('ca000000-0000-0000-0000-000000000000', 'customer', 'T42 t', 'text', '["a"]')$q$, 'a text field has no choices');
select tst.fails($q$insert into public.custom_fields (company_id, entity, label, type, options) values ('ca000000-0000-0000-0000-000000000000', 'customer', 'T42 s', 'select', '[1, 2]')$q$, 'a choice is a text');
select tst.fails($q$insert into public.custom_fields (company_id, entity, label, type) values ('ca000000-0000-0000-0000-000000000000', 'customer', ' hoa NAME ', 'text')$q$, 'the same name twice is refused');
select tst.fails($q$update public.custom_fields set type = 'number' where id = 'a4230000-0000-4000-8000-000000000001'$q$, 'the type of a field does not change');
select tst.fails($q$delete from public.custom_fields where id = 'a4230000-0000-4000-8000-000000000001'$q$, 'a field is not deleted');
:as_super
select tst.fails($q$update public.custom_fields set type = 'number' where id = 'a4230000-0000-4000-8000-000000000001'$q$, 'the type of a field does not change, even for the service role');
select tst.fails($q$delete from public.custom_fields where id = 'a4230000-0000-4000-8000-000000000001'$q$, 'a field is not deleted, even by the service role (archive)');
:as_owner_a
-- values: checked against the type; the record belongs to the field's kind and company
insert into public.custom_field_values (company_id, field_id, entity_id, value) values
  ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000001', 'c4200000-0000-4000-8000-000000000001', '"Oak Park HOA"'),
  ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000002', 'c4200000-0000-4000-8000-000000000002', '"Wed"'),
  ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000003', 'e4200000-0000-4000-8000-000000000001', 'true'),
  ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000004', 'e4200000-0000-4000-8000-000000000001', '3'),
  ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000005', 'e4200000-0000-4000-8000-000000000001', '"2026-12-01"'),
  ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000006', 'e4200000-0000-4000-8000-000000000001', '["Copper"]');
select tst.ok(tst.cnt($q$select 1 from public.custom_field_values where entity_id in ('c4200000-0000-4000-8000-000000000001', 'c4200000-0000-4000-8000-000000000002', 'e4200000-0000-4000-8000-000000000001')$q$) = 6, 'values of every type are kept');
-- a file field: a live file of the company only
insert into public.custom_fields (id, company_id, entity, label, type) values ('a4230000-0000-4000-8000-000000000007', 'ca000000-0000-0000-0000-000000000000', 'customer', 'W-9', 'file');
insert into public.files (id, company_id, kind, customer_id) values
  ('a4240000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'document', 'c4200000-0000-4000-8000-000000000001'),
  ('a4240000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'document', 'c4200000-0000-4000-8000-000000000001');
update public.files set deleted_at = now() where id = 'a4240000-0000-4000-8000-000000000002';
insert into public.custom_field_values (company_id, field_id, entity_id, value) values ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000007', 'c4200000-0000-4000-8000-000000000001', '"a4240000-0000-4000-8000-000000000001"');
select tst.ok(tst.cnt($q$select 1 from public.custom_field_values where field_id = 'a4230000-0000-4000-8000-000000000007'$q$) = 1, 'a file field takes a file of the company');
select tst.fails($q$insert into public.custom_field_values (company_id, field_id, entity_id, value) values ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000007', 'c4200000-0000-4000-8000-000000000002', '"a4240000-0000-4000-8000-000000000002"')$q$, 'a removed file is refused');
select tst.fails($q$insert into public.custom_field_values (company_id, field_id, entity_id, value) values ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000007', 'c4200000-0000-4000-8000-000000000002', '"------------------------------------"')$q$, 'a file id must be a uuid');
select tst.fails($q$insert into public.custom_field_values (company_id, field_id, entity_id, value) values ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000007', 'c4200000-0000-4000-8000-000000000002', to_jsonb(gen_random_uuid()::text))$q$, 'an unknown file is refused');
select tst.fails($q$update public.custom_field_values set value = '["Copper", "Copper"]' where field_id = 'a4230000-0000-4000-8000-000000000006'$q$, 'a multi choice is listed once');
select tst.fails($q$update public.custom_field_values set value = '"2026-13-45"' where field_id = 'a4230000-0000-4000-8000-000000000005'$q$, 'a month 13 is refused');
select tst.fails($q$insert into public.custom_fields (company_id, entity, label, type, options) values ('ca000000-0000-0000-0000-000000000000', 'job', 'T42 dup', 'select', '["A", "A"]')$q$, 'a choice is listed once in a field');
-- a task the office gave the tech: he marks it done, he does not move its time or rewrite it
insert into public.tasks (id, company_id, subject_type, subject_id, title, starts_at, ends_at, assignee_id) values
  ('a4210000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'job', 'e4200000-0000-4000-8000-000000000001', 'T42 for the tech', now() + interval '1 day', now() + interval '1 day 1 hour', 'a0000000-0000-0000-0000-000000000003');
select tst.fails($q$insert into public.custom_field_values (company_id, field_id, entity_id, value) values ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000002', 'c4200000-0000-4000-8000-000000000001', '"Sun"')$q$, 'a choice that is not in the list is refused');
select tst.fails($q$insert into public.custom_field_values (company_id, field_id, entity_id, value) values ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000001', 'c4200000-0000-4000-8000-000000000002', '12')$q$, 'a number in a text field is refused');
select tst.fails($q$update public.custom_field_values set value = '"three"' where field_id = 'a4230000-0000-4000-8000-000000000004'$q$, 'a text in a number field is refused');
select tst.fails($q$update public.custom_field_values set value = '"yes"' where field_id = 'a4230000-0000-4000-8000-000000000003'$q$, 'a checkbox takes true / false only');
select tst.fails($q$update public.custom_field_values set value = '"2026-02-30"' where field_id = 'a4230000-0000-4000-8000-000000000005'$q$, 'a date that does not exist is refused');
select tst.fails($q$insert into public.calendar_events (company_id, kind, user_id, starts_at, ends_at) values ('ca000000-0000-0000-0000-000000000000', 'time_off', 'a3500000-0000-4000-8000-000000000002', now(), now())$q$, 'a day off of an invited (not active) member is refused');
select tst.fails($q$update public.custom_field_values set value = '["Copper", "Gold"]' where field_id = 'a4230000-0000-4000-8000-000000000006'$q$, 'a multi choice outside the list is refused');
select tst.fails($q$insert into public.custom_field_values (company_id, field_id, entity_id, value) values ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000003', 'c4200000-0000-4000-8000-000000000001', 'true')$q$, 'a job field does not go on a client');
select tst.fails($q$insert into public.custom_field_values (company_id, field_id, entity_id, value) values ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000001', 'c4200000-0000-4000-8000-000000000001', '"again"')$q$, 'one value per field and record');
update public.custom_field_values set deleted_at = now() where field_id = 'a4230000-0000-4000-8000-000000000002';
insert into public.custom_field_values (company_id, field_id, entity_id, value) values ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000002', 'c4200000-0000-4000-8000-000000000002', '"Fri"');
select tst.ok(tst.cnt($q$select 1 from public.custom_field_values where field_id = 'a4230000-0000-4000-8000-000000000002' and deleted_at is null and value = '"Fri"'$q$) = 1, 'a cleared value can be set anew');
select tst.fails($q$update public.custom_field_values set entity_id = 'c4200000-0000-4000-8000-000000000002' where field_id = 'a4230000-0000-4000-8000-000000000001'$q$, 'a value does not move to another record');
update public.custom_fields set archived_at = now() where id = 'a4230000-0000-4000-8000-000000000001';
select tst.fails($q$update public.custom_field_values set value = '"New HOA"' where field_id = 'a4230000-0000-4000-8000-000000000001'$q$, 'an archived field takes no new values');
select tst.ok(tst.cnt($q$select 1 from public.custom_field_values where field_id = 'a4230000-0000-4000-8000-000000000001'$q$) = 1, 'an archived field keeps its old values');
update public.custom_fields set archived_at = null where id = 'a4230000-0000-4000-8000-000000000001';
-- the office (role office) reads definitions, does not change them, writes values
:as_super
update public.memberships set role = 'office' where user_id = 'a0000000-0000-0000-0000-000000000002' and company_id = 'ca000000-0000-0000-0000-000000000000';
:as_office_a
select tst.ok(tst.cnt($q$select 1 from public.custom_fields where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 7, 'the office reads own fields');
select tst.fails($q$insert into public.custom_fields (company_id, entity, label, type) values ('ca000000-0000-0000-0000-000000000000', 'job', 'T42 office', 'text')$q$, 'the office does not add own fields (13 §5а)');
select tst.blocked($q$update public.custom_fields set label = 'x' where company_id = 'ca000000-0000-0000-0000-000000000000'$q$, 'the office does not rename own fields');
update public.custom_field_values set value = '4' where field_id = 'a4230000-0000-4000-8000-000000000004';
select tst.ok(tst.cnt($q$select 1 from public.custom_field_values where field_id = 'a4230000-0000-4000-8000-000000000004' and value = '4'$q$) = 1, 'the office writes values');
select tst.ok(tst.cnt($q$select 1 from public.calendar_events where title = 'T42 team meeting' or kind = 'time_off'$q$) >= 3, 'the office sees every event and day off');
:as_super
update public.memberships set role = 'admin' where user_id = 'a0000000-0000-0000-0000-000000000002' and company_id = 'ca000000-0000-0000-0000-000000000000';
-- the tech: his own days off and the company's events; values of his job and client, read only
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.calendar_events where id in ('a4220000-0000-4000-8000-000000000001', 'a4220000-0000-4000-8000-000000000003')$q$) = 2, 'the tech sees the company event and his own day off');
select tst.ok(tst.cnt($q$select 1 from public.calendar_events where id = 'a4220000-0000-4000-8000-000000000002'$q$) = 0, 'the tech does not see another person''s day off');
insert into public.calendar_events (id, company_id, kind, user_id, starts_at, ends_at, all_day) values
  ('a4220000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'time_off', 'a0000000-0000-0000-0000-000000000003', now() + interval '9 days', now() + interval '10 days', true);
update public.calendar_events set ends_at = starts_at + interval '2 days' where id = 'a4220000-0000-4000-8000-000000000004';
select tst.ok(tst.cnt($q$select 1 from public.calendar_events where id = 'a4220000-0000-4000-8000-000000000004'$q$) = 1, 'the tech asks for his own day off and changes it');
select tst.fails($q$insert into public.calendar_events (company_id, kind, user_id, starts_at, ends_at) values ('ca000000-0000-0000-0000-000000000000', 'time_off', 'a0000000-0000-0000-0000-000000000005', now(), now())$q$, 'the tech does not add a day off for someone else');
select tst.fails($q$insert into public.calendar_events (company_id, kind, title, starts_at, ends_at) values ('ca000000-0000-0000-0000-000000000000', 'event', 'T42 tech for all', now(), now())$q$, 'the tech does not add a company event');
select tst.blocked($q$update public.calendar_events set title = 'x' where id = 'a4220000-0000-4000-8000-000000000001'$q$, 'the tech does not change the company event');
select tst.fails($q$update public.calendar_events set user_id = 'a0000000-0000-0000-0000-000000000005' where id = 'a4220000-0000-4000-8000-000000000004'$q$, 'the tech does not move his day off to another person');
select tst.fails($q$update public.calendar_events set ends_at = ends_at + interval '30 days' where id = 'a4220000-0000-4000-8000-000000000003'$q$, 'the tech does not change a day off the office put down for him');
select tst.fails($q$update public.calendar_events set deleted_at = now() where id = 'a4220000-0000-4000-8000-000000000003'$q$, 'the tech does not remove a day off the office put down');
update public.calendar_events set deleted_at = now() where id = 'a4220000-0000-4000-8000-000000000004';
select tst.ok(tst.cnt($q$select 1 from public.calendar_events where id = 'a4220000-0000-4000-8000-000000000004' and deleted_at is not null$q$) = 1, 'the tech takes back his own day off');
update public.tasks set done_at = now() where id = 'a4210000-0000-4000-8000-000000000002';
select tst.ok(tst.cnt($q$select 1 from public.tasks where id = 'a4210000-0000-4000-8000-000000000002' and done_at is not null$q$) = 1, 'the tech marks the office''s task done');
select tst.fails($q$update public.tasks set starts_at = starts_at + interval '2 days', ends_at = ends_at + interval '2 days' where id = 'a4210000-0000-4000-8000-000000000002'$q$, 'the tech does not move the time of the office''s task');
select tst.fails($q$update public.tasks set description = 'tech rewrote' where id = 'a4210000-0000-4000-8000-000000000002'$q$, 'the tech does not rewrite the office''s task');
select tst.ok(tst.cnt($q$select 1 from public.custom_field_values where entity_id in ('c4200000-0000-4000-8000-000000000001', 'e4200000-0000-4000-8000-000000000001')$q$) = 6, 'the tech reads the values of his client and job (with the W-9 file)');
select tst.ok(tst.cnt($q$select 1 from public.custom_field_values where entity_id = 'c4200000-0000-4000-8000-000000000002'$q$) = 0, 'the tech does not see values of another client');
select tst.fails($q$insert into public.custom_field_values (company_id, field_id, entity_id, value) values ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000002', 'c4200000-0000-4000-8000-000000000001', '"Mon"')$q$, 'the tech does not write values (v1)');
select tst.blocked($q$update public.custom_field_values set value = '1' where field_id = 'a4230000-0000-4000-8000-000000000004'$q$, 'the tech does not change values');
select tst.ok(tst.cnt($q$select 1 from public.tasks where id = 'a4210000-0000-4000-8000-000000000001'$q$) = 0, 'a job task not given to the tech stays the office''s (tasks rules as before)');
-- another company and anon
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.calendar_events where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0, 'another company sees no events of ours');
select tst.ok(tst.cnt($q$select 1 from public.custom_fields where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0, 'another company sees no own fields of ours');
select tst.ok(tst.cnt($q$select 1 from public.custom_field_values where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0, 'another company sees no values of ours');
select tst.fails($q$insert into public.custom_field_values (company_id, field_id, entity_id, value) values ('cb000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000001', 'c4200000-0000-4000-8000-000000000001', '"x"')$q$, 'another company does not use our field');
-- no probing: under our company id the answer is the same whether the client / person exists or not
do $$
declare e1 text; e2 text; e3 text; e4 text;
begin
  begin insert into public.custom_field_values (company_id, field_id, entity_id, value) values ('ca000000-0000-0000-0000-000000000000', 'a4230000-0000-4000-8000-000000000001', 'c4200000-0000-4000-8000-000000000002', '"x"'); exception when others then e1 := sqlstate || sqlerrm; end;
  begin insert into public.custom_field_values (company_id, field_id, entity_id, value) values ('ca000000-0000-0000-0000-000000000000', gen_random_uuid(), gen_random_uuid(), '"x"'); exception when others then e2 := sqlstate || sqlerrm; end;
  begin insert into public.calendar_events (company_id, kind, user_id, starts_at, ends_at) values ('ca000000-0000-0000-0000-000000000000', 'time_off', 'a0000000-0000-0000-0000-000000000003', now(), now()); exception when others then e3 := sqlstate || sqlerrm; end;
  begin insert into public.calendar_events (company_id, kind, user_id, starts_at, ends_at) values ('ca000000-0000-0000-0000-000000000000', 'time_off', gen_random_uuid(), now(), now()); exception when others then e4 := sqlstate || sqlerrm; end;
  perform tst.ok(e1 is not null and e1 = e2, 'another company gets one answer for an existing and an unknown client: ' || coalesce(e1, '-'));
  perform tst.ok(e3 is not null and e3 = e4, 'another company gets one answer for a member and an unknown person: ' || coalesce(e3, '-'));
end $$;
select tst.fails($q$insert into public.calendar_events (company_id, kind, title, starts_at, ends_at) values ('ca000000-0000-0000-0000-000000000000', 'event', 'T42 b', now(), now())$q$, 'another company does not add events to ours');
reset role; set role anon;
select tst.fails($q$select 1 from public.calendar_events$q$, 'anon does not read events');
select tst.fails($q$select 1 from public.custom_fields$q$, 'anon does not read own fields');
select tst.fails($q$select 1 from public.custom_field_values$q$, 'anon does not read values');
\echo 'T42 wave П-2b: tasks with a time, events and days off, own fields ok'

-- ---------------------------------------------------------------- T43: wave 3b — a job without an estimate (S17)
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name, status, do_not_service_reason) values
    ('c4300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T43 Prospect', 'prospect', null),
    ('c4300000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T43 Banned', 'do_not_service', 'T43');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city, address_state) values
    ('d4300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c4300000-0000-4000-8000-000000000001', '43 Oak St', 'Austin', 'TX'),
    ('d4300000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c4300000-0000-4000-8000-000000000002', '43 Elm St', 'Austin', 'TX');
end $$;
-- a job type of company B (the office of A cannot read it, so it is taken here)
:as_super
select id as t43_btype from public.job_types where company_id = 'cb000000-0000-0000-0000-000000000000' limit 1 \gset
-- the office creates: a number from the server, status draft («ждёт даты»), the prospect becomes active
:as_office_a
select tst.ok((public.create_job('e4300000-0000-4000-8000-000000000001', 'c4300000-0000-4000-8000-000000000001', 'd4300000-0000-4000-8000-000000000001', '  Gutter repair  ', 'Back side', (select id from public.job_types where company_id = 'ca000000-0000-0000-0000-000000000000' and seed_key = 'repair')) ->> 'number') like 'JOB-%', 'the office creates a job, the server numbers it');
select tst.ok((select status = 'draft' and title = 'Gutter repair' and description = 'Back side' and job_type_id is not null and estimate_id is null from public.jobs where id = 'e4300000-0000-4000-8000-000000000001'), 'a new job waits for a date, its fields are saved');
select tst.ok((select status from public.customers where id = 'c4300000-0000-4000-8000-000000000001') = 'active', 'a prospect with a job becomes active');
-- an archived job type is not chosen anew
update public.job_types set archived_at = now() where company_id = 'ca000000-0000-0000-0000-000000000000' and seed_key = 'warranty';
select tst.fails($q$select public.create_job('e4300000-0000-4000-8000-000000000009', 'c4300000-0000-4000-8000-000000000001', 'd4300000-0000-4000-8000-000000000001', 'X', null, (select id from public.job_types where company_id = 'ca000000-0000-0000-0000-000000000000' and seed_key = 'warranty'))$q$, 'an archived job type is refused');
update public.job_types set archived_at = null where company_id = 'ca000000-0000-0000-0000-000000000000' and seed_key = 'warranty';
-- a repeat with the same id (offline replay) is the same job
select tst.ok((public.create_job('e4300000-0000-4000-8000-000000000001', 'c4300000-0000-4000-8000-000000000001', 'd4300000-0000-4000-8000-000000000001', 'Other') ->> 'repeat')::boolean, 'a repeat returns the same job');
select tst.ok(tst.cnt($q$select 1 from public.jobs where id = 'e4300000-0000-4000-8000-000000000001' and title = 'Gutter repair'$q$) = 1, 'a repeat changes nothing');
select tst.fails($q$select public.create_job('e4300000-0000-4000-8000-000000000001', 'c4300000-0000-4000-8000-000000000002', 'd4300000-0000-4000-8000-000000000002', 'Other')$q$, 'the same id for another client is refused, not «repeat»');
select tst.fails($q$select public.create_job('e4300000-0000-4000-8000-000000000009', 'c4300000-0000-4000-8000-000000000002', 'd4300000-0000-4000-8000-000000000002', 'X')$q$, 'a «do not service» client takes no new job');
select tst.fails($q$select public.create_job('e4300000-0000-4000-8000-000000000009', 'c4300000-0000-4000-8000-000000000001', 'd4300000-0000-4000-8000-000000000002', 'X')$q$, 'the address must be a property of this client');
select tst.fails($q$select public.create_job('e4300000-0000-4000-8000-000000000009', 'c4300000-0000-4000-8000-000000000001', 'd4300000-0000-4000-8000-000000000001', '   ')$q$, 'a job needs a name');
select tst.fails($q$select public.create_job('e4300000-0000-4000-8000-000000000009', 'c4300000-0000-4000-8000-000000000001', 'd4300000-0000-4000-8000-000000000001', 'X', null, $q$ || quote_literal(:'t43_btype') || $q$)$q$, 'a job type of another company is refused');
-- the office plans it (S9): a visit of the job
insert into public.visits (id, company_id, job_id, kind, starts_at, ends_at) values ('f4300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e4300000-0000-4000-8000-000000000001', 'install', now() + interval '1 day', now() + interval '1 day 1 hour');
select tst.ok(tst.cnt($q$select 1 from public.visits where id = 'f4300000-0000-4000-8000-000000000001'$q$) = 1, 'the office puts a visit on the job');
-- sales create (without a date: the form has none for them)
:as_sales_a
select tst.ok((public.create_job('e4300000-0000-4000-8000-000000000002', 'c4300000-0000-4000-8000-000000000001', 'd4300000-0000-4000-8000-000000000001', 'Sales job') ->> 'number') like 'JOB-%', 'sales create a job without a date');
-- the tech and another company create nothing
:as_tech_a
select tst.fails($q$select public.create_job('e4300000-0000-4000-8000-000000000003', 'c4300000-0000-4000-8000-000000000001', 'd4300000-0000-4000-8000-000000000001', 'Tech job')$q$, 'the tech does not create a job');
:as_owner_b
select tst.fails($q$select public.create_job('e4300000-0000-4000-8000-000000000004', 'c4300000-0000-4000-8000-000000000001', 'd4300000-0000-4000-8000-000000000001', 'B job')$q$, 'another company does not create a job for our client');
select tst.fails($q$select public.create_job('e4300000-0000-4000-8000-000000000001', 'c4300000-0000-4000-8000-000000000001', 'd4300000-0000-4000-8000-000000000001', 'B job')$q$, 'another company does not read our job through a repeat');
reset role; set role anon;
select tst.fails($q$select public.create_job('e4300000-0000-4000-8000-000000000005', 'c4300000-0000-4000-8000-000000000001', 'd4300000-0000-4000-8000-000000000001', 'anon')$q$, 'anon does not create a job');
:as_super
select tst.ok(tst.cnt($q$select 1 from public.jobs where id in ('e4300000-0000-4000-8000-000000000003', 'e4300000-0000-4000-8000-000000000004', 'e4300000-0000-4000-8000-000000000005', 'e4300000-0000-4000-8000-000000000009')$q$) = 0, 'no refused job was made');
\echo 'T43 wave 3b: a job without an estimate (S17) ok'

-- ---------------------------------------------------------------- T46: wave 3c — «Работа выполнена» (S10): «on site» starts the job, the office closes it
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values ('c4600000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T46 Client');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city, address_state) values
    ('d4600000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c4600000-0000-4000-8000-000000000001', '46 Pine St', 'Austin', 'TX');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values
    ('e4600000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T46 job', 'c4600000-0000-4000-8000-000000000001', 'd4600000-0000-4000-8000-000000000001', 'draft'),
    ('e4600000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T46 waiting', 'c4600000-0000-4000-8000-000000000001', 'd4600000-0000-4000-8000-000000000001', 'draft');
  insert into public.visits (id, company_id, job_id, kind, starts_at, ends_at) values
    ('f4600000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e4600000-0000-4000-8000-000000000001', 'install', now() - interval '1 hour', now()),
    ('f4600000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'e4600000-0000-4000-8000-000000000001', 'install', now() + interval '1 day', now() + interval '1 day 1 hour');
  update public.jobs set status = 'scheduled' where id = 'e4600000-0000-4000-8000-000000000001';
  insert into public.visit_assignees (company_id, visit_id, user_id) values
    ('ca000000-0000-0000-0000-000000000000', 'f4600000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000003');
end $$;
-- a job on hold stays on hold when its visit gets on site (only the office resumes it)
:as_owner_a
do $$ begin
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values
    ('e4600000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'T46 held', 'c4600000-0000-4000-8000-000000000001', 'd4600000-0000-4000-8000-000000000001', 'draft');
  insert into public.visits (id, company_id, job_id, kind, starts_at, ends_at) values
    ('f4600000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'e4600000-0000-4000-8000-000000000003', 'install', now(), now() + interval '1 hour');
  update public.jobs set status = 'scheduled' where id = 'e4600000-0000-4000-8000-000000000003';
  update public.jobs set status = 'in_progress' where id = 'e4600000-0000-4000-8000-000000000003';
  update public.jobs set status = 'on_hold' where id = 'e4600000-0000-4000-8000-000000000003';
  insert into public.visit_assignees (company_id, visit_id, user_id) values
    ('ca000000-0000-0000-0000-000000000000', 'f4600000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000003');
end $$;
:as_tech_a
update public.visits set status = 'on_site' where id = 'f4600000-0000-4000-8000-000000000003';
:as_owner_a
select tst.ok((select status from public.jobs where id = 'e4600000-0000-4000-8000-000000000003') = 'on_hold', 'the tech on site does not resume a held job');
-- the technician (who may not update jobs) gets on site: the job starts anyway
:as_tech_a
update public.visits set status = 'en_route' where id = 'f4600000-0000-4000-8000-000000000001';
select tst.ok((select status from public.jobs where id = 'e4600000-0000-4000-8000-000000000001') = 'scheduled', 'on the way does not start the job');
update public.visits set status = 'on_site' where id = 'f4600000-0000-4000-8000-000000000001';
:as_owner_a
select tst.ok((select status from public.jobs where id = 'e4600000-0000-4000-8000-000000000001') = 'in_progress', '«on site» starts the job, even when the tech moves the visit');
-- the tech does not close the job, neither by the function nor directly
:as_tech_a
select tst.fails($q$select public.complete_job('e4600000-0000-4000-8000-000000000001')$q$, 'the tech does not close a job');
select tst.blocked($q$update public.jobs set status = 'completed' where id = 'e4600000-0000-4000-8000-000000000001'$q$, 'the tech does not set «completed» directly');
-- sales do not close a job
:as_sales_a
select tst.fails($q$select public.complete_job('e4600000-0000-4000-8000-000000000001')$q$, 'sales do not close a job');
select tst.fails($q$update public.jobs set status = 'completed' where id = 'e4600000-0000-4000-8000-000000000001'$q$, 'sales do not close a job directly either');
select tst.fails($q$insert into public.jobs (company_id, title, customer_id, property_id, status) values ('ca000000-0000-0000-0000-000000000000', 'T46 born closed', 'c4600000-0000-4000-8000-000000000001', 'd4600000-0000-4000-8000-000000000001', 'completed')$q$, 'sales do not insert a job that is already closed');
-- the office: not while a visit is open
:as_office_a
select tst.fails($q$select public.complete_job('e4600000-0000-4000-8000-000000000001')$q$, 'not while a visit of the job is open');
select tst.fails($q$update public.jobs set status = 'completed' where id = 'e4600000-0000-4000-8000-000000000001'$q$, 'not directly either while a visit is open');
update public.visits set status = 'completed' where id = 'f4600000-0000-4000-8000-000000000001';
select tst.ok((select status from public.jobs where id = 'e4600000-0000-4000-8000-000000000001') = 'in_progress', 'a finished visit (paid) does not close the job');
select tst.fails($q$select public.complete_job('e4600000-0000-4000-8000-000000000001')$q$, 'the second visit is still open');
select public.cancel_visit('f4600000-0000-4000-8000-000000000002', 'client_cancelled');
select tst.ok((select status from public.jobs where id = 'e4600000-0000-4000-8000-000000000001') = 'in_progress', 'cancelling the last open visit of a going job leaves it going (S9a)');
select tst.ok((public.complete_job('e4600000-0000-4000-8000-000000000001') ->> 'status') = 'completed', 'the office closes the job');
select tst.ok((select status = 'completed' and completed_at is not null from public.jobs where id = 'e4600000-0000-4000-8000-000000000001'), 'the job is completed, with its time');
select tst.ok((public.complete_job('e4600000-0000-4000-8000-000000000001') ->> 'repeat')::boolean, 'a repeat changes nothing');
select tst.fails($q$select public.complete_job('e4600000-0000-4000-8000-000000000002')$q$, 'a job waiting for a date is not closed');
-- a scheduled job with no visit open (the visit was cancelled) closes through «in progress»
update public.jobs set status = 'scheduled' where id = 'e4600000-0000-4000-8000-000000000002';
select tst.ok((public.complete_job('e4600000-0000-4000-8000-000000000002') ->> 'status') = 'completed', 'a scheduled job closes (through in progress)');
-- another company and anon
:as_owner_b
select tst.fails($q$select public.complete_job('e4600000-0000-4000-8000-000000000002')$q$, 'another company does not close our job');
reset role; set role anon;
select tst.fails($q$select public.complete_job('e4600000-0000-4000-8000-000000000002')$q$, 'anon does not close a job');
:as_super
select tst.ok((select count(*) from public.jobs where id in ('e4600000-0000-4000-8000-000000000001', 'e4600000-0000-4000-8000-000000000002') and status = 'completed') = 2, 'only the office closed, nothing else');
\echo 'T46 wave 3c: «Работа выполнена» (S10) ok'

-- ---------------------------------------------------------------- T44: wave 4b-1 — «do not service» (docs/specs/04 §12): nothing new for the client
:as_super
create function tst.dns(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = 'P0001' and sqlerrm = 'customer_do_not_service' then
      raise notice 'EXPECTED [%] % -> %', p_msg, sqlstate, sqlerrm;
      return;
    end if;
    raise exception 'FAILED (expected customer_do_not_service, got % %): % — %', sqlstate, sqlerrm, p_msg, p_sql;
  end;
  raise exception 'FAILED (expected customer_do_not_service): % — %', p_msg, p_sql;
end $$;
grant execute on function tst.dns(text, text) to authenticated, anon;
:as_owner_a
do $$
declare v_ver uuid; v_ver2 uuid; v_tok text;
begin
  insert into public.customers (id, company_id, display_name) values
    ('c4400000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T44 Closed'),
    ('c4400000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T44 Open');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
    ('d4400000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c4400000-0000-4000-8000-000000000001', '44 Closed St', 'Pasadena'),
    ('d4400000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c4400000-0000-4000-8000-000000000002', '44 Open St', 'Pasadena');
  insert into public.leads (id, company_id, source_id, contact_name, phone, customer_id) values
    ('14400000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T44 lead', '+13235554401', 'c4400000-0000-4000-8000-000000000001');
  insert into public.leads (id, company_id, source_id, contact_name, phone, property_id) values
    ('14400000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T44 lead at the address', '+13235554402', 'd4400000-0000-4000-8000-000000000001');
  -- what was open before the mark: a job with a visit, a sent estimate with a link, a draft
  insert into public.jobs (id, company_id, title, customer_id, property_id) values
    ('e4400000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T44 open job', 'c4400000-0000-4000-8000-000000000001', 'd4400000-0000-4000-8000-000000000001'),
    ('e4400000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T44 other job', 'c4400000-0000-4000-8000-000000000002', 'd4400000-0000-4000-8000-000000000002');
  insert into public.visits (id, company_id, job_id, kind) values
    ('f4400000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e4400000-0000-4000-8000-000000000001', 'install');
  insert into public.estimates (id, company_id, customer_id, property_id, title) values
    ('0e440000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c4400000-0000-4000-8000-000000000001', 'd4400000-0000-4000-8000-000000000001', 'T44 sent'),
    ('0e440000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c4400000-0000-4000-8000-000000000001', 'd4400000-0000-4000-8000-000000000001', 'T44 draft'),
    ('0e440000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'c4400000-0000-4000-8000-000000000002', 'd4400000-0000-4000-8000-000000000002', 'T44 other');
  insert into public.estimate_versions (company_id, estimate_id, version_no) values ('ca000000-0000-0000-0000-000000000000', '0e440000-0000-4000-8000-000000000001', 1) returning id into v_ver;
  update public.estimates set current_version_id = v_ver where id = '0e440000-0000-4000-8000-000000000001';
  insert into public.estimate_versions (company_id, estimate_id, version_no) values ('ca000000-0000-0000-0000-000000000000', '0e440000-0000-4000-8000-000000000002', 1) returning id into v_ver2;
  update public.estimates set current_version_id = v_ver2 where id = '0e440000-0000-4000-8000-000000000002';
  v_tok := public.send_estimate('0e440000-0000-4000-8000-000000000001', 'tok_t44_0123456789abcdef');
  perform tst.ok(v_tok = 'tok_t44_0123456789abcdef', 'an ordinary client: the estimate is sent');
  -- the mark
  update public.customers set status = 'do_not_service', do_not_service_reason = 'T44 rude' where id = 'c4400000-0000-4000-8000-000000000001';
  perform tst.ok((select public_token is null and link_revoked_at is not null from public.estimates where id = '0e440000-0000-4000-8000-000000000001'), 'the open link is revoked on the mark');
  perform tst.ok((select count(*) from public.activities where subject_id = '0e440000-0000-4000-8000-000000000001' and meta ->> 'why' = 'do_not_service') = 1, 'the revoke is in the estimate history');
end $$;
-- nothing new: job, estimate, visit (by job, by lead, by property), move, send, a new link
:as_office_a
select tst.dns($q$insert into public.jobs (company_id, title, customer_id, property_id) values ('ca000000-0000-0000-0000-000000000000', 'T44 new job', 'c4400000-0000-4000-8000-000000000001', 'd4400000-0000-4000-8000-000000000001')$q$, 'no new job for a «do not service» client');
select tst.dns($q$insert into public.estimates (company_id, customer_id, property_id, title) values ('ca000000-0000-0000-0000-000000000000', 'c4400000-0000-4000-8000-000000000001', 'd4400000-0000-4000-8000-000000000001', 'T44 new')$q$, 'no new estimate');
select tst.dns($q$insert into public.visits (company_id, job_id, kind) values ('ca000000-0000-0000-0000-000000000000', 'e4400000-0000-4000-8000-000000000001', 'service')$q$, 'no new visit on the open job');
select tst.dns($q$insert into public.visits (company_id, lead_id, kind) values ('ca000000-0000-0000-0000-000000000000', '14400000-0000-4000-8000-000000000001', 'inspection')$q$, 'no inspection by the client''s lead');
select tst.dns($q$insert into public.visits (company_id, lead_id, kind) values ('ca000000-0000-0000-0000-000000000000', '14400000-0000-4000-8000-000000000002', 'inspection')$q$, 'no inspection at the client''s property (lead without a client)');
-- moving a job onto the client: a job's client never changes («Работы» t14, their test)
select tst.dns($q$update public.estimates set customer_id = 'c4400000-0000-4000-8000-000000000001', property_id = 'd4400000-0000-4000-8000-000000000001' where id = '0e440000-0000-4000-8000-000000000003'$q$, 'an estimate is not moved onto the client');
select tst.dns($q$select public.send_estimate('0e440000-0000-4000-8000-000000000002')$q$, 'the old draft is not sent');
select tst.dns($q$select public.send_estimate('0e440000-0000-4000-8000-000000000001')$q$, 'the revoked estimate gets no new link');
:as_super
do $$ begin
  perform tst.dns($q$select tst.set_token('0e440000-0000-4000-8000-000000000001', 'tok_t44_new_0123456789ab')$q$, 'not even a definer gives the client a new link');
end $$;
-- security-check 06.11: no signature, no revival, no restore, the property owner counts, the open is editable
:as_super
do $$ begin
  perform set_config('app.signing_estimate', '0e440000-0000-4000-8000-000000000001', true);
  perform tst.dns($q$update public.estimates set status = 'awaiting_countersign' where id = '0e440000-0000-4000-8000-000000000001'$q$, 'no signature (on site / countersign) for the client, even from a signing function');
  update public.estimates set status = 'expired' where id = '0e440000-0000-4000-8000-000000000001';
  perform set_config('app.signing_estimate', '', true);
end $$;
:as_office_a
select tst.dns($q$update public.estimates set status = 'viewed' where id = '0e440000-0000-4000-8000-000000000001'$q$, 'an expired estimate is not revived into «viewed»');
-- a job of another client at the client's property: «Работы» t14 refuses it first (the address is not a property of
-- that client, 22023) — still refused; t44 stays the guard for estimates and visits
do $$ begin
  begin
    insert into public.jobs (company_id, title, customer_id, property_id) values ('ca000000-0000-0000-0000-000000000000', 'T44 at their address', 'c4400000-0000-4000-8000-000000000002', 'd4400000-0000-4000-8000-000000000001');
    raise exception 'FAILED: a job of another client at the client''s property was made';
  exception when others then
    perform tst.ok(sqlstate = '22023' or sqlerrm = 'customer_do_not_service', 'no job of another client at the client''s property: ' || sqlerrm);
  end;
end $$;
select tst.dns($q$insert into public.estimates (company_id, customer_id, property_id, title) values ('ca000000-0000-0000-0000-000000000000', 'c4400000-0000-4000-8000-000000000002', 'd4400000-0000-4000-8000-000000000001', 'T44 at their address')$q$, 'no estimate of another client at the client''s property');
:as_super
update public.estimates set deleted_at = now() where id = '0e440000-0000-4000-8000-000000000002';
select tst.dns($q$update public.estimates set deleted_at = null where id = '0e440000-0000-4000-8000-000000000002'$q$, 'a deleted estimate is not restored for the client (any path, the app cannot even see it)');
:as_office_a
-- the open job moves to another address of the same client: its visit follows, nothing refused
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
  ('d4400000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'c4400000-0000-4000-8000-000000000001', '44 Second St', 'Pasadena');
-- (the app does not move a job; a server path would — column grants, 20261107040000)
select tst.server_job($q$update public.jobs set property_id = 'd4400000-0000-4000-8000-000000000003' where id = 'e4400000-0000-4000-8000-000000000001' returning id$q$);
select tst.ok((select property_id from public.visits where id = 'f4400000-0000-4000-8000-000000000001') = 'd4400000-0000-4000-8000-000000000003', 'the open job and its visit move to another address of the client');
update public.visits set property_id = 'd4400000-0000-4000-8000-000000000001' where id = 'f4400000-0000-4000-8000-000000000001';
-- another company does not learn that our client is marked: RLS answers, not the mark
:as_owner_b
do $$ begin
  begin
    insert into public.jobs (company_id, title, customer_id, property_id) values ('ca000000-0000-0000-0000-000000000000', 'T44 spy', 'c4400000-0000-4000-8000-000000000001', 'd4400000-0000-4000-8000-000000000001');
    raise exception 'FAILED: another company inserted a job';
  exception when others then
    perform tst.ok(sqlerrm <> 'customer_do_not_service' and sqlerrm not like 'FAILED%', 'another company gets RLS, not the mark: ' || sqlerrm);
  end;
end $$;
-- the open stays: the visit moves on, the job is edited, the draft is edited
:as_office_a
update public.visits set status = 'en_route' where id = 'f4400000-0000-4000-8000-000000000001';
update public.jobs set title = 'T44 open job, edited' where id = 'e4400000-0000-4000-8000-000000000001';
update public.estimates set title = 'T44 draft, edited' where id = '0e440000-0000-4000-8000-000000000002';
select tst.ok((select status from public.visits where id = 'f4400000-0000-4000-8000-000000000001') = 'en_route', 'the open visit goes on');
select tst.ok((select title from public.jobs where id = 'e4400000-0000-4000-8000-000000000001') = 'T44 open job, edited', 'the open job is edited');
select tst.ok((select status from public.estimates where id = '0e440000-0000-4000-8000-000000000002') = 'draft', 'the draft stays a draft');
-- another client: everything works
insert into public.visits (company_id, job_id, kind) values ('ca000000-0000-0000-0000-000000000000', 'e4400000-0000-4000-8000-000000000002', 'service');
select tst.dns($q$update public.visits set job_id = 'e4400000-0000-4000-8000-000000000001' where id = (select id from public.visits where job_id = 'e4400000-0000-4000-8000-000000000002' limit 1)$q$, 'a visit is not moved onto the client''s job');
insert into public.jobs (company_id, title, customer_id, property_id) values ('ca000000-0000-0000-0000-000000000000', 'T44 job for the open client', 'c4400000-0000-4000-8000-000000000002', 'd4400000-0000-4000-8000-000000000002');
-- back to active: work again
:as_owner_a
update public.customers set status = 'active', do_not_service_reason = null where id = 'c4400000-0000-4000-8000-000000000001';
:as_office_a
insert into public.jobs (company_id, title, customer_id, property_id) values ('ca000000-0000-0000-0000-000000000000', 'T44 job after the mark is off', 'c4400000-0000-4000-8000-000000000001', 'd4400000-0000-4000-8000-000000000001');
:as_super
select tst.ok((select count(*) from public.jobs where customer_id = 'c4400000-0000-4000-8000-000000000001') = 2, 'only the job after the mark was lifted');
reset role; set role anon;
select tst.ok(public.portal_estimate('tok_t44_0123456789abcdef') is null, 'the client''s old link opens nothing');
\echo 'T44 wave 4b-1: «do not service» — nothing new, the open stays, links revoked ok'

-- ---------------------------------------------------------------- T47: a direct insert into jobs keeps the checks of create_job (t14, security check 06.11)
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values
    ('c4700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T47 One'),
    ('c4700000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T47 Two'),
    ('c4700000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'T47 Gone');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city, address_state) values
    ('d4700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c4700000-0000-4000-8000-000000000001', '47 Oak St', 'Austin', 'TX'),
    ('d4700000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c4700000-0000-4000-8000-000000000002', '47 Elm St', 'Austin', 'TX'),
    ('d4700000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'c4700000-0000-4000-8000-000000000003', '47 Ash St', 'Austin', 'TX');
  update public.customers set deleted_at = now() where id = 'c4700000-0000-4000-8000-000000000003';
  insert into public.estimates (id, company_id, customer_id, property_id, title) values
    ('0e470000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c4700000-0000-4000-8000-000000000002', 'd4700000-0000-4000-8000-000000000002', 'T47 of Two');
  update public.job_types set archived_at = now() where company_id = 'ca000000-0000-0000-0000-000000000000' and seed_key = 'warranty';
end $$;
:as_super
select id as t47_btype from public.job_types where company_id = 'cb000000-0000-0000-0000-000000000000' limit 1 \gset
-- sales insert a row themselves (the jobs_insert policy lets them; the app does it in lead.book / estimate.deposit)
:as_sales_a
insert into public.jobs (id, company_id, number, title, customer_id, property_id, type) values
  ('e4700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '', 'Estimate visit', 'c4700000-0000-4000-8000-000000000001', 'd4700000-0000-4000-8000-000000000001', 'inspection');
select tst.ok((select status = 'draft' and number like 'JOB-%' from public.jobs where id = 'e4700000-0000-4000-8000-000000000001'), 'a direct insert as the app makes it (lead.book) still works');
select tst.fails($q$insert into public.jobs (id, company_id, title, customer_id, property_id) values ('e4700000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', 'X', 'c4700000-0000-4000-8000-000000000001', 'd4700000-0000-4000-8000-000000000002')$q$, 'directly: the address must be a property of this client');
select tst.fails($q$insert into public.jobs (id, company_id, title, customer_id, property_id) values ('e4700000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', 'X', 'c4700000-0000-4000-8000-000000000003', 'd4700000-0000-4000-8000-000000000003')$q$, 'directly: a deleted client takes no job');
select tst.fails($q$insert into public.jobs (id, company_id, title, customer_id, property_id, job_type_id) values ('e4700000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', 'X', 'c4700000-0000-4000-8000-000000000001', 'd4700000-0000-4000-8000-000000000001', (select id from public.job_types where company_id = 'ca000000-0000-0000-0000-000000000000' and seed_key = 'warranty'))$q$, 'directly: an archived job type is refused');
select tst.fails($q$insert into public.jobs (id, company_id, title, customer_id, property_id, job_type_id) values ('e4700000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', 'X', 'c4700000-0000-4000-8000-000000000001', 'd4700000-0000-4000-8000-000000000001', $q$ || quote_literal(:'t47_btype') || $q$)$q$, 'directly: a job type of another company is refused');
select tst.fails($q$insert into public.jobs (id, company_id, title, customer_id, property_id, status) values ('e4700000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', 'X', 'c4700000-0000-4000-8000-000000000001', 'd4700000-0000-4000-8000-000000000001', 'scheduled')$q$, 'directly: a job is not born «scheduled» (no date yet)');
select tst.fails($q$insert into public.jobs (id, company_id, title, customer_id, property_id, status) values ('e4700000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', 'X', 'c4700000-0000-4000-8000-000000000001', 'd4700000-0000-4000-8000-000000000001', 'in_progress')$q$, 'directly: a job is not born «in progress»');
select tst.fails($q$insert into public.jobs (id, company_id, title, customer_id, property_id, cancelled_at) values ('e4700000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', 'X', 'c4700000-0000-4000-8000-000000000001', 'd4700000-0000-4000-8000-000000000001', now())$q$, 'directly: a job is not born with a cancel time');
select tst.fails($q$insert into public.jobs (id, company_id, title, customer_id, property_id, estimate_id) values ('e4700000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', 'X', 'c4700000-0000-4000-8000-000000000001', 'd4700000-0000-4000-8000-000000000001', '0e470000-0000-4000-8000-000000000002')$q$, 'directly: the estimate of another client is refused');
select tst.fails($q$insert into public.jobs (id, company_id, title, customer_id, property_id, contract_total_cents) values ('e4700000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', 'X', 'c4700000-0000-4000-8000-000000000001', 'd4700000-0000-4000-8000-000000000001', 100)$q$, 'directly: the app does not set the total of a job');
select tst.fails($q$insert into public.jobs (id, company_id, title, customer_id, property_id, recurring_plan_id, occurrence_date) values ('e4700000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', 'X', 'c4700000-0000-4000-8000-000000000001', 'd4700000-0000-4000-8000-000000000001', gen_random_uuid(), current_date)$q$, 'directly: no recurring plan slot');
select tst.fails($q$insert into public.jobs (id, company_id, title, customer_id, property_id, deleted_at) values ('e4700000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', 'X', 'c4700000-0000-4000-8000-000000000001', 'd4700000-0000-4000-8000-000000000001', now())$q$, 'directly: a job is not born deleted');
-- a replay with the same id (offline queue, upsert … do nothing) passes and changes nothing, even after the client is gone
insert into public.jobs (id, company_id, number, title, customer_id, property_id, type) values
  ('e4700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '', 'Changed', 'c4700000-0000-4000-8000-000000000003', 'd4700000-0000-4000-8000-000000000003', 'inspection')
  on conflict (id) do nothing;
select tst.ok((select title = 'Estimate visit' and customer_id = 'c4700000-0000-4000-8000-000000000001' from public.jobs where id = 'e4700000-0000-4000-8000-000000000001'), 'a replay changes nothing');
select tst.fails($q$insert into public.jobs (id, company_id, number, title, customer_id, property_id) values ('e4700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '', 'X', 'c4700000-0000-4000-8000-000000000002', 'd4700000-0000-4000-8000-000000000002') on conflict (id) do update set customer_id = excluded.customer_id, property_id = excluded.property_id$q$, 'a replay as an update does not move the job to another client');
-- an update does not move the job around either
select tst.fails($q$update public.jobs set property_id = 'd4700000-0000-4000-8000-000000000002' where id = 'e4700000-0000-4000-8000-000000000001'$q$, 'update: the address must be a property of this client');
select tst.fails($q$update public.jobs set customer_id = 'c4700000-0000-4000-8000-000000000002', property_id = 'd4700000-0000-4000-8000-000000000002' where id = 'e4700000-0000-4000-8000-000000000001'$q$, 'update: the client of a job does not change');
select tst.fails($q$update public.jobs set contract_total_cents = 1 where id = 'e4700000-0000-4000-8000-000000000001'$q$, 'update: the total of a job does not change directly (no column grant since 20261107040000)');
select tst.ok((select contract_total_cents from public.jobs where id = 'e4700000-0000-4000-8000-000000000001') is null, 'update: the total stays the server''s');
select tst.fails($q$update public.jobs set job_type_id = (select id from public.job_types where company_id = 'ca000000-0000-0000-0000-000000000000' and seed_key = 'warranty') where id = 'e4700000-0000-4000-8000-000000000001'$q$, 'update: an archived job type is refused');
select tst.fails($q$update public.jobs set completed_at = now() where id = 'e4700000-0000-4000-8000-000000000001'$q$, 'update: no «completed» time without the status');
update public.jobs set description = 'T47 note', job_type_id = (select id from public.job_types where company_id = 'ca000000-0000-0000-0000-000000000000' and seed_key = 'repair') where id = 'e4700000-0000-4000-8000-000000000001';
select tst.ok((select description = 'T47 note' and job_type_id is not null from public.jobs where id = 'e4700000-0000-4000-8000-000000000001'), 'update: what the app changes still changes (job.update)');
-- the other live paths of the app (ops.ts): job.update money, job.category, advanceJob, lead.visit
update public.jobs set tax_enabled = true, tax_rate_bps = 825 where id = 'e4700000-0000-4000-8000-000000000001';
select tst.ok((select tax_enabled and tax_rate_bps = 825 from public.jobs where id = 'e4700000-0000-4000-8000-000000000001'), 'job.update: the tax of a job still changes');
update public.jobs set service_category_id = null where id = 'e4700000-0000-4000-8000-000000000001';
select tst.ok((select service_category_id is null from public.jobs where id = 'e4700000-0000-4000-8000-000000000001'), 'job.category still changes');
update public.jobs set status = 'scheduled' where id = 'e4700000-0000-4000-8000-000000000001';
update public.jobs set status = 'in_progress' where id = 'e4700000-0000-4000-8000-000000000001';
select tst.ok((select status from public.jobs where id = 'e4700000-0000-4000-8000-000000000001') = 'in_progress', 'advanceJob: a job still moves draft → scheduled → in progress');
insert into public.jobs (id, company_id, customer_id, property_id, title, type, number) values
  ('e4700000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'c4700000-0000-4000-8000-000000000002', 'd4700000-0000-4000-8000-000000000002', 'Estimate visit', 'inspection', '')
  on conflict (id) do nothing;
insert into public.jobs (id, company_id, customer_id, property_id, title, type, number) values
  ('e4700000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'c4700000-0000-4000-8000-000000000002', 'd4700000-0000-4000-8000-000000000002', 'Estimate visit', 'inspection', '')
  on conflict (id) do nothing;
select tst.ok(tst.cnt($q$select 1 from public.jobs where id = 'e4700000-0000-4000-8000-000000000003' and status = 'draft'$q$) = 1, 'lead.visit: the inspection job is made once, a replay changes nothing');
-- the office: the same refusals for any staff role, the server function still works
:as_office_a
select tst.fails($q$insert into public.jobs (id, company_id, title, customer_id, property_id) values ('e4700000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', 'X', 'c4700000-0000-4000-8000-000000000002', 'd4700000-0000-4000-8000-000000000001')$q$, 'the office: the address must be of this client too');
select tst.ok((public.create_job('e4700000-0000-4000-8000-000000000002', 'c4700000-0000-4000-8000-000000000002', 'd4700000-0000-4000-8000-000000000002', 'T47 by function') ->> 'number') like 'JOB-%', 'create_job still creates a job');
-- an estimate signed on site and countersigned still makes its job (execute_estimate is a server function)
:as_owner_a
do $$
declare v uuid; o uuid;
begin
  insert into public.estimate_versions (company_id, estimate_id, version_no) values ('ca000000-0000-0000-0000-000000000000', '0e470000-0000-4000-8000-000000000002', 1) returning id into v;
  update public.estimates set current_version_id = v where id = '0e470000-0000-4000-8000-000000000002';
  insert into public.estimate_options (company_id, version_id, name) values ('ca000000-0000-0000-0000-000000000000', v, 'Only') returning id into o;
  insert into public.estimate_line_items (company_id, option_id, line_group, name, quantity, unit_price_cents) values ('ca000000-0000-0000-0000-000000000000', o, 'labor', 'Fix (test price)', 1, 4700);
  update public.estimate_versions set locked_at = now(), sent_at = now() where id = v;
  update public.estimates set status = 'sent', sent_version_id = v where id = '0e470000-0000-4000-8000-000000000002';
  perform tst.ok(public.sign_estimate_on_site('0e470000-0000-4000-8000-000000000002', 'T47 Two', 'M0 0 L2 2') = 'awaiting_countersign', 'T47: the client signs on site');
  perform tst.ok(public.countersign_estimate('0e470000-0000-4000-8000-000000000002', 'M0 0 L3 3') = 'approved', 'T47: the company signs');
  perform tst.ok((select status = 'draft' and contract_total_cents = 4700 from public.jobs where estimate_id = '0e470000-0000-4000-8000-000000000002'), 'a signed estimate still makes its job, waiting for a date');
  perform tst.fails($q$insert into public.jobs (company_id, title, customer_id, property_id, estimate_id, contract_total_cents) values ('ca000000-0000-0000-0000-000000000000', 'squat', 'c4700000-0000-4000-8000-000000000002', 'd4700000-0000-4000-8000-000000000002', '0e470000-0000-4000-8000-000000000002', 100)$q$, 'a job of an estimate is never inserted by the app');
  -- estimate.deposit (ops.ts): a replay of the signed estimate's job by its server id — upsert … do nothing passes, changes nothing
  insert into public.jobs (id, company_id, customer_id, property_id, estimate_id, approved_version_id, title, contract_total_cents, number)
  select j.id, j.company_id, j.customer_id, j.property_id, j.estimate_id, j.approved_version_id, 'T47 deposit replay', 1, ''
    from public.jobs j where j.estimate_id = '0e470000-0000-4000-8000-000000000002'
  on conflict (id) do nothing;
  perform tst.ok((select contract_total_cents = 4700 and title <> 'T47 deposit replay' from public.jobs where estimate_id = '0e470000-0000-4000-8000-000000000002'), 'estimate.deposit replay passes and changes nothing');
  perform tst.fails($q$update public.jobs set contract_total_cents = 100 where estimate_id = '0e470000-0000-4000-8000-000000000002'$q$, 'the signed price of a job: no column grant (20261107040000)');
  perform tst.ok((select contract_total_cents from public.jobs where estimate_id = '0e470000-0000-4000-8000-000000000002') = 4700, 'the signed price of a job does not change directly');
  update public.job_types set archived_at = null where company_id = 'ca000000-0000-0000-0000-000000000000' and seed_key = 'warranty';
end $$;
:as_super
select tst.ok(tst.cnt($q$select 1 from public.jobs where id = 'e4700000-0000-4000-8000-000000000009'$q$) = 0, 'no refused job was made');
\echo 'T47 direct insert into jobs keeps the create_job checks ok'

-- ---------------------------------------------------------------- T52: API rights — what anon and authenticated may touch (security audit 06.11, items 4–5)
-- auth_stub.sql gives the Supabase default privileges before the migrations, so this checks the real picture.
reset role; reset request.jwt.claim.sub;
do $$
declare bad text;
begin
  select string_agg(c.relname || ':' || p, ', ') into bad
    from pg_class c, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p', 'f')
     and has_table_privilege('anon', c.oid, p);
  perform tst.ok(bad is null, 'anon has no rights on public tables: ' || coalesce(bad, ''));

  select string_agg(c.relname || ':' || p, ', ') into bad
    from pg_class c, unnest(array['TRUNCATE','REFERENCES','TRIGGER']) p
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p', 'f')
     and has_table_privilege('authenticated', c.oid, p);
  perform tst.ok(bad is null, 'authenticated has no TRUNCATE / REFERENCES / TRIGGER: ' || coalesce(bad, ''));

  select string_agg(c.relname, ', ') into bad
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p', 'f')
     and has_table_privilege('authenticated', c.oid, 'DELETE')
     and c.relname not in ('customer_tags', 'job_tags', 'visit_assignees',
                           'estimate_options', 'estimate_line_items', 'estimate_line_costs');
  perform tst.ok(bad is null, 'authenticated deletes only where it is meant to (links, estimate draft lines): ' || coalesce(bad, ''));

  select string_agg(c.relname, ', ') into bad
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
     and (has_sequence_privilege('anon', c.oid, 'USAGE') or has_sequence_privilege('anon', c.oid, 'UPDATE'));
  perform tst.ok(bad is null, 'anon uses no sequences: ' || coalesce(bad, ''));

  select string_agg(p.proname, ', ') into bad
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.proname not in ('portal_estimate', 'portal_accept', 'portal_pay_simulated', 'uuid_generate_v7');
  perform tst.ok(bad is null, 'anon runs only the client-link functions in public: ' || coalesce(bad, ''));

  -- schemas public and app: no function runs for PUBLIC (a forgotten revoke), but the id helper of column defaults
  select string_agg(n.nspname || '.' || p.proname, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'app')
     and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
     and p.proname <> 'uuid_generate_v7';
  perform tst.ok(bad is null, 'no function in public / app runs for PUBLIC (revoke all … from public): ' || coalesce(bad, ''));

  select string_agg(p.proname, ', ') into bad
    from pg_proc p where p.pronamespace = 'app'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE');
  perform tst.ok(bad is null and not has_schema_privilege('anon', 'app', 'USAGE'), 'anon reaches nothing in schema app: ' || coalesce(bad, ''));

  select string_agg(p.proname, ', ') into bad
    from pg_proc p where p.pronamespace = 'app'::regnamespace and p.prorettype = 'trigger'::regtype
     and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  perform tst.ok(bad is null, 'authenticated cannot call trigger functions of app: ' || coalesce(bad, ''));

  -- what the app reads and writes on the six tables still works
  -- has_table_privilege with a list is true if ANY right is held: check each one
  select string_agg(t || ':' || p, ', ') into bad
    from unnest(array['catalog_items', 'company_secrets', 'company_licenses', 'company_contacts', 'notes']) t,
         unnest(array['SELECT', 'INSERT', 'UPDATE']) p
   where not has_table_privilege('authenticated', 'public.' || t, p);
  perform tst.ok(bad is null, 'the app keeps select / insert / update it uses: ' || coalesce(bad, ''));
  perform tst.ok(has_table_privilege('authenticated', 'public.notifications', 'SELECT')
             and has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE')
             and not has_column_privilege('authenticated', 'public.notifications', 'kind', 'UPDATE')
             and not has_table_privilege('authenticated', 'public.notifications', 'INSERT')
             and not has_table_privilege('authenticated', 'public.notifications', 'DELETE'),
             'notices: read, and only read_at changes');
end $$;
-- a table or function added later gets nothing by default
begin;
create table public.t52_probe (id int);
create function public.t52_probe_fn() returns int language sql as 'select 1';
do $$ begin
  perform tst.ok(not has_table_privilege('anon', 'public.t52_probe', 'SELECT')
             and not has_table_privilege('authenticated', 'public.t52_probe', 'SELECT')
             and not has_table_privilege('authenticated', 'public.t52_probe', 'TRUNCATE'),
             'a new public table gets no rights for anon / authenticated without a grant');
  perform tst.ok(not has_function_privilege('anon', 'public.t52_probe_fn()', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.t52_probe_fn()', 'EXECUTE'),
             'a new public function runs for nobody until its migration grants it (global default, 20261106100000)');
end $$;
rollback;
\echo 'T52 API rights: anon and authenticated only what is granted ok'


-- ---------------------------------------------------------------- T53: the money of a sent invoice does not change directly (security audit 06.11, item 1)
:as_owner_a
insert into public.customers (id, company_id, display_name) values ('c5300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T53 Client');
:as_sales_a
-- as the app makes it (invoice.issue / visit.pay): inserted already sent, subtotal = total
insert into public.invoices (id, company_id, number, customer_id, kind, status, title, subtotal_cents, total_cents, sent_at) values
  ('15300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '', 'c5300000-0000-4000-8000-000000000001', 'standalone', 'sent', 'T53 sent', 10000, 10000, now());
select tst.fails($q$insert into public.invoices (company_id, number, customer_id, kind, status, subtotal_cents, total_cents) values ('ca000000-0000-0000-0000-000000000000', '', 'c5300000-0000-4000-8000-000000000001', 'standalone', 'sent', -100, -100)$q$, 'an invoice is not born with a negative total');
select tst.fails($q$insert into public.invoices (company_id, number, customer_id, kind, status, subtotal_cents, total_cents) values ('ca000000-0000-0000-0000-000000000000', '', 'c5300000-0000-4000-8000-000000000001', 'standalone', 'draft', -1, 0)$q$, 'an invoice is not born with a negative subtotal');
insert into public.payments (id, company_id, invoice_id, customer_id, method, amount_cents, status, idempotency_key) values
  ('15310000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '15300000-0000-4000-8000-000000000001', 'c5300000-0000-4000-8000-000000000001', 'cash', 4000, 'succeeded', 't53-pay-1');
select tst.ok((select paid_cents = 4000 and payment_status = 'partially_paid' from public.invoices where id = '15300000-0000-4000-8000-000000000001'), 'T53: a payment still lowers the balance');
select tst.fails($q$update public.invoices set total_cents = -100 where id = '15300000-0000-4000-8000-000000000001'$q$, 'sales do not set a negative total on a sent invoice');
select tst.fails($q$update public.invoices set total_cents = 3000, subtotal_cents = 3000 where id = '15300000-0000-4000-8000-000000000001'$q$, 'sales do not set the total below what is paid');
select tst.fails($q$update public.invoices set total_cents = 20000, subtotal_cents = 20000 where id = '15300000-0000-4000-8000-000000000001'$q$, 'the total of a sent invoice does not change at all');
do $$ begin
  update public.invoices set total_cents = 20000, subtotal_cents = 20000 where id = '15300000-0000-4000-8000-000000000001';
  raise exception 'FAILED: the total of a sent invoice changed';
exception when insufficient_privilege then null;   -- the freeze (42501), not some other error
end $$;
select tst.fails($q$update public.invoices set tax_cents = 500 where id = '15300000-0000-4000-8000-000000000001'$q$, 'the tax of a sent invoice does not change');
select tst.fails($q$update public.invoices set discount_cents = 500 where id = '15300000-0000-4000-8000-000000000001'$q$, 'the discount of a sent invoice does not change');
select tst.fails($q$update public.invoices set customer_id = (select id from public.customers where company_id = 'ca000000-0000-0000-0000-000000000000' and id <> 'c5300000-0000-4000-8000-000000000001' limit 1) where id = '15300000-0000-4000-8000-000000000001'$q$, 'a sent invoice does not move to another client');
select tst.fails($q$update public.invoices set kind = 'final' where id = '15300000-0000-4000-8000-000000000001'$q$, 'the kind of a sent invoice does not change');
select tst.fails($q$update public.invoices set sent_at = null where id = '15300000-0000-4000-8000-000000000001'$q$, 'the sent time of a sent invoice does not change');
-- the mark of the payment recalc cannot be set by the app's role
do $$ begin
  perform set_config('app.invoice_recalc', 'on', true);
  begin
    update public.invoices set total_cents = 4000, subtotal_cents = 4000 where id = '15300000-0000-4000-8000-000000000001';
    raise exception 'FAILED: the recalc mark opened the amounts for authenticated';
  exception when insufficient_privilege then null;
  end;
  perform set_config('app.invoice_recalc', '', true);
end $$;
-- what still changes on a sent invoice
update public.invoices set title = 'T53 renamed', due_date = current_date + 30, reminders_paused = true where id = '15300000-0000-4000-8000-000000000001';
select tst.ok((select title = 'T53 renamed' and reminders_paused from public.invoices where id = '15300000-0000-4000-8000-000000000001'), 'title, due date and reminders of a sent invoice still change');
update public.invoices set paid_cents = 10000, payment_status = 'paid' where id = '15300000-0000-4000-8000-000000000001';
select tst.ok((select paid_cents = 4000 and payment_status = 'partially_paid' from public.invoices where id = '15300000-0000-4000-8000-000000000001'), 'paid stays with the payments (direct change ignored)');
insert into public.payments (id, company_id, invoice_id, customer_id, method, amount_cents, status, idempotency_key) values
  ('15310000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', '15300000-0000-4000-8000-000000000001', 'c5300000-0000-4000-8000-000000000001', 'check', 6000, 'succeeded', 't53-pay-2');
select tst.ok((select paid_cents = 10000 and payment_status = 'paid' and total_cents = 10000 from public.invoices where id = '15300000-0000-4000-8000-000000000001'), 'the last payment closes the invoice (recalc passes the guard)');
-- a draft still changes, but not below what is paid; once sent it is frozen
insert into public.invoices (id, company_id, number, customer_id, kind, status, subtotal_cents, total_cents) values
  ('15300000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', '', 'c5300000-0000-4000-8000-000000000001', 'standalone', 'draft', 5000, 5000);
update public.invoices set subtotal_cents = 6000, total_cents = 6000 where id = '15300000-0000-4000-8000-000000000002';
select tst.ok((select total_cents = 6000 from public.invoices where id = '15300000-0000-4000-8000-000000000002'), 'a draft invoice still changes its amounts');
select tst.fails($q$update public.invoices set total_cents = -1 where id = '15300000-0000-4000-8000-000000000002'$q$, 'a draft does not go negative');
-- a paid draft: the total does not go below what is paid (check_violation, not the freeze)
insert into public.payments (id, company_id, invoice_id, customer_id, method, amount_cents, status, idempotency_key) values
  ('15310000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', '15300000-0000-4000-8000-000000000002', 'c5300000-0000-4000-8000-000000000001', 'cash', 3000, 'succeeded', 't53-pay-3');
do $$ begin
  update public.invoices set subtotal_cents = 1000, total_cents = 1000 where id = '15300000-0000-4000-8000-000000000002';
  raise exception 'FAILED: a draft went below what is paid';
exception when check_violation then null;
end $$;
update public.invoices set status = 'sent', sent_at = now() where id = '15300000-0000-4000-8000-000000000002';
select tst.fails($q$update public.invoices set subtotal_cents = 7000, total_cents = 7000 where id = '15300000-0000-4000-8000-000000000002'$q$, 'after sending, the draft amounts are frozen');
-- an old row whose total is already below what is paid (made before this guard): its due date still changes
:as_super
do $$ begin
  perform set_config('app.invoice_recalc', 'on', true);   -- as the server recalc: the only way to make such a row now
  update public.invoices set subtotal_cents = 1000, total_cents = 1000 where id = '15300000-0000-4000-8000-000000000002';
  perform set_config('app.invoice_recalc', '', true);
end $$;
:as_sales_a
update public.invoices set due_date = current_date + 7 where id = '15300000-0000-4000-8000-000000000002';
select tst.ok((select due_date = current_date + 7 and total_cents = 1000 and paid_cents = 3000 from public.invoices where id = '15300000-0000-4000-8000-000000000002'),
              'an old invoice with total below paid still takes a new due date');
-- void still works for the owner (no payments)
:as_owner_a
insert into public.invoices (id, company_id, number, customer_id, kind, status, subtotal_cents, total_cents, sent_at) values
  ('15300000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', '', 'c5300000-0000-4000-8000-000000000001', 'standalone', 'sent', 2500, 2500, now());
update public.invoices set status = 'void', void_reason = 'T53 wrong amount' where id = '15300000-0000-4000-8000-000000000003';
select tst.ok((select status = 'void' from public.invoices where id = '15300000-0000-4000-8000-000000000003'), 'the owner voids a sent invoice to reissue it');
\echo 'T53 money of a sent invoice is frozen, payments and void still work ok'


-- ---------------------------------------------------------------- T54: the simulated card payment only for a demo company (security audit 06.11, item 2)
:as_super
insert into public.invoices (id, company_id, number, customer_id, job_id, kind, status, title, subtotal_cents, total_cents, sent_at)
select x.id::uuid, j.company_id, '', j.customer_id, j.id, 'progress', 'sent', 'T54 progress', 5400, 5400, now()
  from public.jobs j join public.estimates e on e.id = j.estimate_id,
       (values ('15400000-0000-4000-8000-000000000001'), ('15400000-0000-4000-8000-000000000002')) x(id)
 where e.public_token = 'tok_inv_0123456789abcdef';
reset role; reset request.jwt.claim.sub; set role anon;
do $$
declare r jsonb;
begin
  r := public.portal_estimate('tok_inv_0123456789abcdef');
  perform tst.ok((r ->> 'simulated_pay')::boolean, 'a demo company: the page shows the card button');
  perform tst.ok(r ? 'doc_language', 'the page keeps the client language (T19)');
  perform tst.fails_like($q$select * from app.company_flags$q$, 'permission denied%', 'anon does not read the demo flags');
  r := public.portal_pay_simulated('tok_inv_0123456789abcdef', '15400000-0000-4000-8000-000000000002');
  perform tst.ok((select (x ->> 'paid')::bigint from jsonb_array_elements(r -> 'invoices') x where x ->> 'id' = '15400000-0000-4000-8000-000000000002') = 5400,
                 'a demo company: the client pays by the simulated card');
end $$;
-- the company cannot switch the simulation on for itself
:as_owner_a
select tst.fails_like($q$select * from app.company_flags$q$, 'permission denied%', 'the owner does not read the demo flags');
select tst.fails_like($q$insert into app.company_flags (company_id, simulated_payments) values ('ca000000-0000-0000-0000-000000000000', true)$q$, 'permission denied%', 'the owner does not switch the demo on');
select tst.fails_like($q$select app.company_simulates_payments('ca000000-0000-0000-0000-000000000000')$q$, 'permission denied%', 'the flag function is not callable from the app');
-- a revoked link takes no payment, even in a demo company
:as_super
do $$ declare v uuid := (select id from public.estimates where public_token = 'tok_inv_0123456789abcdef'); begin
  perform set_config('app.signing_estimate', v::text, true);   -- as revoke_estimate_link does
  update public.estimates set link_revoked_at = now() where id = v;
  perform set_config('app.signing_estimate', '', true);
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
select tst.fails_like($q$select public.portal_pay_simulated('tok_inv_0123456789abcdef', '15400000-0000-4000-8000-000000000001')$q$, 'this link is closed', 'a revoked link takes no simulated payment');
-- switched off again: no payment either
:as_super
do $$ declare v uuid := (select id from public.estimates where public_token = 'tok_inv_0123456789abcdef'); begin
  perform set_config('app.signing_estimate', v::text, true);   -- as revoke_estimate_link does
  update public.estimates set link_revoked_at = null where id = v;
  perform set_config('app.signing_estimate', '', true);
end $$;
update app.company_flags set simulated_payments = false where company_id = 'ca000000-0000-0000-0000-000000000000';
reset role; reset request.jwt.claim.sub; set role anon;
select tst.fails_like($q$select public.portal_pay_simulated('tok_inv_0123456789abcdef', '15400000-0000-4000-8000-000000000001')$q$, 'card payments are not available yet', 'the demo switched off takes no payment');
:as_super
select tst.ok((select paid_cents = 0 from public.invoices where id = '15400000-0000-4000-8000-000000000001'), 'T54: nothing was paid by the refused calls');
\echo 'T54 simulated card payment only for a demo company ok'


-- ---------------------------------------------------------------- T55: storage files by the files rule; app functions not for PUBLIC (security audit 06.11, items 3, 12)
:as_owner_a
insert into public.customers (id, company_id, display_name) values ('c5500000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T55 Client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city, address_state) values
  ('d5500000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c5500000-0000-4000-8000-000000000001', '55 Oak St', 'Austin', 'TX');
insert into public.files (id, company_id, kind) values ('f5500000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'document');
:as_tech_a
insert into public.files (id, company_id, kind) values ('f5500000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'photo');
:as_super
insert into storage.objects (bucket_id, name) values
  ('files', 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000001.pdf'),
  ('files', 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000002.jpg');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from storage.objects where name like 'ca000000-0000-0000-0000-000000000000/%'$q$) = 1, 'a tech lists only the files he sees (his own photo), not the office document');
select tst.ok(tst.cnt($q$select 1 from storage.objects where name = 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000002.jpg'$q$) = 1, 'a tech reads his own photo');
-- pointing storage_key of his own row at the office document opens nothing (the object name decides)
update public.files set storage_key = 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000001.pdf' where id = 'f5500000-0000-4000-8000-000000000002';
select tst.ok(tst.cnt($q$select 1 from storage.objects where name = 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000001.pdf'$q$) = 0, 'storage_key does not open someone else''s object');
-- upload: the app inserts the row, then the object; a repeat upload (upsert) updates it
insert into public.files (id, company_id, kind) values ('f5500000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'photo');
insert into storage.objects (bucket_id, name) values ('files', 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000003.jpg');
select tst.ok(tst.cnt($q$select 1 from storage.objects where name = 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000003.jpg'$q$) = 1, 'a tech uploads a photo of his row before storage_key is written');
-- as Supabase Storage does it for upsert: true
insert into storage.objects (bucket_id, name) values ('files', 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000003.jpg')
  on conflict (bucket_id, name) do update set updated_at = now() returning id \gset t55_
select tst.ok((select updated_at is not null from storage.objects where id = :'t55_id'), 'a repeat upload of his own photo (upsert) updates the object');
select tst.fails($q$insert into storage.objects (bucket_id, name) values ('files', 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000003.html')$q$, 'one files row takes no object of another kind (.html)');
select tst.fails($q$insert into storage.objects (bucket_id, name) values ('files', 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000003')$q$, 'an object without an extension is refused');
select tst.fails($q$insert into storage.objects (bucket_id, name) values ('files', 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000003.png')$q$, 'one files row takes no second object (.png)');
select tst.fails($q$insert into storage.objects (bucket_id, name) values ('files', 'CA000000-0000-0000-0000-000000000000/F5500000-0000-4000-8000-000000000003.jpg')$q$, 'an upper-case name is refused (one row, one object)');
select tst.fails($q$insert into storage.objects (bucket_id, name) values ('files', 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000003.JPG')$q$, 'an upper-case extension is refused');
-- once the upload is recorded, the author does not replace the photo (before / after is evidence)
update public.files set storage_key = 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000003.jpg', upload_status = 'uploaded'
 where id = 'f5500000-0000-4000-8000-000000000003';
select tst.fails($q$insert into storage.objects (bucket_id, name) values ('files', 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000003.jpg') on conflict (bucket_id, name) do update set updated_at = now()$q$, 'the author does not re-upload over a recorded photo');
select tst.blocked($q$update storage.objects set name = 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000003.jpg' where name = 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000003.jpg'$q$, 'the author does not update a recorded photo');
select tst.ok(tst.cnt($q$select 1 from storage.objects where name = 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000003.jpg'$q$) = 1, 'the author still reads his recorded photo');
select tst.fails($q$insert into storage.objects (bucket_id, name) values ('files', 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000001.pdf')$q$, 'a tech does not write the office document');
select tst.fails($q$insert into storage.objects (bucket_id, name) values ('files', 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-0000000000aa.jpg')$q$, 'a tech does not write an object without his files row');
select tst.blocked($q$update storage.objects set bucket_id = 'files' where name = 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-000000000001.pdf'$q$, 'a tech does not overwrite the office document');
select tst.fails($q$insert into storage.objects (bucket_id, name) values ('files', 'ca000000-0000-0000-0000-000000000000/x/../f5500000-0000-4000-8000-000000000003.jpg')$q$, 'an odd path is refused');
:as_owner_a
select tst.ok(tst.cnt($q$select 1 from storage.objects where name like 'ca000000-0000-0000-0000-000000000000/f55%'$q$) = 3, 'the office sees every file of the company');
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from storage.objects where name like 'ca000000-0000-0000-0000-000000000000/%'$q$) = 0, 'another company sees none of our files');
select tst.fails($q$insert into storage.objects (bucket_id, name) values ('files', 'ca000000-0000-0000-0000-000000000000/f5500000-0000-4000-8000-0000000000bb.jpg')$q$, 'another company does not write into ours');
-- 12: leads and contacts still work for the app's role after PUBLIC lost EXECUTE on app functions
:as_owner_a
select tst.ok(tst.cnt($q$select 1 from public.leads$q$) > 0 and tst.cnt($q$select 1 from public.contacts$q$) > 0, 'leads and contacts still read (can_see_lead / can_see_contact for authenticated)');
\echo 'T55 storage files by the files rule, app functions not for PUBLIC ok'

-- ---------------------------------------------------------------- T48: wave 7-2 — «Команда и приглашение» (S21; docs/specs/19 §2 п.3–4)
-- An invitation by email before the person has an account; the invited person sees nothing until accepting; a wrong email,
-- a cancelled or expired link does not let in; a disabled person sees nothing again; only owner/admin invite and disable.
:as_super
insert into auth.users (id, email, raw_user_meta_data) values
  ('a4800000-0000-4000-8000-000000000001', 'new48@a.test',   '{"full_name":"Nora New"}'),
  ('a4800000-0000-4000-8000-000000000002', 'other48@a.test', '{"full_name":"Oscar Other"}');
select tst.agree('a4800000-0000-4000-8000-000000000001'), tst.agree('a4800000-0000-4000-8000-000000000002');  -- 7а-1
\set as_new48   'reset role; set request.jwt.claim.sub = ''a4800000-0000-4000-8000-000000000001''; set role authenticated;'
\set as_other48 'reset role; set request.jwt.claim.sub = ''a4800000-0000-4000-8000-000000000002''; set role authenticated;'
select tst.ok((select status from public.memberships where status not in ('invited', 'active', 'disabled', 'deleted') limit 1) is null, 'membership statuses: invited / active / disabled / deleted');
-- who may invite
:as_sales_a
select tst.fails($q$select public.invite_member('ca000000-0000-0000-0000-000000000000', 'x48@a.test', 'tech')$q$, 'sales do not invite');
:as_tech_a
select tst.fails($q$select public.invite_member('ca000000-0000-0000-0000-000000000000', 'x48@a.test', 'tech')$q$, 'the tech does not invite');
:as_owner_b
select tst.fails($q$select public.invite_member('ca000000-0000-0000-0000-000000000000', 'x48@a.test', 'tech')$q$, 'another company does not invite into ours');
:as_owner_a
select tst.fails($q$select public.invite_member('ca000000-0000-0000-0000-000000000000', 'x48@a.test', 'owner')$q$, 'nobody is invited as owner');
select tst.fails($q$select public.invite_member('ca000000-0000-0000-0000-000000000000', 'not-an-email', 'tech')$q$, 'not an email');
select tst.fails($q$select public.invite_member('ca000000-0000-0000-0000-000000000000', 'office@a.test', 'tech')$q$, 'already on the team');
select public.invite_member('ca000000-0000-0000-0000-000000000000', '  New48@A.test ', 'tech', 'Nora New') ->> 'token' as t48_token \gset
select tst.ok((select count(*) from public.invitations where email = 'new48@a.test' and status = 'pending' and role = 'tech') = 1, 'the invitation is pending, email normalised');
:as_super
select tst.ok((select count(*) from public.invitations where token_hash = :'t48_token') = 0, 'the link token itself is not stored');
-- the invited person sees nothing of the company, not even the invitation
:as_new48
select tst.ok((select count(*) from public.companies where id = 'ca000000-0000-0000-0000-000000000000') = 0, 'invited: no company before accepting');
select tst.ok((select count(*) from public.customers) = 0, 'invited: no clients before accepting');
select tst.ok((select count(*) from public.invitations) = 0, 'invited: the invitations list is the owner''s');
select tst.blocked($q$update public.invitations set status = 'accepted'$q$, 'nobody writes invitations directly');
-- the link opened by another account does not let in
:as_other48
select tst.fails(format('select public.accept_invitation(%L)', :'t48_token'), 'another email cannot accept');
select tst.ok((select count(*) from public.memberships where user_id = 'a4800000-0000-4000-8000-000000000002') = 0, 'and is not on the team');
reset role; set role anon;
select tst.fails(format('select public.accept_invitation(%L)', :'t48_token'), 'anon cannot accept');
-- the profile email is not a way in: it cannot be changed, and accept reads the sign-in email
:as_other48
select tst.fails($q$update public.users set email = 'new48@a.test' where id = 'a4800000-0000-4000-8000-000000000002'$q$, 'nobody changes their own email in public.users');
select tst.ok((select count(*) from public.users where id = 'a4800000-0000-4000-8000-000000000002' and full_name = 'Oscar Other') = 1, 'own profile still readable');
update public.users set full_name = 'Oscar O.' where id = 'a4800000-0000-4000-8000-000000000002';
select tst.ok((select full_name from public.users where id = 'a4800000-0000-4000-8000-000000000002') = 'Oscar O.', 'own name still editable');
-- a wrong token, then the right one
:as_new48
select tst.fails($q$select public.accept_invitation('0000000000000000000000000000000000000000')$q$, 'a wrong link');
select tst.ok((public.accept_invitation(:'t48_token') ->> 'role') = 'tech', 'the invited person joins with the invited role');
select tst.ok((select status from public.memberships where user_id = 'a4800000-0000-4000-8000-000000000001' and company_id = 'ca000000-0000-0000-0000-000000000000') = 'active', 'active member now');
select tst.ok((select count(*) from public.companies where id = 'ca000000-0000-0000-0000-000000000000') = 1, 'sees the company after accepting');
select tst.ok((public.accept_invitation(:'t48_token') ->> 'repeat')::boolean, 'opening the link again changes nothing');
select tst.blocked($q$update public.memberships set role = 'admin' where user_id = 'a4800000-0000-4000-8000-000000000001'$q$, 'still cannot raise one''s own role');
:as_owner_a
select tst.ok((select status from public.invitations where email = 'new48@a.test') = 'accepted', 'the invitation is accepted');
-- cancel: the link stops working
select public.invite_member('ca000000-0000-0000-0000-000000000000', 'other48@a.test', 'sales') ->> 'id' as t48_inv2 \gset
select public.resend_invitation(:'t48_inv2') ->> 'token' as t48_token2 \gset
select public.revoke_invitation(:'t48_inv2');
:as_other48
select tst.fails(format('select public.accept_invitation(%L)', :'t48_token2'), 'a cancelled invitation does not let in');
-- expired: does not let in; «Отправить ещё раз» gives a new link
:as_owner_a
select public.invite_member('ca000000-0000-0000-0000-000000000000', 'other48@a.test', 'sales') ->> 'id' as t48_inv3 \gset
select public.resend_invitation(:'t48_inv3') ->> 'token' as t48_old \gset
:as_super
update public.invitations set expires_at = now() - interval '1 minute' where id = :'t48_inv3';
:as_other48
select tst.fails(format('select public.accept_invitation(%L)', :'t48_old'), 'an expired invitation does not let in');
:as_owner_a
select tst.ok((select status = 'pending' and expires_at < now() from public.invitations where id = :'t48_inv3'), 'the list sees it expired by its date');
select public.resend_invitation(:'t48_inv3') ->> 'token' as t48_new \gset
:as_other48
select tst.fails(format('select public.accept_invitation(%L)', :'t48_old'), 'the old link is dead after «send again»');
select tst.ok((public.accept_invitation(:'t48_new') ->> 'role') = 'sales', 'the new link lets in');
-- disable: the person sees nothing again; their records stay; bring back
:as_sales_a
select tst.fails($q$select public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a4800000-0000-4000-8000-000000000001', 'disabled')$q$, 'sales do not disable');
:as_owner_a
select tst.fails($q$select public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'disabled')$q$, 'not yourself');
select tst.fails($q$select public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a4800000-0000-4000-8000-000000000001', 'deleted')$q$, '«deleted» is not set here (S22)');
select public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a4800000-0000-4000-8000-000000000001', 'disabled');
:as_new48
select tst.ok((select count(*) from public.companies where id = 'ca000000-0000-0000-0000-000000000000') = 0, 'disabled: no company');
select tst.ok((select count(*) from public.customers) = 0, 'disabled: no clients');
:as_owner_a
select tst.ok((select status = 'disabled' and suspended_at is not null from public.memberships where user_id = 'a4800000-0000-4000-8000-000000000001'), 'disabled with its time, the row stays');
select public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a4800000-0000-4000-8000-000000000001', 'active');
:as_new48
select tst.ok((select count(*) from public.companies where id = 'ca000000-0000-0000-0000-000000000000') = 1, 'brought back: sees the company again');
:as_super
-- already on the team: a second invitation is not a way to change one's role; a switched-off person's old link does not bring them back
:as_super
insert into auth.users (id, email, raw_user_meta_data) values ('a4800000-0000-4000-8000-000000000003', 'late48@a.test', '{"full_name":"Lee Late"}');
select tst.agree('a4800000-0000-4000-8000-000000000003');  -- 7а-1
\set as_late48 'reset role; set request.jwt.claim.sub = ''a4800000-0000-4000-8000-000000000003''; set role authenticated;'
:as_owner_a
select public.invite_member('ca000000-0000-0000-0000-000000000000', 'late48@a.test', 'office') ->> 'token' as t48_late \gset
:as_super
insert into public.memberships (company_id, user_id, role, status) values ('ca000000-0000-0000-0000-000000000000', 'a4800000-0000-4000-8000-000000000003', 'tech', 'active');
:as_late48
select tst.fails(format('select public.accept_invitation(%L)', :'t48_late'), 'an active member cannot re-role through an old invitation');
:as_owner_a
select public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a4800000-0000-4000-8000-000000000003', 'disabled');
:as_late48
select tst.fails(format('select public.accept_invitation(%L)', :'t48_late'), 'a switched-off person does not come back by an old link');
:as_owner_a
select tst.ok((select role = 'tech' and status = 'disabled' from public.memberships where user_id = 'a4800000-0000-4000-8000-000000000003'), 'role and status unchanged');
-- the flag that lets accept_invitation through the guard does nothing for a client session
:as_new48
select set_config('app.accepting_invite', 'on', false);
select tst.blocked($q$update public.memberships set role = 'admin' where user_id = 'a4800000-0000-4000-8000-000000000001' and company_id = 'ca000000-0000-0000-0000-000000000000'$q$, 'the flag does not open the role guard');
select set_config('app.accepting_invite', '', false);
-- audit №13: no direct membership for any user_id, not even by the owner — only accept_invitation makes one
:as_owner_a
select tst.fails($q$insert into public.memberships (company_id, user_id, role, status) values ('ca000000-0000-0000-0000-000000000000', 'a4800000-0000-4000-8000-000000000002', 'admin', 'active')$q$, 'the owner does not add a person without their consent');
-- review #193: a direct update moves nothing — not the person, not the status, not a removed membership
:as_office_a
select tst.fails($q$update public.memberships set user_id = 'a4800000-0000-4000-8000-000000000002' where user_id = 'a4800000-0000-4000-8000-000000000003'$q$, 'an admin does not move a membership to another person');
select tst.fails($q$update public.memberships set status = 'active' where user_id = 'a4800000-0000-4000-8000-000000000003'$q$, 'an admin does not wake a switched-off person by a direct update');
select tst.fails($q$select public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'disabled')$q$, 'an admin does not switch off the owner');
select tst.fails($q$select public.invite_member('ca000000-0000-0000-0000-000000000000', 'sign48@a.test', 'tech', null, true)$q$, 'an admin does not give the right to sign by an invitation');
:as_owner_a
select tst.fails($q$update public.memberships set status = 'disabled' where user_id = 'a0000000-0000-0000-0000-000000000001'$q$, 'the owner does not switch themselves off directly');
select tst.fails($q$update public.memberships set deleted_at = null, status = 'active' where user_id = 'a3500000-0000-4000-8000-000000000001'$q$, 'a removed membership is not brought back directly');
select tst.ok((select count(*) from public.memberships where company_id = 'ca000000-0000-0000-0000-000000000000' and role = 'owner' and status = 'active') >= 1, 'the company still has an active owner');
-- a second owner switches the first off: allowed while one active owner stays; and back
:as_super
insert into auth.users (id, email, raw_user_meta_data) values ('a4800000-0000-4000-8000-000000000004', 'owner2@a.test', '{"full_name":"Olga Owner"}');
select tst.agree('a4800000-0000-4000-8000-000000000004');  -- 7а-1
insert into public.memberships (company_id, user_id, role, status) values ('ca000000-0000-0000-0000-000000000000', 'a4800000-0000-4000-8000-000000000004', 'owner', 'active');
reset role; set request.jwt.claim.sub = 'a4800000-0000-4000-8000-000000000004'; set role authenticated;
select public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'disabled');
select tst.ok((select count(*) from public.memberships where company_id = 'ca000000-0000-0000-0000-000000000000' and role = 'owner' and status = 'active') = 1, 'one active owner left');
select tst.fails($q$select public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a4800000-0000-4000-8000-000000000004', 'disabled')$q$, 'the last active owner is not switched off');
select public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'active');
:as_super
delete from public.memberships where user_id = 'a4800000-0000-4000-8000-000000000004';
-- a removed person is invited again and joins again
update public.memberships set status = 'deleted', deleted_at = now() where user_id = 'a4800000-0000-4000-8000-000000000002' and company_id = 'ca000000-0000-0000-0000-000000000000';
:as_owner_a
select public.invite_member('ca000000-0000-0000-0000-000000000000', 'other48@a.test', 'tech') ->> 'token' as t48_again \gset
:as_other48
select tst.ok((public.accept_invitation(:'t48_again') ->> 'role') = 'tech', 'a removed person joins again by a new invitation');
select tst.ok((select status = 'active' and deleted_at is null and role = 'tech' from public.memberships where user_id = 'a4800000-0000-4000-8000-000000000002'), 'active again, with the new role');
-- the sign-in email must be confirmed (Supabase keeps email_confirmed_at; the local stub adds it here)
:as_super
alter table auth.users add column if not exists email_confirmed_at timestamptz;
update auth.users set email_confirmed_at = now();
insert into auth.users (id, email, raw_user_meta_data) values ('a4800000-0000-4000-8000-000000000005', 'unconf48@a.test', '{"full_name":"Una Unconfirmed"}');
select tst.agree('a4800000-0000-4000-8000-000000000005');  -- 7а-1
:as_owner_a
select public.invite_member('ca000000-0000-0000-0000-000000000000', 'unconf48@a.test', 'tech') ->> 'token' as t48_unconf \gset
reset role; set request.jwt.claim.sub = 'a4800000-0000-4000-8000-000000000005'; set role authenticated;
select tst.fails(format('select public.accept_invitation(%L)', :'t48_unconf'), 'an unconfirmed email does not accept');
:as_super
update auth.users set email_confirmed_at = now() where id = 'a4800000-0000-4000-8000-000000000005';
reset role; set request.jwt.claim.sub = 'a4800000-0000-4000-8000-000000000005'; set role authenticated;
select tst.ok((public.accept_invitation(:'t48_unconf') ->> 'role') = 'tech', 'confirmed — accepts');
:as_super
alter table auth.users drop column email_confirmed_at;
-- an invitation dies with its inviter's right: an admin moved down — the admin-made link does not let in
:as_office_a
select public.invite_member('ca000000-0000-0000-0000-000000000000', 'down48@a.test', 'admin') ->> 'token' as t48_down \gset
:as_super
insert into auth.users (id, email, raw_user_meta_data) values ('a4800000-0000-4000-8000-000000000006', 'down48@a.test', '{"full_name":"Dan Down"}');
select tst.agree('a4800000-0000-4000-8000-000000000006');  -- 7а-1
update public.memberships set role = 'office' where user_id = 'a0000000-0000-0000-0000-000000000002' and company_id = 'ca000000-0000-0000-0000-000000000000';
reset role; set request.jwt.claim.sub = 'a4800000-0000-4000-8000-000000000006'; set role authenticated;
select tst.fails(format('select public.accept_invitation(%L)', :'t48_down'), 'the inviter is no longer an admin: the link is dead');
:as_super
update public.memberships set role = 'admin' where user_id = 'a0000000-0000-0000-0000-000000000002' and company_id = 'ca000000-0000-0000-0000-000000000000';
:as_owner_a
select tst.fails($q$update public.memberships set role = 'office' where user_id = 'a0000000-0000-0000-0000-000000000002'$q$, 'no direct role change (two owners could demote each other)');
-- LEG-19: location sharing — only the person themselves
:as_owner_a
select tst.fails($q$update public.memberships set share_location = true where user_id = 'a0000000-0000-0000-0000-000000000003'$q$, 'the owner does not switch on a tech''s location');
:as_tech_a
-- 7б-2 (210000): set_share_location no longer switches on (it did, without the notice); the tech switches on with the notice
select tst.fails($q$select public.set_share_location('ca000000-0000-0000-0000-000000000000', true)$q$, 'the old function does not switch on without the notice');
:as_super
insert into app.company_flags (company_id, location_sharing) values ('ca000000-0000-0000-0000-000000000000', true) on conflict (company_id) do update set location_sharing = true;
:as_tech_a
select public.set_location_consent('ca000000-0000-0000-0000-000000000000', true);
select tst.ok((select share_location from public.memberships where user_id = 'a0000000-0000-0000-0000-000000000003' and company_id = 'ca000000-0000-0000-0000-000000000000'), 'the tech switches it on for themselves');
:as_owner_a
select tst.ok((select share_location from public.memberships where user_id = 'a0000000-0000-0000-0000-000000000001' and company_id = 'ca000000-0000-0000-0000-000000000000') = false, 'nobody else''s row changed');
:as_tech_a
select public.set_share_location('ca000000-0000-0000-0000-000000000000', false);
:as_super
select tst.ok((select share_location from public.memberships where user_id = 'a0000000-0000-0000-0000-000000000003' and company_id = 'ca000000-0000-0000-0000-000000000000') = false, 'and off again');
-- an admin switched off: the invitations they sent stop working
:as_office_a
select public.invite_member('ca000000-0000-0000-0000-000000000000', 'z48@a.test', 'tech') ->> 'id' as t48_byadmin \gset
:as_owner_a
select public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'disabled');
select tst.ok((select status from public.invitations where id = :'t48_byadmin') = 'revoked', 'a switched-off admin''s invitations are revoked');
select public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002', 'active');
:as_super
:as_super
update app.company_flags set location_sharing = false where company_id = 'ca000000-0000-0000-0000-000000000000';
\echo 'T48 wave 7-2: invitations and team (S21) ok'

-- ---------------------------------------------------------------- T49: wave 7а-1 — согласие с Условиями и Политикой (clickwrap; docs/specs/19 §5)
-- Without the current Terms and Privacy accepted: no company, no joining a team. The server sets who and when and checks
-- the edition; the journal is appended to only; a person sees only their own rows; anon calls nothing.
:as_super
insert into auth.users (id, email, raw_user_meta_data) values
  ('a4900000-0000-4000-8000-000000000001', 'new49@a.test',  '{"full_name":"Nina Fortynine"}'),
  ('a4900000-0000-4000-8000-000000000002', 'gone49@a.test', '{"full_name":"Gus Gone"}');
\set as_new49  'reset role; set request.jwt.claim.sub = ''a4900000-0000-4000-8000-000000000001''; set role authenticated;'
\set as_gone49 'reset role; set request.jwt.claim.sub = ''a4900000-0000-4000-8000-000000000002''; set role authenticated;'
\set v49 '{"terms":"2026-11-06","privacy":"2026-11-06"}'
:as_owner_a
select public.invite_member('ca000000-0000-0000-0000-000000000000', 'new49@a.test', 'tech') ->> 'token' as t49_token \gset
-- before agreeing
:as_new49
select tst.ok(not (public.legal_status() ->> 'ok')::boolean, 'status: not accepted yet');
select tst.ok(not (public.legal_status() -> 'terms' ->> 'ever')::boolean, 'status: first time (the gate says «accept», not «changed»)');
select tst.ok((public.legal_status() -> 'terms' ->> 'current') = '2026-11-06', 'status: the current edition');
select tst.fails_like($q$insert into public.companies (name) values ('No Consent Co')$q$, '%legal not accepted%', 'no company without the consent');
select tst.fails_like(format('select public.accept_invitation(%L)', :'t49_token'), '%legal not accepted%', 'no joining a team without the consent');
:as_super
select tst.ok((select status from public.invitations where email = 'new49@a.test') = 'pending', 'the refused link is not burnt: still pending');
select tst.ok((select count(*) from public.companies where name = 'No Consent Co') = 0, 'and no company appeared');
-- the editions the app showed are checked strictly
:as_new49
select tst.fails_like($q$select public.accept_legal('{"terms":"2026-11-06"}', 'web', '1.0.0')$q$, '%terms and privacy%', 'both documents at once');
select tst.fails_like($q$select public.accept_legal('{"terms":"2026-11-06","privacy":"2026-11-06","dpa":"2026-11-06"}', 'web', '1.0.0')$q$, '%terms and privacy%', 'no DPA without a company (and no other key)');
select tst.fails_like($q$select public.accept_legal('{"terms":"2026-01-01","privacy":"2026-11-06"}', 'web', '1.0.0')$q$, '%legal version outdated%', 'an old edition is refused');
select tst.fails_like($q$select public.accept_legal('{"terms":20261106,"privacy":"2026-11-06"}', 'web', '1.0.0')$q$, '%legal version outdated%', 'the edition is a string');
select tst.fails_like($q$select public.accept_legal('[1,2]', 'web', '1.0.0')$q$, '%terms and privacy%', 'an object only');
select tst.fails_like($q$select public.accept_legal('{"terms":"2026-11-06","privacy":"2026-11-06"}', 'symbian', '1.0.0')$q$, '%unknown platform%', 'a known platform only');
select tst.fails_like($q$select public.accept_legal('{"terms":"2026-11-06","privacy":"2026-11-06"}', 'web', E'1.0\n<script>')$q$, '%bad app version%', 'the app version: no control characters');
select tst.blocked($q$insert into public.legal_acceptance (user_id, doc, version, platform, app_version) values ('a4900000-0000-4000-8000-000000000001', 'terms', '2026-11-06', 'web', 'x')$q$, 'nobody writes the journal directly');
select tst.ok(tst.cnt('select 1 from public.legal_acceptance') = 0, 'nothing written by the refused calls');
-- an anonymous sign-in agrees to nothing
set request.jwt.claims = '{"is_anonymous": true}';
select tst.fails_like(format('select public.accept_legal(%L, %L, %L)', :'v49', 'web', '1.0.0'), '%sign in first%', 'an anonymous sign-in does not agree');
reset request.jwt.claims;
-- a date that does not exist is the same refusal (not a raw 22008)
select tst.fails_like($q$select public.accept_legal('{"terms":"2026-02-30","privacy":"2026-11-06"}', 'web', '1.0.0')$q$, '%legal version outdated%', 'a date that does not exist');
-- agree: without cf-connecting-ip there is no IP (X-Forwarded-For is only kept raw — who wrote which entry is unknown)
set request.headers = '{"x-forwarded-for": "6.6.6.6, 203.0.113.7"}';
select tst.ok((public.accept_legal(:'v49', 'ios', '1.0.0+219') ->> 'ok')::boolean, 'agreed: status ok');
reset request.headers;
select tst.ok(tst.cnt($q$select 1 from public.legal_acceptance where doc in ('terms', 'privacy') and version = '2026-11-06'$q$) = 2, 'two rows: Terms and Privacy');
select tst.ok((select every(user_id = 'a4900000-0000-4000-8000-000000000001' and company_id is null and platform = 'ios' and app_version = '1.0.0+219'
                and accepted_at > now() - interval '1 minute') from public.legal_acceptance), 'who, platform, version — by the server and the call');
select tst.ok((select every(ip is null and ip_raw = 'xff=6.6.6.6, 203.0.113.7') from public.legal_acceptance), 'X-Forwarded-For alone: no IP, the raw header kept');
select min(accepted_at)::text as t49_at from public.legal_acceptance \gset
-- again (a double tap, a retry): no new rows, the time stays
select public.accept_legal(:'v49', 'web', '1.0.1') is not null as t49_again \gset
select tst.ok(tst.cnt('select 1 from public.legal_acceptance') = 2, 'again: still two rows');
select tst.ok((select min(accepted_at)::text from public.legal_acceptance) = :'t49_at', 'again: the first time stays');
-- the journal cannot be edited or wiped
select tst.blocked($q$update public.legal_acceptance set version = '2027-01-01'$q$, 'no edits to the journal');
select tst.blocked($q$delete from public.legal_acceptance$q$, 'no deletes from the journal');
-- now the company and the team
select tst.ok((select app.has_current_legal()), 'has_current_legal for the policy');
insert into public.companies (id, name) values ('c4900000-0000-4000-8000-000000000001', 'Consent Co');
select tst.ok(tst.cnt($q$select 1 from public.memberships where company_id = 'c4900000-0000-4000-8000-000000000001' and role = 'owner' and status = 'active'$q$) = 1, 'agreed: the company is created, the creator is its owner');
select tst.ok((public.accept_invitation(:'t49_token') ->> 'role') = 'tech', 'agreed: the same link now lets in');
-- an anonymous sign-in with consent rows still creates nothing and joins nothing
select public.invite_member('c4900000-0000-4000-8000-000000000001', 'gone49@a.test', 'tech') ->> 'token' as t49_anon \gset
set request.jwt.claims = '{"is_anonymous": true}';
select tst.ok(not (select app.has_current_legal()), 'anonymous: no consent even with rows');
select tst.fails_like($q$insert into public.companies (name) values ('Anon Co')$q$, '%legal not accepted%', 'anonymous: no company');
select tst.fails_like(format('select public.accept_invitation(%L)', :'t49_anon'), '%legal not accepted%', 'anonymous: no joining');
reset request.jwt.claims;
-- other people's rows are not seen
:as_owner_a
select tst.ok(tst.cnt($q$select 1 from public.legal_acceptance where user_id = 'a4900000-0000-4000-8000-000000000001'$q$) = 0, 'the owner of the team does not see the person''s consent rows');
select tst.ok(tst.cnt('select 1 from public.legal_acceptance') = 2, 'only their own two');
-- a superuser cannot edit the journal either (only the erasure of the person removes it)
:as_super
select tst.fails_like($q$update public.legal_acceptance set ip = null$q$, '%append-only%', 'even the server does not edit the journal');
select tst.fails_like($q$delete from public.legal_acceptance$q$, '%append-only%', 'nor deletes from it directly');
-- a new edition: the person has to accept again (simulated inside a transaction, rolled back)
begin;
create or replace function app.legal_current_version(p_doc text)
returns date language sql stable set search_path = '' as $f$
  select case p_doc when 'terms' then date '2026-12-01' when 'privacy' then date '2026-11-06' end;
$f$;
set local request.jwt.claim.sub = 'a4900000-0000-4000-8000-000000000001';
set local role authenticated;
select tst.ok(not (public.legal_status() ->> 'ok')::boolean and (public.legal_status() -> 'terms' ->> 'ever')::boolean, 'a new edition: not ok, but accepted before (the gate says «changed»)');
select tst.fails_like($q$insert into public.companies (name) values ('Old Edition Co')$q$, '%legal not accepted%', 'a new edition: no new company until accepted again');
select tst.fails_like(format('select public.accept_legal(%L, %L, %L)', :'v49', 'web', '1.0.0'), '%legal version outdated%', 'an old app with the old text is refused');
select tst.ok((public.accept_legal('{"terms":"2026-12-01","privacy":"2026-11-06"}', 'web', '1.0.0') ->> 'ok')::boolean, 'the new edition accepted');
rollback;
-- erasing a person takes their consent rows with them (S22, App Store 5.1.1(v)); a direct delete still does not.
-- On the way: Cloudflare's address wins over X-Forwarded-For; a broken header never blocks the consent.
:as_gone49
set request.headers = '{"cf-connecting-ip": "198.51.100.9", "x-forwarded-for": "6.6.6.6, 203.0.113.7"}';
select public.accept_legal(:'v49', 'android', '1.0.0') is not null as t49_gone \gset
reset request.headers;
select tst.ok((select every(ip = '198.51.100.9'::inet and ip_raw = 'cf=198.51.100.9 | xff=6.6.6.6, 203.0.113.7') from public.legal_acceptance), 'the IP is cf-connecting-ip; both headers kept raw');
:as_super
insert into auth.users (id, email, raw_user_meta_data) values ('a4900000-0000-4000-8000-000000000003', 'bad49@a.test', '{"full_name":"Bea Badheader"}');
reset role; set request.jwt.claim.sub = 'a4900000-0000-4000-8000-000000000003'; set role authenticated;
set request.headers = '{"cf-connecting-ip": "garbage", "x-forwarded-for": "1.2.3.4:5"}';
select tst.ok((public.accept_legal(:'v49', 'web', '1.0.0') ->> 'ok')::boolean, 'a broken cf-connecting-ip does not block the consent');
reset request.headers;
select tst.ok((select every(ip is null and ip_raw = 'cf=garbage | xff=1.2.3.4:5') from public.legal_acceptance), 'no IP then, the raw headers kept');
:as_super
insert into auth.users (id, email, raw_user_meta_data) values ('a4900000-0000-4000-8000-000000000004', 'long49@a.test', '{"full_name":"Lou Longheader"}');
reset role; set request.jwt.claim.sub = 'a4900000-0000-4000-8000-000000000004'; set role authenticated;
select set_config('request.headers', jsonb_build_object('cf-connecting-ip', '192.0.2.5/0', 'x-forwarded-for', repeat('9.9.9.9, ', 40))::text, false) is not null as t49_long \gset
select tst.ok((public.accept_legal(:'v49', 'web', '1.0.0') ->> 'ok')::boolean, 'a 300-character header does not block the consent');
reset request.headers;
select tst.ok((select every(length(ip_raw) = 200 and ip = '192.0.2.5'::inet and masklen(ip) = 32) from public.legal_acceptance), 'the raw header is cut to 200; the IP has no mask');
:as_gone49
:as_super
select tst.ok((select count(*) from public.legal_acceptance where user_id = 'a4900000-0000-4000-8000-000000000002') = 2, 'the second person agreed');
delete from auth.users where id = 'a4900000-0000-4000-8000-000000000002';
select tst.ok((select count(*) from public.legal_acceptance where user_id = 'a4900000-0000-4000-8000-000000000002') = 0, 'erased with the person');
-- rights (rule 18, T52): anon calls nothing; the helpers are for the server only
select tst.ok(not has_function_privilege('anon', 'public.accept_legal(jsonb,text,text)', 'EXECUTE'), 'anon: no accept_legal');
select tst.ok(not has_function_privilege('anon', 'public.legal_status()', 'EXECUTE'), 'anon: no legal_status');
select tst.ok(not has_function_privilege('anon', 'app.has_current_legal()', 'EXECUTE'), 'anon: no has_current_legal');
select tst.ok(has_function_privilege('authenticated', 'app.has_current_legal()', 'EXECUTE'), 'authenticated: has_current_legal (the companies policy calls it)');
select tst.ok(not has_function_privilege('authenticated', 'app.legal_current_version(text)', 'EXECUTE'), 'the editions function is internal');
select tst.ok(not has_function_privilege('authenticated', 'app.tg_company_needs_legal()', 'EXECUTE'), 'trigger functions are internal');
select tst.ok(not has_function_privilege('authenticated', 'app.tg_legal_acceptance_guard()', 'EXECUTE'), 'trigger functions are internal (journal)');
select tst.ok(not has_table_privilege('anon', 'public.legal_acceptance', 'SELECT'), 'anon: no journal');
select tst.ok(not has_table_privilege('authenticated', 'public.legal_acceptance', 'INSERT'), 'authenticated: no direct insert');
select tst.ok(not has_table_privilege('authenticated', 'public.legal_acceptance', 'UPDATE'), 'authenticated: no update');
select tst.ok(not has_table_privilege('authenticated', 'public.legal_acceptance', 'DELETE'), 'authenticated: no delete');
reset role; set role anon;
select tst.fails(format('select public.accept_legal(%L, %L, %L)', :'v49', 'web', '1.0.0'), 'anon cannot agree');
:as_super
-- every security definer function in public and app fixes its search_path (security-check 7а-1)
select tst.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef and n.nspname in ('public', 'app')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 'security definer functions set search_path');
\echo 'T49 wave 7а-1: consent to the Terms and Privacy (clickwrap) ok'
:as_super
-- ---------------------------------------------------------------- T58: «do not service» — only the director or the office, with a trace (04 §12.8)
:as_super
create function tst.mark_dns(p_id uuid, p_status text) returns void language plpgsql security definer set search_path = '' as $$
begin
  -- a definer function as the app's RPCs are: auth.uid() inside is still the caller
  update public.customers set status = p_status, do_not_service_reason = case when p_status = 'do_not_service' then 'via definer' end where id = p_id;
end;
$$;
grant execute on function tst.mark_dns(uuid, text) to authenticated;
:as_owner_a
insert into public.customers (id, company_id, display_name) values
  ('c5800000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T58 Client'),
  ('c5800000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T58 Other');
:as_sales_a
select tst.fails($q$update public.customers set status = 'do_not_service', do_not_service_reason = 'sales' where id = 'c5800000-0000-4000-8000-000000000001'$q$, 'sales do not mark «do not service»');
select tst.fails($q$select tst.mark_dns('c5800000-0000-4000-8000-000000000001', 'do_not_service')$q$, 'not through a definer function either: the role is the caller''s');
select tst.fails($q$insert into public.customers (company_id, display_name, status, do_not_service_reason) values ('ca000000-0000-0000-0000-000000000000', 'T58 born banned', 'do_not_service', 'x')$q$, 'sales do not create a client already marked');
update public.customers set status = 'archived' where id = 'c5800000-0000-4000-8000-000000000002';
select tst.ok((select status from public.customers where id = 'c5800000-0000-4000-8000-000000000002') = 'archived', 'sales still archive a client');
:as_tech_a
select tst.blocked($q$update public.customers set status = 'do_not_service', do_not_service_reason = 'tech' where id = 'c5800000-0000-4000-8000-000000000001'$q$, 'the tech does not mark');
:as_office_a
select tst.mark_dns('c5800000-0000-4000-8000-000000000001', 'do_not_service');
select tst.ok((select status from public.customers where id = 'c5800000-0000-4000-8000-000000000001') = 'do_not_service', 'the office marks (also through a definer function)');
select tst.ok((select count(*) from public.activities where subject_type = 'customer' and subject_id = 'c5800000-0000-4000-8000-000000000001'
                 and kind = 'status' and meta ->> 'action' = 'do_not_service_set' and meta ->> 'from' = 'active' and meta ->> 'reason' = 'via definer'
                 and actor_id = 'a0000000-0000-0000-0000-000000000002') = 1, 'one line in the history: who, from → to, the reason');
update public.customers set do_not_service_reason = 'T58 reason edited' where id = 'c5800000-0000-4000-8000-000000000001';
:as_sales_a
select tst.fails($q$update public.customers set status = 'active', do_not_service_reason = null where id = 'c5800000-0000-4000-8000-000000000001'$q$, 'sales do not lift the mark');
:as_owner_a
update public.customers set status = 'active', do_not_service_reason = null where id = 'c5800000-0000-4000-8000-000000000001';
select tst.ok((select count(*) from public.activities where subject_id = 'c5800000-0000-4000-8000-000000000001' and meta ->> 'action' = 'do_not_service_lifted'
                 and meta ->> 'to' = 'active' and meta ->> 'reason' is null and actor_id = 'a0000000-0000-0000-0000-000000000001') = 1, 'the director lifts it, also traced');
select tst.ok((select count(*) from public.activities where subject_id = 'c5800000-0000-4000-8000-000000000002' and kind = 'status') = 0, 'archive leaves no «do not service» line');
:as_super
reset role; set role anon;
select tst.fails($q$select tst.mark_dns('c5800000-0000-4000-8000-000000000001', 'do_not_service')$q$, 'anon does not mark');
:as_super
\echo 'T58 «do not service»: only the director or the office, with a trace ok'

-- ---------------------------------------------------------------- T51: wave 7б-1 — personal settings (member_prefs), only your own
:as_tech_a
select public.set_my_prefs('ca000000-0000-0000-0000-000000000000', true);
select tst.ok((select plan_show_done from public.member_prefs where company_id = 'ca000000-0000-0000-0000-000000000000') = true, 'the tech saves «show done» for himself');
select public.set_my_prefs('ca000000-0000-0000-0000-000000000000', false);
select tst.ok(tst.cnt($q$select 1 from public.member_prefs$q$) = 1 and (select not plan_show_done from public.member_prefs), 'a second save changes the same row, no copy');
select tst.fails($q$insert into public.member_prefs (company_id, user_id, plan_show_done) values ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', true)$q$, 'no direct insert (not even for another person)');
select tst.fails($q$update public.member_prefs set plan_show_done = true$q$, 'no direct update');
select tst.fails($q$delete from public.member_prefs$q$, 'no delete');
:as_owner_a
select public.set_my_prefs('ca000000-0000-0000-0000-000000000000', true);
select tst.ok(tst.cnt($q$select 1 from public.member_prefs$q$) = 1 and (select user_id from public.member_prefs) = 'a0000000-0000-0000-0000-000000000001', 'the owner sees only his own row, not the tech''s');
:as_owner_b
select tst.fails($q$select public.set_my_prefs('ca000000-0000-0000-0000-000000000000', true)$q$, 'not a member: cannot save in another company');
select tst.ok(tst.cnt($q$select 1 from public.member_prefs$q$) = 0, 'another company sees no settings');
reset role; set role anon;
select tst.fails($q$select public.set_my_prefs('ca000000-0000-0000-0000-000000000000', true)$q$, 'anon cannot save');
select tst.fails($q$select 1 from public.member_prefs$q$, 'anon cannot read');
select tst.ok(not has_function_privilege('anon', 'public.set_my_prefs(uuid, boolean)', 'execute'), 'anon has no right to the function at all');
:as_owner_a
select tst.ok(tst.cnt($q$select 1 from public.member_prefs where user_id = 'a0000000-0000-0000-0000-000000000003'$q$) = 0, 'the owner does not read the tech''s row even by its id');
select tst.fails($q$select public.set_my_prefs(null, true)$q$, 'no company: refused');
:as_super
select tst.ok((select plan_show_done from public.member_prefs where user_id = 'a0000000-0000-0000-0000-000000000003') = false
  and (select plan_show_done from public.member_prefs where user_id = 'a0000000-0000-0000-0000-000000000001') = true, 'each person keeps their own value');
select tst.ok(not has_table_privilege('authenticated', 'public.member_prefs', 'insert') and not has_table_privilege('authenticated', 'public.member_prefs', 'update')
  and not has_table_privilege('authenticated', 'public.member_prefs', 'delete'), 'authenticated may only read the table');
-- a person who is not an active member any more: no writes, the old row is not read (tech2 is disabled since an early
-- test: active for a moment to save, then disabled again)
update public.memberships set status = 'active' where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000004';
:as_tech2_a
select public.set_my_prefs('ca000000-0000-0000-0000-000000000000', true);
:as_super
update public.memberships set status = 'disabled' where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000004';
:as_tech2_a
select tst.fails($q$select public.set_my_prefs('ca000000-0000-0000-0000-000000000000', false)$q$, 'a disabled member cannot save');
select tst.ok(tst.cnt($q$select 1 from public.member_prefs$q$) = 0, 'a disabled member does not read his old row');
:as_super
-- a person in two companies: the settings of one do not show in the other
insert into public.memberships (company_id, user_id, role, status) values ('cb000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'tech', 'active');
:as_tech_a
select public.set_my_prefs('cb000000-0000-0000-0000-000000000000', true);
select tst.ok((select plan_show_done from public.member_prefs where company_id = 'cb000000-0000-0000-0000-000000000000') = true
  and (select plan_show_done from public.member_prefs where company_id = 'ca000000-0000-0000-0000-000000000000') = false, 'two companies, two separate settings');
:as_super
delete from public.memberships where company_id = 'cb000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003';
select tst.ok(tst.cnt($q$select 1 from public.member_prefs where company_id = 'cb000000-0000-0000-0000-000000000000'$q$) = 0, 'a membership removed for good takes its settings with it');
\echo 'T51 personal settings (member_prefs) ok'

-- ---------------------------------------------------------------- T56: wave 7б-2 — location consent: only the person, with the notice (LEG-19, AB 1331)
\set as_off56 'reset role; set request.jwt.claim.sub = ''a5600000-0000-4000-8000-000000000001''; set role authenticated;'
\set as_sub56 'reset role; set request.jwt.claim.sub = ''a5600000-0000-4000-8000-000000000002''; set role authenticated;'
:as_super
insert into auth.users (id, email, raw_user_meta_data) values
  ('a5600000-0000-4000-8000-000000000001', 'office56@a.test', '{"full_name":"Olga Office"}'),
  ('a5600000-0000-4000-8000-000000000002', 'sub56@a.test', '{"full_name":"Sam Sub"}');
insert into public.memberships (company_id, user_id, role, status) values
  ('ca000000-0000-0000-0000-000000000000', 'a5600000-0000-4000-8000-000000000001', 'office', 'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a5600000-0000-4000-8000-000000000002', 'subcontractor', 'active');
update public.memberships set share_location = false, location_notice_ack_at = null where company_id = 'ca000000-0000-0000-0000-000000000000';
-- the company flag is off by default: nobody switches on, the app hides the section
:as_tech_a
select tst.ok(public.company_location_sharing('ca000000-0000-0000-0000-000000000000') = false, 'the flag is off by default');
select tst.fails_like($q$select public.set_location_consent('ca000000-0000-0000-0000-000000000000', true)$q$, '%off for this company%', 'flag off: the tech cannot switch on');
:as_owner_b
select tst.ok(public.company_location_sharing('ca000000-0000-0000-0000-000000000000') = false, 'a stranger gets false, not an error');
select tst.fails($q$select public.set_location_consent('ca000000-0000-0000-0000-000000000000', false)$q$, 'a stranger cannot touch the consent of another company');
:as_super
insert into app.company_flags (company_id, location_sharing) values ('ca000000-0000-0000-0000-000000000000', true)
  on conflict (company_id) do update set location_sharing = true;
:as_tech_a
select tst.ok(public.company_location_sharing('ca000000-0000-0000-0000-000000000000'), 'a member sees the flag on');
-- not without the notice: a direct update has no right, and the old function refuses
select tst.fails($q$update public.memberships set share_location = true where user_id = 'a0000000-0000-0000-0000-000000000003'$q$, 'no direct switch-on');
select tst.fails($q$select public.set_share_location('ca000000-0000-0000-0000-000000000000', true)$q$, 'the old function does not switch on without the notice');
select tst.fails($q$select public.set_location_consent(null, true)$q$, 'no company: refused');
select public.set_location_consent('ca000000-0000-0000-0000-000000000000', true);
:as_super
select tst.ok((select share_location and location_notice_ack_at between now() - interval '1 minute' and now() from public.memberships
  where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003'), 'on, with the notice mark');
select tst.ok(tst.cnt($q$select 1 from public.memberships where company_id = 'ca000000-0000-0000-0000-000000000000' and share_location$q$) = 1, 'nobody else switched on');
-- the guard itself (whatever the path): on only by the person and only with ack = now(); ack only by the person
:as_super
update public.memberships set share_location = false where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003';
select tst.fails_like($q$update public.memberships set share_location = true, location_notice_ack_at = now() where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003'$q$, '%only the person%', 'not even the operator switches on for a person');
select tst.ok((select location_notice_ack_at is not null from public.memberships where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003'), 'the old ack stays after going off');
:as_owner_a
select tst.fails($q$update public.memberships set location_notice_ack_at = now() where user_id = 'a0000000-0000-0000-0000-000000000003'$q$, 'the owner does not mark the notice for the tech');
:as_super
create function tst.t56_guard(p_sql text, p_as uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_as::text, true); execute p_sql; end $$;
select tst.fails_like($q$select tst.t56_guard($s$update public.memberships set share_location = true where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003'$s$, 'a0000000-0000-0000-0000-000000000003')$q$,
  '%only with the notice%', 'the person: an old ack is not enough, the notice is read again now');
select tst.fails_like($q$select tst.t56_guard($s$update public.memberships set share_location = true, location_notice_ack_at = now() where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003'$s$, 'a0000000-0000-0000-0000-000000000001')$q$,
  '%only the person%', 'a trigger path with the owner''s identity does not switch on for the tech');
select tst.fails_like($q$select tst.t56_guard($s$insert into public.memberships (company_id, user_id, role, status, share_location, location_notice_ack_at) values ('cb000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'tech', 'active', true, now())$s$, 'b0000000-0000-0000-0000-000000000001')$q$,
  '%only the person%', 'an insert by another person does not come switched on');
drop function tst.t56_guard(text, uuid);
reset request.jwt.claim.sub;
-- a subcontractor never: the function refuses, the role change resets instead of failing the check
:as_sub56
select tst.fails_like($q$select public.set_location_consent('ca000000-0000-0000-0000-000000000000', true)$q$, '%subcontractor%', 'a subcontractor cannot switch on');
:as_tech_a
select public.set_location_consent('ca000000-0000-0000-0000-000000000000', true);
:as_super
update public.memberships set role = 'subcontractor' where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003';
select tst.ok((select not share_location from public.memberships where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003'), 'moved to subcontractor: off by itself (before: the check failed)');
update public.memberships set role = 'tech' where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003';
-- disabled: off by itself; back to active: off until the person agrees again
:as_tech_a
select public.set_location_consent('ca000000-0000-0000-0000-000000000000', true);
:as_owner_a
select public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'disabled');
select public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'active');
:as_super
select tst.ok((select not share_location from public.memberships where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003'), 'disabled and back: off until agreed again (set_member_status still works)');
-- the owner / admin switch off, never on; exactly this company
:as_tech_a
select public.set_location_consent('ca000000-0000-0000-0000-000000000000', true);
:as_owner_b
select tst.fails_like($q$select public.stop_member_location('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003')$q$, '%no such member%', 'another company''s owner cannot switch it off');
select tst.fails_like($q$select public.stop_member_location('cb000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003')$q$, '%no such member%', 'not a member of B: «no such member», no hint');
:as_tech2_a
select tst.fails($q$select public.stop_member_location('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003')$q$, 'a tech cannot switch off a colleague');
:as_office_a
select public.stop_member_location('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003');
select tst.fails($q$select public.stop_member_location('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001')$q$, 'an admin does not touch the owner''s row');
:as_super
select tst.ok((select not share_location from public.memberships where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003'), 'the admin switched it off');
-- rights (rule 18)
select tst.ok(not has_function_privilege('anon', 'public.set_location_consent(uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.stop_member_location(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.company_location_sharing(uuid)', 'execute'), 'anon: no location functions');
select tst.ok(not has_function_privilege('authenticated', 'app.tg_membership_location()', 'execute')
  and not has_function_privilege('authenticated', 'app.tg_membership_location_forget()', 'execute')
  and not has_function_privilege('authenticated', 'app.tg_user_location_fill()', 'execute')
  and not has_function_privilege('authenticated', 'app.company_shares_location(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app.purge_user_locations()', 'execute'), 'trigger and operator functions: nobody calls them');
select tst.ok(not exists (select 1 from pg_trigger t where t.tgrelid = 'public.user_locations'::regclass and not t.tgisinternal
                            and t.tgfoid = 'app.tg_audit()'::regprocedure), 'points have no audit trigger: the journal never keeps coordinates');
\echo 'T56 wave 7б-2: location consent only by the person, with the notice ok'

-- ---------------------------------------------------------------- T57: wave 7б-2 — points: own open visit only, read by role, forgotten on going off
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values ('c5700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T57 Client');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values ('d5700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c5700000-0000-4000-8000-000000000001', '57 Geo St', 'Pasadena');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values ('e5700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T57 job', 'c5700000-0000-4000-8000-000000000001', 'd5700000-0000-4000-8000-000000000001', 'draft');
  insert into public.visits (id, company_id, job_id, starts_at) values
    ('f5700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e5700000-0000-4000-8000-000000000001', now()),
    ('f5700000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'e5700000-0000-4000-8000-000000000001', now()),
    ('f5700000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'e5700000-0000-4000-8000-000000000001', now()),
    ('f5700000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'e5700000-0000-4000-8000-000000000001', now());
end $$;
select (public.assign_visit(v, array['a0000000-0000-0000-0000-000000000003']::uuid[]) ->> 'added') from unnest(array['f5700000-0000-4000-8000-000000000001', 'f5700000-0000-4000-8000-000000000002', 'f5700000-0000-4000-8000-000000000004']::uuid[]) v;
select (public.assign_visit('f5700000-0000-4000-8000-000000000003', array['a0000000-0000-0000-0000-000000000001']::uuid[]) ->> 'added');
:as_tech_a
update public.visits set status = 'en_route' where id = 'f5700000-0000-4000-8000-000000000001';
-- without consent: refused
select tst.fails_like($q$insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f5700000-0000-4000-8000-000000000001', 34.1, -118.1, now())$q$, '%sharing is off%', 'no consent: no point');
select public.set_location_consent('ca000000-0000-0000-0000-000000000000', true);
insert into public.user_locations (visit_id, lat, lng, accuracy_m, source, recorded_at) values ('f5700000-0000-4000-8000-000000000001', 34.1234567, -118.7654321, 12, 'status_change', now());
select tst.ok((select lat = 34.12346 and lng = -118.76543 and user_id = 'a0000000-0000-0000-0000-000000000003' and company_id = 'ca000000-0000-0000-0000-000000000000' from public.user_locations), 'own point on own visit en route: saved, rounded, ids from the server');
-- refusals
select tst.fails($q$insert into public.user_locations (visit_id, lat, lng, recorded_at, user_id) values ('f5700000-0000-4000-8000-000000000001', 34.1, -118.1, now(), 'a0000000-0000-0000-0000-000000000001')$q$, 'no right to write user_id');
select tst.fails($q$insert into public.user_locations (visit_id, lat, lng, recorded_at, company_id) values ('f5700000-0000-4000-8000-000000000001', 34.1, -118.1, now(), 'cb000000-0000-0000-0000-000000000000')$q$, 'no right to write company_id');
select tst.fails_like($q$insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f5700000-0000-4000-8000-000000000002', 34.1, -118.1, now())$q$, '%not under way%', 'own visit still scheduled: refused');
select tst.fails_like($q$insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f5700000-0000-4000-8000-000000000003', 34.1, -118.1, now())$q$, '%no such visit%', 'someone else''s visit: refused');
select tst.fails_like($q$insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f0000000-0000-4000-8000-000000000999', 34.1, -118.1, now())$q$, '%no such visit%', 'no visit: refused');
select tst.fails_like($q$insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f5700000-0000-4000-8000-000000000001', 91, -118.1, now() + interval '40 seconds')$q$, 'not a valid point', 'latitude out of range: our text, not the row');
select tst.fails_like($q$insert into public.user_locations (visit_id, lat, lng, accuracy_m, recorded_at) values ('f5700000-0000-4000-8000-000000000001', 34.1, -118.1, 6000, now() + interval '40 seconds')$q$, 'not a valid point', 'accuracy out of range');
select tst.fails($q$insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f5700000-0000-4000-8000-000000000001', 'NaN', -118.1, now() + interval '40 seconds')$q$, 'NaN refused');
select tst.fails($q$insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f5700000-0000-4000-8000-000000000001', null, -118.1, now() + interval '40 seconds')$q$, 'no latitude refused');
select tst.fails_like($q$insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f5700000-0000-4000-8000-000000000001', 34.1, -118.1, now() + interval '2 minutes')$q$, '%future%', 'a point from the future: refused');
-- skipped silently (an offline phone must not stall): stale, or within 30 s of the last
insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f5700000-0000-4000-8000-000000000001', 34.2, -118.2, now() - interval '6 minutes');
insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f5700000-0000-4000-8000-000000000001', 34.2, -118.2, now() + interval '10 seconds');
select tst.ok(tst.cnt($q$select 1 from public.user_locations$q$) = 1, 'stale and too-frequent points are skipped without an error');
select tst.fails($q$update public.user_locations set lat = 0$q$, 'no update');
select tst.fails($q$delete from public.user_locations$q$, 'no delete for a client');
-- reading: the tech — own; another tech — nothing; office — the open visit; admin/owner — yes; company B — nothing
:as_tech2_a
select tst.ok(tst.cnt($q$select 1 from public.user_locations$q$) = 0, 'another tech does not see the point');
:as_sales_a
select tst.ok(tst.cnt($q$select 1 from public.user_locations$q$) = 0, 'sales do not see points');
:as_off56
select tst.ok(tst.cnt($q$select 1 from public.user_locations$q$) = 1, 'the office sees the point of the open visit');
:as_office_a
select tst.ok(tst.cnt($q$select 1 from public.user_locations$q$) = 1, 'the admin sees it');
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.user_locations$q$) = 0, 'company B sees nothing');
reset role; set role anon;
select tst.fails($q$select 1 from public.user_locations$q$, 'anon cannot read');
-- the visit closed: the office loses it, the owner keeps it (30 days)
:as_super
-- an old point (the trigger would skip a stale one: put a fresh one in, then age it as the operator)
update public.visits set status = 'en_route' where id = 'f5700000-0000-4000-8000-000000000002';
:as_tech_a
insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f5700000-0000-4000-8000-000000000002', 34.3, -118.3, now());
:as_super
update public.user_locations set recorded_at = now() - interval '31 days' where visit_id = 'f5700000-0000-4000-8000-000000000002';
:as_owner_a
select tst.ok(tst.cnt($q$select 1 from public.user_locations$q$) = 1, 'the owner: points older than 30 days are not read');
update public.visits set status = 'on_site' where id = 'f5700000-0000-4000-8000-000000000001';
:as_super
update public.visits set status = 'completed' where id = 'f5700000-0000-4000-8000-000000000001';
:as_off56
select tst.ok(tst.cnt($q$select 1 from public.user_locations$q$) = 0, 'visit completed: the office no longer sees it');
:as_owner_a
select tst.ok(tst.cnt($q$select 1 from public.user_locations where visit_id = 'f5700000-0000-4000-8000-000000000001'$q$) = 1, 'the owner still does (history)');
:as_tech_a
select tst.fails_like($q$insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f5700000-0000-4000-8000-000000000001', 34.1, -118.1, now() + interval '45 seconds')$q$, '%not under way%', 'visit completed: no point');
-- taken off the visit (S9b): the office stops reading the person there, and no new point
:as_tech_a
insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f5700000-0000-4000-8000-000000000002', 34.35, -118.35, now());
:as_off56
select tst.ok(tst.cnt($q$select 1 from public.user_locations where visit_id = 'f5700000-0000-4000-8000-000000000002'$q$) = 1, 'the office sees the point while the tech is on the visit');
:as_office_a
select public.assign_visit('f5700000-0000-4000-8000-000000000002', array['a0000000-0000-0000-0000-000000000001']::uuid[]);
:as_tech_a
select tst.fails_like($q$insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f5700000-0000-4000-8000-000000000002', 34.1, -118.1, now())$q$, '%no such visit%', 'taken off the visit: no point');
:as_off56
select tst.ok(tst.cnt($q$select 1 from public.user_locations where visit_id = 'f5700000-0000-4000-8000-000000000002'$q$) = 0, 'taken off: the office no longer reads his points there');
-- the company flag off: no writes, no reads by others
:as_super
update app.company_flags set location_sharing = false where company_id = 'ca000000-0000-0000-0000-000000000000';
:as_owner_a
select tst.ok(tst.cnt($q$select 1 from public.user_locations$q$) = 0, 'flag off: the owner reads nothing');
:as_super
update app.company_flags set location_sharing = true where company_id = 'ca000000-0000-0000-0000-000000000000';
-- purge: only older than 30 days — run by an owner WITHOUT BYPASSRLS (force RLS on the table must not make it a no-op)
create role t57_owner nologin nobypassrls;
grant postgres to t57_owner;   -- the rules are «to postgres»: membership carries them, not the superuser bit
grant usage on schema app, public to t57_owner;
grant select, delete on public.user_locations to t57_owner;
grant execute on function app.has_role(uuid, text[]) to t57_owner;
alter function app.purge_user_locations() owner to t57_owner;
select tst.ok(app.purge_user_locations() = 1 and tst.cnt($q$select 1 from public.user_locations where recorded_at < now() - interval '30 days'$q$) = 0
  and tst.cnt($q$select 1 from public.user_locations$q$) = 2, 'purge removes only points older than 30 days, even without BYPASSRLS');
-- the forget trigger too, for the rest of T57: going off (the tech; the admin) must delete without BYPASSRLS
alter function app.tg_membership_location_forget() owner to t57_owner;
-- going off forgets the points (the person; and through the admin)
:as_tech_a
select public.set_location_consent('ca000000-0000-0000-0000-000000000000', false);
select tst.ok(tst.cnt($q$select 1 from public.user_locations$q$) = 0, 'consent revoked: own points gone');
:as_super
select tst.ok(tst.cnt($q$select 1 from public.user_locations where user_id = 'a0000000-0000-0000-0000-000000000003'$q$) = 0, 'gone for real, not hidden');
-- through the admin: the same path forgets the points
:as_tech_a
select public.set_location_consent('ca000000-0000-0000-0000-000000000000', true);
:as_super
update public.visits set status = 'en_route' where id = 'f5700000-0000-4000-8000-000000000004';
:as_tech_a
insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f5700000-0000-4000-8000-000000000004', 34.4, -118.4, now());
:as_office_a
select public.stop_member_location('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003');
:as_super
select tst.ok(tst.cnt($q$select 1 from public.user_locations where user_id = 'a0000000-0000-0000-0000-000000000003'$q$) = 0, 'switched off by the admin: points gone');
select tst.ok(not exists (select 1 from pg_publication_tables where tablename = 'user_locations'), 'points are not in any realtime publication');
select tst.ok(not has_table_privilege('authenticated', 'public.user_locations', 'update') and not has_table_privilege('authenticated', 'public.user_locations', 'delete')
  and not has_column_privilege('authenticated', 'public.user_locations', 'user_id', 'insert') and not has_column_privilege('authenticated', 'public.user_locations', 'company_id', 'insert'), 'a client inserts only the point fields, never updates or deletes');
-- account deletion (S22): erase_personal_rows takes the person's points everywhere and the notice mark
:as_tech_a
select public.set_location_consent('ca000000-0000-0000-0000-000000000000', true);
insert into public.user_locations (visit_id, lat, lng, recorded_at) values ('f5700000-0000-4000-8000-000000000004', 34.6, -118.6, now());
:as_super
select tst.ok(tst.cnt($q$select 1 from public.user_locations where user_id = 'a0000000-0000-0000-0000-000000000003'$q$) = 1, 'a point before the erasure');
select app.erase_personal_rows('a0000000-0000-0000-0000-000000000003');
select tst.ok(tst.cnt($q$select 1 from public.user_locations where user_id = 'a0000000-0000-0000-0000-000000000003'$q$) = 0
  and (select location_notice_ack_at is null from public.memberships where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003'), 'erasure: points and the notice mark gone');
:as_tech_a
select public.set_location_consent('ca000000-0000-0000-0000-000000000000', false);
:as_super
update public.visits set status = 'cancelled' where id in ('f5700000-0000-4000-8000-000000000002', 'f5700000-0000-4000-8000-000000000004');
update app.company_flags set location_sharing = false where company_id = 'ca000000-0000-0000-0000-000000000000';
alter function app.purge_user_locations() owner to postgres;
alter function app.tg_membership_location_forget() owner to postgres;
drop owned by t57_owner;
drop role t57_owner;
\echo 'T57 wave 7б-2: points on own open visit, read by role, forgotten on going off ok'
-- ---------------------------------------------------------------- T50: wave 7а-2a — удаление аккаунта (S22; docs/specs/19 §6)
-- delete_account as the person: a fresh sign-in (amr of the token), the word, never the last active owner (unless the
-- company closes with the account); memberships → deleted, own rows wiped/unlinked, the profile anonymised, business
-- records stay; a still-valid token of the deleted person writes and sees nothing. The sign-in itself is closed by the
-- edge function (auth.admin.deleteUser) — checked by hand before a release (§6.8).
:as_super
-- a fresh sign-in: the token's amr (Supabase puts the method and the time of each sign-in step there)
create function tst.fresh(p_minutes_ago int default 0) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp',
      extract(epoch from now() - make_interval(mins => p_minutes_ago))::bigint)))::text, false);
end $$;
grant execute on function tst.fresh(int) to authenticated, anon;
insert into auth.users (id, email, raw_user_meta_data) values
  ('a5000000-0000-4000-8000-000000000001', 'tom50@a.test',   '{"full_name":"Tom Fifty"}'),
  ('a5000000-0000-4000-8000-000000000002', 'olga50@a.test',  '{"full_name":"Olga Owner"}'),
  ('a5000000-0000-4000-8000-000000000003', 'adam50@a.test',  '{"full_name":"Adam Admin"}'),
  ('a5000000-0000-4000-8000-000000000004', 'solo50@a.test',  '{"full_name":"Sol Solo"}'),
  ('a5000000-0000-4000-8000-000000000005', 'eve50@a.test',   '{"full_name":"Eve Employee"}');
select tst.agree('a5000000-0000-4000-8000-000000000001'), tst.agree('a5000000-0000-4000-8000-000000000002'), tst.agree('a5000000-0000-4000-8000-000000000003'),
       tst.agree('a5000000-0000-4000-8000-000000000004'), tst.agree('a5000000-0000-4000-8000-000000000005');
\set as_tom50  'reset role; set request.jwt.claim.sub = ''a5000000-0000-4000-8000-000000000001''; reset request.jwt.claims; set role authenticated;'
\set as_olga50 'reset role; set request.jwt.claim.sub = ''a5000000-0000-4000-8000-000000000002''; reset request.jwt.claims; set role authenticated;'
\set as_adam50 'reset role; set request.jwt.claim.sub = ''a5000000-0000-4000-8000-000000000003''; reset request.jwt.claims; set role authenticated;'
\set as_solo50 'reset role; set request.jwt.claim.sub = ''a5000000-0000-4000-8000-000000000004''; reset request.jwt.claims; set role authenticated;'
\set as_eve50  'reset role; set request.jwt.claim.sub = ''a5000000-0000-4000-8000-000000000005''; reset request.jwt.claims; set role authenticated;'
-- Tom joins Bonpoc (company A) as a tech; Olga owns «Fifty Co» with Adam as admin; Sol owns «Solo Co» alone, Eve works there
:as_owner_a
select public.invite_member('ca000000-0000-0000-0000-000000000000', 'tom50@a.test', 'tech') ->> 'token' as t50_tom \gset
:as_tom50
select public.accept_invitation(:'t50_tom') is not null as t50_j1 \gset
:as_olga50
insert into public.companies (id, name) values ('c5000000-0000-4000-8000-000000000001', 'Fifty Co');
select public.invite_member('c5000000-0000-4000-8000-000000000001', 'adam50@a.test', 'admin') ->> 'token' as t50_adam \gset
:as_adam50
select public.accept_invitation(:'t50_adam') is not null as t50_j2 \gset
:as_solo50
insert into public.companies (id, name) values ('c5000000-0000-4000-8000-000000000002', 'Solo Co');
select public.invite_member('c5000000-0000-4000-8000-000000000002', 'eve50@a.test', 'tech') ->> 'token' as t50_eve \gset
-- Sol also invites Tom (pending: it stops working when Tom leaves)
select public.invite_member('c5000000-0000-4000-8000-000000000002', 'tom50@a.test', 'office') ->> 'id' as t50_inv_tom \gset
:as_eve50
select public.accept_invitation(:'t50_eve') is not null as t50_j3 \gset
-- Tom's things in company A: his settings, a signature, notes, a task, a linked company contact, the lead default
:as_tom50
select public.set_my_prefs('ca000000-0000-0000-0000-000000000000', true);
insert into public.member_signatures (company_id, user_id, svg, name) values ('ca000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000001', '<svg/>', 'Tom Fifty');
:as_super
insert into public.notes (company_id, subject_type, subject_id, body, visibility, created_by) values
  ('ca000000-0000-0000-0000-000000000000', 'customer', 'c1a00000-0000-0000-0000-000000000001', 'Tom private 50', 'private', 'a5000000-0000-4000-8000-000000000001'),
  ('ca000000-0000-0000-0000-000000000000', 'customer', 'c1a00000-0000-0000-0000-000000000001', 'Tom team 50', 'team', 'a5000000-0000-4000-8000-000000000001');
insert into public.tasks (id, company_id, subject_type, subject_id, title, assignee_id, created_by) values
  ('d5000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'property', 'd2000000-0000-4000-8000-000000000001', 'Tom task 50', 'a5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001');
insert into public.company_contacts (company_id, name, user_id) values ('ca000000-0000-0000-0000-000000000000', 'Tom (contact)', 'a5000000-0000-4000-8000-000000000001');
update public.companies set lead_default_assignee_id = 'a5000000-0000-4000-8000-000000000001' where id = 'ca000000-0000-0000-0000-000000000000';
-- his business records: a visit he is assigned to, a payment he took, an expense he wrote (review #214 №4)
insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', 'f1a00000-0000-0000-0000-000000000003', 'a5000000-0000-4000-8000-000000000001');
select id as t50_pay from public.payments where company_id = 'ca000000-0000-0000-0000-000000000000' order by id limit 1 \gset
set session_replication_role = replica;
update public.payments set received_by = 'a5000000-0000-4000-8000-000000000001' where id = :'t50_pay';
set session_replication_role = origin;
insert into public.expenses (id, company_id, vendor, amount_cents, category, created_by) values
  ('e5000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'Tom test vendor 50', 1000, 'materials', 'a5000000-0000-4000-8000-000000000001');
:as_owner_a
select (select count(*) from public.invoices) as t50_inv, (select count(*) from public.payments) as t50_pays, (select count(*) from public.visits) as t50_vis,
       (select count(*) from public.visit_assignees) as t50_va, (select count(*) from public.expenses) as t50_exp \gset
:as_super
-- the journal is append-only: give Tom an IP for the fixture past the triggers
set session_replication_role = replica;
update public.legal_acceptance set ip = '203.0.113.50' where user_id = 'a5000000-0000-4000-8000-000000000001';
set session_replication_role = origin;
:as_super
-- refusals: anon has no function; no word; a stale sign-in; an anonymous token
reset role; set role anon;
select tst.fails($q$select public.delete_account('DELETE')$q$, 'anon cannot delete');
:as_tom50
select tst.fails_like($q$select public.delete_account('yes')$q$, '%type the word%', 'the word is required');
select tst.fails_like($q$select public.delete_account('DELETE')$q$, '%sign in again first%', 'no amr in the token: refused (fail closed)');
select tst.fresh(15);
select tst.fails_like($q$select public.delete_account('DELETE')$q$, '%sign in again first%', 'a sign-in 15 minutes ago is not fresh');
select set_config('request.jwt.claims', jsonb_build_object('amr', jsonb_build_array(
  jsonb_build_object('method', 'otp', 'timestamp', extract(epoch from now() - interval '1 hour')::bigint),
  jsonb_build_object('method', 'token_refresh', 'timestamp', extract(epoch from now())::bigint)))::text, false) is not null as t50_r \gset
select tst.fails_like($q$select public.delete_account('DELETE')$q$, '%sign in again first%', 'a token refresh is not a fresh sign-in');
set request.jwt.claims = '{"is_anonymous": true, "amr": []}';
select tst.fails_like($q$select public.delete_account('DELETE')$q$, '%sign in first%', 'an anonymous sign-in deletes nothing');
:as_super
select tst.ok((select status from public.memberships where user_id = 'a5000000-0000-4000-8000-000000000001') = 'active', 'the refusals changed nothing');
-- delete Tom
:as_tom50
select tst.fresh(2);
select tst.ok((public.delete_account('УДАЛИТЬ') ->> 'deleted')::boolean, 'Tom deletes his account (fresh sign-in, the word in Russian)');
:as_super
select tst.ok((select every(status = 'deleted' and deleted_at is not null and title is null and not share_location) from public.memberships where user_id = 'a5000000-0000-4000-8000-000000000001'), 'his membership is deleted');
select tst.ok((select full_name = 'Deleted user' and email = 'deleted+a5000000-0000-4000-8000-000000000001@deleted.invalid' and phone is null and deleted_at is not null from public.users where id = 'a5000000-0000-4000-8000-000000000001'), 'the profile is anonymised');
select tst.ok((select count(*) from public.member_prefs where user_id = 'a5000000-0000-4000-8000-000000000001') = 0, 'his settings are gone');
select tst.ok((select every(revoked_at is not null) from public.member_signatures where user_id = 'a5000000-0000-4000-8000-000000000001'), 'his signature is revoked (kept on signed documents)');
select tst.ok((select count(*) from public.notes where body = 'Tom private 50') = 0, 'his private note is gone');
select tst.ok((select count(*) from public.notes where body = 'Tom team 50') = 1, 'his team note stays with the company');
select tst.ok((select assignee_id from public.tasks where id = 'd5000000-0000-4000-8000-000000000001') = 'a5000000-0000-4000-8000-000000000001', 'the task stays, pointing to the anonymised person');
select tst.ok((select user_id from public.company_contacts where name = 'Tom (contact)') is null, 'the company contact is unlinked');
select tst.ok((select lead_default_assignee_id from public.companies where id = 'ca000000-0000-0000-0000-000000000000') is null, 'new leads no longer go to him');
select tst.ok((select status = 'revoked' and email like 'deleted+%@deleted.invalid' and name is null from public.invitations where id = :'t50_inv_tom'), 'an invitation to his email stops working and forgets the email');
select tst.ok((select every(email = 'deleted+a5000000-0000-4000-8000-000000000001@deleted.invalid' and name is null) from public.invitations where accepted_by = 'a5000000-0000-4000-8000-000000000001'), 'the accepted invitation forgets his email');
select tst.ok((select count(*) = 2 and every(ip is null and ip_raw is null) from public.legal_acceptance where user_id = 'a5000000-0000-4000-8000-000000000001'), 'the proof of consent stays, without the IP');
-- the office still sees his records (invoices, payments, visits and his assignment, expenses), pointing to him
:as_owner_a
select tst.ok((select count(*) from public.invoices) = :t50_inv and (select count(*) from public.payments) = :t50_pays
          and (select count(*) from public.visits) = :t50_vis and (select count(*) from public.visit_assignees) = :t50_va
          and (select count(*) from public.expenses) = :t50_exp, 'the office sees the same invoices, payments, visits, assignments and expenses');
select tst.ok((select received_by from public.payments where id = :'t50_pay') = 'a5000000-0000-4000-8000-000000000001', 'the payment still says who took it');
select tst.ok((select count(*) from public.visit_assignees where user_id = 'a5000000-0000-4000-8000-000000000001') = 1, 'his visit assignment stays (the office reassigns)');
-- his token (valid up to an hour): sees nothing, writes nothing
:as_tom50
select tst.blocked($q$update public.tasks set title = 'Tom edits' where id = 'd5000000-0000-4000-8000-000000000001'$q$, 'a deleted author does not edit his task');
select tst.blocked($q$update public.expenses set amount_cents = 1 where id = 'e5000000-0000-4000-8000-000000000001'$q$, 'a deleted author does not edit his expense');
select tst.ok((select count(*) from public.companies where id = 'ca000000-0000-0000-0000-000000000000') = 0, 'the deleted person no longer sees the company');
select tst.ok((select count(*) from public.tasks where id = 'd5000000-0000-4000-8000-000000000001') = 0, 'nor his task');
select tst.ok(not app.account_alive(), 'account_alive is false');
select tst.blocked($q$update public.users set full_name = 'Tom back' where id = 'a5000000-0000-4000-8000-000000000001'$q$, 'the anonymised profile is not written back');
select tst.fails_like($q$insert into public.companies (name) values ('Tom Again Co')$q$, '%legal not accepted%', 'no new company by the old token');
select tst.fails($q$select public.accept_legal('{"terms":"2026-11-06","privacy":"2026-11-06"}', 'web', '1.0.0')$q$, 'no new consent by the old token');
select tst.fails($q$select public.set_my_prefs('ca000000-0000-0000-0000-000000000000', false)$q$, 'no settings by the old token');
select tst.fresh(1);
select tst.ok((public.delete_account('DELETE') ->> 'repeat')::boolean, 'again: a success that changes nothing');
:as_super
select tst.ok((select full_name from public.users where id = 'a5000000-0000-4000-8000-000000000001') = 'Deleted user', 'the repeat changed nothing');
-- the last owner: refused; a transfer to the admin needs a fresh sign-in; then the old owner may leave
:as_olga50
select tst.fresh(1);
select tst.fails_like($q$select public.delete_account('DELETE')$q$, '%transfer the company first%', 'the last active owner with an admin: hand it over first');
select tst.fails_like($q$select public.delete_account('DELETE', array['c5000000-0000-4000-8000-000000000001']::uuid[])$q$, '%transfer the company first%', 'an admin is there: no closing — hand it over first');
select tst.ok((select closed_at from public.companies where id = 'c5000000-0000-4000-8000-000000000001') is null, 'and the company is not closed');
select tst.ok((select status from public.memberships where user_id = 'a5000000-0000-4000-8000-000000000002') = 'active', 'and nothing changed');
select tst.fails_like($q$select public.transfer_ownership('c5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000005')$q$, '%no such person on the team%', 'not to a person of another company');
select tst.fails_like($q$select public.transfer_ownership('c5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002')$q$, '%no such person on the team%', 'not to oneself');
select tst.fails_like($q$select public.transfer_ownership('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002')$q$, '%no such person on the team%', 'not in a company where I am not the owner');
reset request.jwt.claims;
select tst.fails_like($q$select public.transfer_ownership('c5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000003')$q$, '%sign in again first%', 'a transfer needs a fresh sign-in');
select tst.fresh(1);
select tst.ok((public.transfer_ownership('c5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000003') ->> 'owner') = 'a5000000-0000-4000-8000-000000000003', 'the company goes to the admin');
:as_super
select tst.ok((select role from public.memberships where user_id = 'a5000000-0000-4000-8000-000000000003') = 'owner'
          and (select role from public.memberships where user_id = 'a5000000-0000-4000-8000-000000000002') = 'admin', 'Adam is the owner, Olga an admin');
:as_adam50
select tst.fresh(1);
select tst.fails_like($q$select public.transfer_ownership('c5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001')$q$, '%no such person on the team%', 'not to a deleted person');
-- right after the transfer (the race «transfer ∥ delete», step by step): the new owner is the last one, Olga is an admin
select tst.fails_like($q$select public.delete_account('DELETE', array['c5000000-0000-4000-8000-000000000001']::uuid[])$q$, '%transfer the company first%', 'the new owner cannot close the company under the old one');
:as_olga50
select tst.fresh(1);
select tst.ok((public.delete_account('ELIMINAR') ->> 'deleted')::boolean, 'now Olga (an admin) may leave');
select tst.ok((select count(*) from public.companies where id = 'c5000000-0000-4000-8000-000000000001') = 0, 'the creator does not see her company any more (companies_select)');
:as_adam50
select tst.ok((select count(*) from public.companies where id = 'c5000000-0000-4000-8000-000000000001') = 1, 'the new owner works on');
-- the last owner without an admin: closes the company with the account
:as_solo50
select tst.fresh(1);
select tst.fails_like($q$select public.delete_account('DELETE')$q$, '%keeps at least one active owner%', 'Sol is the only owner');
select tst.ok((public.delete_account('DELETE', array['c5000000-0000-4000-8000-000000000002']::uuid[]) -> 'closed_companies') ? 'c5000000-0000-4000-8000-000000000002', 'Sol closes «Solo Co» with his account');
:as_super
select tst.ok((select closed_at is not null from public.companies where id = 'c5000000-0000-4000-8000-000000000002'), 'the company is closed (its records are kept)');
select tst.ok((select every(status = 'deleted') from public.memberships where company_id = 'c5000000-0000-4000-8000-000000000002'), 'nobody works in it any more');
select tst.ok(app.retention_years() = 7, 'records are kept 7 years by default');
:as_adam50
select tst.fails_like($q$update public.companies set closed_at = now() where id = 'c5000000-0000-4000-8000-000000000001'$q$, '%closed only with its last owner%', 'an owner does not close a company by hand');
:as_super
select tst.fails_like($q$update public.companies set closed_at = null where id = 'c5000000-0000-4000-8000-000000000002'$q$, '%closed only with its last owner%', 'nor reopen it (only delete_account sets it)');
:as_eve50
select tst.ok((select count(*) from public.companies where id = 'c5000000-0000-4000-8000-000000000002') = 0, 'Eve no longer sees the closed company');
select tst.ok(app.account_alive(), 'but her own account is alive');
-- a switched-off author: no edits of his task or expense either (the is_member branch)
:as_super
insert into auth.users (id, email, raw_user_meta_data) values ('a5000000-0000-4000-8000-000000000006', 'off50@a.test', '{"full_name":"Otto Off"}');
select tst.agree('a5000000-0000-4000-8000-000000000006');
:as_owner_a
select public.invite_member('ca000000-0000-0000-0000-000000000000', 'off50@a.test', 'tech') ->> 'token' as t50_off \gset
reset role; set request.jwt.claim.sub = 'a5000000-0000-4000-8000-000000000006'; set role authenticated;
select public.accept_invitation(:'t50_off') is not null as t50_j4 \gset
:as_super
insert into public.tasks (id, company_id, subject_type, subject_id, title, created_by) values
  ('d5000000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'property', 'd2000000-0000-4000-8000-000000000001', 'Otto task 50', 'a5000000-0000-4000-8000-000000000006');
insert into public.expenses (id, company_id, vendor, amount_cents, category, created_by) values
  ('e5000000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'Otto vendor 50', 1000, 'materials', 'a5000000-0000-4000-8000-000000000006');
:as_owner_a
select public.set_member_status('ca000000-0000-0000-0000-000000000000', 'a5000000-0000-4000-8000-000000000006', 'disabled');
reset role; set request.jwt.claim.sub = 'a5000000-0000-4000-8000-000000000006'; set role authenticated;
select tst.blocked($q$update public.tasks set title = 'Otto edits' where id = 'd5000000-0000-4000-8000-000000000002'$q$, 'a switched-off author does not edit his task');
select tst.blocked($q$update public.expenses set amount_cents = 1 where id = 'e5000000-0000-4000-8000-000000000002'$q$, 'a switched-off author does not edit his expense');
-- two owners leave one after the other (the race, step by step): the first goes, the second is the last one
:as_eve50
insert into public.companies (name) values ('Twin Co') returning id as t50_twin \gset
select tst.ok(:'t50_twin' is not null, 'insert … returning works for the creator (companies_select, review #214 №1)');
:as_super
insert into auth.users (id, email, raw_user_meta_data) values ('a5000000-0000-4000-8000-000000000007', 'kim50@a.test', '{"full_name":"Kim Twin"}');
select tst.agree('a5000000-0000-4000-8000-000000000007');
:as_eve50
select public.invite_member(:'t50_twin', 'kim50@a.test', 'admin') ->> 'token' as t50_kim \gset
reset role; set request.jwt.claim.sub = 'a5000000-0000-4000-8000-000000000007'; set role authenticated;
select public.accept_invitation(:'t50_kim') is not null as t50_j5 \gset
:as_super
update public.memberships set role = 'owner' where company_id = :'t50_twin' and user_id = 'a5000000-0000-4000-8000-000000000007';
:as_eve50
select tst.fresh(1);
select tst.ok((public.delete_account('DELETE') ->> 'deleted')::boolean, 'one of two owners leaves');
reset role; set request.jwt.claim.sub = 'a5000000-0000-4000-8000-000000000007'; set role authenticated;
select tst.fresh(1);
select tst.fails_like($q$select public.delete_account('DELETE')$q$, '%keeps at least one active owner%', 'the second owner is now the last one');
:as_super
select tst.ok((select count(*) from public.memberships where company_id = :'t50_twin' and role = 'owner' and status = 'active') = 1, 'the company always keeps an active owner');
-- the creator with a deleted membership no longer sees her company (has_any_membership counts soft-deleted ones)
:as_eve50
select tst.ok((select count(*) from public.companies where id = :'t50_twin') = 0, 'the creator who left does not see the company');
-- a company is never created already closed
reset role; set request.jwt.claim.sub = 'a5000000-0000-4000-8000-000000000007'; set role authenticated;
select tst.fails_like($q$insert into public.companies (name, closed_at) values ('Closed From Birth Co', now())$q$, '%closed only with its last owner%', 'no company is created closed');

-- the consent journal: even with the erasing flag, a client edits nothing
set app.erasing_user = 'on';
select tst.blocked($q$update public.legal_acceptance set ip = null$q$, 'the flag does not open the journal to a client');
reset app.erasing_user;
-- rights (rule 18, T52)
:as_super
select tst.ok(not has_function_privilege('anon', 'public.delete_account(text,uuid[])', 'EXECUTE'), 'anon: no delete_account');
select tst.ok(not has_function_privilege('anon', 'public.transfer_ownership(uuid,uuid)', 'EXECUTE'), 'anon: no transfer_ownership');
select tst.ok(has_function_privilege('authenticated', 'public.delete_account(text,uuid[])', 'EXECUTE'), 'authenticated: delete_account');
select tst.ok(not has_function_privilege('authenticated', 'app.signed_in_recently(int)', 'EXECUTE'), 'internal: signed_in_recently');
select tst.ok(not has_function_privilege('authenticated', 'app.erase_personal_rows(uuid)', 'EXECUTE'), 'internal: erase_personal_rows');
select tst.ok(not has_function_privilege('authenticated', 'app.tg_user_erased_guard()', 'EXECUTE'), 'internal: the users guard');
-- the watchman: every column that points to a person is classified — a new table must say what happens on deletion
select coalesce(string_agg(format('%s.%s', t, c), ', ' order by t, c), '') as t50_unclassified from (
  select distinct cl.relname::text t, a.attname::text c
    from pg_constraint k join pg_class cl on cl.oid = k.conrelid join pg_namespace n on n.oid = cl.relnamespace
    join lateral unnest(k.conkey) ck(attnum) on true join pg_attribute a on a.attrelid = k.conrelid and a.attnum = ck.attnum
   where k.contype = 'f' and k.confrelid in ('public.users'::regclass, 'public.memberships'::regclass) and n.nspname = 'public'
     and not (k.confrelid = 'public.memberships'::regclass and a.attname = 'company_id')
  union
  select distinct c.table_name::text, c.column_name::text from information_schema.columns c
   where c.table_schema = 'public' and c.data_type = 'uuid'
     and c.column_name ~ '(^|_)(user_id|actor_id|assignee_id|owner_user_id|signer_user_id|on_behalf_of_user_id)$|_by$'
) x
where c not in ('created_by', 'updated_by')   -- history of who wrote a row: kept, pointing to the anonymised person
  and format('%s.%s', t, c) not in (
    -- kept (business and legal records; the person reads as «Удалённый пользователь»)
    'activities.actor_id', 'audit_log.actor_id', 'audit_log.on_behalf_of_user_id', 'calendar_events.user_id',
    'email_outbox.requested_by', 'email_outbox.to_email_set_by', 'estimate_approvals.signer_user_id', 'estimates.owner_user_id',
    'invitations.invited_by', 'invitations.accepted_by', 'invoices.voided_by', 'leads.assigned_to', 'member_signatures.user_id',
    'memberships.user_id', 'memberships.invited_by', 'payments.received_by', 'payments.voided_by', 'status_events.actor_id',
    'tasks.assignee_id', 'tasks.done_by', 'visit_assignees.user_id', 'visits.cancelled_by',
    'visit_checklist_items.done_by', 'visit_checklist_items.na_by', 'visits.checklist_reviewed_by', 'legal_acceptance.user_id', 'users.id',
    -- erased (app.erase_personal_rows)
    'member_prefs.user_id', 'user_locations.user_id', 'push_devices.user_id', 'push_outbox.user_id', 'push_prefs.user_id',
    -- unlinked (set to null)
    'company_contacts.user_id', 'companies.lead_default_assignee_id') \gset
select tst.ok(:'t50_unclassified' = '', format('every person column is classified in T50 (kept / erased / unlinked): %s', :'t50_unclassified'));
-- and the other way: every entry of the lists still exists (no stale classification)
select coalesce(string_agg(e, ', '), '') as t50_stale from unnest(array[
    'activities.actor_id', 'audit_log.actor_id', 'audit_log.on_behalf_of_user_id', 'calendar_events.user_id',
    'email_outbox.requested_by', 'email_outbox.to_email_set_by', 'estimate_approvals.signer_user_id', 'estimates.owner_user_id',
    'invitations.invited_by', 'invitations.accepted_by', 'invoices.voided_by', 'leads.assigned_to', 'member_signatures.user_id',
    'memberships.user_id', 'memberships.invited_by', 'payments.received_by', 'payments.voided_by', 'status_events.actor_id',
    'tasks.assignee_id', 'tasks.done_by', 'visit_assignees.user_id', 'visits.cancelled_by',
    'visit_checklist_items.done_by', 'visit_checklist_items.na_by', 'visits.checklist_reviewed_by', 'legal_acceptance.user_id', 'users.id',
    'member_prefs.user_id', 'user_locations.user_id', 'company_contacts.user_id', 'companies.lead_default_assignee_id']) e
 where not exists (select 1 from information_schema.columns c where c.table_schema = 'public'
                     and format('%s.%s', c.table_name, c.column_name) = e) \gset
select tst.ok(:'t50_stale' = '', format('no stale entries in the T50 lists: %s', :'t50_stale'));
\echo 'T50 wave 7а-2a: account deletion (S22) ok'
-- T57 + S22 (security-check 7б-2): a person whose owner row is switched off, with the location notice mark — the
-- erasure of the mark must not trip the owner guard and roll the whole deletion back
:as_super
insert into auth.users (id, email, raw_user_meta_data) values ('a5700000-0000-4000-8000-000000000009', 'olddir57@b.test', '{"full_name":"Old Owner"}');
insert into public.memberships (company_id, user_id, role, status) values
  ('cb000000-0000-0000-0000-000000000000', 'a5700000-0000-4000-8000-000000000009', 'owner', 'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a5700000-0000-4000-8000-000000000009', 'tech', 'active');
update public.memberships set location_notice_ack_at = now() - interval '1 day' where user_id = 'a5700000-0000-4000-8000-000000000009';
update public.memberships set status = 'disabled' where user_id = 'a5700000-0000-4000-8000-000000000009' and company_id = 'cb000000-0000-0000-0000-000000000000';
reset role; set request.jwt.claim.sub = 'a5700000-0000-4000-8000-000000000009'; reset request.jwt.claims; set role authenticated;
select tst.fresh(2);
select tst.ok((public.delete_account('DELETE') ->> 'deleted')::boolean, 'a switched-off owner with a notice mark deletes the account');
:as_super
select tst.ok((select every(location_notice_ack_at is null and status = 'deleted') from public.memberships where user_id = 'a5700000-0000-4000-8000-000000000009'), 'the notice marks are gone in both companies');
\echo 'T57 + S22: deletion with a switched-off owner row and a notice mark ok'
:as_super
-- ---------------------------------------------------------------- T59: a row never moves to another company (security #2, 19 §7.1)
:as_super
-- (1) guard: every table with company_id, in every non-system schema, has the immutable trigger
do $$
declare missing text;
begin
  select string_agg(n.nspname || '.' || c.relname, ', ' order by 1) into missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
   where c.relkind in ('r', 'p')
     and n.nspname not in ('pg_catalog', 'information_schema', 'tst') and n.nspname not like 'pg\_%'
     -- exceptions, each with its reason:
     and (n.nspname, c.relname) not in (
       ('app', 'company_numbering'),   -- no API access; only app.next_document_number writes it, by company_id
       ('app', 'company_flags'))       -- no API access; the operator sets it by SQL (#196)
     and not exists (select 1 from pg_trigger t
                      where t.tgrelid = c.oid and not t.tgisinternal and t.tgenabled <> 'D'
                        and t.tgfoid = 'app.tg_company_id_immutable()'::regprocedure
                        and t.tgtype & 1 = 1      -- for each row
                        and t.tgtype & 2 = 2      -- before
                        and t.tgtype & 16 = 16);  -- update
  perform tst.ok(missing is null, 'every table with company_id keeps it immutable; missing: ' || coalesce(missing, '-'));
end $$;
-- fixture: owner_b also runs a second company (as an owner of two companies does)
insert into public.companies (id, name) values ('c5900000-0000-4000-8000-000000000000', 'T59 Second');
insert into public.memberships (company_id, user_id, role, status) values
  ('c5900000-0000-4000-8000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'owner', 'active');
-- (2) the EIN of one company does not move into the other (failed before: the row moved)
:as_owner_b
insert into public.company_secrets (company_id, ein) values ('cb000000-0000-0000-0000-000000000000', '98-7654321');
select tst.fails_like($q$update public.company_secrets set company_id = 'c5900000-0000-4000-8000-000000000000' where company_id = 'cb000000-0000-0000-0000-000000000000'$q$,
  '%company_id is immutable (company_secrets -)%', 'an owner of two companies does not move the EIN');
select tst.ok((select count(*) from public.company_secrets where company_id = 'cb000000-0000-0000-0000-000000000000') = 1, 'the EIN stays with its company');
update public.company_secrets set ein = '98-7654322' where company_id = 'cb000000-0000-0000-0000-000000000000';
select tst.ok((select ein from public.company_secrets where company_id = 'cb000000-0000-0000-0000-000000000000') = '98-7654322', 'the EIN is still edited in place');
-- (3) signatures: not moved; a former member does not touch his old signature (failed before: he revoked it)
insert into public.member_signatures (id, company_id, user_id, svg, name) values
  ('a5900000-0000-4000-8000-000000000001', 'c5900000-0000-4000-8000-000000000000', 'b0000000-0000-0000-0000-000000000001', '<svg/>', 'Owner B');
select tst.fails($q$update public.member_signatures set company_id = 'cb000000-0000-0000-0000-000000000000' where id = 'a5900000-0000-4000-8000-000000000001'$q$, 'a signature does not move to another company');
:as_super
update public.memberships set status = 'disabled' where company_id = 'c5900000-0000-4000-8000-000000000000' and user_id = 'b0000000-0000-0000-0000-000000000001';
:as_owner_b
select tst.blocked($q$update public.member_signatures set revoked_at = now() where id = 'a5900000-0000-4000-8000-000000000001'$q$, 'a former member does not change his old signature');
:as_super
select tst.ok((select revoked_at is null from public.member_signatures where id = 'a5900000-0000-4000-8000-000000000001'), 'the old signature is untouched');
update public.memberships set status = 'active' where company_id = 'c5900000-0000-4000-8000-000000000000' and user_id = 'b0000000-0000-0000-0000-000000000001';
-- (4) tables without an id column say the right thing (before: «record old has no field id» or a foreign key error)
select tst.fails_like($q$update public.customer_tags set company_id = 'cb000000-0000-0000-0000-000000000000' where company_id = 'ca000000-0000-0000-0000-000000000000'$q$,
  '%company_id is immutable (customer_tags -)%', 'customer_tags keep their company');
select tst.fails_like($q$update public.notifications set company_id = 'cb000000-0000-0000-0000-000000000000' where company_id = 'ca000000-0000-0000-0000-000000000000'$q$,
  '%company_id is immutable (notifications %', 'notifications keep their company (even for a server function)');
-- (5) Storage: an object is not renamed into another company (failed before: USING saw A, WITH CHECK saw B)
:as_owner_b
insert into storage.objects (bucket_id, name) values ('files', 'cb000000-0000-0000-0000-000000000000/f5900000-0000-4000-8000-000000000001.jpg');
select tst.blocked($q$update storage.objects set name = 'c5900000-0000-4000-8000-000000000000/f5900000-0000-4000-8000-000000000001.jpg' where name = 'cb000000-0000-0000-0000-000000000000/f5900000-0000-4000-8000-000000000001.jpg'$q$,
  'a staff member of two companies does not move a file between them');
select tst.blocked($q$update storage.objects set name = 'cb000000-0000-0000-0000-000000000000/f5900000-0000-4000-8000-000000000002.jpg' where name = 'cb000000-0000-0000-0000-000000000000/f5900000-0000-4000-8000-000000000001.jpg'$q$,
  'nor renames it to another file of the company');
insert into storage.objects (bucket_id, name) values ('files', 'cb000000-0000-0000-0000-000000000000/f5900000-0000-4000-8000-000000000001.jpg')
  on conflict (bucket_id, name) do update set updated_at = now();
select tst.ok((select updated_at is not null from storage.objects where name = 'cb000000-0000-0000-0000-000000000000/f5900000-0000-4000-8000-000000000001.jpg'), 'a repeat upload (upsert, same name) still works');
:as_super
select tst.ok((select count(*) from storage.objects where name like 'c5900000-0000-4000-8000-000000000000/%') = 0, 'nothing landed in the other company');
-- the snapshot check holds only while the app's roles cannot delete objects (files are deleted by the server)
select tst.ok(not exists (select 1 from pg_policy p where p.polrelid = 'storage.objects'::regclass and p.polcmd in ('d', '*')
                            and (p.polroles @> array['authenticated'::regrole::oid] or p.polroles @> array[0::oid] or p.polroles @> array['anon'::regrole::oid])),
              'no DELETE policy on storage.objects for the app''s roles');
\echo 'T59 a row never moves to another company ok'
-- ---------------------------------------------------------------- T60: our costs never reach the client page (security #2, 19 §7.2, audit item 8)
:as_owner_a
do $$
declare v_cust uuid; v_prop uuid; v_e uuid; v_v uuid;
begin
  insert into public.customers (company_id, display_name) values ('ca000000-0000-0000-0000-000000000000', 'T60 Client') returning id into v_cust;
  insert into public.properties (company_id, customer_id, address_line1, address_city) values ('ca000000-0000-0000-0000-000000000000', v_cust, '60 Cost St', 'Burbank') returning id into v_prop;
  insert into public.estimates (company_id, customer_id, property_id, title) values ('ca000000-0000-0000-0000-000000000000', v_cust, v_prop, 'T60 costs') returning id into v_e;
  -- what an old app, a module bug or a direct UPDATE could store: costs everywhere, a hidden BOM line, junk
  insert into public.estimate_versions (company_id, estimate_id, version_no, calc_inputs) values ('ca000000-0000-0000-0000-000000000000', v_e, 1, $j${
    "note": "Scope", "marginPct": "41.2", "internal": {"profit": 1},
    "options": [
      {"id": "o1", "name": "Standard", "recommended": true, "costCents": 5, "marginPct": "40", "lines": [
        {"id": "l1", "name": "Install", "description": "Labor", "group": "labor", "quantity": "2", "unit": "hr", "unitPriceCents": 9000,
         "unitCostCents": 4000, "catalogItemId": "cat-1", "vendor": "ABC Supply", "vendorTaxBps": 950, "markupBps": 3000, "purchaseTaxBps": 950,
         "optional": false, "selected": false, "clientVisible": true},
        {"id": "l2", "name": {"unitCostCents": 4000}, "group": "material", "quantity": 1, "unit": "ea", "unitPriceCents": 0,
         "clientVisible": false, "unitMaterialCostCents": 1234},
        {"id": "l3", "name": "Clean", "group": "service", "quantity": 1, "unit": "ea", "unitPriceCents": 9000, "optional": true, "selected": true, "unitCostCents": [1]},
        {"id": "l4", "name": "Hidden as text", "group": "material", "quantity": 1, "unit": "ea", "unitPriceCents": 0, "clientVisible": "false"},
        {"id": "l5", "name": "Hidden as zero", "group": "material", "quantity": 1, "unit": "ea", "unitPriceCents": 0, "clientVisible": 0},
        {"id": "l6", "name": "Bad price", "group": "service", "quantity": 1, "unit": "ea", "unitPriceCents": [1, 2]},
        {"id": "l7", "group": "service", "quantity": 1, "unit": "ea", "unitPriceCents": 100},
        "junk"
      ]},
      42
    ],
    "settings": {"caHic": true, "markup": 3000, "discount": {"kind": "fixed", "cents": 1000, "costShare": 1},
                 "tax": {"enabled": true, "rateBps": 950, "vendorTaxBps": 1, "groups": {"service": false, "labor": false, "material": true, "cost": true}},
                 "deposit": {"kind": "pct", "bps": 1000, "costBasis": 1}}
  }$j$::jsonb) returning id into v_v;
  update public.estimates set current_version_id = v_v where id = v_e;
  perform tst.set_token(v_e, 'tok_costs_0123456789abcdef');
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
do $$
declare d jsonb := public.portal_estimate('tok_costs_0123456789abcdef') -> 'doc';
begin
  -- failed before: the page gave the stored document as it is
  perform tst.ok(d = $j${
    "note": "Scope",
    "options": [
      {"id": "o1", "name": "Standard", "recommended": true, "lines": [
        {"id": "l1", "name": "Install", "description": "Labor", "group": "labor", "quantity": "2", "unit": "hr", "unitPriceCents": 9000,
         "optional": false, "selected": false},
        {"id": "l3", "name": "Clean", "group": "service", "quantity": 1, "unit": "ea", "unitPriceCents": 9000, "optional": true, "selected": true}
      ]}
    ],
    "settings": {"caHic": true, "discount": {"kind": "fixed", "cents": 1000},
                 "tax": {"enabled": true, "rateBps": 950, "groups": {"service": false, "labor": false, "material": true}},
                 "deposit": {"kind": "pct", "bps": 1000}}
  }$j$::jsonb, 'the client gets only the listed fields of the estimate: ' || coalesce(d::text, 'null'));
  perform tst.ok(d::text !~* '(cost|margin|markup|vendor|catalog|profit)', 'no cost, margin, markup, vendor or catalog word on the client page');
end $$;
-- a sent estimate is read through sent_version_id: the same cut
:as_super
update public.estimate_versions set locked_at = now(), sent_at = now() where id = (select current_version_id from public.estimates where title = 'T60 costs');
update public.estimates set status = 'sent', sent_version_id = current_version_id where title = 'T60 costs';
reset role; reset request.jwt.claim.sub; set role anon;
select tst.ok((public.portal_estimate('tok_costs_0123456789abcdef') -> 'doc')::text !~* 'cost' and
              jsonb_array_length(public.portal_estimate('tok_costs_0123456789abcdef') -> 'doc' -> 'options' -> 0 -> 'lines') = 2,
              'the sent version is cut the same way');
:as_super
-- the stored document: since 20261108130000 (19 §9, M1) an OPEN version never keeps a line's unitCostCents (an assigned
-- tech reads calc_inputs; the app's costs live in estimate_line_costs) — the rest of the line stays as it was stored
select tst.ok((select calc_inputs -> 'options' -> 0 -> 'lines' -> 0 from public.estimate_versions v
                 join public.estimates e on e.current_version_id = v.id where e.title = 'T60 costs')
              = $j${"id": "l1", "name": "Install", "description": "Labor", "group": "labor", "quantity": "2", "unit": "hr", "unitPriceCents": 9000,
                   "catalogItemId": "cat-1", "vendor": "ABC Supply",
                   "optional": false, "selected": false, "clientVisible": true}$j$::jsonb,
              'T100 the stored open document has no line cost, supplier tax or markup, the rest is kept');
select tst.ok(not jsonb_path_exists((select calc_inputs from public.estimate_versions v join public.estimates e on e.current_version_id = v.id
                                      where e.title = 'T60 costs'), '$.options[*].lines[*].unitCostCents'), 'T100 no line of it keeps unitCostCents');
select tst.ok(app.client_doc(null) is null and app.client_doc('"x"') is null and app.client_doc('{}') = '{"options": []}', 'odd documents give nothing or an empty one');
-- rule 18: only the page function (security definer) calls them
select tst.ok(not has_function_privilege('anon', 'app.client_doc(jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'app.client_doc(jsonb)', 'execute')
          and not has_function_privilege('anon', 'app.jsonb_scalars(jsonb, text[])', 'execute')
          and not has_function_privilege('authenticated', 'app.jsonb_scalars(jsonb, text[])', 'execute'), 'nobody calls the cutters directly');
\echo 'T60 our costs never reach the client page ok'
-- ---------------------------------------------------------------- T61: foreign keys have indexes, none is invalid (security #2, 19 §7.3, audit item 11)
:as_super
do $$
declare missing text; bad text;
begin
  select string_agg(x.tbl || '(' || x.cols || ')', ', ' order by 1) into missing
    from (select c.conrelid::regclass::text tbl, c.conrelid, c.conkey,
                 (select string_agg(a.attname, ',' order by k.ord) from unnest(c.conkey) with ordinality k(n, ord)
                    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n) cols
            from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
           where c.contype = 'f' and n.nspname = 'public') x
   where not exists (select 1 from pg_index i where i.indrelid = x.conrelid and i.indisvalid
                        -- a partial index helps the key check only when its condition is «<the key column> IS NOT NULL»
                        and (i.indpred is null or exists (select 1 from unnest(string_to_array(x.cols, ',')) k(col)
                              where pg_get_expr(i.indpred, i.indrelid) = '(' || quote_ident(k.col) || ' IS NOT NULL)'))
                        and (i.indkey::int2[])[0:cardinality(x.conkey) - 1] @> x.conkey
                        and (i.indkey::int2[])[0:cardinality(x.conkey) - 1] <@ x.conkey)
     and (x.tbl, x.cols) not in (
       -- the parent is never deleted and its id never changes (soft delete, append-only or a guard trigger) —
       -- until a company is deleted for real (CCPA, S22): that PR adds these indexes first (19 §7.3)
       ('lead_sources', 'company_id,customer_id'), ('customers', 'company_id,lead_source_id'),
       ('customers', 'company_id,merged_into_customer_id'), ('customers', 'company_id,primary_contact_id'),
       ('leads', 'company_id,duplicate_of_lead_id'), ('leads', 'company_id,referred_from_visit_id'),
       ('jobs', 'company_id,attributed_source_id'), ('job_line_items', 'company_id,catalog_item_id'),
       ('estimate_approvals', 'company_id,member_signature_id'), ('service_categories', 'company_id,parent_id'),
       -- estimate versions: locked versions are never deleted (t40); one current / sent pointer per estimate
       ('estimates', 'company_id,current_version_id'), ('estimates', 'company_id,sent_version_id'),
       ('estimate_versions', 'company_id,copied_from_version_id'), ('jobs', 'company_id,approved_version_id'),
       ('invoices', 'company_id,source_estimate_version_id'));
  perform tst.ok(missing is null, 'every foreign key has an index or a reason; missing: ' || coalesce(missing, '-'));
  select string_agg(i.indexrelid::regclass::text, ', ') into bad from pg_index i
    join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname not in ('pg_catalog', 'information_schema') and not i.indisvalid;
  perform tst.ok(bad is null, 'no invalid index (a failed concurrent build): ' || coalesce(bad, '-'));
  perform tst.ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'tasks_assignee_id_fk_idx'), 'the audit''s examples are indexed (tasks.assignee_id)');
end $$;
\echo 'T61 foreign keys have indexes ok'

-- ---------------------------------------------------------------- T62: wave 6-2 — calls (docs/specs/20 §3, §8)
-- The app never sends a call without an outcome (unit test calls.test.ts); old versions still may, so the server keeps
-- counting such a call as answered (rule 16). Here: that behaviour is fixed, a missed call keeps the lead «new»,
-- minutes / person / note are kept, the tech writes on his job and lead but not on a client.
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values ('c6200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T62 Client');
  insert into public.contacts (id, company_id, customer_id, name, is_primary) values
    ('c6210000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c6200000-0000-4000-8000-000000000001', 'T62 Mary', true);
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
    ('d6200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c6200000-0000-4000-8000-000000000001', '62 Call St', 'Pasadena');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values
    ('e6200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T62 job', 'c6200000-0000-4000-8000-000000000001', 'd6200000-0000-4000-8000-000000000001', 'draft');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values
    ('e6200000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T62 old job', 'c6200000-0000-4000-8000-000000000001', 'd6200000-0000-4000-8000-000000000001', 'draft'),
    ('e6200000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'T62 cancelled visit job', 'c6200000-0000-4000-8000-000000000001', 'd6200000-0000-4000-8000-000000000001', 'draft');
  insert into public.visits (id, company_id, job_id, starts_at) values
    ('f6200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e6200000-0000-4000-8000-000000000001', now() + interval '1 day'),
    ('f6200000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'e6200000-0000-4000-8000-000000000002', now() - interval '20 days'),
    ('f6200000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'e6200000-0000-4000-8000-000000000003', now() + interval '2 days');
  -- the tech is on an old visit (20 days ago) and on a visit cancelled below: neither opens its job
  insert into public.visit_assignees (company_id, visit_id, user_id) values
    ('ca000000-0000-0000-0000-000000000000', 'f6200000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000003'),
    ('ca000000-0000-0000-0000-000000000000', 'f6200000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000003');
  perform public.cancel_visit('f6200000-0000-4000-8000-000000000003', 'we_cancelled');
end $$;
select tst.ok((public.assign_visit('f6200000-0000-4000-8000-000000000001', array['a0000000-0000-0000-0000-000000000003']::uuid[]) ->> 'added')::int = 1, 'T62 the tech is on the visit');
insert into public.leads (id, company_id, source_id, contact_name, phone, assigned_to) values
  ('16200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T62 missed', '+13235556201', null),
  ('16200000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T62 old app', '+13235556202', null),
  ('16200000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T62 tech lead', '+13235556203', 'a0000000-0000-0000-0000-000000000003'),
  ('16200000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T62 not his', '+13235556204', null);
insert into public.activities (company_id, subject_type, subject_id, kind, direction, meta) values
  ('ca000000-0000-0000-0000-000000000000', 'lead', '16200000-0000-4000-8000-000000000001', 'call', 'out', '{"outcome":"no_answer","duration_min":"1"}');
select tst.ok((select status = 'new' and first_response_at is null and call_attempts = 1 from public.leads where id = '16200000-0000-4000-8000-000000000001'),
  'a call «не ответил» keeps the lead new: one attempt, the reply timer runs');
insert into public.activities (company_id, subject_type, subject_id, kind, direction) values
  ('ca000000-0000-0000-0000-000000000000', 'lead', '16200000-0000-4000-8000-000000000002', 'call', 'out');
select tst.ok((select status = 'contacted' and first_response_at is not null from public.leads where id = '16200000-0000-4000-8000-000000000002'),
  'a call without an outcome (an old app) still counts as answered — kept for old versions, the new app always sends one');
insert into public.activities (company_id, subject_type, subject_id, kind, direction, contact_id, body, meta) values
  ('ca000000-0000-0000-0000-000000000000', 'customer', 'c6200000-0000-4000-8000-000000000001', 'call', 'out', 'c6210000-0000-4000-8000-000000000001', 'T62 client call', '{"outcome":"answered","duration_min":"7"}');
select tst.ok((select meta ->> 'duration_min' = '7' and meta ->> 'outcome' = 'answered' and contact_id = 'c6210000-0000-4000-8000-000000000001'
                 and actor_id = 'a0000000-0000-0000-0000-000000000001' from public.activities where body = 'T62 client call'),
  'the office logs a call on a client: outcome, minutes, the person, in its own name');
:as_tech_a
insert into public.activities (company_id, subject_type, subject_id, kind, direction, contact_id, body, meta) values
  ('ca000000-0000-0000-0000-000000000000', 'job', 'e6200000-0000-4000-8000-000000000001', 'call', 'out', 'c6210000-0000-4000-8000-000000000001', 'T62 tech job call', '{"outcome":"voicemail","duration_min":"2"}');
select tst.ok(tst.cnt($q$select 1 from public.activities where body = 'T62 tech job call'$q$) = 1, 'the tech logs a call on the job of his visit and sees it');
insert into public.activities (company_id, subject_type, subject_id, kind, direction, body, meta) values
  ('ca000000-0000-0000-0000-000000000000', 'lead', '16200000-0000-4000-8000-000000000003', 'call', 'out', 'T62 tech lead call', '{"outcome":"answered"}');
select tst.ok(tst.cnt($q$select 1 from public.activities where body = 'T62 tech lead call'$q$) = 1, 'the tech logs a call on his own lead');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, direction, body, meta) values ('ca000000-0000-0000-0000-000000000000', 'customer', 'c6200000-0000-4000-8000-000000000001', 'call', 'out', 'T62 x', '{"outcome":"answered"}')$q$,
  'the tech does not write a call on a client (only on his job or lead)');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, direction, body, meta) values ('ca000000-0000-0000-0000-000000000000', 'lead', '16200000-0000-4000-8000-000000000004', 'call', 'out', 'T62 y', '{"outcome":"answered"}')$q$,
  'the tech does not write a call on a lead that is not his');
select tst.ok(tst.cnt($q$select 1 from public.activities where body = 'T62 client call'$q$) = 1, 'the tech sees the calls on the client of his visit');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, direction, body, meta) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e6200000-0000-4000-8000-000000000002', 'call', 'out', 'T62 old', '{"outcome":"answered"}')$q$,
  'the tech does not write a call on the job of a visit older than 14 days (the app does not offer it either)');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, direction, body, meta) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e6200000-0000-4000-8000-000000000003', 'call', 'out', 'T62 cancelled', '{"outcome":"answered"}')$q$,
  'the tech does not write a call on the job of a cancelled visit');
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.activities where body like 'T62 %'$q$) = 0, 'another company sees none of the calls');
:as_super
select tst.ok((select status = 'contacted' from public.leads where id = '16200000-0000-4000-8000-000000000003'), 'his answered call moved his new lead (S2)');
\echo 'T62 calls: outcome, minutes, person; the tech on his job and lead only ok'

-- ---------------------------------------------------------------- T63: wave 6-3 — messages (docs/specs/20 «6-3»)
-- An SMS / email opened in the phone's app is an outgoing event (kind sms | email, direction out); the tech writes it on
-- the job of his visit and on his own lead, never on a client or someone else's lead; another company sees none.
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values ('c6300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T63 Client');
  insert into public.contacts (id, company_id, customer_id, name, is_primary) values
    ('c6310000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c6300000-0000-4000-8000-000000000001', 'T63 Ana', true);
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
    ('d6300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c6300000-0000-4000-8000-000000000001', '63 Text St', 'Pasadena');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values
    ('e6300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T63 job', 'c6300000-0000-4000-8000-000000000001', 'd6300000-0000-4000-8000-000000000001', 'draft');
  insert into public.visits (id, company_id, job_id, starts_at) values
    ('f6300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e6300000-0000-4000-8000-000000000001', now() + interval '1 day');
  insert into public.customers (id, company_id, display_name) values ('c6300000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T63 Other');
  insert into public.contacts (id, company_id, customer_id, name, is_primary) values
    ('c6310000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c6300000-0000-4000-8000-000000000002', 'T63 Otto', true);
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
    ('d6300000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c6300000-0000-4000-8000-000000000002', '63 Other St', 'Pasadena');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values
    ('e6300000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T63 not his job', 'c6300000-0000-4000-8000-000000000002', 'd6300000-0000-4000-8000-000000000002', 'draft');
  insert into public.leads (id, company_id, source_id, contact_name, phone, assigned_to) values
    ('16300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T63 tech lead', '+13235556301', 'a0000000-0000-0000-0000-000000000003'),
    ('16300000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T63 not his', '+13235556302', null);
end $$;
select tst.ok((public.assign_visit('f6300000-0000-4000-8000-000000000001', array['a0000000-0000-0000-0000-000000000003']::uuid[]) ->> 'added')::int = 1, 'T63 the tech is on the visit');
insert into public.activities (company_id, subject_type, subject_id, kind, direction, contact_id, body) values
  ('ca000000-0000-0000-0000-000000000000', 'customer', 'c6300000-0000-4000-8000-000000000001', 'sms', 'out', 'c6310000-0000-4000-8000-000000000001', 'T63 office sms');
insert into public.activities (company_id, subject_type, subject_id, kind, direction, body) values
  ('ca000000-0000-0000-0000-000000000000', 'customer', 'c6300000-0000-4000-8000-000000000002', 'sms', 'out', 'T63 other client sms'),
  ('ca000000-0000-0000-0000-000000000000', 'lead', '16300000-0000-4000-8000-000000000002', 'sms', 'out', 'T63 other lead sms');
select tst.ok((select kind = 'sms' and direction = 'out' and contact_id = 'c6310000-0000-4000-8000-000000000001' and actor_id = 'a0000000-0000-0000-0000-000000000001'
                 from public.activities where body = 'T63 office sms'), 'the office writes an SMS on a client: sms, out, the person, in its own name');
:as_tech_a
insert into public.activities (company_id, subject_type, subject_id, kind, direction, contact_id, body) values
  ('ca000000-0000-0000-0000-000000000000', 'job', 'e6300000-0000-4000-8000-000000000001', 'sms', 'out', 'c6310000-0000-4000-8000-000000000001', 'T63 tech job sms');
insert into public.activities (company_id, subject_type, subject_id, kind, direction, body) values
  ('ca000000-0000-0000-0000-000000000000', 'job', 'e6300000-0000-4000-8000-000000000001', 'email', 'out', 'T63 tech job email');
insert into public.activities (company_id, subject_type, subject_id, kind, direction, body) values
  ('ca000000-0000-0000-0000-000000000000', 'lead', '16300000-0000-4000-8000-000000000001', 'sms', 'out', 'T63 tech lead sms');
select tst.ok(tst.cnt($q$select 1 from public.activities where body in ('T63 tech job sms', 'T63 tech job email', 'T63 tech lead sms') and direction = 'out'$q$) = 3,
  'the tech writes SMS and email on the job of his visit and on his own lead, and sees them');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, direction, body) values ('ca000000-0000-0000-0000-000000000000', 'customer', 'c6300000-0000-4000-8000-000000000001', 'sms', 'out', 'T63 x')$q$,
  'the tech does not write a message on a client');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, direction, body) values ('ca000000-0000-0000-0000-000000000000', 'lead', '16300000-0000-4000-8000-000000000002', 'email', 'out', 'T63 y')$q$,
  'the tech does not write a message on a lead that is not his');
select tst.ok(tst.cnt($q$select 1 from public.activities where body = 'T63 office sms'$q$) = 1, 'the tech sees the messages on the client of his visit');
-- #227 review: the tech does not see messages about another client / a lead not his; does not write on a job without his
-- visit; does not put a person of another client on his job's message (the same rule as calls: T39, T62)
select tst.ok(tst.cnt($q$select 1 from public.activities where body in ('T63 other client sms', 'T63 other lead sms')$q$) = 0, 'the tech does not see messages about another client or a lead not his');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, direction, body) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e6300000-0000-4000-8000-000000000002', 'sms', 'out', 'T63 z')$q$,
  'the tech does not write a message on a job without his visit');
select tst.fails($q$insert into public.activities (company_id, subject_type, subject_id, kind, direction, contact_id, body) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e6300000-0000-4000-8000-000000000001', 'sms', 'out', 'c6310000-0000-4000-8000-000000000002', 'T63 w')$q$,
  'the tech does not name a person of another client on his job''s message');
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.activities where body like 'T63 %'$q$) = 0, 'another company sees none of the messages');
:as_super
select tst.ok((select status = 'contacted' from public.leads where id = '16300000-0000-4000-8000-000000000001'), 'an SMS to his new lead is the first answer (S2)');
\echo 'T63 messages: sms / email out; the tech on his job and lead only ok'

-- ---------------------------------------------------------------- T64: the stub gives no rights Supabase does not (docs/specs/21 §5)
-- serverCatalog.test.ts trusts has_function_privilege of this database: a function created now (as postgres, like a
-- migration) with no grant must not be callable by anon or authenticated, and PUBLIC must not have it (rule 18, T52);
-- an explicit grant to authenticated gives it to authenticated only.
:as_super
create function public.t64_probe(p_a uuid) returns int language sql as $$ select 1 $$;
select tst.ok(not has_function_privilege('authenticated', 'public.t64_probe(uuid)', 'EXECUTE'), 'T64 a new function: no EXECUTE for authenticated without a grant');
select tst.ok(not has_function_privilege('anon', 'public.t64_probe(uuid)', 'EXECUTE'), 'T64 a new function: no EXECUTE for anon');
select tst.ok(not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                          where p.oid = 'public.t64_probe(uuid)'::regprocedure and x.grantee = 0 and x.privilege_type = 'EXECUTE'), 'T64 a new function: no EXECUTE for PUBLIC');
grant execute on function public.t64_probe(uuid) to authenticated;
select tst.ok(has_function_privilege('authenticated', 'public.t64_probe(uuid)', 'EXECUTE')
              and not has_function_privilege('anon', 'public.t64_probe(uuid)', 'EXECUTE'), 'T64 a grant to authenticated gives it to authenticated only');
drop function public.t64_probe(uuid);
\echo 'T64 the stub: a new function has no EXECUTE without a grant ok'

-- ---------------------------------------------------------------- T67: wave 6-4 — the tech's task on his own job (docs/specs/20 §6-4)
-- tasks_insert (20261107010000): a job of his live visit (tech_visit_counts) — yes; a job without his visit, a job of a
-- visit older than 14 days — no. He sees and marks his own task; he does not move it to another job (tg_task_guard);
-- the office's task on that job stays hidden from him.
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values ('c6700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T67 Client');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
    ('d6700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c6700000-0000-4000-8000-000000000001', '67 Task St', 'Pasadena');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values
    ('e6700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T67 his job', 'c6700000-0000-4000-8000-000000000001', 'd6700000-0000-4000-8000-000000000001', 'draft'),
    ('e6700000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T67 not his job', 'c6700000-0000-4000-8000-000000000001', 'd6700000-0000-4000-8000-000000000001', 'draft'),
    ('e6700000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'T67 old job', 'c6700000-0000-4000-8000-000000000001', 'd6700000-0000-4000-8000-000000000001', 'draft'),
    ('e6700000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'T67 job to cancel', 'c6700000-0000-4000-8000-000000000001', 'd6700000-0000-4000-8000-000000000001', 'draft');
  insert into public.visits (id, company_id, job_id, starts_at) values
    ('f6700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e6700000-0000-4000-8000-000000000001', now() + interval '1 day'),
    ('f6700000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'e6700000-0000-4000-8000-000000000002', now() + interval '1 day'),
    ('f6700000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'e6700000-0000-4000-8000-000000000003', now() - interval '20 days'),
    ('f6700000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'e6700000-0000-4000-8000-000000000004', now() + interval '2 days');
  insert into public.visit_assignees (company_id, visit_id, user_id) values
    ('ca000000-0000-0000-0000-000000000000', 'f6700000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000003'),
    ('ca000000-0000-0000-0000-000000000000', 'f6700000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000003'),
    ('ca000000-0000-0000-0000-000000000000', 'f6700000-0000-4000-8000-000000000004', 'a0000000-0000-0000-0000-000000000003');
end $$;
insert into public.tasks (company_id, subject_type, subject_id, title) values
  ('ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T67 office task');
:as_tech_a
insert into public.tasks (company_id, subject_type, subject_id, title) values
  ('ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T67 buy brackets');
select tst.ok(tst.cnt($q$select 1 from public.tasks where title = 'T67 buy brackets' and created_by = 'a0000000-0000-0000-0000-000000000003'$q$) = 1,
  'T67 the tech adds a task to the job of his visit and sees it');
select tst.fails($q$insert into public.tasks (company_id, subject_type, subject_id, title) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000002', 'T67 x')$q$,
  'the tech does not add a task to a job without his visit');
select tst.fails($q$insert into public.tasks (company_id, subject_type, subject_id, title) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000003', 'T67 y')$q$,
  'the tech does not add a task to the job of a visit older than 14 days');
update public.tasks set done_at = now() where title = 'T67 buy brackets';
select tst.ok(tst.cnt($q$select 1 from public.tasks where title = 'T67 buy brackets' and done_at is not null$q$) = 1, 'he marks his task done');
select tst.fails($q$update public.tasks set subject_id = 'e6700000-0000-4000-8000-000000000002' where title = 'T67 buy brackets'$q$,
  'he does not move his task to another job');
select tst.ok(tst.cnt($q$select 1 from public.tasks where title = 'T67 office task'$q$) = 0, 'the office''s task on his job stays hidden (only his own)');
:as_tech2_a
select tst.ok(tst.cnt($q$select 1 from public.tasks where title like 'T67 %'$q$) = 0, 'another tech sees none of them');
select tst.fails($q$insert into public.tasks (company_id, subject_type, subject_id, title) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T67 z')$q$,
  'another tech does not add a task to that job');
-- security review: taken off the visit, the job cancelled, the row put under another company — no
select tst.fails($q$insert into public.tasks (company_id, subject_type, subject_id, title) values ('cb000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T67 b')$q$,
  'the tech does not put a task on his job under another company');
:as_super
update public.visit_assignees set deleted_at = now() where visit_id = 'f6700000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-0000-0000-000000000003';
:as_tech_a
select tst.fails($q$insert into public.tasks (company_id, subject_type, subject_id, title) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T67 off')$q$,
  'taken off the visit: no new task on that job');
select tst.ok(tst.cnt($q$select 1 from public.tasks where title = 'T67 buy brackets'$q$) = 1, 'his own task stays his (the author)');
:as_super
update public.visit_assignees set deleted_at = null where visit_id = 'f6700000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-0000-0000-000000000003';
:as_tech_a
insert into public.tasks (company_id, subject_type, subject_id, title) values
  ('ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000004', 'T67 before the cancel');
:as_super
update public.jobs set status = 'cancelled' where id = 'e6700000-0000-4000-8000-000000000004';
:as_tech_a
select tst.fails($q$insert into public.tasks (company_id, subject_type, subject_id, title) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000004', 'T67 c')$q$,
  'the job cancelled: no new task on it (one was allowed before)');
\echo 'T67 the tech: a task on the job of his live visit only; sees and marks his own ok'

-- ---------------------------------------------------------------- T68: the tech's job task — the office, another company, off the team
:as_office_a
select tst.ok(tst.cnt($q$select 1 from public.tasks where title in ('T67 buy brackets', 'T67 office task')$q$) = 2, 'T68 the office sees the tech''s task and its own');
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.tasks where title like 'T67 %'$q$) = 0, 'another company sees none of them');
select tst.fails($q$insert into public.tasks (company_id, subject_type, subject_id, title) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T68 planted')$q$,
  'another company does not plant a task on our job');
select tst.fails($q$insert into public.tasks (company_id, subject_type, subject_id, title) values ('cb000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T68 planted')$q$,
  'nor under its own company');
-- off the team (switched off): no task of his any more, no new one on the job he was on
:as_super
update public.memberships set status = 'disabled' where user_id = 'a0000000-0000-0000-0000-000000000003' and company_id = 'ca000000-0000-0000-0000-000000000000';
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.tasks where title = 'T67 buy brackets'$q$) = 0, 'switched off: he does not see his task any more');
select tst.fails($q$insert into public.tasks (company_id, subject_type, subject_id, title) values ('ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T68 off')$q$,
  'switched off: no new task on his job');
:as_super
update public.memberships set status = 'active' where user_id = 'a0000000-0000-0000-0000-000000000003' and company_id = 'ca000000-0000-0000-0000-000000000000';
\echo 'T68 the tech''s job task: the office sees it, another company and a switched-off tech do not ok'
-- ---------------------------------------------------------------- T69: 3b-2 — the own lines of a job never bring its total below what is invoiced
-- (migration 20261107020000, engine jobLinesBelowInvoiced; test prices)
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values ('c6900000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T69 Home');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
    ('d6900000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c6900000-0000-4000-8000-000000000001', '69 Home St', 'Pasadena');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status, tax_enabled, tax_rate_bps) values
    ('e6900000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T69 lines', 'c6900000-0000-4000-8000-000000000001', 'd6900000-0000-4000-8000-000000000001', 'draft', true, 1000);
end $$;
:as_office_a
insert into public.job_line_items (id, company_id, job_id, position, name, quantity, unit_price_cents, taxable) values
  ('a6900000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e6900000-0000-4000-8000-000000000001', 0, 'T69 labor', 2, 20000, false),
  ('a6900000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'e6900000-0000-4000-8000-000000000001', 1, 'T69 part', 1, 10000, true);
select tst.ok((select contract_total_cents from public.jobs where id = 'e6900000-0000-4000-8000-000000000001') = 51000, 'job total 40000 + 10000 + tax 1000');
-- a draft is not issued (the app does not load it): it does not hold the total
insert into public.invoices (id, company_id, customer_id, job_id, kind, total_cents) values
  ('06900000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'c6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001', 'progress', 999999);
select tst.ok((select status from public.invoices where id = '06900000-0000-4000-8000-000000000003') = 'draft', 'the big invoice is a draft');
insert into public.invoices (id, company_id, customer_id, job_id, kind, status, total_cents) values
  ('06900000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000001', 'progress', 'sent', 50500);
select tst.fails($q$update public.job_line_items set deleted_at = now() where id = 'a6900000-0000-4000-8000-000000000002'$q$, 'removing a line below what is invoiced is refused');
select tst.fails($q$update public.job_line_items set quantity = 1 where id = 'a6900000-0000-4000-8000-000000000001'$q$, 'a smaller quantity below what is invoiced is refused');
select tst.fails($q$update public.jobs set tax_enabled = false where id = 'e6900000-0000-4000-8000-000000000001'$q$, 'the tax switched off below what is invoiced is refused');
select tst.ok((select contract_total_cents from public.jobs where id = 'e6900000-0000-4000-8000-000000000001') = 51000, 'the total stays after the refusals');
select tst.ok(tst.cnt($q$select 1 from public.job_line_items where job_id = 'e6900000-0000-4000-8000-000000000001' and deleted_at is null$q$) = 2, 'the refused removal rolled back');
-- down to exactly what is invoiced: fine; more lines: fine
update public.job_line_items set unit_price_cents = 19800 where id = 'a6900000-0000-4000-8000-000000000001';
select tst.ok((select contract_total_cents from public.jobs where id = 'e6900000-0000-4000-8000-000000000001') = 50600, 'lower but above what is invoiced is fine');
select tst.fails($q$update public.job_line_items set unit_price_cents = 19700 where id = 'a6900000-0000-4000-8000-000000000001'$q$, 'two dollars less crosses the floor');
update public.job_line_items set unit_price_cents = 22500 where id = 'a6900000-0000-4000-8000-000000000001';
select tst.ok((select contract_total_cents from public.jobs where id = 'e6900000-0000-4000-8000-000000000001') = 56000, 'raising the total is fine');
-- a lower tax rate counts the same: 39600 + 10000 + 1000 = 50600, rate 0 → 49600 < 50500
update public.job_line_items set unit_price_cents = 19800 where id = 'a6900000-0000-4000-8000-000000000001';
select tst.fails($q$update public.jobs set tax_rate_bps = 0 where id = 'e6900000-0000-4000-8000-000000000001'$q$, 'a lower tax rate below what is invoiced is refused');
update public.job_line_items set unit_price_cents = 22500 where id = 'a6900000-0000-4000-8000-000000000001';
-- old data: a job already invoiced above its total still takes changes that do not lower the total
:as_super
do $$ begin
  insert into public.jobs (id, company_id, title, customer_id, property_id, status, contract_total_cents) values
    ('e6900000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T69 old', 'c6900000-0000-4000-8000-000000000001', 'd6900000-0000-4000-8000-000000000001', 'draft', 10000);
  insert into public.invoices (id, company_id, customer_id, job_id, kind, status, total_cents) values
    ('06900000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c6900000-0000-4000-8000-000000000001', 'e6900000-0000-4000-8000-000000000002', 'final', 'sent', 20000);
end $$;
:as_office_a
update public.jobs set title = 'T69 old renamed', description = 'still fine' where id = 'e6900000-0000-4000-8000-000000000002';
select tst.ok((select title from public.jobs where id = 'e6900000-0000-4000-8000-000000000002') = 'T69 old renamed', 'old data over-invoiced: an edit that keeps the total passes');
-- and its total may go up even while still below what is invoiced (10000 → 15000 < 20000): only going down is refused
insert into public.job_line_items (id, company_id, job_id, position, name, quantity, unit_price_cents) values
  ('a6900000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'e6900000-0000-4000-8000-000000000002', 0, 'T69 old line', 1, 15000);
select tst.ok((select contract_total_cents from public.jobs where id = 'e6900000-0000-4000-8000-000000000002') = 15000, 'over-invoiced: the total goes up');
select tst.fails($q$update public.job_line_items set unit_price_cents = 14000 where id = 'a6900000-0000-4000-8000-000000000003'$q$, 'over-invoiced: and does not go down again');
-- a void invoice does not count
:as_super
update public.invoices set status = 'void', void_reason = 'T69 test', voided_at = now() where id = '06900000-0000-4000-8000-000000000001';
:as_office_a
update public.job_line_items set deleted_at = now() where id = 'a6900000-0000-4000-8000-000000000002';
select tst.ok((select contract_total_cents from public.jobs where id = 'e6900000-0000-4000-8000-000000000001') = 45000, 'with the invoice void the line can go');
:as_super
select tst.ok(not has_function_privilege('authenticated', 'app.tg_job_total_floor()', 'execute'), 'the trigger function is not callable');
\echo 'T69 job lines never go below what is invoiced ok'

-- ---------------------------------------------------------------- T78: S26 — outside the office a task is assigned only to oneself
-- (migration 20261107060000, docs/specs/23 §5): the tech on the job of his live visit (T67 data). Another person as the
-- assignee becomes himself on insert and stays as it was on a change — not a refusal (older app versions); the office
-- assigns anyone. An upsert of an existing office task (marking it done) keeps its assignee.
:as_tech_a
insert into public.tasks (id, company_id, subject_type, subject_id, title, assignee_id) values
  ('17800000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T78 for tech2', 'a0000000-0000-0000-0000-000000000004'),
  ('17800000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T78 mine', 'a0000000-0000-0000-0000-000000000003'),
  ('17800000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T78 nobody', null);
select tst.ok((select assignee_id from public.tasks where id = '17800000-0000-4000-8000-000000000001') = 'a0000000-0000-0000-0000-000000000003',
  'T78 the tech inserts a task «for tech2»: it is his');
select tst.ok((select assignee_id from public.tasks where id = '17800000-0000-4000-8000-000000000002') = 'a0000000-0000-0000-0000-000000000003', 'his own: his');
select tst.ok((select assignee_id from public.tasks where id = '17800000-0000-4000-8000-000000000003') is null, 'nobody: nobody');
update public.tasks set assignee_id = 'a0000000-0000-0000-0000-000000000004' where id = '17800000-0000-4000-8000-000000000002';
select tst.ok((select assignee_id from public.tasks where id = '17800000-0000-4000-8000-000000000002') = 'a0000000-0000-0000-0000-000000000003',
  'the author does not hand his task to another person (the assignee stays)');
update public.tasks set assignee_id = null where id = '17800000-0000-4000-8000-000000000002';
select tst.ok((select assignee_id from public.tasks where id = '17800000-0000-4000-8000-000000000002') is null, 'he may leave it to nobody');
update public.tasks set assignee_id = 'a0000000-0000-0000-0000-000000000003' where id = '17800000-0000-4000-8000-000000000002';
select tst.ok((select assignee_id from public.tasks where id = '17800000-0000-4000-8000-000000000002') = 'a0000000-0000-0000-0000-000000000003', 'and take it back');
-- the app's task.save is an upsert: the same, through on conflict
insert into public.tasks (id, company_id, subject_type, subject_id, title, assignee_id) values
  ('17800000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T78 mine', 'a0000000-0000-0000-0000-000000000004')
  on conflict (id) do update set assignee_id = excluded.assignee_id;
select tst.ok((select assignee_id from public.tasks where id = '17800000-0000-4000-8000-000000000002') = 'a0000000-0000-0000-0000-000000000003',
  'an upsert does not hand it to another person either');
-- the office assigns anyone; the tech marks the office's task on his property done (upsert) — its assignee stays
:as_office_a
insert into public.tasks (id, company_id, subject_type, subject_id, title, assignee_id) values
  ('17800000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'property', 'd6700000-0000-4000-8000-000000000001', 'T78 office for tech2', 'a0000000-0000-0000-0000-000000000004');
select tst.ok((select assignee_id from public.tasks where id = '17800000-0000-4000-8000-000000000004') = 'a0000000-0000-0000-0000-000000000004', 'the office assigns another person');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.tasks where id = '17800000-0000-4000-8000-000000000004'$q$) = 1, 'the tech sees the task of a property he is at');
insert into public.tasks (id, company_id, subject_type, subject_id, title, assignee_id, done_at) values
  ('17800000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'property', 'd6700000-0000-4000-8000-000000000001', 'T78 office for tech2', 'a0000000-0000-0000-0000-000000000004', now())
  on conflict (id) do update set done_at = excluded.done_at, assignee_id = excluded.assignee_id;
select tst.ok((select assignee_id from public.tasks where id = '17800000-0000-4000-8000-000000000004') = 'a0000000-0000-0000-0000-000000000004'
  and (select done_at from public.tasks where id = '17800000-0000-4000-8000-000000000004') is not null,
  'he marks it done through the upsert; the office''s assignee stays');
-- security-check M1: not the author, he sends another assignee (himself / nobody) with «done» in one upsert — not refused
-- (t05 would refuse it; t04 puts the assignee back first), the done mark is saved, the assignee stays the office's
update public.tasks set done_at = null where id = '17800000-0000-4000-8000-000000000004';
insert into public.tasks (id, company_id, subject_type, subject_id, title, assignee_id, done_at) values
  ('17800000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'property', 'd6700000-0000-4000-8000-000000000001', 'T78 office for tech2', 'a0000000-0000-0000-0000-000000000003', now())
  on conflict (id) do update set done_at = excluded.done_at, assignee_id = excluded.assignee_id;
select tst.ok((select assignee_id from public.tasks where id = '17800000-0000-4000-8000-000000000004') = 'a0000000-0000-0000-0000-000000000004'
  and (select done_at from public.tasks where id = '17800000-0000-4000-8000-000000000004') is not null,
  'not the author: «Кто = me» with «done» — saved done, the office''s assignee stays (no refusal)');
update public.tasks set assignee_id = null where id = '17800000-0000-4000-8000-000000000004';
select tst.ok((select assignee_id from public.tasks where id = '17800000-0000-4000-8000-000000000004') = 'a0000000-0000-0000-0000-000000000004',
  'not the author: «nobody» is not taken either (no refusal, the assignee stays)');
-- the second unique key and «do nothing» behave the same (security-check)
insert into public.tasks (id, company_id, subject_type, subject_id, title, assignee_id, done_by) values
  ('17800000-0000-4000-8000-000000000005', 'ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T78 by key', 'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004')
  on conflict (company_id, id) do update set assignee_id = excluded.assignee_id;
select tst.ok((select assignee_id from public.tasks where id = '17800000-0000-4000-8000-000000000005') = 'a0000000-0000-0000-0000-000000000003'
  and (select done_by from public.tasks where id = '17800000-0000-4000-8000-000000000005') is null,
  'on conflict (company_id, id): his, no forged «done by»');
insert into public.tasks (id, company_id, subject_type, subject_id, title, assignee_id) values
  ('17800000-0000-4000-8000-000000000005', 'ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T78 by key', 'a0000000-0000-0000-0000-000000000004')
  on conflict do nothing;
select tst.ok((select assignee_id from public.tasks where id = '17800000-0000-4000-8000-000000000005') = 'a0000000-0000-0000-0000-000000000003', 'on conflict do nothing changes nothing');
:as_super
select tst.ok(not has_function_privilege('authenticated', 'app.tg_task_who()', 'execute') and not has_function_privilege('anon', 'app.tg_task_who()', 'execute'),
  'the trigger function is not callable');
\echo 'T78 outside the office a task is assigned only to oneself ok'

-- ---------------------------------------------------------------- T79: S26 — «done by» is set by the server
:as_tech_a
select tst.ok((select done_by from public.tasks where id = '17800000-0000-4000-8000-000000000004') = 'a0000000-0000-0000-0000-000000000003',
  'T79 done by the one who marked it (the upsert above)');
update public.tasks set done_at = now(), done_by = 'a0000000-0000-0000-0000-000000000004' where id = '17800000-0000-4000-8000-000000000002';
select tst.ok((select done_by from public.tasks where id = '17800000-0000-4000-8000-000000000002') = 'a0000000-0000-0000-0000-000000000003',
  'a forged «done by» is replaced by the one who marked it');
update public.tasks set done_by = 'a0000000-0000-0000-0000-000000000004' where id = '17800000-0000-4000-8000-000000000002';
select tst.ok((select done_by from public.tasks where id = '17800000-0000-4000-8000-000000000002') = 'a0000000-0000-0000-0000-000000000003',
  '«done by» alone never changes');
update public.tasks set done_at = null where id = '17800000-0000-4000-8000-000000000002';
select tst.ok((select done_by from public.tasks where id = '17800000-0000-4000-8000-000000000002') is null, '«Вернуть»: not done, nobody');
insert into public.tasks (id, company_id, subject_type, subject_id, title, done_at, done_by) values
  ('17900000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T79 done at once', now(), 'a0000000-0000-0000-0000-000000000002');
select tst.ok((select done_by from public.tasks where id = '17900000-0000-4000-8000-000000000001') = 'a0000000-0000-0000-0000-000000000003',
  'inserted done with another person as «done by»: the one who inserted it');
insert into public.tasks (id, company_id, subject_type, subject_id, title, done_by) values
  ('17900000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'job', 'e6700000-0000-4000-8000-000000000001', 'T79 open', 'a0000000-0000-0000-0000-000000000003');
select tst.ok((select done_by from public.tasks where id = '17900000-0000-4000-8000-000000000002') is null, 'an open task has nobody as «done by»');
:as_office_a
update public.tasks set done_at = now() where id = '17900000-0000-4000-8000-000000000002';
select tst.ok((select done_by from public.tasks where id = '17900000-0000-4000-8000-000000000002') = 'a0000000-0000-0000-0000-000000000002', 'the office marks it: the office');
-- a change of the title by the author keeps «done by»
:as_tech_a
update public.tasks set title = 'T79 open renamed' where id = '17900000-0000-4000-8000-000000000002';
select tst.ok((select done_by from public.tasks where id = '17900000-0000-4000-8000-000000000002') = 'a0000000-0000-0000-0000-000000000002', 'another change keeps «done by»');
\echo 'T79 «done by» is set by the server ok'

-- ---------------------------------------------------------------- T70: 3b-3 — «Весь день» у выезда (migration 20261107030000)
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values ('c7000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T70 Home');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
    ('d7000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c7000000-0000-4000-8000-000000000001', '70 Home St', 'Pasadena');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values
    ('e7000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T70 job', 'c7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'draft');
end $$;
:as_office_a
-- the company is in Los Angeles (default): a whole day there is 08:00Z–08:00Z in winter
insert into public.visits (id, company_id, job_id, starts_at, ends_at, all_day) values
  ('f7000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'e7000000-0000-4000-8000-000000000001', '2026-12-01 00:00 America/Los_Angeles', '2026-12-02 00:00 America/Los_Angeles', true),
  ('f7000000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'e7000000-0000-4000-8000-000000000001', '2026-12-03 00:00 America/Los_Angeles', '2026-12-05 00:00 America/Los_Angeles', true),
  ('f7000000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'e7000000-0000-4000-8000-000000000001', '2026-12-06 10:00 America/Los_Angeles', '2026-12-06 11:00 America/Los_Angeles', true),
  ('f7000000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'e7000000-0000-4000-8000-000000000001', '2026-12-07 00:00 UTC', '2026-12-08 00:00 UTC', true);
select tst.ok((select all_day from public.visits where id = 'f7000000-0000-4000-8000-000000000001'), 'a whole day at the company midnight stays «весь день»');
select tst.ok((select all_day from public.visits where id = 'f7000000-0000-4000-8000-000000000002'), 'two whole days stay «весь день»');
select tst.ok(not (select all_day from public.visits where id = 'f7000000-0000-4000-8000-000000000003'), 'a timed range is never «весь день»');
select tst.ok(not (select all_day from public.visits where id = 'f7000000-0000-4000-8000-000000000004'), 'UTC midnight is not the company midnight');
insert into public.visit_assignees (company_id, visit_id, user_id) values
  ('ca000000-0000-0000-0000-000000000000', 'f7000000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000003');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.visits where id = 'f7000000-0000-4000-8000-000000000001' and all_day$q$) = 1, 'the technician sees «весь день» of his visit');
select tst.fails($q$update public.visits set all_day = false where id = 'f7000000-0000-4000-8000-000000000001'$q$, 'the technician does not change «весь день»');
:as_super
select tst.ok(not has_function_privilege('authenticated', 'app.tg_visit_all_day()', 'execute'), 'the normalizer is not callable');
\echo 'T70 visits: all day only on whole days at the company midnight; the tech does not change it ok'

-- ---------------------------------------------------------------- T71: 3b-3 — an old app version and «Весь день» (rule 16)
:as_office_a
-- an old app moves the all-day visit: it writes only starts_at / ends_at → the flag goes by itself
update public.visits set starts_at = '2026-12-01 09:00 America/Los_Angeles', ends_at = '2026-12-01 10:00 America/Los_Angeles' where id = 'f7000000-0000-4000-8000-000000000001';
select tst.ok(not (select all_day from public.visits where id = 'f7000000-0000-4000-8000-000000000001'), 'an old app move to a time clears «весь день»');
-- the new app moves a whole day to another day: stays
update public.visits set starts_at = '2026-12-10 00:00 America/Los_Angeles', ends_at = '2026-12-11 00:00 America/Los_Angeles' where id = 'f7000000-0000-4000-8000-000000000002';
select tst.ok((select all_day from public.visits where id = 'f7000000-0000-4000-8000-000000000002'), 'a whole day moved to another whole day stays «весь день»');
-- an old app inserts without the column: an ordinary visit
insert into public.visits (id, company_id, job_id, starts_at, ends_at) values
  ('f7000000-0000-4000-8000-000000000005', 'ca000000-0000-0000-0000-000000000000', 'e7000000-0000-4000-8000-000000000001', '2026-12-12 00:00 America/Los_Angeles', '2026-12-13 00:00 America/Los_Angeles');
select tst.ok(not (select all_day from public.visits where id = 'f7000000-0000-4000-8000-000000000005'), 'without the column a visit is not «весь день»');
-- a visit without an end cannot be all day
update public.visits set all_day = true, ends_at = null where id = 'f7000000-0000-4000-8000-000000000005';
select tst.ok(not (select all_day from public.visits where id = 'f7000000-0000-4000-8000-000000000005'), 'no end — not «весь день»');
-- the technician does not put the flag on a whole-day visit either
insert into public.visits (id, company_id, job_id, starts_at, ends_at) values
  ('f7000000-0000-4000-8000-000000000006', 'ca000000-0000-0000-0000-000000000000', 'e7000000-0000-4000-8000-000000000001', '2026-12-14 00:00 America/Los_Angeles', '2026-12-15 00:00 America/Los_Angeles');
insert into public.visit_assignees (company_id, visit_id, user_id) values
  ('ca000000-0000-0000-0000-000000000000', 'f7000000-0000-4000-8000-000000000006', 'a0000000-0000-0000-0000-000000000003');
:as_tech_a
select tst.fails($q$update public.visits set all_day = true where id = 'f7000000-0000-4000-8000-000000000006'$q$, 'the technician does not set «весь день» even on a whole day');
-- another company does not touch our flag
:as_owner_b
select tst.blocked($q$update public.visits set all_day = false where id = 'f7000000-0000-4000-8000-000000000002'$q$, 'another company does not change our «весь день»');
:as_super
select tst.ok((select all_day from public.visits where id = 'f7000000-0000-4000-8000-000000000002'), 'and it stays');
-- the company's own zone, not Los Angeles: Honolulu midnight is 10:00Z; an empty zone falls back to Los Angeles
update public.companies set timezone = 'Pacific/Honolulu' where id = 'ca000000-0000-0000-0000-000000000000';
:as_office_a
insert into public.visits (id, company_id, job_id, starts_at, ends_at, all_day) values
  ('f7000000-0000-4000-8000-000000000007', 'ca000000-0000-0000-0000-000000000000', 'e7000000-0000-4000-8000-000000000001', '2026-12-16 00:00 Pacific/Honolulu', '2026-12-17 00:00 Pacific/Honolulu', true),
  ('f7000000-0000-4000-8000-000000000008', 'ca000000-0000-0000-0000-000000000000', 'e7000000-0000-4000-8000-000000000001', '2026-12-16 00:00 America/Los_Angeles', '2026-12-17 00:00 America/Los_Angeles', true);
select tst.ok((select all_day from public.visits where id = 'f7000000-0000-4000-8000-000000000007'), 'a Honolulu company: its own midnight');
select tst.ok(not (select all_day from public.visits where id = 'f7000000-0000-4000-8000-000000000008'), 'a Honolulu company: Los Angeles midnight is not a whole day');
:as_super
-- a zone left from before t89 (20261107050000 refuses a new one): planted past the trigger
alter table public.companies disable trigger t89_company_timezone;
update public.companies set timezone = 'Pacific Time' where id = 'ca000000-0000-0000-0000-000000000000';
alter table public.companies enable trigger t89_company_timezone;
:as_office_a
insert into public.visits (id, company_id, job_id, starts_at, ends_at, all_day) values
  ('f7000000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', 'e7000000-0000-4000-8000-000000000001', '2026-12-20 00:00 America/Los_Angeles', '2026-12-21 00:00 America/Los_Angeles', true);
select tst.ok((select all_day from public.visits where id = 'f7000000-0000-4000-8000-000000000009'), 'a zone Postgres does not know: the save goes through, Los Angeles');
:as_super
alter table public.companies disable trigger t89_company_timezone;
update public.companies set timezone = '' where id = 'ca000000-0000-0000-0000-000000000000';
alter table public.companies enable trigger t89_company_timezone;
:as_office_a
update public.visits set all_day = true, starts_at = '2026-12-18 00:00 America/Los_Angeles', ends_at = '2026-12-19 00:00 America/Los_Angeles' where id = 'f7000000-0000-4000-8000-000000000008';
select tst.ok((select all_day from public.visits where id = 'f7000000-0000-4000-8000-000000000008'), 'an empty zone: Los Angeles');
:as_super
update public.companies set timezone = 'America/Los_Angeles' where id = 'ca000000-0000-0000-0000-000000000000';
:as_super
\echo 'T71 an old app never leaves «весь день» on a timed visit ok'

-- ---------------------------------------------------------------- T72: jobs — UPDATE by columns (17-job §12.1, 20261107040000, rule 16 step 1)
:as_super
do $$
declare c text;
begin
  foreach c in array array['status', 'title', 'description', 'job_type_id', 'tax_enabled', 'tax_rate_bps', 'service_category_id'] loop
    perform tst.ok(has_column_privilege('authenticated', 'public.jobs', c, 'UPDATE'), 'T72 the app may update jobs.' || c);
  end loop;
  foreach c in array array['company_id', 'customer_id', 'property_id', 'estimate_id', 'approved_version_id', 'option_id', 'number',
                           'contract_total_cents', 'deleted_at', 'completed_at', 'closed_at', 'cancelled_at', 'created_by', 'recurring_plan_id'] loop
    perform tst.ok(not has_column_privilege('authenticated', 'public.jobs', c, 'UPDATE'), 'T72 no update of jobs.' || c);
  end loop;
  perform tst.ok(not has_table_privilege('anon', 'public.jobs', 'UPDATE') and not has_table_privilege('anon', 'public.jobs', 'INSERT'), 'T72 anon writes no job');
  -- step 1: old builds on phones still insert (step 2 revokes it once a minimal build exists)
  perform tst.ok(has_table_privilege('authenticated', 'public.jobs', 'INSERT'), 'T72 step 1: INSERT stays for old builds');
end $$;
insert into public.customers (id, company_id, display_name) values ('c7200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T72 Client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
  ('d7200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c7200000-0000-4000-8000-000000000001', '72 Grant St', 'Pasadena'),
  ('d7200000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c7200000-0000-4000-8000-000000000001', '72 Other St', 'Pasadena');
:as_office_a
-- the server paths still make a job (security definer: the owner's rights, not the caller's)
select tst.ok((public.create_job('e7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', 'T72 job') ->> 'repeat') = 'false', 'T72 create_job still makes a job');
update public.jobs set title = 'T72 renamed', description = 'T72 note', tax_enabled = true, tax_rate_bps = 950 where id = 'e7200000-0000-4000-8000-000000000001';
select tst.ok((select title = 'T72 renamed' and description = 'T72 note' and tax_rate_bps = 950 from public.jobs where id = 'e7200000-0000-4000-8000-000000000001'), 'T72 the office edits the allowed columns');
select tst.fails($q$update public.jobs set property_id = 'd7200000-0000-4000-8000-000000000002' where id = 'e7200000-0000-4000-8000-000000000001'$q$, 'T72 the address of a job is not moved by the app');
select tst.fails($q$update public.jobs set deleted_at = now() where id = 'e7200000-0000-4000-8000-000000000001'$q$, 'T72 a job is not deleted by the app');
select tst.fails($q$update public.jobs set number = 'JOB-X' where id = 'e7200000-0000-4000-8000-000000000001'$q$, 'T72 the number is the server''s');
select tst.fails($q$update public.jobs set title = 'T72 x', contract_total_cents = 1 where id = 'e7200000-0000-4000-8000-000000000001'$q$, 'T72 one forbidden column refuses the whole update');
select tst.ok((select title = 'T72 renamed' and property_id = 'd7200000-0000-4000-8000-000000000001' and deleted_at is null from public.jobs where id = 'e7200000-0000-4000-8000-000000000001'), 'T72 nothing of the refused updates went through');
-- the signature paths ran above under the same grants (all migrations come first): T8 — the client on the page
-- (portal_accept) and the company's countersign → execute_estimate; T47 — on site + countersign
:as_super
select tst.ok((select count(*) = 1 and bool_and(status = 'draft') from public.jobs where estimate_id = '0e1a0000-0000-0000-0000-000000000010'), 'T72 portal_accept + countersign made the job of the estimate (T8)');
select tst.ok((select count(*) = 1 from public.jobs where estimate_id = '0e470000-0000-4000-8000-000000000002'), 'T72 on-site signature + countersign made the job (T47)');
\echo 'T72 jobs: update by columns, the server still makes jobs ok'

-- ---------------------------------------------------------------- T73: record_estimate_deposit — the office takes the deposit of a signed estimate
-- fixtures as the signature leaves them (execute_estimate: the job of the estimate and a «sent» deposit invoice; test prices)
:as_super
insert into public.customers (id, company_id, display_name) values ('c7300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T73 Client');
insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
  ('d7300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c7300000-0000-4000-8000-000000000001', '73 Deposit St', 'Pasadena');
insert into public.estimates (id, company_id, customer_id, property_id, title) values
  ('0e730000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'T73 signed'),
  ('0e730000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'T73 not signed'),
  ('0e730000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'T73 no deposit');
insert into public.jobs (id, company_id, number, title, customer_id, property_id, estimate_id) values
  ('e7300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '', 'T73 job', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', '0e730000-0000-4000-8000-000000000001'),
  ('e7300000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', '', 'T73 job 3', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', '0e730000-0000-4000-8000-000000000003');
insert into public.invoices (id, company_id, number, customer_id, job_id, kind, status, title, subtotal_cents, total_cents, sent_at) values
  ('17300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '', 'c7300000-0000-4000-8000-000000000001', 'e7300000-0000-4000-8000-000000000001', 'deposit', 'sent', 'Deposit', 3000, 3000, now());
:as_tech_a
select tst.fails($q$select public.record_estimate_deposit('0e730000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-0000000000f1', 'cash')$q$, 'T73 a tech does not take the deposit of an estimate');
:as_owner_b
select tst.fails($q$select public.record_estimate_deposit('0e730000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-0000000000f2', 'cash')$q$, 'T73 another company does not');
:as_super
set role anon;
select tst.fails($q$select public.record_estimate_deposit('0e730000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-0000000000f3', 'cash')$q$, 'T73 anon has no EXECUTE');
reset role;
:as_office_a
do $$
declare r jsonb;
begin
  begin
    perform public.record_estimate_deposit('0e730000-0000-4000-8000-000000000002', 'a7300000-0000-4000-8000-0000000000f4', 'cash');
    raise exception 'FAILED: a deposit on an estimate without its job';
  exception when others then
    -- a plain refusal, not a «later»: the queue goes in order, so no job means the signature never got through (review #247)
    perform tst.ok(sqlstate = 'P0001' and sqlerrm like 'the deposit was not recorded%', 'T73 not signed on the server: refused (P0001), no payment — ' || sqlstate);
  end;
  begin
    perform public.record_estimate_deposit('0e730000-0000-4000-8000-000000000003', 'a7300000-0000-4000-8000-0000000000f5', 'cash');
    raise exception 'FAILED: a deposit where none is due';
  exception when others then
    perform tst.ok(sqlstate = '22023', 'T73 no deposit invoice: refused (22023) — ' || sqlstate);
  end;
  begin
    perform public.record_estimate_deposit('0e730000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-0000000000f6', 'bitcoin');
    raise exception 'FAILED: an unknown method';
  exception when others then
    perform tst.ok(sqlstate = '22023', 'T73 an unknown method is refused — ' || sqlstate);
  end;
  -- part of the deposit already paid (another phone): the office takes the rest, the sum is the server's
  insert into public.payments (id, company_id, invoice_id, customer_id, method, amount_cents, status, idempotency_key, received_by)
  values ('a7300000-0000-4000-8000-000000000000', 'ca000000-0000-0000-0000-000000000000', '17300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'cash', 1000, 'succeeded', 'a7300000-0000-4000-8000-000000000000', 'a0000000-0000-0000-0000-000000000002');
  r := public.record_estimate_deposit('0e730000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001', 'check');
  perform tst.ok((r ->> 'repeat') = 'false' and (r ->> 'invoice_id') = '17300000-0000-4000-8000-000000000001', 'T73 the deposit is taken on the deposit invoice');
  perform tst.ok((select amount_cents = 2000 and method = 'check' and status = 'succeeded' and received_by = 'a0000000-0000-0000-0000-000000000002'
                    from public.payments where id = 'a7300000-0000-4000-8000-000000000001'), 'T73 the balance of the invoice (3000 − 1000), not a sum from the phone');
  perform tst.ok((select balance_cents = 0 from public.invoices where id = '17300000-0000-4000-8000-000000000001'), 'T73 the deposit invoice is paid');
  -- offline replay: the same payment id — no second payment
  r := public.record_estimate_deposit('0e730000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001', 'check');
  perform tst.ok((r ->> 'repeat') = 'true', 'T73 a replay is the same payment');
  -- another phone, another id, the deposit already paid: nothing more is taken
  r := public.record_estimate_deposit('0e730000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000002', 'cash');
  perform tst.ok((r ->> 'payment_id') is null and (r ->> 'already_paid') = 'true', 'T73 a paid deposit takes no second payment (already_paid)');
  -- an id taken by another payment of ours (not this deposit): refused, not a silent «done»
  begin
    perform public.record_estimate_deposit('0e730000-0000-4000-8000-000000000001',
      (select id from public.payments where company_id = 'ca000000-0000-0000-0000-000000000000' and invoice_id is distinct from '17300000-0000-4000-8000-000000000001' order by id limit 1), 'cash');
    perform tst.ok(false, 'T73 FAILED: a payment id of another payment counted as the deposit');
  exception when others then
    perform tst.ok(sqlstate = '22023', 'T73 an id of another payment of ours: 22023 — ' || sqlstate);
  end;
end $$;
-- our estimate, an id of another company's payment: the same 22023, nothing about whose
:as_super
insert into public.customers (id, company_id, display_name) values ('c7300000-0000-4000-8000-0000000000b1', 'cb000000-0000-0000-0000-000000000000', 'T73 B Client');
insert into public.payments (id, company_id, invoice_id, customer_id, method, amount_cents, status, idempotency_key) values
  ('a7300000-0000-4000-8000-0000000000b1', 'cb000000-0000-0000-0000-000000000000', null, 'c7300000-0000-4000-8000-0000000000b1', 'cash', 500, 'succeeded', 'a7300000-0000-4000-8000-0000000000b1');
:as_office_a
do $$
declare r jsonb;
begin
  begin
    perform public.record_estimate_deposit('0e730000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-0000000000b1', 'cash');
    perform tst.ok(false, 'T73 FAILED: another company''s payment id answered');
  exception when others then
    perform tst.ok(sqlstate = '22023' and sqlerrm = 'this payment id is taken', 'T73 another company''s payment id: the same answer as ours — ' || sqlerrm);
  end;
  perform tst.ok((select count(*) = 2 from public.payments where invoice_id = '17300000-0000-4000-8000-000000000001'), 'T73 two payments on the invoice, no more');
end $$;
-- a replay of another company's payment id does not leak it
:as_owner_b
select tst.fails($q$select public.record_estimate_deposit('0e730000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001', 'check')$q$, 'T73 another company gets no answer by a known payment id');
:as_sales_a
select tst.ok((public.record_estimate_deposit('0e730000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001', 'check') ->> 'repeat') = 'true', 'T73 sales may take a deposit (as payments_insert_staff)');
\echo 'T73 record_estimate_deposit: the office, the server''s sum, one payment per id ok'
-- ---------------------------------------------------------------- T75: companies.timezone is checked when written (docs/specs/22 §1)
:as_owner_a
select tst.fails_like($q$update public.companies set timezone = 'Bad/Zone' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'unknown time zone', 'T75 an unknown zone is refused');
select tst.fails_like($q$update public.companies set timezone = '' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'unknown time zone', 'an empty zone is refused');
select tst.fails_like($q$update public.companies set timezone = 'UTC+3' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'unknown time zone', 'a POSIX string (at time zone takes it) is refused');
select tst.fails_like($q$update public.companies set timezone = 'Factory' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'unknown time zone', 'a catalog name that is not Area/Location is refused');
update public.companies set timezone = 'america/chicago' where id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select timezone from public.companies where id = 'ca000000-0000-0000-0000-000000000000') = 'America/Chicago', 'another case is saved as the exact name');
update public.companies set timezone = 'EST' where id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select timezone from public.companies where id = 'ca000000-0000-0000-0000-000000000000') = 'America/New_York', 'an abbreviation of the explicit list: its zone with daylight time');
update public.companies set timezone = 'Pacific/Kiritimati' where id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select timezone from public.companies where id = 'ca000000-0000-0000-0000-000000000000') = 'Pacific/Kiritimati', 'an exact name stays as it is');
update public.companies set phone = '+13235557500' where id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select timezone from public.companies where id = 'ca000000-0000-0000-0000-000000000000') = 'Pacific/Kiritimati', 'saving another field keeps the zone');
:as_super
select tst.fails_like($q$insert into public.companies (name, timezone) values ('T75 bad', 'Bad/Zone')$q$, 'unknown time zone', 'a new company with an unknown zone is refused (any writer)');
select tst.ok(not has_function_privilege('anon', 'app.tg_company_timezone()', 'EXECUTE') and not has_function_privilege('authenticated', 'app.tg_company_timezone()', 'EXECUTE'), 'nobody executes the trigger function');
select tst.ok(not has_function_privilege('anon', 'app.zone_name(text)', 'EXECUTE'), 'anon does not execute zone_name');
-- an edge function (service_role) writes through the same check (app.zone_name is granted to it)
reset role; set role service_role;
update public.companies set timezone = 'mst' where id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select timezone from public.companies where id = 'ca000000-0000-0000-0000-000000000000') = 'America/Phoenix', 'service_role: the same check (MST — Arizona, no daylight time)');
select tst.fails_like($q$update public.companies set timezone = 'Bad/Zone' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'unknown time zone', 'service_role: an unknown zone is refused too');
-- a zone the server stopped knowing (a tzdata change) stays in the row: saving another field still works (rule 16)
:as_super
alter table public.companies disable trigger t89_company_timezone;
update public.companies set timezone = 'Gone/Zone' where id = 'ca000000-0000-0000-0000-000000000000';
alter table public.companies enable trigger t89_company_timezone;
:as_owner_a
update public.companies set phone = '+13235557501' where id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select phone from public.companies where id = 'ca000000-0000-0000-0000-000000000000') = '+13235557501', 'a stored zone the server does not know does not block saving another field');
:as_super
update public.companies set timezone = 'America/Los_Angeles', phone = null where id = 'ca000000-0000-0000-0000-000000000000';
\echo 'T75 companies.timezone: unknown refused, case and abbreviations made exact ok'

-- ---------------------------------------------------------------- T76: a closed company — the client page, signing, paying, letters (docs/specs/22 §3.5)
:as_super
insert into public.companies (id, name, dba, phone) values ('ca760000-0000-4000-8000-000000000000', 'T76 Legal LLC', 'T76 Gutters', '+13235557676');
insert into app.company_flags (company_id, simulated_payments) values ('ca760000-0000-4000-8000-000000000000', true);  -- else «not available» would answer first
do $$
declare v_cust uuid; v_prop uuid;
begin
  insert into public.customers (company_id, display_name) values ('ca760000-0000-4000-8000-000000000000', 'T76 Client') returning id into v_cust;
  insert into public.properties (company_id, customer_id, address_line1, address_city) values ('ca760000-0000-4000-8000-000000000000', v_cust, '76 Closed St', 'Burbank') returning id into v_prop;
  insert into public.estimates (id, company_id, number, customer_id, property_id, title) values
    ('0e1a7600-0000-4000-8000-000000000001', 'ca760000-0000-4000-8000-000000000000', '', v_cust, v_prop, 'T76 sent');
  insert into public.estimate_versions (id, company_id, estimate_id, version_no) values
    ('0e2a7600-0000-4000-8000-000000000001', 'ca760000-0000-4000-8000-000000000000', '0e1a7600-0000-4000-8000-000000000001', 1);
  update public.estimates set current_version_id = '0e2a7600-0000-4000-8000-000000000001' where id = '0e1a7600-0000-4000-8000-000000000001';
  insert into public.estimate_options (id, company_id, version_id, name) values
    ('0e3a7600-0000-4000-8000-000000000001', 'ca760000-0000-4000-8000-000000000000', '0e2a7600-0000-4000-8000-000000000001', 'Standard');
  insert into public.estimate_line_items (company_id, option_id, line_group, name, quantity, unit_price_cents, taxable) values
    ('ca760000-0000-4000-8000-000000000000', '0e3a7600-0000-4000-8000-000000000001', 'labor', 'Gutters (тестовые цены)', 1, 100000, false);
  update public.estimate_versions set locked_at = now(), sent_at = now() where id = '0e2a7600-0000-4000-8000-000000000001';
  update public.estimates set status = 'sent', sent_version_id = '0e2a7600-0000-4000-8000-000000000001' where id = '0e1a7600-0000-4000-8000-000000000001';
  perform tst.set_token('0e1a7600-0000-4000-8000-000000000001', 'tok_t76_closed_0123456789ab');
  -- a second estimate the client has never opened: «sent» (its first view would make it «viewed» and notify the company)
  insert into public.estimates (id, company_id, number, customer_id, property_id, title) values
    ('0e1a7600-0000-4000-8000-000000000002', 'ca760000-0000-4000-8000-000000000000', '', v_cust, v_prop, 'T76 never viewed');
  insert into public.estimate_versions (id, company_id, estimate_id, version_no) values
    ('0e2a7600-0000-4000-8000-000000000002', 'ca760000-0000-4000-8000-000000000000', '0e1a7600-0000-4000-8000-000000000002', 1);
  update public.estimates set current_version_id = '0e2a7600-0000-4000-8000-000000000002' where id = '0e1a7600-0000-4000-8000-000000000002';
  update public.estimate_versions set locked_at = now(), sent_at = now() where id = '0e2a7600-0000-4000-8000-000000000002';
  update public.estimates set status = 'sent', sent_version_id = '0e2a7600-0000-4000-8000-000000000002' where id = '0e1a7600-0000-4000-8000-000000000002';
  perform tst.set_token('0e1a7600-0000-4000-8000-000000000002', 'tok_t76_sent_0123456789abcd');
  -- a letter queued minutes before the company was closed
  insert into public.email_outbox (company_id, estimate_id, kind) values ('ca760000-0000-4000-8000-000000000000', '0e1a7600-0000-4000-8000-000000000001', 'signed_copy');
end $$;
-- open: the page works as before (control)
reset role; reset request.jwt.claim.sub; set role anon;
select tst.ok(public.portal_estimate('tok_t76_closed_0123456789ab') ->> 'status' = 'viewed', 'T76 control: an open company — the page as before');
-- closed as delete_account closes it (the test plants it past the guard t06).
-- Owner A stays an ACTIVE owner of T76 here: in real life delete_account makes every other member «deleted» in the same
-- transaction, so an active member of a closed company cannot exist — the test makes the strongest case on purpose:
-- even someone who may sign contracts there gets «company closed» on site (review of #271, item 3).
:as_super
insert into public.memberships (company_id, user_id, role, status) values ('ca760000-0000-4000-8000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'owner', 'active');
alter table public.companies disable trigger t06_company_closed_guard;
update public.companies set closed_at = now() where id = 'ca760000-0000-4000-8000-000000000000';
alter table public.companies enable trigger t06_company_closed_guard;
select set_config('tst.t76_views', (select viewed_count || '|' || coalesce(last_viewed_at::text, '') from public.estimates where id = '0e1a7600-0000-4000-8000-000000000001'), false);
select set_config('tst.t76_rows', ((select count(*) from public.notifications where company_id = 'ca760000-0000-4000-8000-000000000000')
                                 + (select count(*) from public.estimate_approvals where company_id = 'ca760000-0000-4000-8000-000000000000') * 1000
                                 + (select count(*) from public.payments where company_id = 'ca760000-0000-4000-8000-000000000000') * 1000000)::text, false);
reset role; reset request.jwt.claim.sub; set role anon;
do $$
declare r jsonb := public.portal_estimate('tok_t76_closed_0123456789ab');
begin
  -- failed before: the whole estimate, the phone and «Pay by card»
  perform tst.ok(r = '{"status": "closed", "company": {"name": "T76 Gutters"}, "doc_language": "en"}'::jsonb, 'a closed company: only its name and the client''s language: ' || coalesce(r::text, 'null'));
  perform tst.ok(public.portal_estimate('tok_t76_sent_0123456789abcd') ->> 'status' = 'closed', 'a sent estimate never viewed: «closed» too');
  perform tst.fails_like($q$select public.portal_accept('tok_t76_closed_0123456789ab', '0e3a7600-0000-4000-8000-000000000001', null, 'Client', 'M0 0 L5 5', true)$q$, 'company closed', 'a closed company: the client cannot sign');
  perform tst.fails_like($q$select public.portal_pay_simulated('tok_t76_closed_0123456789ab', '0e1a7600-0000-4000-8000-0000000000ff')$q$, 'company closed', 'a closed company: no card payment (refused before anything else)');
end $$;
-- signed on site by an active owner of T76 (may sign contracts): still closed — the check is before «on site»
:as_super
select tst.ok(exists (select 1 from public.memberships where company_id = 'ca760000-0000-4000-8000-000000000000'
                        and user_id = 'a0000000-0000-0000-0000-000000000001' and role = 'owner' and status = 'active'),
              'owner A is an active owner of T76 (else the on-site refusal would answer first)');
:as_owner_a
select tst.fails_like($q$select public.portal_accept('tok_t76_closed_0123456789ab', '0e3a7600-0000-4000-8000-000000000001', null, 'Client', 'M0 0 L5 5', true, 'on_site')$q$, 'company closed', 'on site by a member who may sign: refused too');
:as_super
select tst.ok((select status from public.estimates where id = '0e1a7600-0000-4000-8000-000000000002') = 'sent', 'the never viewed estimate stays «sent» (no sent → viewed)');
select tst.ok((select status from public.estimates where id = '0e1a7600-0000-4000-8000-000000000001') = 'viewed'
          and (select viewed_count || '|' || coalesce(last_viewed_at::text, '') from public.estimates where id = '0e1a7600-0000-4000-8000-000000000001') = current_setting('tst.t76_views'),
              'the closed page counts no view');
select tst.ok(((select count(*) from public.notifications where company_id = 'ca760000-0000-4000-8000-000000000000')
             + (select count(*) from public.estimate_approvals where company_id = 'ca760000-0000-4000-8000-000000000000') * 1000
             + (select count(*) from public.payments where company_id = 'ca760000-0000-4000-8000-000000000000') * 1000000)::text = current_setting('tst.t76_rows'),
              'no notification, signature or payment is written for a closed company');
-- a repeat of the signature (the answer was lost, the company closed meanwhile): «company closed», not the page
select set_config('app.signing_estimate', '0e1a7600-0000-4000-8000-000000000001', false);
update public.estimates set status = 'awaiting_countersign' where id = '0e1a7600-0000-4000-8000-000000000001';
select set_config('app.signing_estimate', '', false);
reset role; reset request.jwt.claim.sub; set role anon;
select tst.fails_like($q$select public.portal_accept('tok_t76_closed_0123456789ab', '0e3a7600-0000-4000-8000-000000000001', null, 'Client', 'M0 0 L5 5', true)$q$, 'company closed', 'a repeat of the signature (awaiting countersign): refused before the repeat branch');
:as_super
-- «closed» wins over «expired» and «declined» (they give the phone)
select tst.set_expires('0e1a7600-0000-4000-8000-000000000001', (now() - interval '3 days')::date);
reset role; reset request.jwt.claim.sub; set role anon;
select tst.ok(public.portal_estimate('tok_t76_closed_0123456789ab') ->> 'status' = 'closed' and public.portal_estimate('tok_t76_closed_0123456789ab')::text not like '%3235557676%',
              'past «valid until»: still «closed», no phone');
-- an empty dba: the name
:as_super
update public.companies set dba = '' where id = 'ca760000-0000-4000-8000-000000000000';
reset role; reset request.jwt.claim.sub; set role anon;
select tst.ok(public.portal_estimate('tok_t76_closed_0123456789ab') -> 'company' ->> 'name' = 'T76 Legal LLC', 'an empty dba: the company name');
-- the letter: never handed out, no attempt counted, no address taken
reset role; set role service_role;
select tst.ok(public.email_claim((select id from public.email_outbox where estimate_id = '0e1a7600-0000-4000-8000-000000000001')) is null, 'a closed company: email_claim hands out no letter');
:as_super
select tst.ok((select status = 'expired' and attempts = 0 and to_email is null from public.email_outbox where estimate_id = '0e1a7600-0000-4000-8000-000000000001'),
              'the letter is expired, no attempt, no address');
-- rights as before (rule 18, T52)
select tst.ok(has_function_privilege('anon', 'public.portal_estimate(text)', 'EXECUTE')
          and has_function_privilege('anon', 'public.portal_pay_simulated(text, uuid)', 'EXECUTE')
          and has_function_privilege('anon', 'public.portal_accept(text, uuid, uuid[], text, text, boolean, text, uuid, uuid, uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.email_claim(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.email_claim(uuid)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.email_claim(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'app.company_closed(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'app.company_closed(uuid)', 'EXECUTE'), 'the rights are as before; nobody calls company_closed directly');
\echo 'T76 a closed company: the page, signing, paying and letters refused ok'
-- ---------------------------------------------------------------- T80: push_devices — a person's phones (docs/specs/27 §4.1)
:as_tech_a
select public.register_push_device('ExponentPushToken[t80-mike-1]', 'android', 'es', '1.0.0 · 270');
select tst.ok(tst.cnt($q$select 1 from public.push_devices where revoked_at is null$q$) = 1, 'T80 the person sees their phone');
select tst.ok((select lang from public.push_devices) = 'es', 'T80 the interface language of the phone is kept');
select tst.fails($q$select expo_token from public.push_devices$q$, 'T80 the token itself is never read back');
select public.register_push_device('ExponentPushToken[t80-mike-1]', 'android', 'ru', null);
select tst.ok(tst.cnt($q$select 1 from public.push_devices$q$) = 1 and (select lang from public.push_devices) = 'ru', 'T80 a repeat updates the same row (the language changed)');
select public.register_push_device('ExpoPushToken[t80-mike-2]', 'ios', 'xx', null);
select tst.ok((select lang from public.push_devices where platform = 'ios') = 'en', 'T80 an unknown language becomes en');
select tst.fails_like($q$select public.register_push_device('not a token', 'android', 'en', null)$q$, 'not a push token', 'T80 a wrong token is refused');
select tst.fails_like($q$select public.register_push_device('ExponentPushToken[a b]', 'android', 'en', null)$q$, 'not a push token', 'T80 a token with a space is refused');
select tst.fails_like($q$select public.register_push_device('ExponentPushToken[ok]', 'windows', 'en', null)$q$, 'unknown platform', 'T80 an unknown platform is refused');
select tst.fails($q$insert into public.push_devices (user_id, expo_token, platform) values ('a0000000-0000-0000-0000-000000000003', 'ExponentPushToken[direct]', 'android')$q$, 'T80 no direct insert');
select tst.blocked($q$update public.push_devices set lang = 'en'$q$, 'T80 no direct update');
select tst.blocked($q$delete from public.push_devices$q$, 'T80 no direct delete');
:as_tech2_a
select tst.ok(tst.cnt($q$select 1 from public.push_devices$q$) = 0, 'T80 another person sees no phones of Mike');
select public.forget_push_device('ExponentPushToken[t80-mike-1]');
select public.forget_push_device(null);
:as_super
select tst.ok((select revoked_at is null from public.push_devices where expo_token = 'ExponentPushToken[t80-mike-1]'), 'T80 forget does not touch another person''s token');
select tst.ok(not exists (select 1 from public.push_devices where revoked_at is not null), 'T80 forget(null) is silent and changes nothing');
:as_tech2_a
-- the phone was handed over: Luis signs in on it — the token moves to Luis
select public.register_push_device('ExponentPushToken[t80-mike-1]', 'android', 'en', null);
select tst.ok(tst.cnt($q$select 1 from public.push_devices$q$) = 1, 'T80 the token moved to the person signed in now');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.push_devices$q$) = 1, 'T80 Mike keeps only his other phone');
select public.forget_push_device('ExpoPushToken[t80-mike-2]');
select tst.ok((select revoked_reason from public.push_devices where platform = 'ios') = 'signed_out', 'T80 sign out switches the own phone off');
select public.register_push_device('ExpoPushToken[t80-mike-2]', 'ios', 'en', null);
select tst.ok((select revoked_at is null from public.push_devices where platform = 'ios'), 'T80 signing in again switches it on');
-- not more than 10 live phones
do $$ begin
  for i in 1..11 loop
    perform public.register_push_device('ExponentPushToken[t80-many-' || i || ']', 'android', 'en', null);
  end loop;
end $$;
select tst.ok(tst.cnt($q$select 1 from public.push_devices where revoked_at is null$q$) = 10, 'T80 not more than 10 live phones');
select tst.ok((select revoked_reason from public.push_devices where platform = 'ios') = 'too_many', 'T80 the phone seen longest ago goes off');
-- the table never grows without end: 30 more fake tokens leave at most 10 live + 10 switched-off rows
do $$ begin
  for i in 1..30 loop
    perform public.register_push_device('ExponentPushToken[t80-flood-' || i || ']', 'android', 'en', null);
  end loop;
end $$;
select tst.ok(tst.cnt($q$select 1 from public.push_devices$q$) <= 20 and tst.cnt($q$select 1 from public.push_devices where revoked_at is null$q$) = 10,
          'T80 a flood of tokens keeps at most 20 rows of a person');
:as_super
select tst.ok((select revoked_at is null from public.push_devices where expo_token = 'ExponentPushToken[t80-flood-30]'), 'T80 the phone just registered is never the one switched off');
:as_tech_a
reset role; set role anon;
select tst.fails($q$select public.register_push_device('ExponentPushToken[anon]', 'android', 'en', null)$q$, 'T80 anon cannot register');
select tst.fails($q$select 1 from public.push_devices$q$, 'T80 anon cannot read the phones');
:as_super
select tst.ok(not has_function_privilege('anon', 'public.forget_push_device(text)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.register_push_device(text, text, text, text)', 'EXECUTE'), 'T80 anon executes neither function');
select tst.ok(not has_table_privilege('authenticated', 'public.push_devices', 'INSERT') and not has_table_privilege('authenticated', 'public.push_devices', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.push_devices', 'DELETE'), 'T80 the app has only select on push_devices');
-- the server's paths without BYPASSRLS (supabase/README: not checked on staging) — as T57: the rules «to postgres» carry them
create role t80_owner nologin nobypassrls;
grant postgres to t80_owner;
grant usage on schema app, public to t80_owner;
grant select, insert, update, delete on public.push_devices, public.push_outbox to t80_owner;
grant execute on function app.push_account_alive(uuid) to t80_owner;
alter function public.register_push_device(text, text, text, text) owner to t80_owner;
alter function app.erase_personal_rows(uuid) owner to t80_owner;
:as_tech2_a
select public.register_push_device('ExponentPushToken[t80-luis-2]', 'ios', 'en', null);
select tst.ok(tst.cnt($q$select 1 from public.push_devices where platform = 'ios'$q$) = 1, 'T80 registering works without BYPASSRLS');
:as_super
-- account deletion (S22) erases the phones — without BYPASSRLS too
select app.erase_personal_rows('a0000000-0000-0000-0000-000000000003');
select tst.ok((select count(*) from public.push_devices where user_id = 'a0000000-0000-0000-0000-000000000003') = 0, 'T80 account deletion erases the person''s phones (no BYPASSRLS)');
alter function public.register_push_device(text, text, text, text) owner to postgres;
alter function app.erase_personal_rows(uuid) owner to postgres;
-- a deleted account (its JWT still valid for a while) registers nothing
update public.users set deleted_at = now() where id = 'a0000000-0000-0000-0000-000000000004';
:as_tech2_a
select tst.fails_like($q$select public.register_push_device('ExponentPushToken[t80-gone]', 'android', 'en', null)$q$, 'not allowed', 'T80 a deleted account cannot register a phone');
:as_super
update public.users set deleted_at = null where id = 'a0000000-0000-0000-0000-000000000004';
-- the whole path of account deletion (public.delete_account, S22), not only erase_personal_rows
insert into auth.users (id, email, raw_user_meta_data) values ('a8000000-0000-4000-8000-000000000020', 'gone80@a.test', '{"full_name":"Gail Gone"}');
insert into public.memberships (company_id, user_id, role, status) values ('ca000000-0000-0000-0000-000000000000', 'a8000000-0000-4000-8000-000000000020', 'admin', 'active');
reset role; set request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000020'; set role authenticated;
select public.register_push_device('ExponentPushToken[t80-gail]', 'android', 'en', null);
:as_super
insert into public.notifications (id, company_id, kind, invoice_id) values ('08000000-0000-4000-8000-000000000020', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
select tst.ok(exists (select 1 from public.push_outbox where user_id = 'a8000000-0000-4000-8000-000000000020'), 'T80 Gail (admin) has a queued push');
reset role; set request.jwt.claim.sub = 'a8000000-0000-4000-8000-000000000020'; reset request.jwt.claims; set role authenticated;
select tst.fresh(2);
select tst.ok((public.delete_account('DELETE') ->> 'deleted')::boolean, 'T80 Gail deletes her account');
select tst.fails_like($q$select public.register_push_device('ExponentPushToken[t80-gail-2]', 'android', 'en', null)$q$, 'not allowed', 'T80 after delete_account her JWT registers nothing');
:as_super
reset request.jwt.claims;
select tst.ok(not exists (select 1 from public.push_devices where user_id = 'a8000000-0000-4000-8000-000000000020')
          and not exists (select 1 from public.push_outbox where user_id = 'a8000000-0000-4000-8000-000000000020'), 'T80 delete_account erased her phones and queued pushes');
delete from public.push_outbox where notification_id = '08000000-0000-4000-8000-000000000020';
delete from public.notifications where id = '08000000-0000-4000-8000-000000000020';
delete from public.push_devices;
\echo 'T80 push_devices: own rows only, through the functions, the token follows the person signed in ok'

-- ---------------------------------------------------------------- T81: push_outbox — who gets a push (docs/specs/27 §4.2–4.3)
:as_super
insert into auth.users (id, email, raw_user_meta_data) values
  ('a8100000-0000-4000-8000-000000000001', 'admin81@a.test', '{"full_name":"Ann Admin"}'),
  ('a8100000-0000-4000-8000-000000000002', 'sales81@a.test', '{"full_name":"Sam Sales"}'),
  ('a8100000-0000-4000-8000-000000000003', 'sub81@a.test',   '{"full_name":"Sid Sub"}'),
  ('a8100000-0000-4000-8000-000000000004', 'off81@a.test',   '{"full_name":"Olga Off"}'),
  ('a8100000-0000-4000-8000-000000000005', 'office81@a.test', '{"full_name":"Oscar Office"}');
insert into public.memberships (company_id, user_id, role, status) values
  ('ca000000-0000-0000-0000-000000000000', 'a8100000-0000-4000-8000-000000000001', 'admin', 'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a8100000-0000-4000-8000-000000000002', 'sales', 'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a8100000-0000-4000-8000-000000000003', 'subcontractor', 'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a8100000-0000-4000-8000-000000000004', 'admin', 'disabled'),
  ('ca000000-0000-0000-0000-000000000000', 'a8100000-0000-4000-8000-000000000005', 'office', 'active');
update public.estimates set owner_user_id = 'a8100000-0000-4000-8000-000000000002' where id = '0e730000-0000-4000-8000-000000000003';
create temp table t81_who (user_id uuid, kind text, route text);
grant select on t81_who to authenticated;
-- a) the client signed
insert into public.notifications (id, company_id, kind, estimate_id, payload) values
  ('08100000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'estimate.client_signed', '0e730000-0000-4000-8000-000000000003', '{"customer":"T81 Client","total":123400}');
insert into t81_who select user_id, kind, route from public.push_outbox where notification_id = '08100000-0000-4000-8000-000000000001';
select tst.ok(exists (select 1 from t81_who where user_id = 'a0000000-0000-0000-0000-000000000001'), 'T81 signed: the owner gets it');
select tst.ok(exists (select 1 from t81_who where user_id = 'a8100000-0000-4000-8000-000000000001'), 'T81 signed: an admin gets it');
select tst.ok(exists (select 1 from t81_who where user_id = 'a8100000-0000-4000-8000-000000000002'), 'T81 signed: the author of the estimate (sales) gets it');
select tst.ok(not exists (select 1 from t81_who where user_id in ('a8100000-0000-4000-8000-000000000005', 'a0000000-0000-0000-0000-000000000003',
          'a8100000-0000-4000-8000-000000000003', 'a8100000-0000-4000-8000-000000000004', 'b0000000-0000-0000-0000-000000000001')),
          'T81 signed: not the office, a tech, a subcontractor, a switched-off admin or another company');
select tst.ok((select bool_and(kind = 'estimate.client_signed' and route = '/estimate/0e730000-0000-4000-8000-000000000003') from t81_who), 'T81 the push leads to the estimate');
select tst.ok((select bool_and(status = 'pending' and tries = 0) from public.push_outbox where notification_id = '08100000-0000-4000-8000-000000000001'), 'T81 rows wait for send-push');
-- no text, names or sums in the queue (14-app-store п.6): the columns are fixed
select tst.ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'push_outbox'
          and column_name in ('title', 'body', 'payload', 'customer', 'total')), 'T81 the queue keeps no text, names or sums');
-- b) a payment: owner and admin only
truncate t81_who;
insert into public.notifications (id, company_id, kind, estimate_id, payload) values
  ('08100000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'deposit.paid', '0e730000-0000-4000-8000-000000000003', '{}');
insert into t81_who select user_id, kind, route from public.push_outbox where notification_id = '08100000-0000-4000-8000-000000000002';
select tst.ok((select count(*) from t81_who where user_id in ('a0000000-0000-0000-0000-000000000001', 'a8100000-0000-4000-8000-000000000001')) = 2
          and not exists (select 1 from t81_who where user_id = 'a8100000-0000-4000-8000-000000000002'), 'T81 payment: owner and admin, not the author');
select tst.ok((select bool_and(kind = 'payment.received') from t81_who), 'T81 deposit.paid is «payment received»');
-- the viewed estimate is off by default; approved is the office's own act
insert into public.notifications (id, company_id, kind, estimate_id) values
  ('08100000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'estimate.viewed', '0e730000-0000-4000-8000-000000000003'),
  ('08100000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'estimate.approved', '0e730000-0000-4000-8000-000000000003');
select tst.ok(not exists (select 1 from public.push_outbox where notification_id in ('08100000-0000-4000-8000-000000000003', '08100000-0000-4000-8000-000000000004')),
          'T81 estimate.viewed and estimate.approved send no push');
-- an error of the queue never rolls back the feed row (a signature, a payment)
alter table public.push_outbox add constraint t81_broken check (false) not valid;
insert into public.notifications (id, company_id, kind, estimate_id) values
  ('08100000-0000-4000-8000-000000000005', 'ca000000-0000-0000-0000-000000000000', 'estimate.client_signed', '0e730000-0000-4000-8000-000000000003');
alter table public.push_outbox drop constraint t81_broken;
select tst.ok(exists (select 1 from public.notifications where id = '08100000-0000-4000-8000-000000000005')
          and not exists (select 1 from public.push_outbox where notification_id = '08100000-0000-4000-8000-000000000005'), 'T81 a broken queue does not roll back the notification');
-- the app's roles have no rights on the queue
:as_owner_a
select tst.fails($q$select 1 from public.push_outbox$q$, 'T81 the owner cannot read the queue');
select tst.fails($q$insert into public.push_outbox (company_id, user_id, kind, route) values ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'lead.new', '/')$q$, 'T81 the app cannot write the queue');
:as_super
select tst.ok(not has_function_privilege('authenticated', 'app.tg_notification_push()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'app.push_recipients(uuid, text[], uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'app.purge_push_outbox()', 'EXECUTE'), 'T81 nobody in the app executes the queue functions');
select tst.fails_like($q$insert into public.push_outbox (company_id, user_id, kind, route) values ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'lead.new', 'https://evil.test')$q$,
          '%push_outbox_route_check%', 'T81 a route is only a path inside the app');
-- one push per (feed row, person): the owner who is also the author of the estimate gets one, not two
update public.estimates set owner_user_id = 'a0000000-0000-0000-0000-000000000001' where id = '0e730000-0000-4000-8000-000000000003';
insert into public.notifications (id, company_id, kind, estimate_id) values
  ('08100000-0000-4000-8000-000000000007', 'ca000000-0000-0000-0000-000000000000', 'estimate.client_signed', '0e730000-0000-4000-8000-000000000003');
select tst.ok((select count(*) from public.push_outbox where notification_id = '08100000-0000-4000-8000-000000000007' and user_id = 'a0000000-0000-0000-0000-000000000001') = 1,
          'T81 the owner who is the author gets exactly one push');
select tst.fails_like($q$insert into public.push_outbox (company_id, user_id, notification_id, kind, route) values ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', '08100000-0000-4000-8000-000000000007', 'estimate.client_signed', '/')$q$,
          '%push_outbox_notification_id_user_id_key%', 'T81 a second push of the same row to the same person is refused by the table');
-- the author who is a subcontractor, switched off or deleted gets nothing
create temp table t81_author (who uuid, nid uuid);
insert into t81_author values
  ('a8100000-0000-4000-8000-000000000003', '08100000-0000-4000-8000-000000000011'),
  ('a8100000-0000-4000-8000-000000000004', '08100000-0000-4000-8000-000000000012'),
  ('a8100000-0000-4000-8000-000000000005', '08100000-0000-4000-8000-000000000013');
update public.users set deleted_at = now() where id = 'a8100000-0000-4000-8000-000000000005';
do $$ declare r record; begin
  for r in select * from t81_author loop
    update public.estimates set owner_user_id = r.who where id = '0e730000-0000-4000-8000-000000000003';
    insert into public.notifications (id, company_id, kind, estimate_id) values (r.nid, 'ca000000-0000-0000-0000-000000000000', 'estimate.client_signed', '0e730000-0000-4000-8000-000000000003');
    perform tst.ok(not exists (select 1 from public.push_outbox where notification_id = r.nid and user_id = r.who), 'T81 an author who is a subcontractor / switched off / deleted gets no push');
    perform tst.ok(exists (select 1 from public.push_outbox where notification_id = r.nid and user_id = 'a0000000-0000-0000-0000-000000000001'), 'T81 the owner still gets it');
  end loop;
end $$;
update public.users set deleted_at = null where id = 'a8100000-0000-4000-8000-000000000005';
drop table t81_author;
-- the trigger and the purge without BYPASSRLS (as T57)
alter function app.tg_notification_push() owner to t80_owner;
alter function app.purge_push_outbox() owner to t80_owner;
alter function app.erase_personal_rows(uuid) owner to t80_owner;
grant execute on function app.push_recipients(uuid, text[], uuid) to t80_owner;
insert into public.notifications (id, company_id, kind, invoice_id) values
  ('08100000-0000-4000-8000-000000000006', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
select tst.ok((select count(*) from public.push_outbox where notification_id = '08100000-0000-4000-8000-000000000006')
          = (select count(*) from public.push_outbox where notification_id = '08100000-0000-4000-8000-000000000002'), 'T81 the queue works without BYPASSRLS (the same people as the deposit)');
-- account deletion erases the person's queued pushes; the 30-day purge keeps fresh rows
select app.erase_personal_rows('a8100000-0000-4000-8000-000000000002');
select tst.ok(not exists (select 1 from public.push_outbox where user_id = 'a8100000-0000-4000-8000-000000000002'), 'T81 account deletion erases the person''s queue rows');
select tst.ok(app.purge_push_outbox() = 0 and exists (select 1 from public.push_outbox), 'T81 the purge keeps rows younger than 30 days');
update public.push_outbox set created_at = now() - interval '31 days';
select tst.ok(app.purge_push_outbox() > 0, 'T81 the purge deletes rows older than 30 days');
select tst.ok(not exists (select 1 from public.push_outbox), 'T81 nothing older than 30 days is left');
alter function app.tg_notification_push() owner to postgres;
alter function app.purge_push_outbox() owner to postgres;
alter function app.erase_personal_rows(uuid) owner to postgres;
delete from public.notifications where id::text like '08100000-%';
update public.estimates set owner_user_id = null where id = '0e730000-0000-4000-8000-000000000003';
update public.memberships set status = 'disabled' where user_id::text like 'a8100000-%' and status = 'active';
drop table t81_who;
delete from public.push_devices;
reassign owned by t80_owner to postgres;
drop owned by t80_owner;
drop role t80_owner;
\echo 'T81 push_outbox: owner, admin and the author; payments to owner and admin; no text; server only ok'

-- ---------------------------------------------------------------- T82: push_claim / push_finish — sending (docs/specs/27 §4.4–4.5)
:as_super
insert into auth.users (id, email, raw_user_meta_data) values
  ('a8200000-0000-4000-8000-000000000001', 'admin82@a.test', '{"full_name":"Ada Admin"}'),
  ('a8200000-0000-4000-8000-000000000002', 'sales82@a.test', '{"full_name":"Sue Sales"}');
insert into public.memberships (company_id, user_id, role, status) values
  ('ca000000-0000-0000-0000-000000000000', 'a8200000-0000-4000-8000-000000000001', 'admin', 'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a8200000-0000-4000-8000-000000000002', 'sales', 'active');
delete from public.push_outbox;
insert into public.push_devices (id, user_id, expo_token, platform, lang) values
  ('d8200000-0000-4000-8000-000000000001', 'a8200000-0000-4000-8000-000000000001', 'ExponentPushToken[t82-ada-1]', 'android', 'es'),
  ('d8200000-0000-4000-8000-000000000002', 'a8200000-0000-4000-8000-000000000001', 'ExponentPushToken[t82-ada-2]', 'ios', 'ru'),
  ('d8200000-0000-4000-8000-000000000003', 'a8200000-0000-4000-8000-000000000002', 'ExponentPushToken[t82-sue-1]', 'android', 'en'),
  ('d8200000-0000-4000-8000-000000000009', 'a0000000-0000-0000-0000-000000000003', 'ExponentPushToken[t82-mike]', 'android', 'en');
create temp table t82_claim (n int, v jsonb);
grant select, insert on t82_claim to service_role;
-- a payment: owner (no phone) and Ada (two phones)
insert into public.notifications (id, company_id, kind, invoice_id) values ('08200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
reset role; set role service_role;
insert into t82_claim select 1, public.push_claim(100);
:as_super
select tst.ok((select jsonb_array_length(v) from t82_claim where n = 1) = 1, 'T82 claim hands out only people with a live phone');
select tst.ok((select v -> 0 ->> 'kind' = 'payment.received' and v -> 0 ->> 'route' = '/notifications' and jsonb_array_length(v -> 0 -> 'devices') = 2 from t82_claim where n = 1),
          'T82 the row carries its kind, route and both phones of the person');
select tst.ok((select bool_and(x ->> 'token' like 'ExponentPushToken[t82-ada-%' and x ->> 'lang' in ('es', 'ru')) from t82_claim, jsonb_array_elements(v -> 0 -> 'devices') x where n = 1),
          'T82 the phones are Ada''s own, with their language');
select tst.ok((select status = 'sending' and tries = 1 from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000001' and user_id = 'a8200000-0000-4000-8000-000000000001'),
          'T82 a claimed row is «sending», tries 1');
select tst.ok((select status = 'skipped' and error = 'no_device' from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-0000-0000-000000000001'),
          'T82 a person without a live phone is skipped (no_device)');
select tst.ok(not (select v::text ~ '(Owner|Ada|\$|total|customer)' from t82_claim where n = 1), 'T82 claim returns no names, sums or text');
-- a second claim right away takes nothing (the row is «sending»)
reset role; set role service_role;
insert into t82_claim select 2, public.push_claim(100);
:as_super
select tst.ok((select v = '[]'::jsonb from t82_claim where n = 2), 'T82 a row in «sending» is not taken twice');
-- retry: 1, 2, 4, 8 min, the fifth try fails for good
create temp table t82_id as select id from public.push_outbox where user_id = 'a8200000-0000-4000-8000-000000000001';
grant select on t82_id to service_role;
reset role; set role service_role;
select tst.ok(public.push_finish((select id from t82_id), 'retry', null, 'http_503') = 'pending', 'T82 retry puts the row back in the queue');
:as_super
select tst.ok((select status = 'pending' and error = 'http_503' and next_try_at between now() + interval '55 seconds' and now() + interval '65 seconds'
               from public.push_outbox where id = (select id from t82_id)), 'T82 the first retry waits 1 min');
reset role; set role service_role;
select tst.ok(public.push_claim(100) = '[]'::jsonb, 'T82 a retry is not taken before its time');
:as_super
do $$ declare i int; v_next interval; begin
  for i in 2..5 loop
    update public.push_outbox set next_try_at = now() where id = (select id from t82_id);
    perform public.push_claim(100);
    if i < 5 then
      perform tst.ok(public.push_finish((select id from t82_id), 'retry', null, 'http_429') = 'pending', 'T82 retry ' || i || ' goes back to the queue');
      select next_try_at - now() into v_next from public.push_outbox where id = (select id from t82_id);
      perform tst.ok(v_next between make_interval(mins => (2 ^ (i - 1))::int) - interval '5 seconds' and make_interval(mins => (2 ^ (i - 1))::int) + interval '5 seconds',
                     'T82 retry ' || i || ' waits 2^(n-1) min');
    else
      perform tst.ok(public.push_finish((select id from t82_id), 'retry', null, 'http_429') = 'failed', 'T82 after 5 tries a retry is failed for good');
    end if;
  end loop;
end $$;
select tst.ok((select status = 'failed' and tries = 5 from public.push_outbox where id = (select id from t82_id)), 'T82 the row stops at 5 tries');
reset role; set role service_role;
select tst.ok(public.push_finish((select id from t82_id), 'sent', null, null) is null, 'T82 finish changes only a row in «sending»');
select tst.fails_like($q$select public.push_finish(gen_random_uuid(), 'done', null, null)$q$, 'unknown status', 'T82 an unknown status is refused');
-- sent: tickets of this person's phones only; the error is a code only
:as_super
insert into public.notifications (id, company_id, kind, invoice_id) values ('08200000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'deposit.paid', null);
truncate t82_id;
insert into t82_id select id from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000002' and user_id = 'a8200000-0000-4000-8000-000000000001';
reset role; set role service_role;
select public.push_claim(100);
select tst.ok(public.push_finish((select id from t82_id), 'sent',
          '[{"ticket_id":"tkt-82-1","device_id":"d8200000-0000-4000-8000-000000000001"},{"ticket_id":"tkt-82-x","device_id":"d8200000-0000-4000-8000-000000000009"},{"ticket_id":"bad ticket","device_id":"d8200000-0000-4000-8000-000000000002"}]',
          null) = 'sent', 'T82 sent');
:as_super
select tst.ok((select status = 'sent' and sent_at is not null and ticket_ids = array['tkt-82-1'] from public.push_outbox where id = (select id from t82_id)),
          'T82 a sent row keeps its tickets');
select tst.ok(not exists (select 1 from public.push_tickets where ticket_id in ('tkt-82-x', 'bad ticket')), 'T82 a ticket of another person''s phone or of a bad shape is not kept');
-- the error is only a short code: never the text of Expo or a token
insert into public.notifications (id, company_id, kind, invoice_id) values ('08200000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
truncate t82_id;
insert into t82_id select id from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000003' and user_id = 'a8200000-0000-4000-8000-000000000001';
reset role; set role service_role;
select public.push_claim(100);
select tst.ok(public.push_finish((select id from t82_id), 'failed', null, '"ExponentPushToken[t82-ada-1]" is not a valid token') = 'failed', 'T82 failed');
:as_super
select tst.ok((select error = 'other' from public.push_outbox where id = (select id from t82_id)), 'T82 an error with text or a token is kept as «other»');
-- checked again at sending time: the person switched off / deleted / the author changed / the phone handed over
insert into public.notifications (id, company_id, kind, invoice_id) values ('08200000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
update public.estimates set owner_user_id = 'a8200000-0000-4000-8000-000000000002' where id = '0e730000-0000-4000-8000-000000000003';
insert into public.notifications (id, company_id, kind, estimate_id) values ('08200000-0000-4000-8000-000000000005', 'ca000000-0000-0000-0000-000000000000', 'estimate.client_signed', '0e730000-0000-4000-8000-000000000003');
select tst.ok(exists (select 1 from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000005' and user_id = 'a8200000-0000-4000-8000-000000000002'),
          'T82 the author (sales) is in the queue of a signature');
update public.memberships set status = 'disabled' where user_id = 'a8200000-0000-4000-8000-000000000001';
update public.estimates set owner_user_id = null where id = '0e730000-0000-4000-8000-000000000003';
reset role; set role service_role;
select public.push_claim(100);
:as_super
select tst.ok((select status = 'skipped' and error = 'not_member' from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000004' and user_id = 'a8200000-0000-4000-8000-000000000001'),
          'T82 a person switched off after the queue gets nothing (not_member)');
select tst.ok((select status = 'skipped' and error = 'not_member' from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000005' and user_id = 'a8200000-0000-4000-8000-000000000002'),
          'T82 an author who is no longer the author gets nothing');
update public.memberships set status = 'active' where user_id = 'a8200000-0000-4000-8000-000000000001';
update public.users set deleted_at = now() where id = 'a8200000-0000-4000-8000-000000000001';
insert into public.notifications (id, company_id, kind, invoice_id) values ('08200000-0000-4000-8000-000000000006', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
-- the queue did not take a deleted person; put one in by hand as if it was queued just before
insert into public.push_outbox (company_id, user_id, notification_id, kind, route)
  values ('ca000000-0000-0000-0000-000000000000', 'a8200000-0000-4000-8000-000000000001', '08200000-0000-4000-8000-000000000006', 'payment.received', '/notifications')
  on conflict do nothing;
reset role; set role service_role;
select public.push_claim(100);
:as_super
select tst.ok((select status = 'skipped' and error = 'not_member' from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000006' and user_id = 'a8200000-0000-4000-8000-000000000001'),
          'T82 a person deleted after the queue gets nothing');
update public.users set deleted_at = null where id = 'a8200000-0000-4000-8000-000000000001';
-- the phones are looked up at sending time: both of Ada's phones went to Mike → nothing to send to Ada
insert into public.notifications (id, company_id, kind, invoice_id) values ('08200000-0000-4000-8000-000000000007', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
update public.push_devices set user_id = 'a0000000-0000-0000-0000-000000000003' where user_id = 'a8200000-0000-4000-8000-000000000001';
reset role; set role service_role;
select tst.ok(not (public.push_claim(100)::text like '%t82-ada%'), 'T82 a phone handed over gets none of the old owner''s pushes');
:as_super
select tst.ok((select status = 'skipped' and error = 'no_device' from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000007' and user_id = 'a8200000-0000-4000-8000-000000000001'),
          'T82 … and the row is skipped (no_device)');
update public.push_devices set user_id = 'a8200000-0000-4000-8000-000000000001' where id in ('d8200000-0000-4000-8000-000000000001', 'd8200000-0000-4000-8000-000000000002');
-- a closed company sends nothing
insert into public.notifications (id, company_id, kind, invoice_id) values ('08200000-0000-4000-8000-000000000008', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
alter table public.companies disable trigger t06_company_closed_guard;
update public.companies set closed_at = now() where id = 'ca000000-0000-0000-0000-000000000000';
reset role; set role service_role;
select public.push_claim(100);
:as_super
update public.companies set closed_at = null where id = 'ca000000-0000-0000-0000-000000000000';
alter table public.companies enable trigger t06_company_closed_guard;
select tst.ok((select status = 'skipped' and error = 'not_member' from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000008' and user_id = 'a8200000-0000-4000-8000-000000000001'),
          'T82 a closed company sends nothing');
-- older than 24 h → skipped; stuck in «sending» > 10 min → back to pending
insert into public.notifications (id, company_id, kind, invoice_id) values ('08200000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
update public.push_outbox set created_at = now() - interval '25 hours' where notification_id = '08200000-0000-4000-8000-000000000009';
insert into public.notifications (id, company_id, kind, invoice_id) values ('08200000-0000-4000-8000-000000000010', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
update public.push_outbox set status = 'sending', tries = 1, next_try_at = now() - interval '11 minutes' where notification_id = '08200000-0000-4000-8000-000000000010';
truncate t82_claim;
reset role; set role service_role;
insert into t82_claim select 3, public.push_claim(100);
:as_super
select tst.ok((select status = 'skipped' and error = 'expired' from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000009' and user_id = 'a8200000-0000-4000-8000-000000000001'),
          'T82 a row older than 24 h is skipped (expired)');
select tst.ok((select status = 'sending' and tries = 2 from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000010' and user_id = 'a8200000-0000-4000-8000-000000000001'),
          'T82 a row stuck in «sending» goes back to the queue and is taken again');
update public.push_outbox set next_try_at = now() - interval '11 minutes', tries = 5 where notification_id = '08200000-0000-4000-8000-000000000010';
reset role; set role service_role;
select public.push_claim(100);
:as_super
select tst.ok((select status = 'failed' and error = 'stuck' from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000010' and user_id = 'a8200000-0000-4000-8000-000000000001'),
          'T82 a stuck row with no tries left is failed');
-- the role was lowered after the queue: an admin who is now sales gets no payment push (security-check #287 №4а)
insert into public.notifications (id, company_id, kind, invoice_id) values ('08200000-0000-4000-8000-000000000012', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
update public.memberships set role = 'sales' where user_id = 'a8200000-0000-4000-8000-000000000001';
reset role; set role service_role;
select public.push_claim(100);
:as_super
update public.memberships set role = 'admin' where user_id = 'a8200000-0000-4000-8000-000000000001';
select tst.ok((select status = 'skipped' and error = 'not_member' from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000012' and user_id = 'a8200000-0000-4000-8000-000000000001'),
          'T82 an admin lowered to sales after the queue gets no payment push');
-- a subcontractor never gets one, even if a row got into the queue (№4б)
insert into auth.users (id, email, raw_user_meta_data) values ('a8200000-0000-4000-8000-000000000003', 'sub82@a.test', '{"full_name":"Sid Sub"}');
insert into public.memberships (company_id, user_id, role, status) values ('ca000000-0000-0000-0000-000000000000', 'a8200000-0000-4000-8000-000000000003', 'subcontractor', 'active');
insert into public.push_devices (id, user_id, expo_token, platform, lang) values ('d8200000-0000-4000-8000-000000000004', 'a8200000-0000-4000-8000-000000000003', 'ExponentPushToken[t82-sid]', 'android', 'en');
insert into public.push_outbox (company_id, user_id, kind, route) values
  ('ca000000-0000-0000-0000-000000000000', 'a8200000-0000-4000-8000-000000000003', 'payment.received', '/notifications'),
  ('ca000000-0000-0000-0000-000000000000', 'a8200000-0000-4000-8000-000000000003', 'lead.new', '/leads');
reset role; set role service_role;
select tst.ok(not (public.push_claim(100)::text like '%t82-sid%'), 'T82 a subcontractor is never sent a push');
:as_super
select tst.ok((select bool_and(status = 'skipped' and error = 'not_member') from public.push_outbox where user_id = 'a8200000-0000-4000-8000-000000000003'),
          'T82 … his rows are skipped (not_member)');
-- some phones reached, some not: a retry goes only to the others; when all live ones have a ticket — sent (№3)
insert into public.notifications (id, company_id, kind, invoice_id) values ('08200000-0000-4000-8000-000000000013', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
create temp table t82_part as select id from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000013' and user_id = 'a8200000-0000-4000-8000-000000000001';
create temp table t82_got (v jsonb);
grant select on t82_part to service_role;
grant select, insert on t82_got to service_role;
reset role; set role service_role;
insert into t82_got select x from jsonb_array_elements(public.push_claim(100)) x;
select tst.ok((select jsonb_array_length(v -> 'devices') from t82_got where (v ->> 'id')::uuid = (select id from t82_part)) = 2, 'T82 partial: the first try goes to both phones');
select tst.ok(public.push_finish((select id from t82_part), 'retry', '[{"ticket_id":"tkt-82-p1","device_id":"d8200000-0000-4000-8000-000000000001"}]', 'http_429') = 'pending',
          'T82 partial: one phone reached, the row is retried');
:as_super
update public.push_outbox set next_try_at = now() where id = (select id from t82_part);
truncate t82_got;
reset role; set role service_role;
insert into t82_got select x from jsonb_array_elements(public.push_claim(100)) x;
select tst.ok((select array_agg(d ->> 'device_id') from t82_got, jsonb_array_elements(v -> 'devices') d where (v ->> 'id')::uuid = (select id from t82_part))
          = array['d8200000-0000-4000-8000-000000000002'], 'T82 partial: the retry goes only to the phone not reached');
select tst.ok(public.push_finish((select id from t82_part), 'sent', '[{"ticket_id":"tkt-82-p2","device_id":"d8200000-0000-4000-8000-000000000002"}]', null) = 'sent', 'T82 partial: sent');
:as_super
select tst.ok((select ticket_ids = array['tkt-82-p1', 'tkt-82-p2'] from public.push_outbox where id = (select id from t82_part)), 'T82 partial: the row keeps the tickets of both tries');
-- the phone not reached went off before the retry: every live phone has a ticket → the claim marks it sent
insert into public.notifications (id, company_id, kind, invoice_id) values ('08200000-0000-4000-8000-000000000014', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
truncate t82_part;
insert into t82_part select id from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000014' and user_id = 'a8200000-0000-4000-8000-000000000001';
reset role; set role service_role;
select public.push_claim(100);
select public.push_finish((select id from t82_part), 'retry', '[{"ticket_id":"tkt-82-p3","device_id":"d8200000-0000-4000-8000-000000000001"}]', 'http_503');
:as_super
update public.push_devices set revoked_at = now(), revoked_reason = 'signed_out' where id = 'd8200000-0000-4000-8000-000000000002';
update public.push_outbox set next_try_at = now() where id = (select id from t82_part);
reset role; set role service_role;
select tst.ok(not (public.push_claim(100)::text like '%' || (select id from t82_part)::text || '%'), 'T82 partial: nothing is sent twice to the phone already reached');
:as_super
select tst.ok((select status = 'sent' and ticket_ids = array['tkt-82-p3'] from public.push_outbox where id = (select id from t82_part)), 'T82 partial: all live phones reached → sent');
-- out of tries with one phone reached: sent (to it), the error stays
insert into public.notifications (id, company_id, kind, invoice_id) values ('08200000-0000-4000-8000-000000000015', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
truncate t82_part;
insert into t82_part select id from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000015' and user_id = 'a8200000-0000-4000-8000-000000000001';
update public.push_devices set revoked_at = null, revoked_reason = null where id = 'd8200000-0000-4000-8000-000000000002';
update public.push_outbox set tries = 4 where id = (select id from t82_part);
reset role; set role service_role;
select public.push_claim(100);
select tst.ok(public.push_finish((select id from t82_part), 'retry', '[{"ticket_id":"tkt-82-p4","device_id":"d8200000-0000-4000-8000-000000000001"}]', 'http_503') = 'sent',
          'T82 partial: the last try with one phone reached is sent, not failed');
:as_super
select tst.ok((select status = 'sent' and error = 'http_503' from public.push_outbox where id = (select id from t82_part)), 'T82 partial: … and keeps why not all phones got it');
drop table t82_part;
drop table t82_got;
-- the limit of one claim
insert into public.push_outbox (company_id, user_id, kind, route)
  select 'ca000000-0000-0000-0000-000000000000', 'a8200000-0000-4000-8000-000000000001', 'payment.received', '/notifications' from generate_series(1, 3);
reset role; set role service_role;
select tst.ok(jsonb_array_length(public.push_claim(2)) = 2, 'T82 claim takes not more than its limit');
-- rights: service_role only (rule 18)
:as_super
select tst.ok(has_function_privilege('service_role', 'public.push_claim(integer)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.push_finish(uuid, text, jsonb, text)', 'EXECUTE'), 'T82 service_role executes claim and finish');
select tst.ok(not has_function_privilege('authenticated', 'public.push_claim(integer)', 'EXECUTE') and not has_function_privilege('anon', 'public.push_claim(integer)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.push_finish(uuid, text, jsonb, text)', 'EXECUTE') and not has_function_privilege('anon', 'public.push_finish(uuid, text, jsonb, text)', 'EXECUTE'),
          'T82 the app (anon, authenticated) executes neither');
:as_owner_a
select tst.fails($q$select public.push_claim(100)$q$, 'T82 the owner cannot claim pushes');
select tst.fails($q$select public.push_finish(gen_random_uuid(), 'sent', null, null)$q$, 'T82 the owner cannot finish pushes');
:as_super
-- the server's path without BYPASSRLS (as T80)
create role t82_owner nologin nobypassrls;
grant postgres to t82_owner;
grant usage on schema app, public to t82_owner;
grant select, insert, update, delete on public.push_devices, public.push_outbox, public.push_tickets to t82_owner;
grant select on public.notifications, public.estimates, public.memberships, public.users, public.companies to t82_owner;
grant execute on all functions in schema app to t82_owner;
alter function public.push_claim(integer) owner to t82_owner;
alter function public.push_finish(uuid, text, jsonb, text) owner to t82_owner;
update public.push_outbox set status = 'skipped' where status in ('pending', 'sending');
insert into public.notifications (id, company_id, kind, invoice_id) values ('08200000-0000-4000-8000-000000000011', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
truncate t82_id;
insert into t82_id select id from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000011' and user_id = 'a8200000-0000-4000-8000-000000000001';
reset role; set role service_role;
select tst.ok(public.push_claim(100)::text like '%t82-ada-1%', 'T82 claim works without BYPASSRLS');
select tst.ok(public.push_finish((select id from t82_id), 'sent', '[{"ticket_id":"tkt-82-2","device_id":"d8200000-0000-4000-8000-000000000001"}]', null) = 'sent', 'T82 finish works without BYPASSRLS');
:as_super
alter function public.push_claim(integer) owner to postgres;
alter function public.push_finish(uuid, text, jsonb, text) owner to postgres;
drop table t82_claim;
drop table t82_id;
\echo 'T82 push_claim / push_finish: atomic, checked again at sending, retries 1-2-4-8, 5 tries, service_role only ok'

-- ---------------------------------------------------------------- T83: receipts, DeviceNotRegistered, the kick, schedules (docs/specs/27 §4.5)
:as_super
insert into public.push_tickets (ticket_id, outbox_id, device_id, created_at)
  select 'tkt-83-old', id, 'd8200000-0000-4000-8000-000000000001', now() - interval '20 minutes' from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000011' and user_id = 'a8200000-0000-4000-8000-000000000001';
insert into public.push_tickets (ticket_id, outbox_id, device_id, created_at)
  select 'tkt-83-day', id, 'd8200000-0000-4000-8000-000000000002', now() - interval '25 hours' from public.push_outbox where notification_id = '08200000-0000-4000-8000-000000000011' and user_id = 'a8200000-0000-4000-8000-000000000001';
reset role; set role service_role;
select tst.ok((select array_agg(x ->> 'ticket_id' order by x ->> 'ticket_id') from jsonb_array_elements(public.push_receipts_due(300)) x) = array['tkt-83-old'],
          'T83 due receipts: older than 15 min, not checked, not older than 24 h');
:as_super
select tst.ok((select checked_at is not null from public.push_tickets where ticket_id = 'tkt-83-day'), 'T83 a ticket older than 24 h is closed without asking (Expo forgot it)');
select tst.ok((select checked_at is null from public.push_tickets where ticket_id = 'tkt-82-2'), 'T83 a fresh ticket waits');
reset role; set role service_role;
select public.push_receipts_done(array['tkt-83-old'], array['d8200000-0000-4000-8000-000000000001']::uuid[]);
:as_super
select tst.ok((select checked_at is not null from public.push_tickets where ticket_id = 'tkt-83-old'), 'T83 a checked receipt is marked');
select tst.ok((select revoked_reason = 'not_registered' and revoked_at is not null from public.push_devices where id = 'd8200000-0000-4000-8000-000000000001'),
          'T83 DeviceNotRegistered switches the phone off');
select tst.ok((select revoked_at is null from public.push_devices where id = 'd8200000-0000-4000-8000-000000000002'), 'T83 the person''s other phone stays on');
insert into public.notifications (id, company_id, kind, invoice_id) values ('08300000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
reset role; set role service_role;
select tst.ok(not (public.push_claim(100)::text like '%t82-ada-1%'), 'T83 a switched-off phone is not sent to again');
-- receipts_done touches only the ids it is given (№4в): unknown tickets and phones change nothing
:as_super
create temp table t83_before as
  select (select count(*) from public.push_tickets where checked_at is null) as open_tickets,
         (select count(*) from public.push_devices where revoked_at is null) as live_phones;
reset role; set role service_role;
select public.push_receipts_done(array['no-such-ticket'], array[gen_random_uuid()]);
select public.push_receipts_done(null, null);
:as_super
select tst.ok((select open_tickets from t83_before) = (select count(*) from public.push_tickets where checked_at is null)
          and (select live_phones from t83_before) = (select count(*) from public.push_devices where revoked_at is null),
          'T83 receipts_done with unknown ids changes no other ticket or phone');
drop table t83_before;
-- the app re-registers the token: the phone is on again (P1)
:as_super
select tst.ok(not has_function_privilege('authenticated', 'public.push_receipts_due(integer)', 'EXECUTE') and not has_function_privilege('anon', 'public.push_receipts_due(integer)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.push_receipts_done(text[], uuid[])', 'EXECUTE') and not has_function_privilege('anon', 'public.push_receipts_done(text[], uuid[])', 'EXECUTE')
          and has_function_privilege('service_role', 'public.push_receipts_done(text[], uuid[])', 'EXECUTE'), 'T83 receipts: service_role only');
select tst.ok(not has_function_privilege('authenticated', 'app.push_kick()', 'EXECUTE') and not has_function_privilege('anon', 'app.push_kick()', 'EXECUTE')
          and not has_function_privilege('service_role', 'app.push_kick()', 'EXECUTE'), 'T83 nobody but the owner (pg_cron) runs the kick');
select tst.ok(not has_table_privilege('authenticated', 'public.push_tickets', 'SELECT') and not has_table_privilege('anon', 'public.push_tickets', 'SELECT')
          and not has_table_privilege('authenticated', 'public.push_tickets', 'INSERT'), 'T83 the app has no rights on push_tickets');
:as_owner_a
select tst.fails($q$select 1 from public.push_tickets$q$, 'T83 the owner cannot read tickets');
select tst.fails($q$select public.push_receipts_done(array['x'], null)$q$, 'T83 the owner cannot mark receipts');
:as_super
-- pg_net on the hosting: the app's roles have no rights in schema net (security-check #287 №1); no pg_net here → skipped
do $$ begin
  if to_regnamespace('net') is null then
    perform tst.ok(true, 'T83 no pg_net here: nothing to check in schema net');
  else
    perform tst.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'net'::regnamespace
                                and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')))
                   and not exists (select 1 from pg_class c where c.relnamespace = 'net'::regnamespace and c.relkind in ('r', 'v', 'p')
                                    and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT'))),
                   'T83 anon and authenticated have no rights in schema net');
  end if;
end $$;
-- the kick: no Vault and no pg_net here → silent
select tst.ok(app.push_kick() = false, 'T83 the kick without Vault and pg_net does nothing');
-- the kick with a stand-in Vault and pg_net (as on Supabase): only with both secrets, only https, the key in a header
create schema vault;
create table vault.decrypted_secrets (name text, decrypted_secret text, created_at timestamptz default now());
create schema net;
create table net.t83_calls (url text, body jsonb, headers jsonb, timeout_ms int);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net.t83_calls values (url, body, headers, timeout_milliseconds) returning 1::bigint $$;
select tst.ok(app.push_kick() = false and not exists (select 1 from net.t83_calls), 'T83 the kick without secrets is silent');
insert into vault.decrypted_secrets (name, decrypted_secret) values ('push_fn_url', 'http://example.test/functions/v1/send-push'), ('push_fn_key', 'k83-0123456789abcdef');
select tst.ok(app.push_kick() = false and not exists (select 1 from net.t83_calls), 'T83 the kick never calls a plain http address');
update vault.decrypted_secrets set decrypted_secret = 'https://example.test/functions/v1/send-push' where name = 'push_fn_url';
select tst.ok(app.push_kick() = true, 'T83 the kick with both secrets calls send-push');
select tst.ok((select count(*) = 1 and bool_and(url = 'https://example.test/functions/v1/send-push' and body = '{}'::jsonb and headers ->> 'x-push-key' = 'k83-0123456789abcdef'
               and timeout_ms = 5000) from net.t83_calls), 'T83 one POST, empty body, the key in x-push-key, 5 s');
delete from vault.decrypted_secrets where name = 'push_fn_key';
select tst.ok(app.push_kick() = false and (select count(*) from net.t83_calls) = 1, 'T83 without the key the kick is silent');
drop schema net cascade;
drop schema vault cascade;
-- schedules: one of each, where pg_cron exists (not in this local database)
do $$ declare n int; begin
  if to_regnamespace('cron') is null then
    perform tst.ok(true, 'T83 no pg_cron here: the migration made no schedule and did not fail');
  else
    execute $q$select count(*) from cron.job where jobname in ('send-push', 'push-purge')$q$ into n;
    perform tst.ok(n = 2, 'T83 the schedules exist once each');
  end if;
end $$;
-- the purge: tickets older than 2 days go
update public.push_tickets set created_at = now() - interval '3 days' where ticket_id = 'tkt-83-day';
select app.purge_push_outbox();
select tst.ok(not exists (select 1 from public.push_tickets where ticket_id = 'tkt-83-day') and exists (select 1 from public.push_tickets where ticket_id = 'tkt-83-old'),
          'T83 the purge deletes tickets older than 2 days only');
-- account deletion erases the person's tickets with their phones and queue (cascade)
select app.erase_personal_rows('a8200000-0000-4000-8000-000000000001');
select tst.ok(not exists (select 1 from public.push_tickets t join public.push_devices d on d.id = t.device_id where d.user_id = 'a8200000-0000-4000-8000-000000000001')
          and not exists (select 1 from public.push_tickets where ticket_id like 'tkt-8%'), 'T83 account deletion erases the person''s tickets');
-- clean up
delete from public.push_outbox;
delete from public.push_devices;
delete from public.notifications where id::text like '08200000-%' or id::text like '08300000-%';
update public.memberships set status = 'disabled' where user_id::text like 'a8200000-%' and status = 'active';
reassign owned by t82_owner to postgres;
drop owned by t82_owner;
drop role t82_owner;
\echo 'T83 receipts, DeviceNotRegistered, the kick from Vault, schedules once ok'

-- ---------------------------------------------------------------- T84: pushes of visits and leads (docs/specs/27 §4.7)
:as_super
delete from public.push_outbox;
insert into auth.users (id, email, raw_user_meta_data) values ('a8400000-0000-4000-8000-000000000001', 'sub84@a.test', '{"full_name":"Sam Sub"}');
insert into public.memberships (company_id, user_id, role, status) values ('ca000000-0000-0000-0000-000000000000', 'a8400000-0000-4000-8000-000000000001', 'subcontractor', 'active');
-- a lead the owner gets (assigned to him), added by the office
:as_office_a
insert into public.leads (id, company_id, source_id, contact_name, phone, assigned_to) values
  ('18400000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T84 Lead', '+13235558401', 'a0000000-0000-0000-0000-000000000001');
:as_super
select tst.ok((select count(*) = 1 and bool_and(route = '/lead/18400000-0000-4000-8000-000000000001' and notification_id is null)
               from public.push_outbox where kind = 'lead.new' and source_id = '18400000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-0000-0000-000000000001'),
          'T84 a new lead added by the office: a push to its assignee (the owner), once');
select tst.ok(not exists (select 1 from public.push_outbox where source_id = '18400000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-0000-0000-000000000002'),
          'T84 … not to the office who added it');
-- the owner adds a lead for himself: nobody is told
:as_owner_a
insert into public.leads (id, company_id, source_id, contact_name, phone, assigned_to) values
  ('18400000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T84 Own', '+13235558402', 'a0000000-0000-0000-0000-000000000001');
:as_super
select tst.ok(not exists (select 1 from public.push_outbox where source_id = '18400000-0000-4000-8000-000000000002' and user_id = 'a0000000-0000-0000-0000-000000000001'),
          'T84 the person who added the lead gets no push about it');
select tst.ok(exists (select 1 from public.push_outbox where source_id = '18400000-0000-4000-8000-000000000002' and user_id = 'a0000000-0000-0000-0000-000000000002'),
          'T84 a busy owner is not the only one: the office hears of the owner''s new lead (variant 2)');
-- a lead given to the tech at once: the tech and the people of the flow; never the subcontractor
:as_office_a
insert into public.leads (id, company_id, source_id, contact_name, phone, assigned_to) values
  ('18400000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T84 Tech', '+13235558404', 'a0000000-0000-0000-0000-000000000003');
:as_super
select tst.ok(exists (select 1 from public.push_outbox where source_id = '18400000-0000-4000-8000-000000000004' and user_id = 'a0000000-0000-0000-0000-000000000003')
          and exists (select 1 from public.push_outbox where source_id = '18400000-0000-4000-8000-000000000004' and user_id = 'a0000000-0000-0000-0000-000000000001')
          and not exists (select 1 from public.push_outbox where source_id = '18400000-0000-4000-8000-000000000004' and user_id = 'a8400000-0000-4000-8000-000000000001'),
          'T84 a lead given to the tech: the tech and the owner; not the subcontractor');
-- a lead nobody holds (from outside: no auth.uid) → owner, admin, office; never tech or subcontractor
insert into public.leads (id, company_id, source_id, contact_name, phone, assigned_to) values
  ('18400000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T84 Web', '+13235558403', null);
select tst.ok(exists (select 1 from public.push_outbox where source_id = '18400000-0000-4000-8000-000000000003' and user_id = 'a0000000-0000-0000-0000-000000000001')
          and exists (select 1 from public.push_outbox where source_id = '18400000-0000-4000-8000-000000000003' and user_id = 'a0000000-0000-0000-0000-000000000002')
          and not exists (select 1 from public.push_outbox where source_id = '18400000-0000-4000-8000-000000000003'
                          and user_id in ('a0000000-0000-0000-0000-000000000003', 'a8400000-0000-4000-8000-000000000001')),
          'T84 a lead nobody holds: owner and office, not a tech or a subcontractor');
-- given to the tech → «lead assigned to you»; giving it to oneself — nothing; a subcontractor — nothing
:as_office_a
update public.leads set assigned_to = 'a0000000-0000-0000-0000-000000000003' where id = '18400000-0000-4000-8000-000000000001';
update public.leads set assigned_to = 'a0000000-0000-0000-0000-000000000002' where id = '18400000-0000-4000-8000-000000000002';
:as_super
select tst.ok(exists (select 1 from public.push_outbox where kind = 'lead.assigned' and user_id = 'a0000000-0000-0000-0000-000000000003'
                      and source_id = '18400000-0000-4000-8000-000000000001'), 'T84 a lead given to the tech: «lead assigned to you»');
select tst.ok(not exists (select 1 from public.push_outbox where kind = 'lead.assigned' and user_id = 'a0000000-0000-0000-0000-000000000002'),
          'T84 a lead someone takes himself: no push');
update public.leads set assigned_to = 'a8400000-0000-4000-8000-000000000001' where id = '18400000-0000-4000-8000-000000000003';
select tst.ok(not exists (select 1 from public.push_outbox where kind = 'lead.assigned' and user_id = 'a8400000-0000-4000-8000-000000000001'),
          'T84 a subcontractor gets no lead push');
-- a lead given to the subcontractor at once: no push to him (the people of the flow still get it)
:as_office_a
insert into public.leads (id, company_id, source_id, contact_name, phone, assigned_to) values
  ('18400000-0000-4000-8000-000000000005', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T84 Sub', '+13235558405', 'a8400000-0000-4000-8000-000000000001');
:as_super
select tst.ok(not exists (select 1 from public.push_outbox where source_id = '18400000-0000-4000-8000-000000000005' and user_id = 'a8400000-0000-4000-8000-000000000001')
          and exists (select 1 from public.push_outbox where source_id = '18400000-0000-4000-8000-000000000005' and user_id = 'a0000000-0000-0000-0000-000000000001'),
          'T84 a lead given to the subcontractor at once: nothing to him, the owner still hears');
-- a visit: the office puts Mike and the subcontractor on it (assign_visit), and itself
insert into public.visits (id, company_id, lead_id, kind, legacy_no_property, starts_at, ends_at) values
  ('f8400000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '18400000-0000-4000-8000-000000000001', 'inspection', true,
   now() + interval '1 day', now() + interval '1 day 1 hour');
:as_office_a
select public.assign_visit('f8400000-0000-4000-8000-000000000001', array['a0000000-0000-0000-0000-000000000003', 'a8400000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000002']::uuid[]);
:as_super
select tst.ok((select array_agg(user_id order by user_id) from public.push_outbox where kind = 'visit.assigned' and source_id = 'f8400000-0000-4000-8000-000000000001')
          = array['a0000000-0000-0000-0000-000000000003']::uuid[],
          'T84 visit assigned: Mike; not the office who assigned itself, not the subcontractor (he cannot open a visit yet)');
select tst.ok((select bool_and(route = '/visit/f8400000-0000-4000-8000-000000000001') from public.push_outbox where kind = 'visit.assigned'), 'T84 the push leads to the visit');
-- moved (by the office, who is on it too) while «assigned» still waits: no second push
:as_office_a
update public.visits set starts_at = starts_at + interval '2 hours', ends_at = ends_at + interval '2 hours' where id = 'f8400000-0000-4000-8000-000000000001';
:as_super
select tst.ok(not exists (select 1 from public.push_outbox where kind = 'visit.rescheduled'), 'T84 moved while «assigned» waits: no second push');
-- sent; then moved (only the end): everyone on it but the one who moved it
update public.push_outbox set status = 'sent' where kind = 'visit.assigned';
:as_office_a
update public.visits set ends_at = ends_at + interval '30 minutes' where id = 'f8400000-0000-4000-8000-000000000001';
:as_super
select tst.ok((select array_agg(user_id order by user_id) from public.push_outbox where kind = 'visit.rescheduled')
          = array['a0000000-0000-0000-0000-000000000003']::uuid[],
          'T84 a longer visit (only ends_at): «visit rescheduled» to everyone on it but the office and the subcontractor');
-- the same values again (an offline repeat) or a note: nothing new; moved again while waiting: still one
update public.push_outbox set status = 'sent' where kind = 'visit.rescheduled';
update public.visits set ends_at = ends_at, notes = 'gate code at the door' where id = 'f8400000-0000-4000-8000-000000000001';
select tst.ok((select count(*) from public.push_outbox where kind = 'visit.rescheduled') = 1, 'T84 the same time again or a note: no push');
update public.visits set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' where id = 'f8400000-0000-4000-8000-000000000001';
update public.visits set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where id = 'f8400000-0000-4000-8000-000000000001';
select tst.ok((select count(*) = count(distinct user_id) and count(*) = 2 from public.push_outbox where kind = 'visit.rescheduled' and status = 'pending'),
          'T84 moved twice while waiting (not by a person on it): one push per person (Mike, the office)');
select tst.ok(not exists (select 1 from public.push_outbox where user_id = 'a8400000-0000-4000-8000-000000000001' and kind like 'visit.%'),
          'T84 a subcontractor on a visit gets no visit push (security-check #291 №1)');
-- taken off and put back (assign_visit updates deleted_at back to null): a new «assigned» once the old one is gone
:as_office_a
select public.assign_visit('f8400000-0000-4000-8000-000000000001', array['a8400000-0000-4000-8000-000000000001']::uuid[]);
select public.assign_visit('f8400000-0000-4000-8000-000000000001', array['a8400000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000003']::uuid[]);
:as_super
select tst.ok((select count(*) from public.push_outbox where kind = 'visit.assigned' and user_id = 'a0000000-0000-0000-0000-000000000003') = 2,
          'T84 put back on the visit: a new «assigned» push');
-- a direct row (old queues: op lead.visit) is caught too; a repeat while waiting is not doubled
insert into public.visits (id, company_id, lead_id, kind, legacy_no_property, starts_at, ends_at) values
  ('f8400000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', '18400000-0000-4000-8000-000000000001', 'inspection', true,
   now() + interval '2 days', now() + interval '2 days 1 hour');
:as_office_a
insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', 'f8400000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000003');
:as_super
update public.visit_assignees set deleted_at = now() where visit_id = 'f8400000-0000-4000-8000-000000000002';
update public.visit_assignees set deleted_at = null where visit_id = 'f8400000-0000-4000-8000-000000000002';
select tst.ok((select count(*) from public.push_outbox where source_id = 'f8400000-0000-4000-8000-000000000002') = 1, 'T84 a direct row is caught; a repeat while waiting is not doubled');
-- a visit already done: no push
insert into public.visits (id, company_id, lead_id, kind, legacy_no_property, starts_at, ends_at, status) values
  ('f8400000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', '18400000-0000-4000-8000-000000000001', 'inspection', true,
   now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 'completed');
insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', 'f8400000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000003');
select tst.ok(not exists (select 1 from public.push_outbox where source_id = 'f8400000-0000-4000-8000-000000000003'), 'T84 a done visit sends no push');
-- a broken queue never rolls back the visit or the lead
alter table public.push_outbox add constraint t84_broken check (false) not valid;
insert into public.leads (id, company_id, source_id, contact_name, phone, assigned_to) values
  ('18400000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T84 Broken', '+13235558409', null);
insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', 'f8400000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000002');
alter table public.push_outbox drop constraint t84_broken;
select tst.ok(exists (select 1 from public.leads where id = '18400000-0000-4000-8000-000000000009')
          and exists (select 1 from public.visit_assignees where visit_id = 'f8400000-0000-4000-8000-000000000002' and user_id = 'a0000000-0000-0000-0000-000000000002'),
          'T84 a broken queue does not roll back the lead or the visit');
-- at sending time: phones for everyone, then the world changes before the claim
insert into public.push_devices (user_id, expo_token, platform, lang) values
  ('a0000000-0000-0000-0000-000000000001', 'ExponentPushToken[t84-owner]', 'android', 'en'),
  ('a0000000-0000-0000-0000-000000000002', 'ExponentPushToken[t84-office]', 'android', 'en'),
  ('a0000000-0000-0000-0000-000000000003', 'ExponentPushToken[t84-mike]', 'android', 'en'),
  ('a8400000-0000-4000-8000-000000000001', 'ExponentPushToken[t84-sub]', 'android', 'en');
delete from public.push_outbox where status = 'sent';
update public.push_outbox set next_try_at = now() where status = 'pending';
-- Mike is taken off visit 2 (directly, as an old queue would), visit 1 is cancelled for the subcontractor; lead 1 is closed
update public.visit_assignees set deleted_at = now() where visit_id = 'f8400000-0000-4000-8000-000000000002' and user_id = 'a0000000-0000-0000-0000-000000000003';
update public.visits set status = 'cancelled', cancel_reason = 'other', cancel_reason_text = 'T84' where id = 'f8400000-0000-4000-8000-000000000001';
update public.leads set status = 'lost', lost_reason = 'price_too_high' where id = '18400000-0000-4000-8000-000000000001';
-- lead 3 went to the subcontractor: its «new lead» to owner and office still stands (they handle the flow)
-- lead 4 is handed from Mike to the office before sending
update public.leads set assigned_to = 'a0000000-0000-0000-0000-000000000002' where id = '18400000-0000-4000-8000-000000000004';
-- a forged row: «visit assigned» to the owner of a visit he is not on → skipped at sending
insert into public.push_outbox (company_id, user_id, kind, route, source_id) values
  ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'visit.assigned', '/visit/f8400000-0000-4000-8000-000000000002', 'f8400000-0000-4000-8000-000000000002');
reset role; set role service_role;
select public.push_claim(500);
:as_super
select tst.ok((select bool_and(status = 'skipped' and error = 'not_member') from public.push_outbox
               where source_id in ('f8400000-0000-4000-8000-000000000001', '18400000-0000-4000-8000-000000000001')),
          'T84 at sending: a cancelled visit and a closed lead send nothing');
select tst.ok((select status = 'skipped' and error = 'not_member' from public.push_outbox
               where source_id = 'f8400000-0000-4000-8000-000000000002' and user_id = 'a0000000-0000-0000-0000-000000000003'),
          'T84 at sending: a person taken off the visit gets nothing');
select tst.ok((select status = 'skipped' and error = 'not_member' from public.push_outbox
               where kind = 'visit.assigned' and source_id = 'f8400000-0000-4000-8000-000000000002' and user_id = 'a0000000-0000-0000-0000-000000000001'),
          'T84 at sending: a forged «visit assigned» of a visit the person is not on is skipped');
select tst.ok((select count(*) = 2 and bool_and(status = 'sending') from public.push_outbox where source_id = '18400000-0000-4000-8000-000000000003'
               and user_id in ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002')),
          'T84 at sending: the open lead still goes to the people of the flow');
select tst.ok((select status = 'skipped' and error = 'not_member' from public.push_outbox where source_id = '18400000-0000-4000-8000-000000000004'
               and user_id = 'a0000000-0000-0000-0000-000000000003' and kind = 'lead.new')
          and (select status = 'sending' from public.push_outbox where source_id = '18400000-0000-4000-8000-000000000004'
               and user_id = 'a0000000-0000-0000-0000-000000000001' and kind = 'lead.new'),
          'T84 at sending: the tech whose lead was handed on gets nothing, the owner still does');
-- the subcontractor never gets money or signatures (payment, signature of his own estimate)
update public.estimates set owner_user_id = 'a8400000-0000-4000-8000-000000000001' where id = '0e730000-0000-4000-8000-000000000003';
insert into public.notifications (id, company_id, kind, estimate_id) values
  ('08400000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'estimate.client_signed', '0e730000-0000-4000-8000-000000000003'),
  ('08400000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
select tst.ok(not exists (select 1 from public.push_outbox where user_id = 'a8400000-0000-4000-8000-000000000001' and kind in ('estimate.client_signed', 'payment.received')),
          'T84 a subcontractor gets no signature or money push');
update public.estimates set owner_user_id = null where id = '0e730000-0000-4000-8000-000000000003';
\echo 'T84 visits and leads: assigned, moved, new, given; not the actor; a subcontractor nothing yet; checked at sending ok'

-- ---------------------------------------------------------------- T85: the switches by kind (docs/specs/27 §4.7)
:as_super
delete from public.push_outbox;
:as_tech_a
select tst.ok((public.set_push_kind('ca000000-0000-0000-0000-000000000000', 'visits', false) ->> 'enabled') = 'false', 'T85 Mike switches «visits» off');
select tst.ok(tst.cnt($q$select 1 from public.push_prefs where kind = 'visits' and not enabled$q$) = 1, 'T85 he reads his own switch');
select tst.fails_like($q$select public.set_push_kind('ca000000-0000-0000-0000-000000000000', 'everything', false)$q$, 'unknown notification kind', 'T85 an unknown kind is refused');
select tst.fails_like($q$select public.set_push_kind('cb000000-0000-0000-0000-000000000000', 'visits', false)$q$, 'only a member%', 'T85 not in another company');
select tst.fails($q$insert into public.push_prefs (company_id, user_id, kind, enabled) values ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'leads', false)$q$, 'T85 no direct insert');
select tst.blocked($q$update public.push_prefs set enabled = true$q$, 'T85 no direct update');
:as_owner_a
select tst.ok(tst.cnt($q$select 1 from public.push_prefs$q$) = 0, 'T85 another person does not see Mike''s switches');
:as_super
-- switched off → not queued
insert into public.visits (id, company_id, lead_id, kind, legacy_no_property, starts_at, ends_at) values
  ('f8500000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '18400000-0000-4000-8000-000000000003', 'inspection', true,
   now() + interval '1 day', now() + interval '1 day 1 hour');
insert into public.visit_assignees (company_id, visit_id, user_id) values ('ca000000-0000-0000-0000-000000000000', 'f8500000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000003');
select tst.ok(not exists (select 1 from public.push_outbox where user_id = 'a0000000-0000-0000-0000-000000000003'), 'T85 a kind switched off is not queued');
-- switched off after it was queued → skipped 'off' at sending
:as_tech_a
select public.set_push_kind('ca000000-0000-0000-0000-000000000000', 'visits', true);
:as_super
update public.visits set starts_at = starts_at + interval '1 hour' where id = 'f8500000-0000-4000-8000-000000000001';
select tst.ok(exists (select 1 from public.push_outbox where user_id = 'a0000000-0000-0000-0000-000000000003' and kind = 'visit.rescheduled'), 'T85 switched on again: queued');
:as_tech_a
select public.set_push_kind('ca000000-0000-0000-0000-000000000000', 'visits', false);
reset role; set role service_role;
select public.push_claim(100);
:as_super
select tst.ok((select status = 'skipped' and error = 'off' from public.push_outbox where user_id = 'a0000000-0000-0000-0000-000000000003' and kind = 'visit.rescheduled'),
          'T85 switched off after the queue: skipped (off)');
-- «the client opened the estimate»: off by default; the author who switched it on gets it
update public.estimates set owner_user_id = 'a0000000-0000-0000-0000-000000000001' where id = '0e730000-0000-4000-8000-000000000003';
insert into public.notifications (id, company_id, kind, estimate_id) values ('08500000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'estimate.viewed', '0e730000-0000-4000-8000-000000000003');
select tst.ok(not exists (select 1 from public.push_outbox where kind = 'estimate.viewed'), 'T85 «estimate opened» is off by default');
:as_owner_a
select public.set_push_kind('ca000000-0000-0000-0000-000000000000', 'viewed', true);
:as_super
insert into public.notifications (id, company_id, kind, estimate_id) values ('08500000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'estimate.viewed', '0e730000-0000-4000-8000-000000000003');
select tst.ok((select count(*) = 1 and bool_and(user_id = 'a0000000-0000-0000-0000-000000000001' and route = '/estimate/0e730000-0000-4000-8000-000000000003')
               from public.push_outbox where kind = 'estimate.viewed'), 'T85 switched on: the author gets «estimate opened», nobody else');
-- a payment with «payment» off for the owner: not queued for him
:as_owner_a
select public.set_push_kind('ca000000-0000-0000-0000-000000000000', 'payment', false);
:as_super
insert into public.notifications (id, company_id, kind, invoice_id) values ('08500000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'invoice.paid', null);
select tst.ok(not exists (select 1 from public.push_outbox where notification_id = '08500000-0000-4000-8000-000000000003' and user_id = 'a0000000-0000-0000-0000-000000000001'),
          'T85 «payment» off: the owner gets no payment push');
-- the server's paths without BYPASSRLS (as T80): the switch, the enqueue and the lead trigger
create role t85_owner nologin nobypassrls;
grant postgres to t85_owner;
grant usage on schema app, public to t85_owner;
grant select, insert, update, delete on public.push_prefs, public.push_outbox to t85_owner;
grant select on public.memberships, public.users, public.companies, public.leads to t85_owner;
grant execute on all functions in schema app to t85_owner;
alter function public.set_push_kind(uuid, text, boolean) owner to t85_owner;
alter function app.push_enqueue(uuid, uuid, text, text, uuid) owner to t85_owner;
alter function app.push_enabled(uuid, uuid, text) owner to t85_owner;
alter function app.tg_lead_push() owner to t85_owner;
:as_owner_a
select tst.ok((public.set_push_kind('ca000000-0000-0000-0000-000000000000', 'leads', true) ->> 'enabled') = 'true', 'T85 the switch works without BYPASSRLS');
:as_office_a
insert into public.leads (id, company_id, source_id, contact_name, phone, assigned_to) values
  ('18500000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T85 Lead', '+13235558501', 'a0000000-0000-0000-0000-000000000001');
:as_super
select tst.ok(exists (select 1 from public.push_outbox where source_id = '18500000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-0000-0000-000000000001'),
          'T85 a new lead is queued without BYPASSRLS');
alter function public.set_push_kind(uuid, text, boolean) owner to postgres;
alter function app.push_enqueue(uuid, uuid, text, text, uuid) owner to postgres;
alter function app.push_enabled(uuid, uuid, text) owner to postgres;
alter function app.tg_lead_push() owner to postgres;
reassign owned by t85_owner to postgres;
drop owned by t85_owner;
drop role t85_owner;
-- rights; account deletion erases the switches
select tst.ok(not has_function_privilege('anon', 'public.set_push_kind(uuid, text, boolean)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.set_push_kind(uuid, text, boolean)', 'EXECUTE')
          and not has_table_privilege('anon', 'public.push_prefs', 'SELECT') and not has_table_privilege('authenticated', 'public.push_prefs', 'INSERT'),
          'T85 rights: the app calls set_push_kind and reads its own rows only');
select tst.ok(not has_function_privilege('authenticated', 'app.push_enqueue(uuid, uuid, text, text, uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'app.push_enabled(uuid, uuid, text)', 'EXECUTE'), 'T85 nobody in the app runs the queue helpers');
reset role; set role anon;
select tst.fails($q$select public.set_push_kind('ca000000-0000-0000-0000-000000000000', 'visits', true)$q$, 'T85 anon cannot set a switch');
:as_super
select app.erase_personal_rows('a0000000-0000-0000-0000-000000000003');
select tst.ok(not exists (select 1 from public.push_prefs where user_id = 'a0000000-0000-0000-0000-000000000003'), 'T85 account deletion erases the person''s switches');
-- clean up
update public.estimates set owner_user_id = null where id = '0e730000-0000-4000-8000-000000000003';
delete from public.push_outbox;
delete from public.push_devices;
delete from public.push_prefs;
delete from public.notifications where id::text like '0840%' or id::text like '0850%';
delete from public.visit_assignees where visit_id::text like 'f840%' or visit_id::text like 'f850%';
delete from public.visits where id::text like 'f840%' or id::text like 'f850%';
update public.memberships set status = 'disabled' where user_id = 'a8400000-0000-4000-8000-000000000001';
\echo 'T85 switches by kind: own only, not queued when off, skipped when switched off later, «estimate opened» off by default ok'

-- ---------------------------------------------------------------- T86: the office reads the company, only owner / admin change it
-- Spec 26 §3 (decision 07.11, LOG): the office sees «Настройки компании» read-only in the app; the database is the guard.
-- the person «office A» is an admin by now (earlier tests): make them office for this test, like T-tests above do
:as_super
update public.memberships set role = 'office' where user_id = 'a0000000-0000-0000-0000-000000000002' and company_id = 'ca000000-0000-0000-0000-000000000000';
:as_office_a
select tst.ok((select name from public.companies where id = 'ca000000-0000-0000-0000-000000000000') is not null, 'T86 the office reads the company');
select tst.blocked($q$update public.companies set name = 'office-edit' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'T86 the office cannot rename the company');
select tst.blocked($q$update public.companies set doc_language = 'es' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'T86 the office cannot change the client document language');
select tst.blocked($q$update public.companies set lead_settings = '{"replyWarnMin": 1}'::jsonb where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'T86 the office cannot change the lead settings');
:as_owner_a
select tst.ok((select name from public.companies where id = 'ca000000-0000-0000-0000-000000000000') <> 'office-edit', 'T86 the company is unchanged after the office tried');
:as_super
update public.memberships set role = 'admin' where user_id = 'a0000000-0000-0000-0000-000000000002' and company_id = 'ca000000-0000-0000-0000-000000000000';
\echo 'T86 company settings: the office reads, owner / admin change ok'

-- ---------------------------------------------------------------- T87: reminders of a lead without an answer (docs/specs/27 §4.9)
-- All times are fixed (2030-01-08 is a Tuesday, the company is in America/Los_Angeles with the default hours Mon–Sat
-- 8:00–18:00): the test never depends on the real hour (CHECKS §9 №1). The real clock (push_claim → now()) never
-- reaches these leads: they are years ahead.
:as_super
delete from public.push_outbox;
update public.companies set business_hours = null where id = 'ca000000-0000-0000-0000-000000000000';
create temp table t87_t (k text primary key, at timestamptz);
insert into t87_t values ('in', '2030-01-08 10:00 America/Los_Angeles'), ('night', '2030-01-08 22:00 America/Los_Angeles'),
                         ('morning', '2030-01-09 08:00 America/Los_Angeles'), ('sunday', '2030-01-06 10:00 America/Los_Angeles');
-- lead 1: added by the office, held by Mike (tech); lead 2: added by the owner for himself; lead 3: added by the office, held by the owner
insert into public.leads (id, company_id, source_id, contact_name, phone, assigned_to, created_by, received_at) values
  ('18700000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T87 One', '+13235558701',
   'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', (select at from t87_t where k = 'in') - interval '14 minutes'),
  ('18700000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T87 Two', '+13235558702',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', (select at from t87_t where k = 'in') - interval '70 minutes'),
  ('18700000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T87 Three', '+13235558703',
   'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', (select at from t87_t where k = 'in') - interval '70 minutes');
delete from public.push_outbox;   -- the «new lead» pushes of these inserts are not what is tested here
-- 14 minutes: nothing yet
select app.push_lead_reminders((select at from t87_t where k = 'in'));
select tst.ok(not exists (select 1 from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001'), 'T87 14 minutes without an answer: no reminder yet');
-- 15 minutes: the assignee
select app.push_lead_reminders((select at from t87_t where k = 'in') + interval '1 minute');
select tst.ok((select count(*) = 1 and bool_and(user_id = 'a0000000-0000-0000-0000-000000000003' and route = '/lead/18700000-0000-4000-8000-000000000001')
               from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001' and kind = 'lead.reminder'),
          'T87 15 minutes: a reminder to the assignee');
-- once: the next minute, even after it was sent, nothing new
update public.push_outbox set status = 'sent' where kind = 'lead.reminder';
select app.push_lead_reminders((select at from t87_t where k = 'in') + interval '2 minutes');
select tst.ok((select count(*) from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001' and kind = 'lead.reminder') = 1, 'T87 a reminder comes once');
-- the person who added the lead himself gets no reminder; the owner who holds it gets no escalation
select tst.ok(not exists (select 1 from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000002'), 'T87 a lead the owner added for himself: no reminder, no escalation');
select tst.ok(exists (select 1 from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000003' and kind = 'lead.reminder' and user_id = 'a0000000-0000-0000-0000-000000000001')
          and not exists (select 1 from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000003' and kind = 'lead.escalation'),
          'T87 the owner holds the lead: a reminder to him, no escalation');
-- 60 minutes: the owner, because Mike holds it
select app.push_lead_reminders((select at from t87_t where k = 'in') + interval '46 minutes');
select tst.ok((select count(*) = 1 and bool_and(user_id = 'a0000000-0000-0000-0000-000000000001') from public.push_outbox
               where source_id = '18700000-0000-4000-8000-000000000001' and kind = 'lead.escalation'),
          'T87 60 minutes: the owner hears, because another person holds the lead');
select tst.ok(not exists (select 1 from public.push_outbox where kind = 'lead.escalation' and user_id <> 'a0000000-0000-0000-0000-000000000001'),
          'T87 the escalation goes to the owner only (not admin or office)');
-- night: nothing; the first working minute: yes
delete from public.push_outbox;
update public.leads set received_at = (select at from t87_t where k = 'night') - interval '20 minutes' where id = '18700000-0000-4000-8000-000000000001';
select app.push_lead_reminders((select at from t87_t where k = 'night'));
select tst.ok(not exists (select 1 from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001'), 'T87 at night: no reminder');
update public.leads set received_at = (select at from t87_t where k = 'morning') - interval '9 hours' where id = '18700000-0000-4000-8000-000000000001';
select app.push_lead_reminders((select at from t87_t where k = 'morning'));
select tst.ok(exists (select 1 from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001' and kind = 'lead.reminder'), 'T87 a night lead reminds at the start of the day');
-- Sunday is closed by default; the company's own hours count (open on Sunday)
delete from public.push_outbox;
update public.leads set received_at = (select at from t87_t where k = 'sunday') - interval '20 minutes' where id = '18700000-0000-4000-8000-000000000001';
select app.push_lead_reminders((select at from t87_t where k = 'sunday'));
select tst.ok(not exists (select 1 from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001'), 'T87 Sunday is closed by default: no reminder');
update public.companies set business_hours = '{"sun": [540, 780]}' where id = 'ca000000-0000-0000-0000-000000000000';
select app.push_lead_reminders((select at from t87_t where k = 'sunday'));
select tst.ok(exists (select 1 from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001' and kind = 'lead.reminder'), 'T87 the company''s own hours: open on Sunday');
update public.companies set business_hours = null where id = 'ca000000-0000-0000-0000-000000000000';
-- answered (the first touch) → no reminder, and a waiting one is skipped at sending
delete from public.push_outbox;
update public.leads set received_at = (select at from t87_t where k = 'in') - interval '20 minutes' where id = '18700000-0000-4000-8000-000000000001';
select app.push_lead_reminders((select at from t87_t where k = 'in'));
insert into public.push_devices (user_id, expo_token, platform, lang) values ('a0000000-0000-0000-0000-000000000003', 'ExponentPushToken[t87-mike]', 'android', 'en');
update public.leads set first_response_at = (select at from t87_t where k = 'in'), first_response_kind = 'call' where id = '18700000-0000-4000-8000-000000000001';
update public.push_outbox set created_at = now(), next_try_at = now() where source_id = '18700000-0000-4000-8000-000000000001';
-- the claim runs on the real clock: open the company all week, so the result does not depend on the hour
update public.companies set business_hours = '{"sun": [0, 1440], "mon": [0, 1440], "tue": [0, 1440], "wed": [0, 1440], "thu": [0, 1440], "fri": [0, 1440], "sat": [0, 1440]}' where id = 'ca000000-0000-0000-0000-000000000000';
reset role; set role service_role;
select public.push_claim(100);
:as_super
update public.companies set business_hours = null where id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select status = 'skipped' and error = 'not_member' from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001' and kind = 'lead.reminder'),
          'T87 answered before sending: the reminder is skipped');
select app.push_lead_reminders((select at from t87_t where k = 'in') + interval '5 minutes');
select tst.ok((select count(*) from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001') = 1, 'T87 answered: no new reminder');
-- «leads» switched off: nothing; a subcontractor holding it: nothing
delete from public.push_outbox;
update public.leads set first_response_at = null, first_response_kind = null where id = '18700000-0000-4000-8000-000000000001';
:as_tech_a
select public.set_push_kind('ca000000-0000-0000-0000-000000000000', 'leads', false);
:as_super
select app.push_lead_reminders((select at from t87_t where k = 'in'));
select tst.ok(not exists (select 1 from public.push_outbox where user_id = 'a0000000-0000-0000-0000-000000000003'), 'T87 «leads» off: no reminder');
delete from public.push_prefs where user_id = 'a0000000-0000-0000-0000-000000000003';
insert into auth.users (id, email, raw_user_meta_data) values ('a8700000-0000-4000-8000-000000000001', 'sub87@a.test', '{"full_name":"Sal Sub"}');
insert into public.memberships (company_id, user_id, role, status) values ('ca000000-0000-0000-0000-000000000000', 'a8700000-0000-4000-8000-000000000001', 'subcontractor', 'active');
update public.leads set assigned_to = 'a8700000-0000-4000-8000-000000000001' where id = '18700000-0000-4000-8000-000000000001';
delete from public.push_outbox;
select app.push_lead_reminders((select at from t87_t where k = 'in'));
select tst.ok(not exists (select 1 from public.push_outbox where user_id = 'a8700000-0000-4000-8000-000000000001'), 'T87 a subcontractor gets no reminder');
-- security-check #305 №1: 501 old leads that already got their reminder never hide a new one
update public.leads set assigned_to = 'a0000000-0000-0000-0000-000000000003' where id = '18700000-0000-4000-8000-000000000001';
delete from public.push_outbox;
insert into public.leads (id, company_id, source_id, contact_name, phone, assigned_to, created_by, received_at)
select ('18710000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001',
       'T87 Old ' || g, '+1323555' || lpad(g::text, 4, '0'), 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002',
       (select at from t87_t where k = 'in') - interval '23 hours' + g * interval '1 second'
  from generate_series(1, 501) g;
delete from public.push_outbox;
insert into public.push_outbox (company_id, user_id, kind, route, source_id, status)
select company_id, assigned_to, 'lead.reminder', '/lead/' || id::text, id, 'sent' from public.leads where id::text like '18710000-%';
update public.leads set received_at = (select at from t87_t where k = 'in') - interval '20 minutes' where id = '18700000-0000-4000-8000-000000000001';
select app.push_lead_reminders((select at from t87_t where k = 'in'));
select tst.ok(exists (select 1 from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001' and kind = 'lead.reminder'),
          'T87 501 old leads already reminded do not hide a new one');
-- one company with many leads does not take the minute from the others: at most 20 per company
delete from public.push_outbox;
update public.leads set deleted_at = now() where id::text like '18710000-%';
insert into public.leads (id, company_id, source_id, contact_name, phone, assigned_to, created_by, received_at)
select ('18720000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'cb000000-0000-0000-0000-000000000000', (select id from public.lead_sources where company_id = 'cb000000-0000-0000-0000-000000000000' limit 1),
       'T87 B ' || g, '+1424555' || lpad(g::text, 4, '0'), 'b0000000-0000-0000-0000-000000000001', null,
       (select at from t87_t where k = 'in') - interval '20 minutes' + g * interval '1 second'
  from generate_series(1, 30) g;
delete from public.push_outbox;
select app.push_lead_reminders((select at from t87_t where k = 'in'));
select tst.ok((select count(*) from public.push_outbox where company_id = 'cb000000-0000-0000-0000-000000000000' and kind = 'lead.reminder') = 20,
          'T87 at most 20 reminders per company in one minute');
select tst.ok(exists (select 1 from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001' and kind = 'lead.reminder'),
          'T87 … and the other company still gets its reminder');
select app.push_lead_reminders((select at from t87_t where k = 'in') + interval '1 minute');
select tst.ok((select count(*) from public.push_outbox where company_id = 'cb000000-0000-0000-0000-000000000000' and kind = 'lead.reminder') = 30,
          'T87 the rest come the next minute');
update public.leads set deleted_at = now() where id::text like '18720000-%';
-- №5: given to a person less than 15 min ago — no reminder yet (the «lead assigned to you» push is fresh)
delete from public.push_outbox;
insert into public.push_outbox (company_id, user_id, kind, route, source_id, status, created_at)
  values ('ca000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'lead.assigned', '/lead/18700000-0000-4000-8000-000000000001',
          '18700000-0000-4000-8000-000000000001', 'sent', (select at from t87_t where k = 'in') - interval '5 minutes');
select app.push_lead_reminders((select at from t87_t where k = 'in'));
select tst.ok(not exists (select 1 from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001' and kind = 'lead.reminder'),
          'T87 given to him 5 minutes ago: no reminder yet');
select app.push_lead_reminders((select at from t87_t where k = 'in') + interval '11 minutes');
select tst.ok(exists (select 1 from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001' and kind = 'lead.reminder'),
          'T87 15 minutes after it was given to him: the reminder');
-- №Б: people who would get nothing (a subcontractor, «leads» off) do not take the 20 places of a company
delete from public.push_outbox;
:as_owner_a
select public.set_push_kind('ca000000-0000-0000-0000-000000000000', 'leads', false);
:as_super
update public.memberships set status = 'active' where user_id = 'a8700000-0000-4000-8000-000000000001';
insert into public.leads (id, company_id, source_id, contact_name, phone, assigned_to, created_by, received_at)
select ('18730000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001',
       'T87 Sub ' || g, '+1323556' || lpad(g::text, 4, '0'), 'a8700000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000002',
       (select at from t87_t where k = 'in') - interval '70 minutes' + g * interval '1 second'
  from generate_series(1, 25) g;
update public.leads set received_at = (select at from t87_t where k = 'in') - interval '3 hours', assigned_to = 'a0000000-0000-0000-0000-000000000003'
 where id = '18700000-0000-4000-8000-000000000001';
delete from public.push_outbox;
select app.push_lead_reminders((select at from t87_t where k = 'in'));
select tst.ok(exists (select 1 from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001' and kind = 'lead.reminder'
                      and user_id = 'a0000000-0000-0000-0000-000000000003'),
          'T87 25 newer leads of a subcontractor (and the owner''s «leads» off) do not block the older lead''s reminder');
select tst.ok(not exists (select 1 from public.push_outbox where source_id::text like '18730000-%'), 'T87 … and nothing goes to the subcontractor or the owner who switched «leads» off');
update public.leads set deleted_at = now() where id::text like '18730000-%';
delete from public.push_prefs where user_id = 'a0000000-0000-0000-0000-000000000001';
-- №В: a reminder taken after the working day ended is «off_hours» and comes again the next working morning
update public.companies set business_hours = '{"sun": null, "mon": null, "tue": null, "wed": null, "thu": null, "fri": null, "sat": null}' where id = 'ca000000-0000-0000-0000-000000000000';
update public.push_outbox set next_try_at = now(), created_at = now() where source_id = '18700000-0000-4000-8000-000000000001';
reset role; set role service_role;
select public.push_claim(100);
:as_super
update public.companies set business_hours = null where id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select status = 'skipped' and error = 'off_hours' from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001' and kind = 'lead.reminder'),
          'T87 not sent before the working day ended: skipped as off_hours');
update public.leads set received_at = (select at from t87_t where k = 'morning') - interval '10 hours' where id = '18700000-0000-4000-8000-000000000001';
select app.push_lead_reminders((select at from t87_t where k = 'morning'));
select tst.ok((select count(*) from public.push_outbox where source_id = '18700000-0000-4000-8000-000000000001' and kind = 'lead.reminder' and status = 'pending') = 1,
          'T87 … and it comes again the next working morning');
-- the schedule: its own job once, where pg_cron exists (not here)
do $$ declare n int; begin
  if to_regnamespace('cron') is null then
    perform tst.ok(true, 'T87 no pg_cron here: no schedule, the migration did not fail');
  else
    execute $q$select count(*) from cron.job where jobname = 'push-lead-reminders'$q$ into n;
    perform tst.ok(n = 1, 'T87 the reminders have their own schedule, once');
  end if;
end $$;
select tst.ok(not exists (select 1 from pg_proc where proname = 'push_claim' and prosrc like '%push_lead_reminders%'), 'T87 push_claim does not run the reminders (they never stop the queue)');
-- rights
select tst.ok(not has_function_privilege('authenticated', 'app.push_lead_reminders(timestamptz)', 'EXECUTE')
          and not has_function_privilege('anon', 'app.push_lead_reminders(timestamptz)', 'EXECUTE')
          and not has_function_privilege('service_role', 'app.push_lead_reminders(timestamptz)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'app.push_in_hours(uuid, timestamptz)', 'EXECUTE')
          and not has_function_privilege('anon', 'app.push_in_hours(uuid, timestamptz)', 'EXECUTE')
          and not has_function_privilege('service_role', 'app.push_in_hours(uuid, timestamptz)', 'EXECUTE')
          and not has_function_privilege('anon', 'app.push_lead_unanswered(public.leads)', 'EXECUTE')
          and not has_function_privilege('service_role', 'app.push_lead_unanswered(public.leads)', 'EXECUTE'), 'T87 nobody but the server runs the reminders');
-- clean up
delete from public.push_outbox;
delete from public.push_devices;
update public.leads set deleted_at = now() where id::text like '18700000-%';
update public.memberships set status = 'disabled' where user_id = 'a8700000-0000-4000-8000-000000000001';
drop table t87_t;
\echo 'T87 reminders of a lead without an answer: 15 min to the assignee, 60 min to the owner, working hours, once, not the author ok'

-- ---------------------------------------------------------------- T77: S22b — the people of a closed company see why (docs/specs/22 §3.6)
-- «T77 Co»: Olive owns it alone; Wes works there, Otto is switched off, Ed left the day before. Olive deletes her account
-- and closes the company (a real delete_account): Wes and Otto become «deleted» with the same now() as closed_at.
:as_super
insert into auth.users (id, email, raw_user_meta_data) values
  ('a7700000-0000-4000-8000-000000000001', 'early77@a.test', '{"full_name":"Ed Early"}'),
  ('a7700000-0000-4000-8000-000000000002', 'with77@a.test',  '{"full_name":"Wes With"}'),
  ('a7700000-0000-4000-8000-000000000003', 'off77@a.test',   '{"full_name":"Otto Off"}'),
  ('a7700000-0000-4000-8000-000000000004', 'owner77@a.test', '{"full_name":"Olive Owner"}');
select tst.agree('a7700000-0000-4000-8000-000000000004');
\set as_owner77 'reset role; set request.jwt.claim.sub = ''a7700000-0000-4000-8000-000000000004''; reset request.jwt.claims; set role authenticated;'
\set as_early77 'reset role; set request.jwt.claim.sub = ''a7700000-0000-4000-8000-000000000001''; reset request.jwt.claims; set role authenticated;'
\set as_with77  'reset role; set request.jwt.claim.sub = ''a7700000-0000-4000-8000-000000000002''; reset request.jwt.claims; set role authenticated;'
\set as_off77   'reset role; set request.jwt.claim.sub = ''a7700000-0000-4000-8000-000000000003''; reset request.jwt.claims; set role authenticated;'
:as_owner77
insert into public.companies (id, name, dba) values ('c7700000-0000-4000-8000-000000000001', 'T77 Legal LLC', '');
:as_super
insert into public.memberships (company_id, user_id, role, status, deleted_at) values
  ('c7700000-0000-4000-8000-000000000001', 'a7700000-0000-4000-8000-000000000001', 'tech', 'deleted', now() - interval '1 day');
insert into public.memberships (company_id, user_id, role, status) values
  ('c7700000-0000-4000-8000-000000000001', 'a7700000-0000-4000-8000-000000000002', 'tech', 'active'),
  ('c7700000-0000-4000-8000-000000000001', 'a7700000-0000-4000-8000-000000000003', 'office', 'disabled');
-- before the closing: nothing to show
:as_with77
select tst.ok((select count(*) from public.my_closed_companies()) = 0, 'T77 an open company: nothing');
:as_owner77
select tst.fresh(1);
select tst.ok((public.delete_account('DELETE', array['c7700000-0000-4000-8000-000000000001']::uuid[]) -> 'closed_companies') ? 'c7700000-0000-4000-8000-000000000001',
              'T77 Olive closes «T77 Co» with her account');
:as_super
select tst.ok((select every(m.deleted_at = co.closed_at) from public.memberships m join public.companies co on co.id = m.company_id
                where co.id = 'c7700000-0000-4000-8000-000000000001' and m.user_id <> 'a7700000-0000-4000-8000-000000000001'),
              'T77 delete_account: deleted_at of the members = closed_at (one now(), the function counts on it)');
:as_with77
do $$
declare r record; n int;
begin
  select count(*) into n from public.my_closed_companies();
  select * into r from public.my_closed_companies() limit 1;
  -- failed before: nothing told him why — he silently worked in the demo
  perform tst.ok(n = 1 and r.company_id = 'c7700000-0000-4000-8000-000000000001' and r.name = 'T77 Legal LLC' and r.closed_at is not null,
                 'T77 gone with the closing: sees the company (empty dba → name): ' || n || ' ' || coalesce(r.name, 'null'));
end $$;
:as_off77
select tst.ok((select count(*) from public.my_closed_companies()) = 1, 'T77 switched off at the closing: sees it too (it was his company)');
:as_early77
select tst.ok((select count(*) from public.my_closed_companies()) = 0, 'T77 left BEFORE the closing: nothing');
:as_owner77
select tst.ok((select count(*) from public.my_closed_companies()) = 0, 'T77 the deleted owner with a live token: nothing (account_alive)');
:as_owner_a
select tst.ok((select count(*) from public.my_closed_companies()) = 0, 'T77 an active member of another company: nothing');
:as_owner_b
select tst.ok((select count(*) from public.my_closed_companies()) = 0, 'T77 a stranger: nothing');
-- an anonymous sign-in sees nothing
:as_with77
set request.jwt.claims = '{"is_anonymous": true}';
select tst.ok((select count(*) from public.my_closed_companies()) = 0, 'T77 an anonymous sign-in: nothing');
reset request.jwt.claims;
-- only the name and the moment: three columns
:as_super
select tst.ok((select array_agg(a.n order by a.i) from pg_proc p, unnest(p.proargnames) with ordinality a(n, i)
                where p.proname = 'my_closed_companies' and p.pronamespace = 'public'::regnamespace) = array['company_id', 'name', 'closed_at'],
              'T77 only company_id, name, closed_at');
-- the 90-day edge: 89 days after the closing — still shown, 91 — no more
alter table public.companies disable trigger t06_company_closed_guard;
update public.companies set closed_at = closed_at - interval '89 days' where id = 'c7700000-0000-4000-8000-000000000001';
alter table public.companies enable trigger t06_company_closed_guard;
update public.memberships set deleted_at = deleted_at - interval '89 days'
 where company_id = 'c7700000-0000-4000-8000-000000000001' and user_id <> 'a7700000-0000-4000-8000-000000000001';
:as_with77
select tst.ok((select count(*) from public.my_closed_companies()) = 1, 'T77 closed 89 days ago: still shown');
:as_super
alter table public.companies disable trigger t06_company_closed_guard;
update public.companies set closed_at = closed_at - interval '2 days' where id = 'c7700000-0000-4000-8000-000000000001';
alter table public.companies enable trigger t06_company_closed_guard;
update public.memberships set deleted_at = deleted_at - interval '2 days'
 where company_id = 'c7700000-0000-4000-8000-000000000001' and user_id <> 'a7700000-0000-4000-8000-000000000001';
:as_with77
select tst.ok((select count(*) from public.my_closed_companies()) = 0, 'T77 closed more than 90 days ago: nothing');
-- rights (rule 18)
:as_super
select tst.ok(has_function_privilege('authenticated', 'public.my_closed_companies()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.my_closed_companies()', 'EXECUTE')
          and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where p.proname = 'my_closed_companies' and a.grantee = 0),
              'T77 the signed-in app only: not anon, not PUBLIC');
reset role; reset request.jwt.claim.sub; set role anon;
select tst.fails($q$select * from public.my_closed_companies()$q$, 'T77 anon cannot call it');
:as_super
\echo 'T77 the people of a closed company: their own membership gone with the closing, name and time only, 90 days ok'

-- ---------------------------------------------------------------- T88: the author of an estimate for pushes (docs/specs/27 §4.11 №1–№2)
-- The app never fills estimates.owner_user_id: the author is whoever made the estimate (created_by). No owner_user_id by hand here.
:as_super
insert into auth.users (id, email, raw_user_meta_data) values
  ('a8800000-0000-4000-8000-000000000001', 'office88@a.test', '{"full_name":"Olivia Office"}'),
  ('a8800000-0000-4000-8000-000000000002', 'tech88@a.test',   '{"full_name":"Tim Tech"}');
insert into public.memberships (company_id, user_id, role, status) values
  ('ca000000-0000-0000-0000-000000000000', 'a8800000-0000-4000-8000-000000000001', 'office', 'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a8800000-0000-4000-8000-000000000002', 'tech', 'active');
insert into public.estimates (id, company_id, customer_id, property_id, title, created_by) values
  ('0e880000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'T88 by the office', 'a8800000-0000-4000-8000-000000000001'),
  ('0e880000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'T88 by a tech', 'a8800000-0000-4000-8000-000000000002');
select tst.ok((select bool_and(owner_user_id is null) and count(*) = 2 from public.estimates where id::text like '0e880000-%')
          and (select created_by from public.estimates where id = '0e880000-0000-4000-8000-000000000001') = 'a8800000-0000-4000-8000-000000000001',
          'T88 the estimates have no owner_user_id, only who made them (as the app leaves them)');
-- a) the office made it: «the client signed» reaches the office author, and owner / admin as before
insert into public.notifications (id, company_id, kind, estimate_id) values
  ('08800000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'estimate.client_signed', '0e880000-0000-4000-8000-000000000001');
select tst.ok(exists (select 1 from public.push_outbox where notification_id = '08800000-0000-4000-8000-000000000001' and user_id = 'a8800000-0000-4000-8000-000000000001'),
          'T88 signed: the office person who made the estimate gets it (before: nobody but owner / admin)');
select tst.ok(exists (select 1 from public.push_outbox where notification_id = '08800000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-0000-0000-000000000001'),
          'T88 signed: the owner still gets it');
-- b) «the client opened»: the office author who switched it on gets it, nobody else
insert into public.push_prefs (company_id, user_id, kind, enabled) values
  ('ca000000-0000-0000-0000-000000000000', 'a8800000-0000-4000-8000-000000000001', 'viewed', true),
  ('ca000000-0000-0000-0000-000000000000', 'a8800000-0000-4000-8000-000000000002', 'viewed', true);
insert into public.notifications (id, company_id, kind, estimate_id) values
  ('08800000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'estimate.viewed', '0e880000-0000-4000-8000-000000000001');
select tst.ok((select count(*) = 1 and bool_and(user_id = 'a8800000-0000-4000-8000-000000000001') from public.push_outbox where notification_id = '08800000-0000-4000-8000-000000000002'),
          'T88 opened: the author who switched it on gets it, nobody else (before: nobody at all)');
-- c) a tech made it: no «signed» and no «opened» for him (he has no such switches, §4.11 №2); the owner still gets «signed»
insert into public.notifications (id, company_id, kind, estimate_id) values
  ('08800000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'estimate.client_signed', '0e880000-0000-4000-8000-000000000002'),
  ('08800000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'estimate.viewed', '0e880000-0000-4000-8000-000000000002');
select tst.ok(not exists (select 1 from public.push_outbox where notification_id in ('08800000-0000-4000-8000-000000000003', '08800000-0000-4000-8000-000000000004')
                            and user_id = 'a8800000-0000-4000-8000-000000000002'), 'T88 a tech who made the estimate gets neither «signed» nor «opened»');
select tst.ok(exists (select 1 from public.push_outbox where notification_id = '08800000-0000-4000-8000-000000000003' and user_id = 'a0000000-0000-0000-0000-000000000001'),
          'T88 the tech''s estimate signed: the owner gets it');
select tst.ok(not exists (select 1 from public.push_outbox where notification_id = '08800000-0000-4000-8000-000000000004'), 'T88 the tech''s estimate opened: nobody');
-- d) at sending time the same author counts: the office author's rows go, a tech put in by hand is skipped
insert into public.push_outbox (company_id, user_id, notification_id, kind, route) values
  ('ca000000-0000-0000-0000-000000000000', 'a8800000-0000-4000-8000-000000000002', '08800000-0000-4000-8000-000000000003', 'estimate.client_signed', '/estimate/0e880000-0000-4000-8000-000000000002');
select tst.ok((select bool_and(app.push_still_recipient(o)) from public.push_outbox o
                where o.notification_id in ('08800000-0000-4000-8000-000000000001', '08800000-0000-4000-8000-000000000002') and o.user_id = 'a8800000-0000-4000-8000-000000000001'),
          'T88 at sending time the office author is still a recipient');
select tst.ok(not (select app.push_still_recipient(o) from public.push_outbox o
                    where o.notification_id = '08800000-0000-4000-8000-000000000003' and o.user_id = 'a8800000-0000-4000-8000-000000000002'),
          'T88 at sending time a tech author is not');
-- e) an owner_user_id, when someone sets it, still wins over created_by
update public.estimates set owner_user_id = 'a0000000-0000-0000-0000-000000000001' where id = '0e880000-0000-4000-8000-000000000001';
select tst.ok(app.push_estimate_author('ca000000-0000-0000-0000-000000000000', '0e880000-0000-4000-8000-000000000001') = 'a0000000-0000-0000-0000-000000000001'
          and app.push_estimate_author('ca000000-0000-0000-0000-000000000000', '0e880000-0000-4000-8000-000000000002') is null
          and app.push_estimate_author('b0000000-0000-0000-0000-000000000000', '0e880000-0000-4000-8000-000000000001') is null,
          'T88 owner_user_id wins; a tech is no author; another company finds nothing');
update public.estimates set owner_user_id = 'a8800000-0000-4000-8000-000000000002' where id = '0e880000-0000-4000-8000-000000000001';
select tst.ok(app.push_estimate_author('ca000000-0000-0000-0000-000000000000', '0e880000-0000-4000-8000-000000000001') = 'a8800000-0000-4000-8000-000000000001',
          'T88 a tech as owner_user_id: the author falls back to who made it');
-- with a JWT nobody writes someone else as the maker: created_by is the caller (core trigger), so the push goes to them
:as_office_a
insert into public.estimates (id, company_id, customer_id, property_id, title, created_by) values
  ('0e880000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'T88 forged maker', 'a8800000-0000-4000-8000-000000000001');
:as_super
select tst.ok((select created_by from public.estimates where id = '0e880000-0000-4000-8000-000000000003') = 'a0000000-0000-0000-0000-000000000002',
          'T88 a forged created_by is replaced by the caller: nobody makes pushes go to a colleague');
select tst.ok(not has_function_privilege('authenticated', 'app.push_estimate_author(uuid, uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'app.push_estimate_author(uuid, uuid)', 'EXECUTE')
          and not has_function_privilege('service_role', 'app.push_estimate_author(uuid, uuid)', 'EXECUTE'), 'T88 nobody in the app runs the author function');
-- clean up
delete from public.push_outbox;
delete from public.push_prefs where user_id::text like 'a8800000-%';
update public.estimates set deleted_at = now() where id::text like '0e880000-%';
update public.memberships set status = 'disabled' where user_id::text like 'a8800000-%';
\echo 'T88 the author of an estimate for pushes: who made it (owner_user_id first), not a tech; the same at sending time ok'

-- ---------------------------------------------------------------- T89: no push about a deleted estimate (docs/specs/27 §4.12)
:as_super
insert into auth.users (id, email, raw_user_meta_data) values ('a8900000-0000-4000-8000-000000000001', 'office89@a.test', '{"full_name":"Odette Office"}');
insert into public.memberships (company_id, user_id, role, status) values ('ca000000-0000-0000-0000-000000000000', 'a8900000-0000-4000-8000-000000000001', 'office', 'active');
insert into public.estimates (id, company_id, customer_id, property_id, title, created_by) values
  ('0e890000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'T89 deleted later', 'a8900000-0000-4000-8000-000000000001'),
  ('0e890000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'c7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'T89 kept', 'a8900000-0000-4000-8000-000000000001');
insert into public.notifications (id, company_id, kind, estimate_id) values
  ('08900000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'estimate.client_signed', '0e890000-0000-4000-8000-000000000001'),
  ('08900000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'estimate.client_signed', '0e890000-0000-4000-8000-000000000002');
select tst.ok((select count(*) from public.push_outbox where notification_id in ('08900000-0000-4000-8000-000000000001', '08900000-0000-4000-8000-000000000002')
                and user_id = 'a8900000-0000-4000-8000-000000000001') = 2, 'T89 both signatures are queued for the author');
insert into public.push_prefs (company_id, user_id, kind, enabled) values ('ca000000-0000-0000-0000-000000000000', 'a8900000-0000-4000-8000-000000000001', 'viewed', true);
insert into public.notifications (id, company_id, kind, estimate_id) values
  ('08900000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'estimate.viewed', '0e890000-0000-4000-8000-000000000001');
select tst.ok(exists (select 1 from public.push_outbox where notification_id = '08900000-0000-4000-8000-000000000003' and user_id = 'a8900000-0000-4000-8000-000000000001'),
          'T89 «opened» is queued for the author who switched it on');
update public.estimates set deleted_at = now() where id = '0e890000-0000-4000-8000-000000000001';
select tst.ok(not (select app.push_still_recipient(o) from public.push_outbox o
                    where o.notification_id = '08900000-0000-4000-8000-000000000001' and o.user_id = 'a8900000-0000-4000-8000-000000000001'),
          'T89 the estimate deleted after the queue: the author no longer gets it');
select tst.ok(not exists (select 1 from public.push_outbox o where o.notification_id = '08900000-0000-4000-8000-000000000001' and app.push_still_recipient(o)),
          'T89 …nor the owner or anyone else');
select tst.ok(not (select app.push_still_recipient(o) from public.push_outbox o
                    where o.notification_id = '08900000-0000-4000-8000-000000000003' and o.user_id = 'a8900000-0000-4000-8000-000000000001'),
          'T89 «opened» about the deleted estimate is skipped too');
select tst.ok((select bool_and(app.push_still_recipient(o)) from public.push_outbox o where o.notification_id = '08900000-0000-4000-8000-000000000002'),
          'T89 the estimate that is not deleted still goes to everyone queued');
-- clean up
delete from public.push_outbox;
delete from public.push_prefs where user_id = 'a8900000-0000-4000-8000-000000000001';
update public.estimates set deleted_at = now() where id::text like '0e890000-%';
update public.memberships set status = 'disabled' where user_id = 'a8900000-0000-4000-8000-000000000001';
\echo 'T89 no push about an estimate deleted after the queue ok'

-- ---------------------------------------------------------------- T90: company modules — switch on, 7-day trial, nothing saved after it (docs/specs/33 S0b, founder О2)
:as_tech_a
select tst.fails($q$select public.module_enable('ca000000-0000-0000-0000-000000000000', 'gutters')$q$, 'T90 a tech does not switch modules on');
:as_super
insert into auth.users (id, email, raw_user_meta_data) values ('a9000000-0000-4000-8000-000000000001', 'office90@a.test', '{"full_name":"Oscar Office"}');
insert into public.memberships (company_id, user_id, role, status) values ('ca000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-000000000001', 'office', 'active');
\set as_office90 'reset role; set request.jwt.claim.sub = ''a9000000-0000-4000-8000-000000000001''; set role authenticated;'
:as_office90
select tst.fails($q$select public.module_enable('ca000000-0000-0000-0000-000000000000', 'gutters')$q$, 'T90 the office does not switch modules on');
:as_owner_b
select tst.fails($q$select public.module_enable('ca000000-0000-0000-0000-000000000000', 'gutters')$q$, 'T90 another company does not switch A''s modules on');
:as_owner_a
select tst.ok((select enabled and trial_ends_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute'
                 from public.module_enable('ca000000-0000-0000-0000-000000000000', 'gutters')), 'T90 the owner switches it on: a 7-day trial starts');
select tst.ok(app.module_active('ca000000-0000-0000-0000-000000000000', 'gutters'), 'T90 in the trial the module is active');
select tst.fails($q$select public.module_enable('ca000000-0000-0000-0000-000000000000', 'Bad Key!')$q$, 'T90 junk module keys are refused');
select tst.fails($q$select public.module_enable('ca000000-0000-0000-0000-000000000000', 'roofing')$q$, 'T90 only modules the app knows');
select tst.fails_like($q$select public.module_save_settings('ca000000-0000-0000-0000-000000000000', 'gutters', jsonb_build_object('x', repeat('a', 40000)), 1)$q$,
          '%too large%', 'T90 settings over 32 KB are refused');
select tst.ok((select row_version from public.module_save_settings('ca000000-0000-0000-0000-000000000000', 'gutters', '{"storyHeightIn":120}', 1)) = 2,
          'T90 the owner saves settings in the trial');
select tst.fails_like($q$select public.module_save_settings('ca000000-0000-0000-0000-000000000000', 'gutters', '{"storyHeightIn":132}', 1)$q$,
          '%changed by someone else%', 'T90 an old row version is a conflict, nothing overwritten silently');
select tst.blocked($q$update public.company_modules set paid_until = now() + interval '1 year' where company_id = 'ca000000-0000-0000-0000-000000000000'$q$,
          'T90 nobody pays for themselves: no direct writes');
select tst.blocked($q$insert into public.company_modules (company_id, module_key, enabled, paid_until) values ('ca000000-0000-0000-0000-000000000000', 'roofing', true, now() + interval '1 year')$q$,
          'T90 no direct inserts');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.company_modules where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 1, 'T90 every member reads the company''s modules');
select tst.fails($q$select public.module_save_settings('ca000000-0000-0000-0000-000000000000', 'gutters', '{}', 2)$q$, 'T90 a tech does not change module settings');
:as_office90
select tst.fails($q$select public.module_save_settings('ca000000-0000-0000-0000-000000000000', 'gutters', '{}', 2)$q$, 'T90 the office does not change module settings');
select tst.fails($q$select public.module_disable('ca000000-0000-0000-0000-000000000000', 'gutters')$q$, 'T90 the office does not switch modules off');
:as_tech_a
select tst.fails($q$select public.module_disable('ca000000-0000-0000-0000-000000000000', 'gutters')$q$, 'T90 a tech does not switch modules off');
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.company_modules where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0, 'T90 another company does not see A''s modules');
select tst.ok(not app.module_active('ca000000-0000-0000-0000-000000000000', 'gutters'), 'T90 another company does not learn whether A''s module is active');
select tst.fails($q$select public.module_save_settings('ca000000-0000-0000-0000-000000000000', 'gutters', '{}', 2)$q$, 'T90 another company does not change A''s settings');
select tst.fails($q$select public.module_disable('ca000000-0000-0000-0000-000000000000', 'gutters')$q$, 'T90 another company does not switch A''s modules off');
-- an admin may do what the owner does; switching off and on inside the trial keeps its end
:as_super
insert into auth.users (id, email, raw_user_meta_data) values ('a9000000-0000-4000-8000-000000000002', 'admin90@a.test', '{"full_name":"Ada Admin"}');
insert into public.memberships (company_id, user_id, role, status) values ('ca000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-000000000002', 'admin', 'active');
create temp table t90_trial as select trial_ends_at from public.company_modules where company_id = 'ca000000-0000-0000-0000-000000000000' and module_key = 'gutters';
grant select on t90_trial to authenticated;
\set as_admin90 'reset role; set request.jwt.claim.sub = ''a9000000-0000-4000-8000-000000000002''; set role authenticated;'
:as_admin90
select public.module_disable('ca000000-0000-0000-0000-000000000000', 'gutters');
select tst.ok((select trial_ends_at = (select trial_ends_at from t90_trial) and enabled
                 from public.module_enable('ca000000-0000-0000-0000-000000000000', 'gutters')), 'T90 an admin switches off and on: the trial end does not move');
select tst.ok((select row_version from public.company_modules where company_id = 'ca000000-0000-0000-0000-000000000000' and module_key = 'gutters') = 4
          and (select settings->>'storyHeightIn' from public.module_save_settings('ca000000-0000-0000-0000-000000000000', 'gutters', '{"storyHeightIn":120}', 4)) = '120',
          'T90 an admin saves settings');
-- a member who was switched off sees nothing and calls nothing
:as_super
update public.memberships set status = 'disabled' where user_id = 'a9000000-0000-4000-8000-000000000001';
:as_office90
select tst.ok(tst.cnt($q$select 1 from public.company_modules$q$) = 0 and not app.module_active('ca000000-0000-0000-0000-000000000000', 'gutters'),
          'T90 a disabled member sees no modules');
:as_owner_b
select tst.ok(not app.module_active('cb000000-0000-0000-0000-000000000000', 'gutters'), 'T90 a company that never switched it on has no module');
-- the trial ends: nothing of the module is saved any more (founder О2)
:as_super
update public.company_modules set trial_ends_at = now() - interval '1 minute' where company_id = 'ca000000-0000-0000-0000-000000000000' and module_key = 'gutters';
:as_owner_a
select tst.ok(not app.module_active('ca000000-0000-0000-0000-000000000000', 'gutters'), 'T90 after the trial without payment the module is not active');
select tst.fails_like($q$select public.module_save_settings('ca000000-0000-0000-0000-000000000000', 'gutters', '{"storyHeightIn":132}', 2)$q$,
          '%not active%', 'T90 after the trial settings are not saved');
select tst.ok((select trial_ends_at < now() from public.module_enable('ca000000-0000-0000-0000-000000000000', 'gutters')), 'T90 switching on again does not restart the trial');
select tst.ok((select settings->>'storyHeightIn' = '120' from public.company_modules where company_id = 'ca000000-0000-0000-0000-000000000000' and module_key = 'gutters'),
          'T90 the old settings are kept, readable');
-- paid by the operator / billing: active again
:as_super
update public.company_modules set paid_until = now() + interval '30 days' where company_id = 'ca000000-0000-0000-0000-000000000000' and module_key = 'gutters';
:as_owner_a
select tst.ok(app.module_active('ca000000-0000-0000-0000-000000000000', 'gutters'), 'T90 paid: the module is active again');
select public.module_disable('ca000000-0000-0000-0000-000000000000', 'gutters');
select tst.ok(not app.module_active('ca000000-0000-0000-0000-000000000000', 'gutters')
          and tst.cnt($q$select 1 from public.company_modules where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 1,
          'T90 switched off: not active, the row (and settings) stay');
-- rights (rule 18)
:as_super
select tst.ok(not has_function_privilege('anon', 'public.module_enable(uuid, text)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.module_save_settings(uuid, text, jsonb, integer)', 'EXECUTE')
          and not has_function_privilege('anon', 'app.module_active(uuid, text)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.module_enable(uuid, text)', 'EXECUTE')
          and not has_table_privilege('authenticated', 'public.company_modules', 'INSERT')
          and not has_table_privilege('authenticated', 'public.company_modules', 'UPDATE'), 'T90 rights: anon nothing; the app only through the functions');
-- clean up
delete from public.company_modules where company_id = 'ca000000-0000-0000-0000-000000000000';
update public.memberships set status = 'disabled' where user_id::text like 'a9000000-%';
drop table t90_trial;
\echo 'T90 company modules: owner/admin switch on, 7-day trial, nothing saved after it, no self-payment ok'

-- ---------------------------------------------------------------- T91: price-list item properties (docs/specs/33 П16, C3; core K1)
:as_super
insert into auth.users (id, email, raw_user_meta_data) values
  ('a9100000-0000-4000-8000-000000000001', 'office91@a.test', '{"full_name":"Olive Office"}'),
  ('a9100000-0000-4000-8000-000000000002', 'tech91@a.test', '{"full_name":"Ted Tech"}');
insert into public.memberships (company_id, user_id, role, status) values
  ('ca000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000001', 'office', 'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000002', 'tech', 'active');
\set as_office91 'reset role; set request.jwt.claim.sub = ''a9100000-0000-4000-8000-000000000001''; set role authenticated;'
\set as_tech91 'reset role; set request.jwt.claim.sub = ''a9100000-0000-4000-8000-000000000002''; set role authenticated;'
:as_office91
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, is_placeholder_price)
  values ('91000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'material', 'T91 test item', 'ft', 100, true);
select tst.ok((select attributes = '{}'::jsonb and purchase_unit is null and pack_size is null from public.catalog_items where id = '91000000-0000-4000-8000-000000000001'),
          'T91 a new item has no properties: {} and no purchase unit');
-- the office (staff) writes properties the way the app does (upsert of the columns it sends)
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, is_placeholder_price, attributes, purchase_unit, pack_size)
  values ('91000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'material', 'T91 test item', 'ft', 100, true,
          '{"profile":"k","size":"6","material":"aluminum","gauge":".032","color":"white","gutterSize":"6","lengthIn":"120"}', 'coil', 1.5)
  on conflict (id) do update set attributes = excluded.attributes, purchase_unit = excluded.purchase_unit, pack_size = excluded.pack_size;
select tst.ok((select attributes->>'gauge' = '.032' and attributes->>'gutterSize' = '6' and purchase_unit = 'coil' and pack_size = 1.5
                 from public.catalog_items where id = '91000000-0000-4000-8000-000000000001'), 'T91 staff saves properties (camelCase names too), a purchase unit and a pack size');
-- an old phone saves the item without the new columns: they stay (rule 16)
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, is_placeholder_price)
  values ('91000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'material', 'T91 renamed by an old phone', 'ft', 120, true)
  on conflict (id) do update set name = excluded.name, unit_price_cents = excluded.unit_price_cents;
select tst.ok((select name = 'T91 renamed by an old phone' and attributes->>'color' = 'white' and purchase_unit = 'coil'
                 from public.catalog_items where id = '91000000-0000-4000-8000-000000000001'), 'T91 an old phone''s save never clears the properties');
-- junk is refused by the server, not only the app
select tst.fails_like($q$update public.catalog_items set attributes = '["k"]' where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_attributes_check%', 'T91 properties are an object');
select tst.fails_like($q$update public.catalog_items set attributes = '{"size":6}' where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_attributes_check%', 'T91 a value is text');
select tst.fails_like($q$update public.catalog_items set attributes = '{"color":{"r":1}}' where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_attributes_check%', 'T91 no nested values');
select tst.fails_like($q$update public.catalog_items set attributes = '{"size":""}' where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_attributes_check%', 'T91 no empty values');
select tst.fails_like($q$update public.catalog_items set attributes = jsonb_build_object('note', repeat('a', 121)) where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_attributes_check%', 'T91 a value is at most 120 characters');
select tst.fails_like($q$update public.catalog_items set attributes = '{"bad key":"x"}' where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_attributes_check%', 'T91 names: letters, digits, _');
select tst.fails_like($q$update public.catalog_items set attributes = '{"1size":"x"}' where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_attributes_check%', 'T91 a name starts with a letter');
select tst.fails_like($q$update public.catalog_items set attributes = (select jsonb_object_agg('k' || g, repeat('v', 100)) from generate_series(1, 45) g) where id = '91000000-0000-4000-8000-000000000001'$q$,
          '%catalog_items_attributes_check%', 'T91 the whole map is at most 4000 bytes');
select tst.fails_like($q$update public.catalog_items set attributes = 'null' where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_attributes_check%', 'T91 not a JSON null');
select tst.fails($q$update public.catalog_items set attributes = null where id = '91000000-0000-4000-8000-000000000001'$q$, 'T91 not an SQL null');
select tst.fails_like($q$update public.catalog_items set pack_size = 0 where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_purchase_check%', 'T91 a pack size is above zero');
select tst.fails_like($q$update public.catalog_items set purchase_unit = '  ' where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_purchase_check%', 'T91 a purchase unit is not blank');
select tst.fails_like($q$update public.catalog_items set purchase_unit = repeat('u', 21) where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_purchase_check%', 'T91 a purchase unit is at most 20 characters');
-- security-check C3: a line break, blanks, control characters and bidi overrides; a padded purchase unit
select tst.fails_like($q$update public.catalog_items set attributes = jsonb_build_object('note', repeat(E'abcdefghi\n', 300)) where id = '91000000-0000-4000-8000-000000000001'$q$,
          '%catalog_items_attributes_check%', 'T91 line breaks count toward the 120 characters');
select tst.fails_like($q$update public.catalog_items set attributes = jsonb_build_object('note', E'\n') where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_attributes_check%', 'T91 a line break alone is blank');
select tst.fails_like($q$update public.catalog_items set attributes = '{"note":"   "}' where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_attributes_check%', 'T91 spaces alone are blank');
select tst.fails_like($q$update public.catalog_items set attributes = jsonb_build_object('note', E'red\u001b[31m') where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_attributes_check%', 'T91 no control characters');
select tst.fails_like($q$update public.catalog_items set attributes = jsonb_build_object('note', E'abc‮def') where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_attributes_check%', 'T91 no bidirectional overrides');
select tst.fails_like($q$update public.catalog_items set purchase_unit = 'a' || repeat(' ', 100) where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_purchase_check%', 'T91 a purchase unit is stored trimmed');
select tst.fails_like($q$update public.catalog_items set purchase_unit = 'a' || repeat(E'\t', 5) where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_purchase_check%', 'T91 tabs do not pad a purchase unit');
select tst.fails_like($q$update public.catalog_items set purchase_unit = E'b\nox' where id = '91000000-0000-4000-8000-000000000001'$q$, '%catalog_items_purchase_check%', 'T91 no control characters in a purchase unit');
update public.catalog_items set attributes = '{"color":"white","note":"Café 6″ — ok","size":"6","profile":"k"}' where id = '91000000-0000-4000-8000-000000000001';
select tst.ok((select attributes->>'note' = 'Café 6″ — ok' from public.catalog_items where id = '91000000-0000-4000-8000-000000000001'), 'T91 ordinary text with accents and symbols is fine');
-- a tech reads, does not write; another company neither reads nor writes
:as_tech91
select tst.ok((select attributes->>'profile' = 'k' from public.catalog_items where id = '91000000-0000-4000-8000-000000000001'), 'T91 a tech reads the properties');
select tst.blocked($q$update public.catalog_items set attributes = '{"color":"red"}' where id = '91000000-0000-4000-8000-000000000001'$q$, 'T91 a tech does not change properties');
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.catalog_items where id = '91000000-0000-4000-8000-000000000001'$q$) = 0, 'T91 another company does not see the item');
select tst.blocked($q$update public.catalog_items set attributes = '{"color":"red"}' where id = '91000000-0000-4000-8000-000000000001'$q$, 'T91 another company does not change properties');
:as_super
select tst.ok((select attributes->>'color' = 'white' from public.catalog_items where id = '91000000-0000-4000-8000-000000000001'), 'T91 nothing changed by the refused writes');
select tst.ok(not has_table_privilege('anon', 'public.catalog_items', 'SELECT'), 'T91 anon reads nothing');
update public.memberships set status = 'disabled' where user_id in ('a9100000-0000-4000-8000-000000000001', 'a9100000-0000-4000-8000-000000000002');
\echo 'T91 catalog item properties: shape checked on the server, staff writes, old phones never clear them ok'
-- ---------------------------------------------------------------- T92: gutter measurements — who reads and writes, same company, sizes (docs/specs/33 S4g, П11, П19)
:as_super
insert into auth.users (id, email, raw_user_meta_data) values
  ('a9200000-0000-4000-8000-000000000001', 'sales92@a.test', '{"full_name":"Sid Sales"}'),
  ('a9200000-0000-4000-8000-000000000002', 'sub92@a.test', '{"full_name":"Sue Sub"}'),
  ('a9200000-0000-4000-8000-000000000003', 'tech92@a.test', '{"full_name":"Ted Tech"}');
insert into public.memberships (company_id, user_id, role, status) values
  ('ca000000-0000-0000-0000-000000000000', 'a9200000-0000-4000-8000-000000000001', 'sales', 'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a9200000-0000-4000-8000-000000000002', 'subcontractor', 'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a9200000-0000-4000-8000-000000000003', 'tech', 'active');
insert into public.leads (id, company_id, source_id, contact_name, phone) values
  ('19200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T92 Lead', '+13235550192'),
  ('19200000-0000-4000-8000-000000000002', 'cb000000-0000-0000-0000-000000000000', '1b000000-0000-0000-0000-000000000001', 'T92 B Lead', '+13235550193'),
  ('19200000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T92 Other Lead', '+13235550194');
\set as_sales92 'reset role; set request.jwt.claim.sub = ''a9200000-0000-4000-8000-000000000001''; set role authenticated;'
\set as_sub92   'reset role; set request.jwt.claim.sub = ''a9200000-0000-4000-8000-000000000002''; set role authenticated;'
\set as_tech92  'reset role; set request.jwt.claim.sub = ''a9200000-0000-4000-8000-000000000003''; set role authenticated;'
-- the module is off: nobody saves a measurement yet (founder О2: only an active module saves)
:as_owner_a
select tst.blocked($q$insert into public.gutter_measurements (id, company_id) values ('9e920000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000')$q$,
          'T92 the module is off: no measurement is saved');
select public.module_enable('ca000000-0000-0000-0000-000000000000', 'gutters');
-- owner: a measurement on a property and a lead of the company; created_by is the caller, whatever is sent
insert into public.gutter_measurements (id, company_id, property_id, lead_id, label, created_by) values
  ('9e920000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'd1a00000-0000-0000-0000-000000000001',
   '19200000-0000-4000-8000-000000000001', 'Front and back', 'a9200000-0000-4000-8000-000000000003');
select tst.ok((select created_by = 'a0000000-0000-0000-0000-000000000001' and row_version = 1 and status = 'draft' and revision = 0
                 from public.gutter_measurements where id = '9e920000-0000-4000-8000-000000000001'), 'T92 the owner measures; the author cannot be forged');
select tst.fails_like($q$insert into public.gutter_measurements (company_id, property_id) values ('ca000000-0000-0000-0000-000000000000', 'd1b00000-0000-0000-0000-000000000001')$q$,
          '%cannot be linked%', 'T92 another company''s property is refused');
select tst.fails_like($q$insert into public.gutter_measurements (company_id, lead_id) values ('ca000000-0000-0000-0000-000000000000', '19200000-0000-4000-8000-000000000002')$q$,
          '%cannot be linked%', 'T92 another company''s lead is refused');
select tst.fails_like($q$update public.gutter_measurements set property_id = 'd1b00000-0000-0000-0000-000000000001' where id = '9e920000-0000-4000-8000-000000000001'$q$,
          '%cannot be linked%', 'T92 …also on update');
select tst.fails($q$insert into public.gutter_measurements (company_id, status) values ('ca000000-0000-0000-0000-000000000000', 'sent')$q$, 'T92 only draft / ready');
select tst.fails($q$insert into public.gutter_measurements (company_id, label) values ('ca000000-0000-0000-0000-000000000000', repeat('x', 121))$q$, 'T92 a label up to 120');
-- a draft «measure here» without a lead or a property
insert into public.gutter_measurements (id, company_id) values ('9e920000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000');
-- a tech sees only his own, his leads' and his visits' measurements (like leads and properties, П11)
:as_tech92
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurements where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0,
          'T92 a tech does not see the office''s measurements on a lead that is not his');
select tst.blocked($q$insert into public.gutter_measurement_elements (company_id, measurement_id, kind) values ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 'run')$q$,
          'T92 …nor draws on them');
insert into public.gutter_measurements (id, company_id, label) values ('9e920000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'Ted''s own');
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurements where id = '9e920000-0000-4000-8000-000000000003'$q$) = 1, 'T92 a tech measures on his own');
select tst.fails_like($q$insert into public.gutter_measurements (company_id, lead_id) values ('ca000000-0000-0000-0000-000000000000', '19200000-0000-4000-8000-000000000003')$q$,
          'this lead or property cannot be linked', 'T92 a tech does not hang a measurement on a lead he does not see');
select tst.fails_like($q$insert into public.gutter_measurements (company_id, lead_id) values ('ca000000-0000-0000-0000-000000000000', gen_random_uuid())$q$,
          'this lead or property cannot be linked', 'T92 …the same answer as for a lead that does not exist (no probing)');
select tst.fails_like($q$update public.gutter_measurements set lead_id = '19200000-0000-4000-8000-000000000003' where id = '9e920000-0000-4000-8000-000000000003'$q$,
          'this lead or property cannot be linked', 'T92 …nor moves his own onto it');
select tst.fails_like($q$insert into public.gutter_measurements (company_id, property_id) values ('ca000000-0000-0000-0000-000000000000', 'd1a00000-0000-0000-0000-000000000001')$q$,
          'this lead or property cannot be linked', 'T92 a tech does not hang a measurement on a property of no visit of his');
select tst.fails_like($q$update public.gutter_measurements set property_id = 'd1a00000-0000-0000-0000-000000000001' where id = '9e920000-0000-4000-8000-000000000003'$q$,
          'this lead or property cannot be linked', 'T92 …nor moves his own onto it');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurements where id = '9e920000-0000-4000-8000-000000000003'$q$) = 0, 'T92 another tech does not see it');
:as_super
update public.leads set assigned_to = 'a9200000-0000-4000-8000-000000000003' where id = '19200000-0000-4000-8000-000000000001';
-- the property of his visit: he sees the office's measurement on it and draws
insert into public.visits (id, company_id, property_id, starts_at, ends_at) values
  ('f9200000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'd1a00000-0000-0000-0000-000000000002', now(), now() + interval '2 hours');
insert into public.visit_assignees (company_id, visit_id, user_id) values
  ('ca000000-0000-0000-0000-000000000000', 'f9200000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000003');
:as_owner_a
insert into public.gutter_measurements (id, company_id, property_id) values ('9e920000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'd1a00000-0000-0000-0000-000000000002');
insert into public.gutter_measurement_revisions (company_id, measurement_id, revision, elements, engine_version) values
  ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000002', 1, '[]', 'x');
:as_tech92
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurements where id = '9e920000-0000-4000-8000-000000000004'$q$) = 1, 'T92 a tech sees the measurement on the property of his visit');
insert into public.gutter_measurement_elements (company_id, measurement_id, kind) values ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000004', 'point');
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurement_elements where measurement_id = '9e920000-0000-4000-8000-000000000004'$q$) = 1, 'T92 …and draws on it');
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurement_revisions where measurement_id = '9e920000-0000-4000-8000-000000000002'$q$) = 0,
          'T92 a tech does not see revisions of a measurement he does not see');
:as_super
-- the lead is his now: he sees the measurement on it and draws
:as_tech92
insert into public.gutter_measurement_elements (id, company_id, measurement_id, kind, geom, attrs) values
  ('9e920000-0000-4000-8000-0000000000e1', 'ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 'run',
   '{"a":[0,360],"b":[480,360]}', '{"profile":"k","size":"6","material":"aluminum","gauge":".032","story":1,"hanger":"hidden"}');
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurements where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 3,
          'T92 a tech sees his own, the one on his lead and the one on his visit''s property, not the office''s draft');
-- he edits the one on his lead although its property is not of his visits; a full rewrite from the queue passes
update public.gutter_measurements set label = 'Front, back (Ted)' where id = '9e920000-0000-4000-8000-000000000001';
insert into public.gutter_measurements (id, company_id, property_id, lead_id, label) values
  ('9e920000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'd1a00000-0000-0000-0000-000000000001', '19200000-0000-4000-8000-000000000001', 'Front and back')
  on conflict (id) do update set property_id = excluded.property_id, lead_id = excluded.lead_id, label = excluded.label;
select tst.ok((select label = 'Front and back' from public.gutter_measurements where id = '9e920000-0000-4000-8000-000000000001'),
          'T92 a tech edits the measurement on his lead (its property is not his); the queue''s full rewrite passes');
-- an element upsert as the queue sends it (full write of one element): the second time it updates, row_version + 1
insert into public.gutter_measurement_elements (id, company_id, measurement_id, kind, geom, confidence) values
  ('9e920000-0000-4000-8000-0000000000e1', 'ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 'run', '{"a":[0,360],"b":[492,360]}', 'taped')
  on conflict (id) do update set geom = excluded.geom, confidence = excluded.confidence;
select tst.ok((select row_version = 2 and confidence = 'taped' and updated_by = 'a9200000-0000-4000-8000-000000000003'
                 from public.gutter_measurement_elements where id = '9e920000-0000-4000-8000-0000000000e1'), 'T92 the same element written again is an update, version + 1');
:as_sales92
insert into public.gutter_measurement_elements (company_id, measurement_id, kind, geom, attrs) values
  ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 'downspout', '{"runId":"9e920000-0000-4000-8000-0000000000e1","atIn":480}', '{"shape":"rect","size":"3x4"}');
:as_office_a
insert into public.gutter_measurement_elements (company_id, measurement_id, kind, geom) values
  ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 'point', '{"p":[0,0]}');
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurement_elements where measurement_id = '9e920000-0000-4000-8000-000000000001'$q$) = 3,
          'T92 tech, sales and office draw on one measurement');
-- shapes and sizes
select tst.fails($q$insert into public.gutter_measurement_elements (company_id, measurement_id, kind) values ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 'house')$q$, 'T92 only known element kinds');
select tst.fails($q$insert into public.gutter_measurement_elements (company_id, measurement_id, kind, confidence) values ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 'run', 'guess')$q$, 'T92 confidence: auto / drawn / taped');
select tst.fails($q$insert into public.gutter_measurement_elements (company_id, measurement_id, kind, geom) values ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 'run', '[1,2]')$q$, 'T92 geometry is an object');
select tst.fails($q$insert into public.gutter_measurement_elements (company_id, measurement_id, kind, attrs) values ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 'run', jsonb_build_object('x', repeat('a', 9000)))$q$, 'T92 attributes up to 8 KB');
select tst.fails($q$insert into public.gutter_measurement_elements (company_id, measurement_id, kind, geom) values ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 'run', jsonb_build_object('x', repeat('a', 2100)))$q$, 'T92 geometry up to 2 KB');
-- no deletes: removal is deleted_at; the row and its history stay
select tst.blocked($q$delete from public.gutter_measurement_elements where id = '9e920000-0000-4000-8000-0000000000e1'$q$, 'T92 elements are not deleted');
select tst.blocked($q$delete from public.gutter_measurements where id = '9e920000-0000-4000-8000-000000000002'$q$, 'T92 measurements are not deleted');
update public.gutter_measurements set deleted_at = now() where id = '9e920000-0000-4000-8000-000000000002';
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurements where id = '9e920000-0000-4000-8000-000000000002' and deleted_at is not null$q$) = 1,
          'T92 removing is deleted_at (undo and offline sync see it)');
update public.gutter_measurements set deleted_at = null where id = '9e920000-0000-4000-8000-000000000002';
-- a row never moves to another company; an element never sits under another company's measurement
select tst.fails($q$update public.gutter_measurements set company_id = 'cb000000-0000-0000-0000-000000000000' where id = '9e920000-0000-4000-8000-000000000001'$q$, 'T92 company_id is immutable');
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurements where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0
          and tst.cnt($q$select 1 from public.gutter_measurement_elements where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0,
          'T92 another company sees nothing');
select tst.blocked($q$insert into public.gutter_measurement_elements (company_id, measurement_id, kind) values ('cb000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 'run')$q$,
          'T92 another company cannot hang an element on A''s measurement');
select tst.blocked($q$insert into public.gutter_measurement_elements (company_id, measurement_id, kind) values ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 'run')$q$,
          'T92 another company cannot write into A');
select tst.blocked($q$update public.gutter_measurement_elements set geom = '{}' where company_id = 'ca000000-0000-0000-0000-000000000000'$q$, 'T92 another company cannot change A''s elements');
select tst.blocked($q$update public.gutter_measurements set label = 'x' where company_id = 'ca000000-0000-0000-0000-000000000000'$q$, 'T92 another company cannot change A''s measurements');
-- no probing: A's real property and a random id give the same answer to a stranger
select tst.fails_like($q$insert into public.gutter_measurements (company_id, property_id) values ('ca000000-0000-0000-0000-000000000000', 'd1a00000-0000-0000-0000-000000000001')$q$,
          'not allowed', 'T92 a stranger with A''s real property id…');
select tst.fails_like($q$insert into public.gutter_measurements (company_id, property_id) values ('ca000000-0000-0000-0000-000000000000', gen_random_uuid())$q$,
          'not allowed', 'T92 …gets the same answer as with a random id');
select tst.fails_like($q$insert into public.gutter_measurements (company_id, lead_id) values ('ca000000-0000-0000-0000-000000000000', '19200000-0000-4000-8000-000000000001')$q$,
          'not allowed', 'T92 …and with A''s real lead id');
-- a subcontractor: nothing (П11)
:as_sub92
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurements$q$) = 0 and tst.cnt($q$select 1 from public.gutter_measurement_elements$q$) = 0
          and tst.cnt($q$select 1 from public.gutter_measurement_revisions$q$) = 0, 'T92 a subcontractor sees no measurements');
select tst.blocked($q$insert into public.gutter_measurements (company_id) values ('ca000000-0000-0000-0000-000000000000')$q$, 'T92 a subcontractor does not measure');
select tst.blocked($q$update public.gutter_measurement_elements set geom = '{}' where company_id = 'ca000000-0000-0000-0000-000000000000'$q$, 'T92 a subcontractor does not draw');
-- rights (rule 18, T52)
:as_super
select tst.ok(not has_table_privilege('anon', 'public.gutter_measurements', 'SELECT')
          and not has_table_privilege('anon', 'public.gutter_measurement_elements', 'SELECT')
          and not has_table_privilege('anon', 'public.gutter_measurement_revisions', 'SELECT')
          and not has_table_privilege('authenticated', 'public.gutter_measurements', 'DELETE')
          and not has_table_privilege('authenticated', 'public.gutter_measurement_elements', 'DELETE')
          and not has_table_privilege('authenticated', 'public.gutter_measurement_revisions', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.gutter_measurement_revisions', 'DELETE')
          and not has_function_privilege('anon', 'app.gutter_sees(uuid, uuid, uuid, uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'app.gutter_sees_measurement(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'app.tg_gutter_measurement_refs()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'app.tg_gutter_revision_frozen()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'app.tg_gutter_limits()', 'EXECUTE'),
          'T92 rights: anon nothing; no deletes; revisions never updated; trigger functions not callable');
select tst.ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
                where oid in ('public.gutter_measurements'::regclass, 'public.gutter_measurement_elements'::regclass, 'public.gutter_measurement_revisions'::regclass)),
          'T92 RLS on and forced on all three tables');
\echo 'T92 gutter measurements: staff and techs write, subcontractors and other companies nothing, same company, no deletes ok'

-- ---------------------------------------------------------------- T93: gutter measurements after the trial; revisions never change (founder О2, spec 33 §4)
:as_tech92
insert into public.gutter_measurement_revisions (company_id, measurement_id, revision, elements, parts, engine_version) values
  ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 1, '[{"kind":"run"}]', '[{"key":"gutter.k.6","qty":"40"}]', 'gutterParts@358');
update public.gutter_measurements set revision = 1, status = 'ready' where id = '9e920000-0000-4000-8000-000000000001';
select tst.ok((select revision = 1 and status = 'ready' from public.gutter_measurements where id = '9e920000-0000-4000-8000-000000000001'),
          'T93 «Make estimate»: a revision and the measurement is ready');
-- M8b (T98): the number is the server's — a phone that sends 1 again gets the next one, never a duplicate
insert into public.gutter_measurement_revisions (company_id, measurement_id, revision, elements, engine_version) values ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 1, '[]', 'x');
select tst.ok((select array_agg(revision order by revision) = array[1, 2] from public.gutter_measurement_revisions where measurement_id = '9e920000-0000-4000-8000-000000000001'),
          'T93 one revision number once (the server numbers them, M8b)');
select tst.fails($q$insert into public.gutter_measurement_revisions (company_id, measurement_id, revision, elements, engine_version) values ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 2, '{}', 'x')$q$,
          'T93 the snapshot is an array of elements');
select tst.fails($q$insert into public.gutter_measurement_revisions (company_id, measurement_id, revision, elements, engine_version) values ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 2, jsonb_build_array(repeat('a', 600000)), 'x')$q$,
          'T93 a snapshot up to 512 KB');
select tst.blocked($q$update public.gutter_measurement_revisions set parts = '[]' where measurement_id = '9e920000-0000-4000-8000-000000000001'$q$, 'T93 the app cannot change a revision');
-- limits per measurement: 1000 elements, 100 revisions (no loop fills the database)
insert into public.gutter_measurement_revisions (company_id, measurement_id, revision, elements, engine_version)
select 'ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000003', g, '[]', 'x' from generate_series(1, 100) g;
select tst.fails_like($q$insert into public.gutter_measurement_revisions (company_id, measurement_id, revision, elements, engine_version) values ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000003', 101, '[]', 'x')$q$,
          '%at most 100 revisions%', 'T93 at most 100 revisions a measurement');
insert into public.gutter_measurement_elements (company_id, measurement_id, kind)
select 'ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000003', 'point' from generate_series(1, 1000);
select tst.fails_like($q$insert into public.gutter_measurement_elements (company_id, measurement_id, kind) values ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000003', 'point')$q$,
          '%at most 1000 elements%', 'T93 at most 1000 elements a measurement');
:as_super
select tst.fails_like($q$update public.gutter_measurement_revisions set parts = '[]' where measurement_id = '9e920000-0000-4000-8000-000000000001'$q$,
          '%never changes%', 'T93 …nor can the server');
-- the trial is over, not paid: reading stays, writing stops — on the server, not only in the app
update public.company_modules set trial_ends_at = now() - interval '1 minute', paid_until = null
 where company_id = 'ca000000-0000-0000-0000-000000000000' and module_key = 'gutters';
:as_owner_a
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurements where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 4
          and tst.cnt($q$select 1 from public.gutter_measurement_elements where measurement_id = '9e920000-0000-4000-8000-000000000001'$q$) = 3
          and tst.cnt($q$select 1 from public.gutter_measurement_revisions where measurement_id = '9e920000-0000-4000-8000-000000000001'$q$) = 2,
          'T93 after the trial old drafts and revisions still open');
select tst.blocked($q$insert into public.gutter_measurements (company_id) values ('ca000000-0000-0000-0000-000000000000')$q$, 'T93 after the trial no new measurement');
select tst.blocked($q$update public.gutter_measurement_elements set geom = '{"a":[0,0],"b":[1,1]}' where measurement_id = '9e920000-0000-4000-8000-000000000001'$q$,
          'T93 after the trial an edit is not saved');
select tst.blocked($q$update public.gutter_measurements set label = 'after' where id = '9e920000-0000-4000-8000-000000000001'$q$, 'T93 …nor a renamed measurement');
select tst.blocked($q$insert into public.gutter_measurement_revisions (company_id, measurement_id, revision, elements, engine_version) values ('ca000000-0000-0000-0000-000000000000', '9e920000-0000-4000-8000-000000000001', 2, '[]', 'x')$q$,
          'T93 …nor a new revision');
-- paid: writing again
:as_super
update public.company_modules set paid_until = now() + interval '30 days' where company_id = 'ca000000-0000-0000-0000-000000000000' and module_key = 'gutters';
:as_tech92
update public.gutter_measurement_elements set confidence = 'taped' where measurement_id = '9e920000-0000-4000-8000-000000000001' and kind = 'downspout';
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurement_elements where kind = 'downspout' and confidence = 'taped'$q$) = 1, 'T93 paid: edits are saved again');
-- the lead is taken from him: his own measurement stays, the one on that lead is gone from his phone
:as_super
update public.leads set assigned_to = null where id = '19200000-0000-4000-8000-000000000001';
:as_tech92
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurements where id = '9e920000-0000-4000-8000-000000000001'$q$) = 0
          and tst.cnt($q$select 1 from public.gutter_measurements where id = '9e920000-0000-4000-8000-000000000003'$q$) = 1,
          'T93 the lead taken from a tech: the measurement on it is gone, his own stays');
-- clean up
:as_super
delete from public.visit_assignees where visit_id = 'f9200000-0000-4000-8000-000000000001';
update public.visits set deleted_at = now() where id = 'f9200000-0000-4000-8000-000000000001';
delete from public.gutter_measurement_revisions where company_id = 'ca000000-0000-0000-0000-000000000000';
delete from public.gutter_measurement_elements where company_id = 'ca000000-0000-0000-0000-000000000000';
delete from public.gutter_measurements where company_id = 'ca000000-0000-0000-0000-000000000000';
delete from public.company_modules where company_id = 'ca000000-0000-0000-0000-000000000000';
update public.leads set deleted_at = now() where id::text like '19200000-%';
update public.memberships set status = 'disabled' where user_id::text like 'a9200000-%';
\echo 'T93 gutter measurements after the trial: read yes, write no; revisions never change ok'

-- ---------------------------------------------------------------- T94: photos of a measurement and its element (spec 33 П21.10, M5d)
:as_super
insert into auth.users (id, email, raw_user_meta_data) values
  ('a9400000-0000-4000-8000-000000000001', 'tech94@a.test', '{"full_name":"Tia Tech"}'),
  ('a9400000-0000-4000-8000-000000000002', 'tech94b@a.test', '{"full_name":"Tom Tech"}'),
  ('a9400000-0000-4000-8000-000000000003', 'sub94@a.test', '{"full_name":"Sam Sub"}');
insert into public.memberships (company_id, user_id, role, status) values
  ('ca000000-0000-0000-0000-000000000000', 'a9400000-0000-4000-8000-000000000001', 'tech', 'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a9400000-0000-4000-8000-000000000002', 'tech', 'active'),
  ('ca000000-0000-0000-0000-000000000000', 'a9400000-0000-4000-8000-000000000003', 'subcontractor', 'active');
\set as_tech94  'reset role; set request.jwt.claim.sub = ''a9400000-0000-4000-8000-000000000001''; set role authenticated;'
\set as_tech94b 'reset role; set request.jwt.claim.sub = ''a9400000-0000-4000-8000-000000000002''; set role authenticated;'
\set as_sub94   'reset role; set request.jwt.claim.sub = ''a9400000-0000-4000-8000-000000000003''; set role authenticated;'
:as_owner_a
select public.module_enable('ca000000-0000-0000-0000-000000000000', 'gutters');
-- the office's measurement (no lead, no property) with a run
insert into public.gutter_measurements (id, company_id, label) values ('9e940000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'T94 office');
insert into public.gutter_measurement_elements (id, company_id, measurement_id, kind) values
  ('9e940000-0000-4000-8000-0000000000e2', 'ca000000-0000-0000-0000-000000000000', '9e940000-0000-4000-8000-000000000002', 'run');
-- Tia's own measurement with a run
:as_tech94
insert into public.gutter_measurements (id, company_id, label) values ('9e940000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'T94 Tia');
insert into public.gutter_measurement_elements (id, company_id, measurement_id, kind) values
  ('9e940000-0000-4000-8000-0000000000e1', 'ca000000-0000-0000-0000-000000000000', '9e940000-0000-4000-8000-000000000001', 'run');
-- a tech: a photo of her measurement and of its run
insert into public.files (id, company_id, kind, measurement_id) values
  ('f9400000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000001');
insert into public.files (id, company_id, kind, measurement_id, element_id) values
  ('f9400000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000001', '9e940000-0000-4000-8000-0000000000e1');
select tst.ok(tst.cnt($q$select 1 from public.files where measurement_id = '9e940000-0000-4000-8000-000000000001'$q$) = 2,
          'T94 a tech adds photos to her measurement and to its run');
-- …not to a measurement she does not see; not an element of another measurement; photos only; an element names its measurement
select tst.blocked($q$insert into public.files (company_id, kind, measurement_id) values ('ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000002')$q$,
          'T94 a tech cannot add a photo to a measurement she does not see');
select tst.fails($q$insert into public.files (company_id, kind, measurement_id, element_id) values ('ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000001', '9e940000-0000-4000-8000-0000000000e2')$q$,
          'T94 an element of another measurement is refused');
select tst.fails($q$insert into public.files (company_id, kind, element_id) values ('ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-0000000000e1')$q$,
          'T94 an element''s photo names its measurement');
select tst.fails($q$insert into public.files (company_id, kind, measurement_id) values ('ca000000-0000-0000-0000-000000000000', 'receipt', '9e940000-0000-4000-8000-000000000001')$q$,
          'T94 a measurement holds photos only');
select tst.fails($q$update public.files set measurement_id = '9e940000-0000-4000-8000-000000000002' where id = 'f9400000-0000-4000-8000-000000000001'$q$,
          'T94 a tech cannot move her photo onto a measurement she does not see');
-- the office: sees all, adds to any measurement
:as_owner_a
insert into public.files (id, company_id, kind, measurement_id) values
  ('f9400000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000001'),
  ('f9400000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000002');
select tst.ok(tst.cnt($q$select 1 from public.files where id::text like 'f9400000-%'$q$) = 4, 'T94 the office sees and adds measurement photos');
-- Tia sees the office's photo of her measurement (and its Storage object), not the one of the office's measurement
:as_tech94
select tst.ok(tst.cnt($q$select 1 from public.files where id::text like 'f9400000-%'$q$) = 3
          and app.can_read_file_object('ca000000-0000-0000-0000-000000000000/f9400000-0000-4000-8000-000000000003.jpg')
          and not app.can_read_file_object('ca000000-0000-0000-0000-000000000000/f9400000-0000-4000-8000-000000000004.jpg')
          and app.can_write_file_object('ca000000-0000-0000-0000-000000000000/f9400000-0000-4000-8000-000000000001.jpg'),
          'T94 a tech sees the photos (and objects) of a measurement she sees, not of another; uploads her own');
-- another tech and a subcontractor: nothing of hers
:as_tech94b
select tst.ok(tst.cnt($q$select 1 from public.files where id::text like 'f9400000-%'$q$) = 0
          and not app.can_read_file_object('ca000000-0000-0000-0000-000000000000/f9400000-0000-4000-8000-000000000001.jpg'),
          'T94 another tech does not see her measurement''s photos');
select tst.blocked($q$insert into public.files (company_id, kind, measurement_id) values ('ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000001')$q$,
          'T94 another tech cannot add to her measurement');
:as_sub94
select tst.ok(tst.cnt($q$select 1 from public.files where id::text like 'f9400000-%'$q$) = 0, 'T94 a subcontractor sees no measurement photos');
select tst.blocked($q$insert into public.files (company_id, kind, measurement_id) values ('ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000002')$q$,
          'T94 a subcontractor adds no measurement photos');
-- another company: nothing
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.files where id::text like 'f9400000-%'$q$) = 0, 'T94 another company sees nothing');
select tst.fails($q$insert into public.files (company_id, kind, measurement_id) values ('cb000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000001')$q$,
          'T94 another company cannot hang a photo on A''s measurement');
-- like the measurement: a tech also sees the photos of one on her lead and on the property of her visit
:as_super
insert into public.leads (id, company_id, source_id, contact_name, phone, assigned_to) values
  ('19400000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'T94 Lead', '+13235550941', 'a9400000-0000-4000-8000-000000000001');
insert into public.visits (id, company_id, property_id, starts_at, ends_at) values
  ('f9400000-0000-4000-8000-0000000000a1', 'ca000000-0000-0000-0000-000000000000', 'd1a00000-0000-0000-0000-000000000002', now(), now() + interval '2 hours');
insert into public.visit_assignees (company_id, visit_id, user_id) values
  ('ca000000-0000-0000-0000-000000000000', 'f9400000-0000-4000-8000-0000000000a1', 'a9400000-0000-4000-8000-000000000001');
:as_owner_a
insert into public.gutter_measurements (id, company_id, lead_id) values ('9e940000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', '19400000-0000-4000-8000-000000000001');
insert into public.gutter_measurements (id, company_id, property_id) values ('9e940000-0000-4000-8000-000000000004', 'ca000000-0000-0000-0000-000000000000', 'd1a00000-0000-0000-0000-000000000002');
insert into public.files (id, company_id, kind, measurement_id) values
  ('f9410000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000003'),
  ('f9410000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000004');
:as_tech94
select tst.ok(tst.cnt($q$select 1 from public.files where id::text like 'f9410000-%'$q$) = 2
          and app.can_read_file_object('ca000000-0000-0000-0000-000000000000/f9410000-0000-4000-8000-000000000001.jpg')
          and app.can_read_file_object('ca000000-0000-0000-0000-000000000000/f9410000-0000-4000-8000-000000000002.jpg'),
          'T94 a tech sees the photos of a measurement on her lead and on her visit''s property');
:as_tech94b
select tst.ok(tst.cnt($q$select 1 from public.files where id::text like 'f9410000-%'$q$) = 0, 'T94 …another tech does not');
select tst.blocked($q$update public.files set deleted_at = now() where id = 'f9400000-0000-4000-8000-000000000001'$q$, 'T94 another tech cannot remove her photo');
-- a visit's photo is never also a measurement's (it would reach whoever sees the measurement — security-check №1)
:as_owner_a
insert into public.files (id, company_id, kind, visit_id) values
  ('f9410000-0000-4000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'photo', 'f9400000-0000-4000-8000-0000000000a1');
select tst.fails($q$update public.files set measurement_id = '9e940000-0000-4000-8000-000000000002' where id = 'f9410000-0000-4000-8000-000000000003'$q$,
          'T94 a visit''s photo cannot be put on a measurement');
select tst.fails($q$insert into public.files (company_id, kind, measurement_id, visit_id) values ('ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000002', 'f9400000-0000-4000-8000-0000000000a1')$q$,
          'T94 …nor made both at once');
select tst.fails($q$insert into public.files (company_id, kind, measurement_id, customer_id) values ('ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000002', 'c1a00000-0000-0000-0000-000000000001')$q$,
          'T94 …nor a client''s');
-- a photo's measurement is set once (security-check №2): no moving, no unpinning
:as_tech94
select tst.fails_like($q$update public.files set measurement_id = null, element_id = null where id = 'f9400000-0000-4000-8000-000000000002'$q$,
          '%set once%', 'T94 a photo''s measurement is set once');
-- after the trial (founder О2): read yes, add no — the office too; a visit's photo is not touched by the rule
:as_super
update public.company_modules set trial_ends_at = now() - interval '1 minute' where company_id = 'ca000000-0000-0000-0000-000000000000' and module_key = 'gutters';
:as_tech94
select tst.ok(tst.cnt($q$select 1 from public.files where measurement_id = '9e940000-0000-4000-8000-000000000001'$q$) = 3, 'T94 after the trial the photos are still seen');
select tst.blocked($q$insert into public.files (company_id, kind, measurement_id) values ('ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000001')$q$,
          'T94 after the trial a tech adds no photo');
:as_owner_a
select tst.blocked($q$insert into public.files (company_id, kind, measurement_id) values ('ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000002')$q$,
          'T94 …nor the office');
select tst.blocked($q$update public.files set deleted_at = now() where id = 'f9400000-0000-4000-8000-000000000004'$q$, 'T94 …nor removes one');
select tst.fails($q$update public.files set measurement_id = null where id = 'f9400000-0000-4000-8000-000000000004'$q$, 'T94 …nor unpins one');
select tst.ok(not app.can_write_file_object('ca000000-0000-0000-0000-000000000000/f9400000-0000-4000-8000-000000000004.jpg'),
          'T94 …nor uploads its bytes (security-check №3)');
:as_tech94
select tst.blocked($q$update public.files set storage_key = 'ca000000-0000-0000-0000-000000000000/f9400000-0000-4000-8000-000000000001.jpg', upload_status = 'uploaded' where id = 'f9400000-0000-4000-8000-000000000001'$q$,
          'T94 after the trial a tech does not record an upload');
select tst.ok(not app.can_write_file_object('ca000000-0000-0000-0000-000000000000/f9400000-0000-4000-8000-000000000001.jpg'),
          'T94 …nor uploads the bytes of her photo');
:as_owner_a
insert into public.files (id, company_id, kind) values ('f9400000-0000-4000-8000-000000000009', 'ca000000-0000-0000-0000-000000000000', 'document');
select tst.ok(tst.cnt($q$select 1 from public.files where id = 'f9400000-0000-4000-8000-000000000009'$q$) = 1, 'T94 other files are saved as before');
-- at most 300 photos per measurement (the server's own roles too)
:as_super
insert into public.files (company_id, kind, measurement_id)
  select 'ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000002' from generate_series(1, 299);
select tst.fails_like($q$insert into public.files (company_id, kind, measurement_id) values ('ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000002')$q$,
          '%at most 300 photos%', 'T94 the 301st photo of a measurement is refused');
-- removed photos do not count (security-check №5а); bringing one back over the limit is refused
update public.files set deleted_at = now()
 where id in (select id from public.files where measurement_id = '9e940000-0000-4000-8000-000000000002' and deleted_at is null and id::text not like 'f94%' limit 1);
insert into public.files (company_id, kind, measurement_id) values ('ca000000-0000-0000-0000-000000000000', 'photo', '9e940000-0000-4000-8000-000000000002');
select tst.fails_like($q$update public.files set deleted_at = null where measurement_id = '9e940000-0000-4000-8000-000000000002' and deleted_at is not null$q$,
          '%at most 300 photos%', 'T94 a removed photo frees its place; bringing it back over 300 is refused');
-- rights (rule 18, T52)
select tst.ok(not has_function_privilege('anon', 'app.tg_files_measurement_limit()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'app.tg_files_measurement_limit()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'app.tg_files_measurement_fixed()', 'EXECUTE')
          and not has_function_privilege('anon', 'app.can_write_file_object(text)', 'EXECUTE')
          and not has_function_privilege('anon', 'app.can_read_file_object(text)', 'EXECUTE')
          and not has_table_privilege('anon', 'public.files', 'SELECT')
          and not has_table_privilege('authenticated', 'public.files', 'DELETE'),
          'T94 rights: the trigger function is not callable; anon nothing; no deletes');
-- clean up
delete from public.files where company_id = 'ca000000-0000-0000-0000-000000000000' and (measurement_id is not null or id = 'f9400000-0000-4000-8000-000000000009' or id::text like 'f9410000-%');
delete from public.visit_assignees where visit_id = 'f9400000-0000-4000-8000-0000000000a1';
update public.visits set deleted_at = now() where id = 'f9400000-0000-4000-8000-0000000000a1';
update public.leads set deleted_at = now() where id = '19400000-0000-4000-8000-000000000001';
delete from public.gutter_measurement_elements where company_id = 'ca000000-0000-0000-0000-000000000000';
delete from public.gutter_measurements where company_id = 'ca000000-0000-0000-0000-000000000000';
delete from public.company_modules where company_id = 'ca000000-0000-0000-0000-000000000000';
update public.memberships set status = 'disabled' where user_id::text like 'a9400000-%';
\echo 'T94 measurement photos: seen like the measurement, added only while the module is active, same measurement ok'
-- ---------------------------------------------------------------- T95: the measurement limits answer P0001 + hint limit_reached (docs/specs/33-gutters-settings П22.2 №17)
-- 54000 reached the phone as HTTP 500 and was retried for ever; P0001 is HTTP 400, the server's «no».
:as_super
insert into public.company_modules (company_id, module_key, enabled, trial_ends_at) values ('ca000000-0000-0000-0000-000000000000', 'gutters', true, now() + interval '7 days')
  on conflict (company_id, module_key) do update set enabled = true, trial_ends_at = now() + interval '7 days';
insert into public.gutter_measurements (id, company_id) values ('9e950000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000');
insert into public.gutter_measurement_elements (company_id, measurement_id, kind)
  select 'ca000000-0000-0000-0000-000000000000', '9e950000-0000-4000-8000-000000000001', 'point' from generate_series(1, 1000);
insert into public.gutter_measurement_revisions (company_id, measurement_id, revision, elements, engine_version)
  select 'ca000000-0000-0000-0000-000000000000', '9e950000-0000-4000-8000-000000000001', g, '[]', 'x' from generate_series(1, 100) g;
do $$
declare v_state text; v_hint text;
begin
  begin
    insert into public.gutter_measurement_elements (company_id, measurement_id, kind) values ('ca000000-0000-0000-0000-000000000000', '9e950000-0000-4000-8000-000000000001', 'point');
    raise exception 'T95 FAILED: the 1001st element was saved';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
    if v_state <> 'P0001' or v_hint is distinct from 'limit_reached' then
      raise exception 'T95 FAILED: the 1001st element answered % / %', v_state, v_hint;
    end if;
  end;
  begin
    insert into public.gutter_measurement_revisions (company_id, measurement_id, revision, elements, engine_version) values ('ca000000-0000-0000-0000-000000000000', '9e950000-0000-4000-8000-000000000001', 101, '[]', 'x');
    raise exception 'T95 FAILED: the 101st revision was saved';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
    if v_state <> 'P0001' or v_hint is distinct from 'limit_reached' then
      raise exception 'T95 FAILED: the 101st revision answered % / %', v_state, v_hint;
    end if;
  end;
end $$;
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurement_elements where measurement_id = '9e950000-0000-4000-8000-000000000001'$q$) = 1000, 'T95 the 1001st element is not saved');
select tst.ok(not has_function_privilege('authenticated', 'app.tg_gutter_limits()', 'execute'), 'T95 nobody calls the limit function directly');
delete from public.gutter_measurements where id = '9e950000-0000-4000-8000-000000000001';
delete from public.company_modules where company_id = 'ca000000-0000-0000-0000-000000000000';
\echo 'T95 measurement limits: P0001 limit_reached ok'

-- ---------------------------------------------------------------- T96: a module's item made with a fixed id, «insert or nothing» (docs/specs/33-gutters-settings П22.10)
-- What the app sends for catalog.save onlyNew (PostgREST ignoreDuplicates): INSERT … ON CONFLICT (id) DO NOTHING. Two phones,
-- two presses, the queue sending twice → one row; a price someone set is never overwritten by the test one; a refusal stays one.
:as_office_a
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, is_placeholder_price, attributes)
  values ('96000000-0000-5000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'labor', 'Install, story 1 (test)', 'ft', 300, true, '{"work":"install","story":"1"}')
  on conflict (id) do nothing;
select tst.ok((select unit_price_cents = 300 and is_placeholder_price and pg_typeof(unit_price_cents) = 'bigint'::regtype from public.catalog_items where id = '96000000-0000-5000-8000-000000000001'),
  'T96 the test item is saved: a whole-cent price, marked test (rule 9)');
-- the owner sets the real price
:as_owner_a
update public.catalog_items set unit_price_cents = 455, is_placeholder_price = false where id = '96000000-0000-5000-8000-000000000001';
-- the second phone presses «create now» with the same fixed id and the test price
:as_office_a
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, is_placeholder_price, attributes)
  values ('96000000-0000-5000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'labor', 'Install, story 1 (test)', 'ft', 300, true, '{"work":"install","story":"1"}')
  on conflict (id) do nothing;
select tst.ok(tst.cnt($q$select 1 from public.catalog_items where id = '96000000-0000-5000-8000-000000000001'$q$) = 1, 'T96 the same id twice is one row');
select tst.ok((select unit_price_cents = 455 and not is_placeholder_price and name = 'Install, story 1 (test)' from public.catalog_items where id = '96000000-0000-5000-8000-000000000001'),
  'T96 the price someone set is not overwritten by the test one');
-- a tech may not make items: a refusal, also when the id is there already (ON CONFLICT DO NOTHING hides nothing)
:as_tech_a
do $$ begin
  perform tst.fails($q$insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, is_placeholder_price)
    values ('96000000-0000-5000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'labor', 'x', 'ft', 300, true) on conflict (id) do nothing$q$, 'T96 tech makes a new item');
  perform tst.fails($q$insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, is_placeholder_price)
    values ('96000000-0000-5000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'labor', 'x', 'ft', 1, true) on conflict (id) do nothing$q$, 'T96 tech: an existing id is still refused');
end $$;
-- company B writes a row into A: refused (WITH CHECK)
:as_owner_b
do $$ begin
  perform tst.fails($q$insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents)
    values ('96000000-0000-5000-8000-000000000003', 'ca000000-0000-0000-0000-000000000000', 'labor', 'x', 'ft', 1) on conflict (id) do nothing$q$, 'T96 company B writes into A');
end $$;
-- company B with A's id in its own list: the id is global — the insert «succeeds» with no row, and B sees nothing under it.
-- That silence is what the app reads back after onlyNew (ops.ts catalog.save: no own row → PermanentError «id_taken»).
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents)
  values ('96000000-0000-5000-8000-000000000001', 'cb000000-0000-0000-0000-000000000000', 'labor', 'B squats', 'ft', 1) on conflict (id) do nothing;
select tst.ok(tst.cnt($q$select 1 from public.catalog_items where id = '96000000-0000-5000-8000-000000000001' and company_id = 'cb000000-0000-0000-0000-000000000000'$q$) = 0,
  'T96 B with A''s id: no row of B — the read-back finds nothing (the app says «id taken»)');
-- our own row deleted before: «insert or nothing» does nothing; the app reads it back deleted and brings it back as it was
:as_office_a
update public.catalog_items set deleted_at = now(), is_active = false where id = '96000000-0000-5000-8000-000000000001';
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, is_placeholder_price)
  values ('96000000-0000-5000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'labor', 'Install (test)', 'ft', 300, true) on conflict (id) do nothing;
select tst.ok((select deleted_at is not null from public.catalog_items where id = '96000000-0000-5000-8000-000000000001' and company_id = 'ca000000-0000-0000-0000-000000000000'),
  'T96 the read-back sees our own deleted row');
update public.catalog_items set deleted_at = null, is_active = true where id = '96000000-0000-5000-8000-000000000001' and company_id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select deleted_at is null and is_active and unit_price_cents = 455 and not is_placeholder_price from public.catalog_items where id = '96000000-0000-5000-8000-000000000001'),
  'T96 the deleted item is back with the owner''s price, not the test one');
:as_super
select tst.ok(tst.cnt($q$select 1 from public.catalog_items where id::text like '96000000-0000-5000-8000-00000000000%'$q$) = 1, 'T96 only the one item exists');
select tst.ok((select unit_price_cents = 455 from public.catalog_items where id = '96000000-0000-5000-8000-000000000001'), 'T96 still the owner''s price');
delete from public.catalog_items where id = '96000000-0000-5000-8000-000000000001';
\echo 'T96 a module item with a fixed id: insert or nothing, one row, the set price stays, refusals stay refusals ok'

-- ---------------------------------------------------------------- T97: what a module wrote into a line stays the company's (spec 33 П23.7, C4)
-- The app keeps `source` in calc_inputs («Обновить смету» needs it after a reload); the page must never show it.
:as_owner_a
do $$
declare v_cust uuid; v_prop uuid; v_e uuid; v_v uuid;
begin
  insert into public.customers (company_id, display_name) values ('ca000000-0000-0000-0000-000000000000', 'T97 Client') returning id into v_cust;
  insert into public.properties (company_id, customer_id, address_line1, address_city) values ('ca000000-0000-0000-0000-000000000000', v_cust, '97 Source St', 'Burbank') returning id into v_prop;
  insert into public.estimates (company_id, customer_id, property_id, title) values ('ca000000-0000-0000-0000-000000000000', v_cust, v_prop, 'T97 module lines') returning id into v_e;
  insert into public.estimate_versions (company_id, estimate_id, version_no, calc_inputs) values ('ca000000-0000-0000-0000-000000000000', v_e, 1, $j${
    "options": [{"id": "o1", "name": "Option", "lines": [
      {"id": "m1", "name": "K-style 5in", "group": "material", "quantity": "42.5", "unit": "ft", "unitPriceCents": 1200,
       "source": {"module": "gutters", "key": "part=gutter", "section": "gutter", "qty": "42.5", "priceCents": 900, "name": "Gutter 5in",
                  "unit": "ft", "testPrice": true, "revisionId": "r1"}},
      {"id": "m2", "name": "Downspout", "group": "material", "quantity": "2", "unit": "ea", "unitPriceCents": 0,
       "source": {"module": "gutters", "key": "part=ds", "section": "downspouts", "qty": "2", "priceCents": 0, "name": "Downspout", "unit": "ea", "noPrice": true, "gone": true}},
      {"id": "own", "name": "Haul away", "group": "service", "quantity": "1", "unit": "ea", "unitPriceCents": 5000}
    ]}],
    "settings": {"tax": {"enabled": false, "rateBps": 0, "groups": {}}, "deposit": {"kind": "none"}, "discount": null}
  }$j$::jsonb) returning id into v_v;
  update public.estimates set current_version_id = v_v where id = v_e;
  perform tst.set_token(v_e, 'tok_t97src_0123456789abcd');
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
do $$
declare d jsonb := public.portal_estimate('tok_t97src_0123456789abcd') -> 'doc';
begin
  perform tst.ok(jsonb_array_length(d -> 'options' -> 0 -> 'lines') = 3, 'T97 the page shows all three lines');
  perform tst.ok(d::text !~* '(source|testPrice|noPrice|gone|revisionId|"priceCents"|gutters|part=)', 'T97 no source, test-price or module word on the client page: ' || d::text);
  perform tst.ok((d -> 'options' -> 0 -> 'lines' -> 0 ->> 'unitPriceCents') = '1200', 'T97 the client sees the line''s price, not the module''s');
end $$;
:as_office_a
select tst.ok((select calc_inputs -> 'options' -> 0 -> 'lines' -> 0 -> 'source' ->> 'priceCents' from public.estimate_versions v
                 join public.estimates e on e.current_version_id = v.id where e.title = 'T97 module lines') = '900', 'T97 the office reads the module''s source back');
:as_super
-- the tech who made the draft reads it: the source holds the client price per unit (the same as the line's), never a cost
set session_replication_role = replica;  -- the service-fields trigger keeps created_by
update public.estimates set created_by = 'a0000000-0000-0000-0000-000000000003' where title = 'T97 module lines';
set session_replication_role = origin;
:as_tech_a
select tst.ok((select v.calc_inputs -> 'options' -> 0 -> 'lines' -> 0 -> 'source' ->> 'priceCents' from public.estimate_versions v
                 join public.estimates e on e.current_version_id = v.id where e.title = 'T97 module lines') = '900', 'T97 the tech sees the source of his own draft');
select tst.ok(not exists (select 1 from public.estimate_versions v join public.estimates e on e.current_version_id = v.id,
                            jsonb_array_elements(v.calc_inputs -> 'options' -> 0 -> 'lines') l, jsonb_object_keys(coalesce(l -> 'source', '{}')) k
                           where e.title = 'T97 module lines' and k !~ '^(module|key|section|qty|priceCents|name|unit|noPrice|testPrice|gone|revisionId|measurementId)$'),
              'T97 the source has only the module''s words: no cost, markup or supplier field');
:as_tech2_a
select tst.ok(tst.cnt($q$select 1 from public.estimate_versions v join public.estimates e on e.id = v.estimate_id where e.title = 'T97 module lines'$q$) = 0,
              'T97 another tech (not the author, not assigned) reads nothing');
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.estimate_versions v join public.estimates e on e.id = v.estimate_id where e.title = 'T97 module lines'$q$) = 0,
              'T97 another company reads nothing');
-- a sent (locked) version is read through sent_version_id: cut the same way
:as_super
update public.estimate_versions set locked_at = now(), sent_at = now() where id = (select current_version_id from public.estimates where title = 'T97 module lines');
update public.estimates set status = 'sent', sent_version_id = current_version_id where title = 'T97 module lines';
reset role; reset request.jwt.claim.sub; set role anon;
select tst.ok((public.portal_estimate('tok_t97src_0123456789abcd') -> 'doc')::text !~* '(source|testPrice|noPrice|revisionId|gutters)'
              and jsonb_array_length(public.portal_estimate('tok_t97src_0123456789abcd') -> 'doc' -> 'options' -> 0 -> 'lines') = 3,
              'T97 the sent version is cut the same way');
:as_super
\echo 'T97 module line sources: kept for the company, never on the client page ok'

-- ---------------------------------------------------------------- T98: the server numbers a measurement's revisions (spec 33 П23.8, M8b; debt M2 №3)
-- Phones send any number; the server gives the next one under the measurement's row lock; a replay of the same id
-- (`on conflict (id) do nothing`, the queue retries) never moves it.
:as_super
insert into public.company_modules (company_id, module_key, enabled, trial_ends_at) values ('ca000000-0000-0000-0000-000000000000', 'gutters', true, now() + interval '7 days')
  on conflict (company_id, module_key) do update set enabled = true, trial_ends_at = now() + interval '7 days';
:as_office_a
insert into public.gutter_measurements (id, company_id) values ('9e980000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000');
insert into public.gutter_measurement_revisions (id, company_id, measurement_id, revision, elements, parts, engine_version) values
  ('9e980000-0000-4000-8000-0000000000a1', 'ca000000-0000-0000-0000-000000000000', '9e980000-0000-4000-8000-000000000001', 7, '[]', '[]', 'x')
  on conflict (id) do nothing;
select tst.ok((select revision from public.gutter_measurement_revisions where id = '9e980000-0000-4000-8000-0000000000a1') = 1
              and (select revision from public.gutter_measurements where id = '9e980000-0000-4000-8000-000000000001') = 1,
              'T98 the first revision is 1 whatever the phone sent; the measurement says 1');
-- the queue retries the same write: nothing moves
insert into public.gutter_measurement_revisions (id, company_id, measurement_id, revision, elements, parts, engine_version) values
  ('9e980000-0000-4000-8000-0000000000a1', 'ca000000-0000-0000-0000-000000000000', '9e980000-0000-4000-8000-000000000001', 1, '[]', '[]', 'x')
  on conflict (id) do nothing;
select tst.ok(tst.cnt($q$select 1 from public.gutter_measurement_revisions where measurement_id = '9e980000-0000-4000-8000-000000000001'$q$) = 1
              and (select revision from public.gutter_measurements where id = '9e980000-0000-4000-8000-000000000001') = 1,
              'T98 a replay of the same id adds nothing and keeps the number');
-- a second phone (it also thought it was the first)
insert into public.gutter_measurement_revisions (id, company_id, measurement_id, revision, elements, parts, engine_version) values
  ('9e980000-0000-4000-8000-0000000000a2', 'ca000000-0000-0000-0000-000000000000', '9e980000-0000-4000-8000-000000000001', 1, '[]', '[]', 'x')
  on conflict (id) do nothing;
select tst.ok((select revision from public.gutter_measurement_revisions where id = '9e980000-0000-4000-8000-0000000000a2') = 2
              and (select revision from public.gutter_measurements where id = '9e980000-0000-4000-8000-000000000001') = 2,
              'T98 the next one is 2, the measurement follows');
-- the counter is the server's: a direct write of it is ignored (an old phone's full write still goes through)
:as_office_a
update public.gutter_measurements set revision = 0, label = 'T98' where id = '9e980000-0000-4000-8000-000000000001';
select tst.ok((select revision = 2 and label = 'T98' from public.gutter_measurements where id = '9e980000-0000-4000-8000-000000000001'),
              'T98 a phone cannot set the counter (the rest of its write goes through)');
insert into public.gutter_measurement_revisions (id, company_id, measurement_id, revision, elements, parts, engine_version) values
  ('9e980000-0000-4000-8000-0000000000a3', 'ca000000-0000-0000-0000-000000000000', '9e980000-0000-4000-8000-000000000001', 1, '[]', '[]', 'x');
select tst.ok((select revision from public.gutter_measurement_revisions where id = '9e980000-0000-4000-8000-0000000000a3') = 3
              and (select revision from public.gutter_measurements where id = '9e980000-0000-4000-8000-000000000001') = 3,
              'T98 the next number is 3');
-- a stranger gets one answer: the same code for a measurement that exists and one that does not (no probing)
:as_owner_b
do $$
declare a text; b text;
begin
  begin
    insert into public.gutter_measurement_revisions (company_id, measurement_id, revision, elements, engine_version)
      values ('ca000000-0000-0000-0000-000000000000', '9e980000-0000-4000-8000-000000000001', 1, '[]', 'x');
  exception when others then a := sqlstate;
  end;
  begin
    insert into public.gutter_measurement_revisions (company_id, measurement_id, revision, elements, engine_version)
      values ('ca000000-0000-0000-0000-000000000000', gen_random_uuid(), 1, '[]', 'x');
  exception when others then b := sqlstate;
  end;
  perform tst.ok(a = '42501' and b = '42501', 'T98 another company: one answer whether the measurement exists or not (' || coalesce(a, 'none') || ' / ' || coalesce(b, 'none') || ')');
end $$;
-- who may not: another tech (not his), another company; nor with the module off
:as_tech2_a
select tst.blocked($q$insert into public.gutter_measurement_revisions (company_id, measurement_id, revision, elements, engine_version) values ('ca000000-0000-0000-0000-000000000000', '9e980000-0000-4000-8000-000000000001', 1, '[]', 'x')$q$,
          'T98 a tech who does not see the measurement adds no revision');
:as_owner_b
select tst.fails($q$insert into public.gutter_measurement_revisions (company_id, measurement_id, revision, elements, engine_version) values ('cb000000-0000-0000-0000-000000000000', '9e980000-0000-4000-8000-000000000001', 1, '[]', 'x')$q$,
          'T98 another company cannot hang a revision on it');
:as_super
select tst.ok((select revision from public.gutter_measurements where id = '9e980000-0000-4000-8000-000000000001') = 3, 'T98 refused writes do not move the number');
update public.company_modules set enabled = false where company_id = 'ca000000-0000-0000-0000-000000000000' and module_key = 'gutters';
:as_office_a
select tst.blocked($q$insert into public.gutter_measurement_revisions (company_id, measurement_id, revision, elements, engine_version) values ('ca000000-0000-0000-0000-000000000000', '9e980000-0000-4000-8000-000000000001', 1, '[]', 'x')$q$,
          'T98 the module is off: no revision (founder О2)');
:as_super
-- a replay of the 100th revision (its answer was lost) is «nothing to do», never «limit reached»
insert into public.gutter_measurements (id, company_id) values ('9e980000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000');
insert into public.gutter_measurement_revisions (id, company_id, measurement_id, revision, elements, engine_version)
  select ('9e981000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'ca000000-0000-0000-0000-000000000000', '9e980000-0000-4000-8000-000000000002', 1, '[]', 'x'
    from generate_series(1, 100) g;
insert into public.gutter_measurement_revisions (id, company_id, measurement_id, revision, elements, engine_version)
  values ('9e981000-0000-4000-8000-000000000100', 'ca000000-0000-0000-0000-000000000000', '9e980000-0000-4000-8000-000000000002', 1, '[]', 'x')
  on conflict (id) do nothing;
select tst.ok((select revision from public.gutter_measurements where id = '9e980000-0000-4000-8000-000000000002') = 100,
              'T98 the replay of the 100th adds nothing, refuses nothing, keeps the number');
delete from public.gutter_measurements where id = '9e980000-0000-4000-8000-000000000002';
select tst.ok(not has_function_privilege('authenticated', 'app.tg_gutter_revision_number()', 'execute')
          and not has_function_privilege('anon', 'app.tg_gutter_revision_number()', 'execute')
          and not has_function_privilege('authenticated', 'app.tg_gutter_revision_kept()', 'execute'), 'T98 nobody calls the numbering functions directly (rule 18)');
delete from public.gutter_measurements where id = '9e980000-0000-4000-8000-000000000001';
delete from public.company_modules where company_id = 'ca000000-0000-0000-0000-000000000000' and module_key = 'gutters';
\echo 'T98 revision numbers: the server gives them, a replay keeps them ok'

-- ---------------------------------------------------------------- T101: checklist templates (docs/specs/08 §8, migration 20261108140000)
-- office_a is a real dispatcher (role office) in T101–T103; back to admin at the end of T103
:as_super
update public.memberships set role = 'office' where user_id = 'a0000000-0000-0000-0000-000000000002' and company_id = 'ca000000-0000-0000-0000-000000000000';
:as_office_a
insert into public.checklist_templates (id, company_id, name, items, applies_every_visit) values
  ('c1010000-0000-4000-8000-000000000101', 'ca000000-0000-0000-0000-000000000000', 'Every visit',
   '[{"id":"c1010000-0000-4000-8000-0000000001a1","label":"Confirm scope","kind":"check","required":true},
     {"id":"c1010000-0000-4000-8000-0000000001a2","label":"Photo of the area","kind":"photo","required":false,"hint":"wide"}]', true);
select tst.ok(tst.cnt($q$select 1 from public.checklist_templates where id = 'c1010000-0000-4000-8000-000000000101'$q$) = 1, 'T101 the office makes a template (founder В2)');
update public.checklist_templates set name = 'Every visit (v2)' where id = 'c1010000-0000-4000-8000-000000000101';
do $$ begin
  perform tst.fails($q$insert into public.checklist_templates (company_id, name, items) values ('ca000000-0000-0000-0000-000000000000', 'bad', '[{"id":"x","label":"a","kind":"check","required":true}]')$q$, 'T101 an item id must be a uuid');
  perform tst.fails($q$insert into public.checklist_templates (company_id, name, items) values ('ca000000-0000-0000-0000-000000000000', 'bad', '[{"id":"c1010000-0000-4000-8000-0000000001a9","label":"a","kind":"text","required":true}]')$q$, 'T101 only check / photo items');
  perform tst.fails($q$insert into public.checklist_templates (company_id, name, items) values ('ca000000-0000-0000-0000-000000000000', 'bad', '[{"id":"c1010000-0000-4000-8000-0000000001a9","label":"a","kind":"check","required":true,"x":1}]')$q$, 'T101 no unknown keys in an item');
  perform tst.fails($q$insert into public.checklist_templates (company_id, name, items) values ('ca000000-0000-0000-0000-000000000000', 'bad', '[{"id":"c1010000-0000-4000-8000-0000000001a9","label":"a","kind":"check","required":true},{"id":"c1010000-0000-4000-8000-0000000001a9","label":"b","kind":"check","required":true}]')$q$, 'T101 no two items with one id');
  perform tst.fails($q$insert into public.checklist_templates (company_id, name, applies_visit_kinds) values ('ca000000-0000-0000-0000-000000000000', 'bad', '{estimate}')$q$, 'T101 visit kinds are inspection / work');
end $$;
:as_owner_a
select tst.ok(tst.cnt($q$select 1 from public.checklist_templates where name = 'Every visit (v2)'$q$) = 1, 'T101 the director sees the office''s change');
:as_sales_a
select tst.ok(tst.cnt($q$select 1 from public.checklist_templates where id = 'c1010000-0000-4000-8000-000000000101'$q$) = 1, 'T101 sales reads templates');
select tst.blocked($q$update public.checklist_templates set name = 'sales' where id = 'c1010000-0000-4000-8000-000000000101'$q$, 'T101 sales does not change templates');
do $$ begin
  perform tst.fails($q$insert into public.checklist_templates (company_id, name) values ('ca000000-0000-0000-0000-000000000000', 'sales')$q$, 'T101 sales does not make templates');
end $$;
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.checklist_templates$q$) = 0, 'T101 a tech does not read templates (the snapshot is in his visit)');
do $$ begin
  perform tst.fails($q$insert into public.checklist_templates (company_id, name) values ('ca000000-0000-0000-0000-000000000000', 'tech')$q$, 'T101 a tech does not make templates');
end $$;
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.checklist_templates where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0, 'T101 another company sees nothing');
do $$ begin
  perform tst.fails($q$insert into public.checklist_templates (company_id, name) values ('ca000000-0000-0000-0000-000000000000', 'B')$q$, 'T101 another company writes nothing');
end $$;
:as_owner_a
do $$ begin
  perform tst.fails($q$update public.companies set visit_settings = '{"minPhotosBefore":0}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'T101 the minimum of photos is 1..20');
  perform tst.fails($q$update public.companies set visit_settings = '{"photosBefore":true}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, 'T101 no unknown photo settings');
  perform tst.fails_like($q$update public.companies set visit_settings = '{"minPhotosAfter":"3"}' where id = 'ca000000-0000-0000-0000-000000000000'$q$, '%companies_visit_settings_valid%', 'T101 a string minimum is a clean refusal, not a cast error');
end $$;
update public.companies set visit_settings = '{"photosBeforeRequired":true,"photosAfterRequired":false,"minPhotosBefore":2}' where id = 'ca000000-0000-0000-0000-000000000000';
select tst.ok((select visit_settings ->> 'minPhotosBefore' = '2' from public.companies where id = 'ca000000-0000-0000-0000-000000000000'), 'T101 the director saves the photo settings');
update public.companies set visit_settings = '{}' where id = 'ca000000-0000-0000-0000-000000000000';
:as_super
select tst.ok(not has_function_privilege('anon', 'app.valid_checklist_items(jsonb)', 'execute')
          and not has_function_privilege('anon', 'app.valid_visit_settings(jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'app.chk_mirror(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'app.chk_items_json(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'app.tg_visit_item_guard()', 'execute')
          and not has_function_privilege('authenticated', 'app.tg_visit_checklist_legacy()', 'execute')
          and not has_function_privilege('authenticated', 'app.tg_visit_checklist_legacy_insert()', 'execute')
          and not has_function_privilege('authenticated', 'app.tg_visit_checklist_review()', 'execute')
          and not has_function_privilege('authenticated', 'app.tg_chk_item_mirror()', 'execute')
          and not has_function_privilege('authenticated', 'app.chk_in_mirror()', 'execute')
          and not has_function_privilege('anon', 'app.chk_mirror(uuid)', 'execute'), 'T101 the helpers are not callable (rule 18)');
-- the mirror's flag set by a user in his own transaction opens nothing (it counts only inside a nested trigger)
select tst.ok(not app.chk_in_mirror(), 'T101 a user''s own app.chk_mirror = on is not the mirror (depth 1)');
\echo 'T101 checklist templates: the office (role office) writes, sales reads, tech nothing, another company nothing; photo settings ok'

-- ---------------------------------------------------------------- T102: items of a visit (docs/specs/08 §8, §11.3)
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values ('c1020000-0000-4000-8000-0000000000c1', 'ca000000-0000-0000-0000-000000000000', 'T102 Home');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
    ('c1020000-0000-4000-8000-0000000000d1', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000c1', '102 Home St', 'Pasadena');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values
    ('c1020000-0000-4000-8000-0000000000e1', 'ca000000-0000-0000-0000-000000000000', 'T102 job', 'c1020000-0000-4000-8000-0000000000c1', 'c1020000-0000-4000-8000-0000000000d1', 'draft');
  insert into public.visits (id, company_id, job_id, starts_at) values
    ('c1020000-0000-4000-8000-0000000000f1', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000e1', now()),
    ('c1020000-0000-4000-8000-0000000000f2', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000e1', now() + interval '1 day');
  insert into public.visit_assignees (company_id, visit_id, user_id) values
    ('ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f1', 'a0000000-0000-0000-0000-000000000003');
  -- a photo of the visit, a photo of the other visit
  insert into public.files (id, company_id, kind, visit_id, job_id, stage) values
    ('c1020000-0000-4000-8000-000000000011', 'ca000000-0000-0000-0000-000000000000', 'photo', 'c1020000-0000-4000-8000-0000000000f1', 'c1020000-0000-4000-8000-0000000000e1', 'before'),
    ('c1020000-0000-4000-8000-000000000012', 'ca000000-0000-0000-0000-000000000000', 'photo', 'c1020000-0000-4000-8000-0000000000f2', 'c1020000-0000-4000-8000-0000000000e1', 'before');
end $$;
:as_office_a
-- the snapshot of a template, as the office's phone sends it (S9)
insert into public.visit_checklist_items (id, company_id, visit_id, position, label, kind, required, template_id, template_name) values
  ('c1020000-0000-4000-8000-0000000000a1', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f1', 0, 'Confirm scope', 'check', true, 'c1010000-0000-4000-8000-000000000101', 'Every visit'),
  ('c1020000-0000-4000-8000-0000000000a2', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f1', 1, 'Photo of the area', 'photo', false, 'c1010000-0000-4000-8000-000000000101', 'Every visit'),
  ('c1020000-0000-4000-8000-0000000000a3', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f1', 2, 'Walk through', 'check', true, null, null),
  ('c1020000-0000-4000-8000-0000000000a5', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f1', 5, 'Spare', 'check', false, null, null),
  ('c1020000-0000-4000-8000-0000000000a6', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f1', 6, 'Ladder', 'check', false, null, null),
  ('c1020000-0000-4000-8000-0000000000b1', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f2', 0, 'Other visit', 'check', true, null, null);
select tst.ok((select checklist = '[{"id":"c1020000-0000-4000-8000-0000000000a1","done":false,"label":"Confirm scope"},{"id":"c1020000-0000-4000-8000-0000000000a2","done":false,"label":"Photo of the area"},{"id":"c1020000-0000-4000-8000-0000000000a3","done":false,"label":"Walk through"},{"id":"c1020000-0000-4000-8000-0000000000a5","done":false,"label":"Spare"},{"id":"c1020000-0000-4000-8000-0000000000a6","done":false,"label":"Ladder"}]'::jsonb
                 from public.visits where id = 'c1020000-0000-4000-8000-0000000000f1'), 'T102 the rows are mirrored into visits.checklist for old phones');
:as_tech_a
select tst.ok(tst.cnt($q$select 1 from public.visit_checklist_items where visit_id = 'c1020000-0000-4000-8000-0000000000f1'$q$) = 5, 'T102 the tech sees the items of his visit');
select tst.ok(tst.cnt($q$select 1 from public.visit_checklist_items where visit_id = 'c1020000-0000-4000-8000-0000000000f2'$q$) = 0, 'T102 the tech does not see a visit he is not on');
-- a tick: who is the server's word, the phone's time (offline), never in the future
update public.visit_checklist_items set done = true, done_at = now() - interval '10 minutes'
 where id = 'c1020000-0000-4000-8000-0000000000a1';
select tst.ok((select done and done_by = 'a0000000-0000-0000-0000-000000000003' and done_at < now() - interval '9 minutes'
                 from public.visit_checklist_items where id = 'c1020000-0000-4000-8000-0000000000a1'), 'T102 the tick: by the tech, at the phone''s time');
update public.visit_checklist_items set skipped = true, na_reason = 'client_refused', na_at = now() + interval '1 day'
 where id = 'c1020000-0000-4000-8000-0000000000a3';
select tst.ok((select skipped and not done and na_by = 'a0000000-0000-0000-0000-000000000003' and na_at <= now()
                 from public.visit_checklist_items where id = 'c1020000-0000-4000-8000-0000000000a3'), 'T102 a skip is not done; a future time becomes now');
-- the time is the phone's only at the tick: later nobody moves it
update public.visit_checklist_items set done_at = now() - interval '5 days', na_at = now() - interval '5 days'
 where id in ('c1020000-0000-4000-8000-0000000000a1', 'c1020000-0000-4000-8000-0000000000a3');
select tst.ok((select done_at > now() - interval '11 minutes' from public.visit_checklist_items where id = 'c1020000-0000-4000-8000-0000000000a1')
          and (select na_at > now() - interval '1 minute' from public.visit_checklist_items where id = 'c1020000-0000-4000-8000-0000000000a3'),
  'T102 done_at / na_at do not move without a tick or a skip');
update public.visit_checklist_items set photo_ids = array['c1020000-0000-4000-8000-000000000011'::uuid], done = true
 where id = 'c1020000-0000-4000-8000-0000000000a2';
select tst.ok((select done and photo_ids = array['c1020000-0000-4000-8000-000000000011'::uuid] from public.visit_checklist_items where id = 'c1020000-0000-4000-8000-0000000000a2'),
  'T102 a photo of the visit goes on the item');
do $$ begin
  perform tst.fails_like($q$update public.visit_checklist_items set photo_ids = photo_ids || 'c1020000-0000-4000-8000-000000000012'::uuid where id = 'c1020000-0000-4000-8000-0000000000a2'$q$, '%photo of its visit%', 'T102 a photo of another visit does not go on the item');
  perform tst.fails_like($q$update public.visit_checklist_items set photo_ids = photo_ids || 'c1020000-0000-4000-8000-000000000099'::uuid where id = 'c1020000-0000-4000-8000-0000000000a2'$q$, '%photo of its visit%', 'T102 a made-up photo id does not go on the item');
end $$;
-- he adds an optional item of his own on site and removes it again
insert into public.visit_checklist_items (id, company_id, visit_id, position, label) values
  ('c1020000-0000-4000-8000-0000000000a4', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f1', 3, 'Dog in the yard');
update public.visit_checklist_items set deleted_at = now() where id = 'c1020000-0000-4000-8000-0000000000a4';
do $$ begin
  perform tst.fails($q$update public.visit_checklist_items set done_by = 'a0000000-0000-0000-0000-000000000001' where id = 'c1020000-0000-4000-8000-0000000000a1'$q$, 'T102 done_by is not the tech''s to write');
  perform tst.fails($q$update public.visit_checklist_items set label = 'easier' where id = 'c1020000-0000-4000-8000-0000000000a3'$q$, 'T102 the tech does not change what an item says');
  perform tst.fails($q$update public.visit_checklist_items set required = false where id = 'c1020000-0000-4000-8000-0000000000a3'$q$, 'T102 the tech does not make an item optional');
  perform tst.fails($q$update public.visit_checklist_items set deleted_at = now() where id = 'c1020000-0000-4000-8000-0000000000a3'$q$, 'T102 the tech does not remove a required item');
  perform tst.fails($q$update public.visit_checklist_items set deleted_at = now() where id = 'c1020000-0000-4000-8000-0000000000a2'$q$, 'T102 the tech does not remove the office''s item');
  perform tst.fails($q$insert into public.visit_checklist_items (company_id, visit_id, label, required) values ('ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f1', 'mine', true)$q$, 'T102 the tech adds only an optional item');
  perform tst.fails($q$insert into public.visit_checklist_items (company_id, visit_id, label) values ('ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f2', 'not mine')$q$, 'T102 the tech adds nothing to another visit');
  perform tst.fails($q$update public.visit_checklist_items set visit_id = 'c1020000-0000-4000-8000-0000000000f2' where id = 'c1020000-0000-4000-8000-0000000000a1'$q$, 'T102 an item stays on its visit');
  perform tst.fails($q$update public.visits set checklist_reviewed_at = now() where id = 'c1020000-0000-4000-8000-0000000000f1'$q$, 'T102 the tech does not press «Просмотрено»');
end $$;
-- items for «after the visit is closed»: one open, one skipped with a reason, one of the tech's own
update public.visit_checklist_items set skipped = true, na_reason = 'unsafe' where id = 'c1020000-0000-4000-8000-0000000000a6';
insert into public.visit_checklist_items (id, company_id, visit_id, position, label) values
  ('c1020000-0000-4000-8000-0000000000a7', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f1', 7, 'My note');
select tst.blocked($q$update public.visit_checklist_items set done = true where id = 'c1020000-0000-4000-8000-0000000000b1'$q$, 'T102 the tech does not tick a visit he is not on');
-- sales reads items only (§8, §11.5 №30)
:as_sales_a
select tst.ok(tst.cnt($q$select 1 from public.visit_checklist_items where visit_id = 'c1020000-0000-4000-8000-0000000000f1'$q$) = 7, 'T102 sales reads the items');
select tst.blocked($q$update public.visit_checklist_items set done = true where id = 'c1020000-0000-4000-8000-0000000000b1'$q$, 'T102 sales does not tick');
select tst.blocked($q$update public.visit_checklist_items set label = 'sales' where id = 'c1020000-0000-4000-8000-0000000000b1'$q$, 'T102 sales does not change what an item says');
do $$ begin
  perform tst.fails($q$insert into public.visit_checklist_items (company_id, visit_id, label) values ('ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f2', 'sales')$q$, 'T102 sales adds no item');
end $$;
-- the dispatcher (role office): edits, but a required item stays the director's
:as_office_a
do $$ begin
  perform tst.fails($q$update public.visit_checklist_items set deleted_at = now() where id = 'c1020000-0000-4000-8000-0000000000b1'$q$, 'T102 the office does not remove a required item');
  perform tst.fails($q$update public.visit_checklist_items set required = false where id = 'c1020000-0000-4000-8000-0000000000b1'$q$, 'T102 the office does not make a required item optional');
end $$;
update public.visit_checklist_items set done = true where id = 'c1020000-0000-4000-8000-0000000000b1';
update public.visit_checklist_items set done = false where id = 'c1020000-0000-4000-8000-0000000000b1';
update public.visit_checklist_items set label = 'Walk through with the client', position = 5 where id = 'c1020000-0000-4000-8000-0000000000a3';
-- «Просмотрено»: writing who pressed it without pressing changes nothing
update public.visits set checklist_reviewed_by = 'a0000000-0000-0000-0000-000000000001' where id = 'c1020000-0000-4000-8000-0000000000f1';
select tst.ok((select checklist_reviewed_by is null from public.visits where id = 'c1020000-0000-4000-8000-0000000000f1'), 'T102 who pressed «Просмотрено» is not written by hand');
update public.visits set checklist_reviewed_at = now(), checklist_reviewed_by = 'a0000000-0000-0000-0000-000000000001' where id = 'c1020000-0000-4000-8000-0000000000f1';
select tst.ok((select checklist_reviewed_by = 'a0000000-0000-0000-0000-000000000002' from public.visits where id = 'c1020000-0000-4000-8000-0000000000f1'), 'T102 «Просмотрено»: the server writes who pressed it');
update public.visits set notes = coalesce(notes, '') || ' ', checklist_reviewed_by = 'a0000000-0000-0000-0000-000000000001' where id = 'c1020000-0000-4000-8000-0000000000f1';
select tst.ok((select checklist_reviewed_by = 'a0000000-0000-0000-0000-000000000002' from public.visits where id = 'c1020000-0000-4000-8000-0000000000f1'), 'T102 another edit of the visit keeps who pressed it');
update public.visits set checklist_reviewed_at = null where id = 'c1020000-0000-4000-8000-0000000000f1';
select tst.ok((select checklist_reviewed_by is null from public.visits where id = 'c1020000-0000-4000-8000-0000000000f1'), 'T102 «Отменить» clears who pressed it');
:as_owner_a
update public.visit_checklist_items set deleted_at = now() where id = 'c1020000-0000-4000-8000-0000000000b1';
select tst.ok((select checklist = '[]'::jsonb from public.visits where id = 'c1020000-0000-4000-8000-0000000000f2'), 'T102 the director removes a required item; the mirror follows');
-- the client signs: a tech only finishes what was left
update public.visits set status = 'on_site', work_started_at = now(), signed_at = now() where id = 'c1020000-0000-4000-8000-0000000000f1';
:as_tech_a
update public.visit_checklist_items set done = true where id = 'c1020000-0000-4000-8000-0000000000a3';
select tst.ok((select done and not skipped and na_reason is null from public.visit_checklist_items where id = 'c1020000-0000-4000-8000-0000000000a3'), 'T102 after the signature the tech still finishes a skipped item (§8)');
do $$ begin
  perform tst.fails($q$update public.visit_checklist_items set done = false where id = 'c1020000-0000-4000-8000-0000000000a1'$q$, 'T102 after the signature the tech does not untick');
  perform tst.fails_like($q$update public.visit_checklist_items set skipped = true where id = 'c1020000-0000-4000-8000-0000000000a5'$q$, '%visit is closed%', 'T102 after the signature the tech does not skip');
  perform tst.fails_like($q$update public.visit_checklist_items set na_reason = 'other' where id = 'c1020000-0000-4000-8000-0000000000a6'$q$, '%visit is closed%', 'T102 after the signature the tech does not change a skip''s reason');
  perform tst.fails_like($q$update public.visit_checklist_items set deleted_at = now() where id = 'c1020000-0000-4000-8000-0000000000a7'$q$, '%visit is closed%', 'T102 after the signature the tech does not remove his own item');
  perform tst.fails($q$update public.visit_checklist_items set photo_ids = '{}' where id = 'c1020000-0000-4000-8000-0000000000a2'$q$, 'T102 after the signature the tech does not take a photo off');
  perform tst.fails($q$insert into public.visit_checklist_items (company_id, visit_id, label) values ('ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f1', 'late')$q$, 'T102 after the signature the tech adds nothing');
end $$;
update public.visit_checklist_items set done_at = now() - interval '5 days' where id = 'c1020000-0000-4000-8000-0000000000a1';
select tst.ok((select done_at > now() - interval '1 day' from public.visit_checklist_items where id = 'c1020000-0000-4000-8000-0000000000a1'), 'T102 after the signature the time of a tick does not move');
-- a visit finished without a signature (an inspection «Готово», a job visit completed) is closed too
:as_owner_a
insert into public.visits (id, company_id, job_id, starts_at) values
  ('c1020000-0000-4000-8000-0000000000f4', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000e1', now());
insert into public.visit_assignees (company_id, visit_id, user_id) values
  ('ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f4', 'a0000000-0000-0000-0000-000000000003');
insert into public.visit_checklist_items (id, company_id, visit_id, position, label, required, done) values
  ('c1020000-0000-4000-8000-0000000000c1', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f4', 0, 'Done before close', true, true);
update public.visits set status = 'on_site' where id = 'c1020000-0000-4000-8000-0000000000f4';
update public.visits set status = 'completed' where id = 'c1020000-0000-4000-8000-0000000000f4';
:as_tech_a
do $$ begin
  perform tst.fails_like($q$update public.visit_checklist_items set done = false where id = 'c1020000-0000-4000-8000-0000000000c1'$q$, '%visit is closed%', 'T102 a completed visit without a signature: the tech does not untick');
end $$;
:as_owner_b
select tst.ok(tst.cnt($q$select 1 from public.visit_checklist_items where company_id = 'ca000000-0000-0000-0000-000000000000'$q$) = 0, 'T102 another company sees no items');
do $$ begin
  perform tst.fails($q$insert into public.visit_checklist_items (company_id, visit_id, label) values ('ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f1', 'B')$q$, 'T102 another company adds nothing');
end $$;
\echo 'T102 visit items: the tech ticks, skips, attaches photos of the visit, adds / removes his optional item, only finishes a closed visit; sales reads; the office edits, the director removes required ones ok'

-- ---------------------------------------------------------------- T103: rule 16 — an old phone writes the whole array (step 1)
:as_owner_a
insert into public.visits (id, company_id, job_id, starts_at) values
  ('c1030000-0000-4000-8000-0000000000f1', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000e1', now() + interval '2 days');
insert into public.visit_assignees (company_id, visit_id, user_id) values
  ('ca000000-0000-0000-0000-000000000000', 'c1030000-0000-4000-8000-0000000000f1', 'a0000000-0000-0000-0000-000000000003');
insert into public.visit_checklist_items (id, company_id, visit_id, position, label, required, done) values
  ('c1030000-0000-4000-8000-0000000000a1', 'ca000000-0000-0000-0000-000000000000', 'c1030000-0000-4000-8000-0000000000f1', 6, 'Required for T103', true, false),
  ('c1030000-0000-4000-8000-0000000000a3', 'ca000000-0000-0000-0000-000000000000', 'c1030000-0000-4000-8000-0000000000f1', 7, 'Left out by the old phone', false, false),
  ('c1030000-0000-4000-8000-0000000000a4', 'ca000000-0000-0000-0000-000000000000', 'c1030000-0000-4000-8000-0000000000f1', 8, 'Ticked by the office', false, true),
  -- a live item of another visit (the old array must not reach it)
  ('c1030000-0000-4000-8000-0000000000b2', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000f2', 1, 'Live on another visit', false, false);
:as_tech_a
-- the old app (ops visit.checklist): the whole list with one tick changed, a label rewritten, an item dropped, its own
-- new item, an id of another visit, and the office's tick it never saw (false in its stale copy)
update public.visits set checklist = '[{"id":"c1030000-0000-4000-8000-0000000000a1","label":"REWRITTEN","done":true},
                                      {"id":"c1030000-0000-4000-8000-0000000000a2","label":"Old phone item","done":false},
                                      {"id":"c1030000-0000-4000-8000-0000000000b2","label":"another visit","done":true},
                                      {"id":"c1030000-0000-4000-8000-0000000000a4","label":"Ticked by the office","done":false}]'
 where id = 'c1030000-0000-4000-8000-0000000000f1';
select tst.ok((select done and label = 'Required for T103' and required and done_by = 'a0000000-0000-0000-0000-000000000003'
                 from public.visit_checklist_items where id = 'c1030000-0000-4000-8000-0000000000a1'), 'T103 an old phone''s tick reaches the row; its label rewrite does not');
select tst.ok((select not required and label = 'Old phone item' and created_by = 'a0000000-0000-0000-0000-000000000003'
                 from public.visit_checklist_items where id = 'c1030000-0000-4000-8000-0000000000a2'), 'T103 an old phone''s new item is the tech''s optional one');
select tst.ok((select deleted_at is null from public.visit_checklist_items where id = 'c1030000-0000-4000-8000-0000000000a3'),
  'T103 an item the old array left out is not removed');
select tst.ok((select done from public.visit_checklist_items where id = 'c1030000-0000-4000-8000-0000000000a4'),
  'T103 an old array does not take off a tick someone else made');
:as_owner_a
select tst.ok((select not done and visit_id = 'c1020000-0000-4000-8000-0000000000f2' and label = 'Live on another visit'
                 from public.visit_checklist_items where id = 'c1030000-0000-4000-8000-0000000000b2'), 'T103 an id of another visit changes nothing there');
select tst.ok(tst.cnt($q$select 1 from public.visit_checklist_items where visit_id = 'c1030000-0000-4000-8000-0000000000f1' and label = 'another visit' and not required$q$) = 1,
  'T103 a taken id comes in as a new optional item (no answer whether it exists elsewhere)');
:as_super
select tst.ok((select v.checklist = app.chk_items_json(v.id) and jsonb_array_length(v.checklist) = 5 from public.visits v where v.id = 'c1030000-0000-4000-8000-0000000000f1'),
  'T103 after an old write the array is the mirror of the rows again (the old hole: a tech rewriting the whole list)');
-- the tech's own tick: his old phone may take it off, and put it back
:as_tech_a
update public.visits set checklist = '[{"id":"c1030000-0000-4000-8000-0000000000a1","label":"x","done":false}]' where id = 'c1030000-0000-4000-8000-0000000000f1';
select tst.ok((select not done from public.visit_checklist_items where id = 'c1030000-0000-4000-8000-0000000000a1'), 'T103 an old phone takes off its own tick');
update public.visits set checklist = '[{"id":"c1030000-0000-4000-8000-0000000000a1","label":"x","done":true}]' where id = 'c1030000-0000-4000-8000-0000000000f1';
-- sales writing an old array changes no item
:as_sales_a
update public.visits set checklist = '[{"id":"c1030000-0000-4000-8000-0000000000a1","label":"x","done":false},{"id":"c1030000-0000-4000-8000-0000000000a8","label":"sales item","done":false}]'
 where id = 'c1030000-0000-4000-8000-0000000000f1';
:as_super
select tst.ok((select done from public.visit_checklist_items where id = 'c1030000-0000-4000-8000-0000000000a1')
          and tst.cnt($q$select 1 from public.visit_checklist_items where id = 'c1030000-0000-4000-8000-0000000000a8'$q$) = 0
          and (select checklist = app.chk_items_json(id) from public.visits where id = 'c1030000-0000-4000-8000-0000000000f1'),
  'T103 sales: an old array changes no item, the mirror stays');
:as_owner_a
update public.visits set status = 'on_site', work_started_at = now(), signed_at = now() where id = 'c1030000-0000-4000-8000-0000000000f1';
:as_tech_a
-- after the signature an old phone unticking gets no refusal (its queue would retry forever): the untick is left out
update public.visits set checklist = '[{"id":"c1030000-0000-4000-8000-0000000000a1","label":"x","done":false},{"id":"c1030000-0000-4000-8000-0000000000a9","label":"late","done":false}]'
 where id = 'c1030000-0000-4000-8000-0000000000f1';
:as_owner_a
select tst.ok((select done from public.visit_checklist_items where id = 'c1030000-0000-4000-8000-0000000000a1'), 'T103 after the signature an old phone does not untick');
select tst.ok(tst.cnt($q$select 1 from public.visit_checklist_items where id = 'c1030000-0000-4000-8000-0000000000a9'$q$) = 0, 'T103 after the signature an old phone adds nothing');
-- a visit inserted with an old array (the office's old phone): rows, then the mirror
insert into public.visits (id, company_id, job_id, starts_at, checklist) values
  ('c1030000-0000-4000-8000-0000000000f3', 'ca000000-0000-0000-0000-000000000000', 'c1020000-0000-4000-8000-0000000000e1', now() + interval '3 days',
   '[{"id":"c1030000-0000-4000-8000-0000000000b1","label":"From old insert","done":false},
     {"id":"c1030000-0000-4000-8000-0000000000b1","label":"Same id again","done":false},
     {"id":"v1-c0","label":"Not a uuid","done":true}]');
:as_super
select tst.ok((select required from public.visit_checklist_items where id = 'c1030000-0000-4000-8000-0000000000b1')
          and tst.cnt($q$select 1 from public.visit_checklist_items where visit_id = 'c1030000-0000-4000-8000-0000000000f3'$q$) = 3
          and (select checklist = app.chk_items_json(id) from public.visits where id = 'c1030000-0000-4000-8000-0000000000f3'),
  'T103 an old insert with a list becomes rows (the same id twice, a non-uuid id: new ids, no refusal)');
delete from public.files where id in ('c1020000-0000-4000-8000-000000000011', 'c1020000-0000-4000-8000-000000000012');
delete from public.visits where id in ('c1020000-0000-4000-8000-0000000000f1', 'c1030000-0000-4000-8000-0000000000f1', 'c1020000-0000-4000-8000-0000000000f2', 'c1030000-0000-4000-8000-0000000000f3', 'c1020000-0000-4000-8000-0000000000f4');
delete from public.jobs where id = 'c1020000-0000-4000-8000-0000000000e1';
delete from public.properties where id = 'c1020000-0000-4000-8000-0000000000d1';
delete from public.customers where id = 'c1020000-0000-4000-8000-0000000000c1';
delete from public.checklist_templates where id = 'c1010000-0000-4000-8000-000000000101';
update public.memberships set role = 'admin' where user_id = 'a0000000-0000-0000-0000-000000000002' and company_id = 'ca000000-0000-0000-0000-000000000000';
\echo 'T103 rule 16: an old phone array moves ticks (unticks only its own) and its own items into the rows, sales changes nothing, the mirror wins ok'
-- ---------------------------------------------------------------- T105: a quantity-0 line never reaches the client page (spec 33 П23.9, C5 debt 2)
-- 0 is how a contractor leaves a part out; the page shows no $0 row for it. The signature fingerprint and the server's
-- totals read calc_inputs, never the page's copy: they do not move.
:as_owner_a
do $$
declare v_cust uuid; v_prop uuid; v_e uuid; v_v uuid;
begin
  insert into public.customers (company_id, display_name) values ('ca000000-0000-0000-0000-000000000000', 'T105 Client') returning id into v_cust;
  insert into public.properties (company_id, customer_id, address_line1, address_city) values ('ca000000-0000-0000-0000-000000000000', v_cust, '105 Zero St', 'Burbank') returning id into v_prop;
  insert into public.estimates (company_id, customer_id, property_id, title) values ('ca000000-0000-0000-0000-000000000000', v_cust, v_prop, 'T105 zero lines') returning id into v_e;
  insert into public.estimate_versions (company_id, estimate_id, version_no, calc_inputs) values ('ca000000-0000-0000-0000-000000000000', v_e, 1, $j${
    "options": [{"id": "o1", "name": "Option", "lines": [
      {"id": "keep", "name": "Gutter", "group": "material", "quantity": "10", "unit": "ft", "unitPriceCents": 1200},
      {"id": "z1", "name": "Leaf guard", "group": "material", "quantity": "0", "unit": "ft", "unitPriceCents": 0},
      {"id": "z2", "name": "End cap", "group": "material", "quantity": "0.00", "unit": "ea", "unitPriceCents": 900},
      {"id": "z3", "name": "Elbow", "group": "material", "quantity": 0, "unit": "ea", "unitPriceCents": 500},
      {"id": "z4", "name": "Offset", "group": "material", "quantity": " .0 ", "unit": "ea", "unitPriceCents": 500},
      {"id": "small", "name": "Sealant", "group": "material", "quantity": "0.01", "unit": "ea", "unitPriceCents": 800},
      {"id": "ten", "name": "Hanger", "group": "material", "quantity": "10.0", "unit": "ea", "unitPriceCents": 300},
      {"id": "z5", "name": "Strap", "group": "material", "quantity": "-0", "unit": "ea", "unitPriceCents": 100},
      {"id": "z6", "name": "Wedge", "group": "material", "quantity": "+0", "unit": "ea", "unitPriceCents": 100},
      {"id": "z7", "name": "Rivet", "group": "material", "quantity": "0.", "unit": "ea", "unitPriceCents": 100},
      {"id": "z8", "name": "Screw", "group": "material", "quantity": "00", "unit": "ea", "unitPriceCents": 100},
      {"id": "dime", "name": "Caulk", "group": "material", "quantity": "0.10", "unit": "ea", "unitPriceCents": 100},
      {"id": "lead0", "name": "Ferrule", "group": "material", "quantity": "010", "unit": "ea", "unitPriceCents": 100},
      {"id": "exp", "name": "Paint", "group": "material", "quantity": "0e5", "unit": "ea", "unitPriceCents": 100},
      {"id": "addz", "name": "Splash block", "group": "material", "quantity": "0", "unit": "ea", "unitPriceCents": 2500, "optional": true}
    ]}],
    "settings": {"tax": {"enabled": false, "rateBps": 0, "groups": {}}, "deposit": {"kind": "none"}, "discount": null}
  }$j$::jsonb) returning id into v_v;
  update public.estimates set current_version_id = v_v where id = v_e;
  perform tst.set_token(v_e, 'tok_t105zero_0123456789ab');
end $$;
reset role; reset request.jwt.claim.sub; set role anon;
do $$
declare d jsonb := public.portal_estimate('tok_t105zero_0123456789ab') -> 'doc';
begin
  perform tst.ok((select array_agg(l ->> 'id' order by o) from jsonb_array_elements(d -> 'options' -> 0 -> 'lines') with ordinality x(l, o))
                 = array['keep', 'small', 'ten', 'dime', 'lead0', 'exp'], 'T105 quantity-0 lines (any spelling, add-ons too) are not on the page: ' || d::text);
end $$;
:as_super
select tst.ok(jsonb_array_length((select calc_inputs -> 'options' -> 0 -> 'lines' from public.estimate_versions v
                 join public.estimates e on e.current_version_id = v.id where e.title = 'T105 zero lines')) = 15, 'T105 the stored document keeps every line');
select tst.ok(app.client_doc('{"options":[{"id":"o","lines":[{"id":"a","name":"A","group":"labor","quantity":"0","unitPriceCents":1}]}]}'::jsonb)
                -> 'options' -> 0 -> 'lines' = '[]'::jsonb, 'T105 an option of only quantity-0 lines has no lines');
select tst.ok(not has_function_privilege('anon', 'app.client_doc(jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'app.client_doc(jsonb)', 'execute'), 'T105 nobody calls app.client_doc directly (rule 18)');
\echo 'T105 quantity-0 lines: never on the client page ok'

-- ---------------------------------------------------------------- T104: photo minimums of a visit's snapshot (docs/specs/08 §11.7 №7)
:as_super
update public.memberships set role = 'office' where user_id = 'a0000000-0000-0000-0000-000000000002' and company_id = 'ca000000-0000-0000-0000-000000000000';
:as_owner_a
do $$ begin
  insert into public.customers (id, company_id, display_name) values ('c1040000-0000-4000-8000-0000000000c1', 'ca000000-0000-0000-0000-000000000000', 'T104 Home');
  insert into public.properties (id, company_id, customer_id, address_line1, address_city) values
    ('c1040000-0000-4000-8000-0000000000d1', 'ca000000-0000-0000-0000-000000000000', 'c1040000-0000-4000-8000-0000000000c1', '104 Home St', 'Pasadena');
  insert into public.jobs (id, company_id, title, customer_id, property_id, status) values
    ('c1040000-0000-4000-8000-0000000000e1', 'ca000000-0000-0000-0000-000000000000', 'T104 job', 'c1040000-0000-4000-8000-0000000000c1', 'c1040000-0000-4000-8000-0000000000d1', 'draft');
end $$;
:as_office_a
-- the office makes a visit with the minimums of its templates (S9), then changes them
insert into public.visits (id, company_id, job_id, starts_at, checklist_min_photos_before, checklist_min_photos_after) values
  ('c1040000-0000-4000-8000-0000000000f1', 'ca000000-0000-0000-0000-000000000000', 'c1040000-0000-4000-8000-0000000000e1', now(), 2, 3);
update public.visits set checklist_min_photos_after = 4 where id = 'c1040000-0000-4000-8000-0000000000f1';
select tst.ok((select checklist_min_photos_before = 2 and checklist_min_photos_after = 4 from public.visits where id = 'c1040000-0000-4000-8000-0000000000f1'),
  'T104 the office sets the photo minimums of a visit');
do $$ begin
  perform tst.fails($q$update public.visits set checklist_min_photos_before = 21 where id = 'c1040000-0000-4000-8000-0000000000f1'$q$, 'T104 a minimum above 20 is refused');
  perform tst.fails($q$update public.visits set checklist_min_photos_after = 0 where id = 'c1040000-0000-4000-8000-0000000000f1'$q$, 'T104 a minimum of 0 is refused (null is the company''s)');
end $$;
:as_owner_a
insert into public.visit_assignees (company_id, visit_id, user_id) values
  ('ca000000-0000-0000-0000-000000000000', 'c1040000-0000-4000-8000-0000000000f1', 'a0000000-0000-0000-0000-000000000003');
:as_tech_a
do $$ begin
  perform tst.fails($q$update public.visits set checklist_min_photos_before = null where id = 'c1040000-0000-4000-8000-0000000000f1'$q$, 'T104 a tech does not lower the minimums of his visit');
end $$;
update public.visits set notes = 'tech note' where id = 'c1040000-0000-4000-8000-0000000000f1';
:as_sales_a
do $$ begin
  perform tst.fails($q$update public.visits set checklist_min_photos_after = 1 where id = 'c1040000-0000-4000-8000-0000000000f1'$q$, 'T104 sales does not change the minimums');
  perform tst.fails($q$insert into public.visits (id, company_id, job_id, starts_at, checklist_min_photos_before) values
    ('c1040000-0000-4000-8000-0000000000f2', 'ca000000-0000-0000-0000-000000000000', 'c1040000-0000-4000-8000-0000000000e1', now(), 5)$q$, 'T104 sales does not make a visit with minimums');
end $$;
-- a visit without minimums: sales books it as before
insert into public.visits (id, company_id, job_id, starts_at) values
  ('c1040000-0000-4000-8000-0000000000f3', 'ca000000-0000-0000-0000-000000000000', 'c1040000-0000-4000-8000-0000000000e1', now());
select tst.ok(tst.cnt($q$select 1 from public.visits where id = 'c1040000-0000-4000-8000-0000000000f3'$q$) = 1, 'T104 sales makes a visit without minimums as before');
:as_super
select tst.ok((select checklist_min_photos_before = 2 and checklist_min_photos_after = 4 and notes = 'tech note' from public.visits where id = 'c1040000-0000-4000-8000-0000000000f1'),
  'T104 the tech''s other edit of the visit passes, the minimums stay');
delete from public.visits where id in ('c1040000-0000-4000-8000-0000000000f1', 'c1040000-0000-4000-8000-0000000000f3');
delete from public.jobs where id = 'c1040000-0000-4000-8000-0000000000e1';
delete from public.properties where id = 'c1040000-0000-4000-8000-0000000000d1';
delete from public.customers where id = 'c1040000-0000-4000-8000-0000000000c1';
update public.memberships set role = 'admin' where user_id = 'a0000000-0000-0000-0000-000000000002' and company_id = 'ca000000-0000-0000-0000-000000000000';
\echo 'T104 photo minimums of a visit: only the office sets them (1..20), a tech and sales cannot ok'
-- ---------------------------------------------------------------- T99: the tech does not see the price list's costs (19 §9, P1)
-- catalog_items keeps its old cost columns (rule 16 step 1) but they are always null: a trigger moves what a phone
-- writes into catalog_item_costs, which only app.can_view_costs reads (owner / admin / office, view_costs).
:as_owner_a
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, unit_cost_cents, vendor_tax_bps, markup_bps)
  values ('99000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'material', 'T99 bracket (test)', 'ea', 1213, 1000, 1025, 1000);
select tst.ok((select row(unit_cost_cents, vendor_tax_bps, markup_bps) = row(1000::bigint, 1025, 1000) from public.catalog_item_costs
                where item_id = '99000000-0000-4000-8000-000000000001'), 'T99 the owner reads the cost from catalog_item_costs');
select tst.ok((select unit_cost_cents is null and vendor_tax_bps is null and markup_bps is null and unit_price_cents = 1213
                 from public.catalog_items where id = '99000000-0000-4000-8000-000000000001'), 'T99 the item row keeps the price, its cost columns are blank');
-- an old office build: loaded null costs, saves the item with a new price and null costs — the cost stays
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, unit_cost_cents, vendor_tax_bps, markup_bps)
  values ('99000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'material', 'T99 bracket (test)', 'ea', 1300, null, null, null)
  on conflict (id) do update set unit_price_cents = excluded.unit_price_cents, unit_cost_cents = excluded.unit_cost_cents,
    vendor_tax_bps = excluded.vendor_tax_bps, markup_bps = excluded.markup_bps;
select tst.ok((select unit_cost_cents = 1000 and markup_bps = 1000 from public.catalog_item_costs where item_id = '99000000-0000-4000-8000-000000000001'),
  'T99 null from an old phone never erases the cost');
-- review #383 №2: the new app's save of a phone without costs sends no cost column at all — the side table keeps all
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents)
  values ('99000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'material', 'T99 bracket renamed (test)', 'ea', 1300)
  on conflict (id) do update set name = excluded.name, unit_price_cents = excluded.unit_price_cents;
select tst.ok((select row(unit_cost_cents, vendor_tax_bps, markup_bps) = row(1000::bigint, 1025, 1000) from public.catalog_item_costs
                where item_id = '99000000-0000-4000-8000-000000000001'), 'T99 a save without cost columns keeps cost, supplier tax and markup');
-- an old build sends a new cost in the old column: it lands in the side table, the row stays blank
update public.catalog_items set unit_cost_cents = 1100 where id = '99000000-0000-4000-8000-000000000001';
select tst.ok((select k.unit_cost_cents = 1100 and k.markup_bps = 1000 and i.unit_cost_cents is null
                 from public.catalog_item_costs k join public.catalog_items i on i.id = k.item_id where k.item_id = '99000000-0000-4000-8000-000000000001'),
  'T99 a cost written the old way moves to catalog_item_costs');
-- «insert or nothing» (a module item, a replay) on an existing row does not touch its cost
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, unit_cost_cents)
  values ('99000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'material', 'x', 'ea', 1, 1) on conflict (id) do nothing;
select tst.ok((select unit_cost_cents = 1100 from public.catalog_item_costs where item_id = '99000000-0000-4000-8000-000000000001'),
  'T99 ON CONFLICT DO NOTHING keeps the cost');
:as_owner_b
insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, unit_cost_cents)
  values ('99000000-0000-4000-8000-000000000001', 'cb000000-0000-0000-0000-000000000000', 'material', 'B', 'ea', 1, 1) on conflict (id) do nothing;
select tst.ok(tst.cnt('select 1 from public.catalog_item_costs where item_id = ''99000000-0000-4000-8000-000000000001''') = 0, 'T99 company B does not see A''s cost');
select tst.blocked($q$update public.catalog_item_costs set unit_cost_cents = 1 where item_id = '99000000-0000-4000-8000-000000000001'$q$, 'T99 company B changes A''s cost');
:as_office_a
select tst.ok((select unit_cost_cents = 1100 from public.catalog_item_costs where item_id = '99000000-0000-4000-8000-000000000001'),
  'T99 company B''s «insert or nothing» with A''s id left A''s cost alone; the office reads it');
-- the new app clears a cost in the side table itself, the way ops.ts catalog.save does it (PostgREST upsert)
insert into public.catalog_item_costs (item_id, company_id, unit_cost_cents, vendor_tax_bps, markup_bps)
  values ('99000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 1100, 1025, null)
  on conflict (item_id) do update set item_id = excluded.item_id, company_id = excluded.company_id, unit_cost_cents = excluded.unit_cost_cents,
    vendor_tax_bps = excluded.vendor_tax_bps, markup_bps = excluded.markup_bps;
select tst.ok((select markup_bps is null and unit_cost_cents = 1100 from public.catalog_item_costs where item_id = '99000000-0000-4000-8000-000000000001'),
  'T99 the office clears the markup');
:as_tech_a
do $$ begin
  -- the old app's `select *` still works for the tech; no cost anywhere
  perform tst.ok(tst.cnt('select * from public.catalog_items') > 0, 'T99 the tech still reads the price list with select *');
  perform tst.ok(tst.cnt('select 1 from public.catalog_items where unit_cost_cents is not null or vendor_tax_bps is not null or markup_bps is not null') = 0,
    'T99 the tech sees no cost, supplier tax or markup in catalog_items');
  perform tst.ok(tst.cnt('select 1 from public.catalog_item_costs') = 0, 'T99 the tech reads nothing from catalog_item_costs');
  perform tst.fails($q$insert into public.catalog_item_costs (item_id, company_id, unit_cost_cents)
    values ('99000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 1)$q$, 'T99 the tech writes a cost');
  perform tst.blocked($q$update public.catalog_item_costs set unit_cost_cents = 1$q$, 'T99 the tech changes a cost');
end $$;
-- company B «upserts» (ON CONFLICT DO UPDATE, the app's plain save) with A's id: RLS refuses before any trigger
:as_owner_b
select tst.fails($q$insert into public.catalog_items (id, company_id, kind, name, unit, unit_price_cents, unit_cost_cents)
  values ('99000000-0000-4000-8000-000000000001', 'cb000000-0000-0000-0000-000000000000', 'material', 'B', 'ea', 1, 1)
  on conflict (id) do update set unit_cost_cents = excluded.unit_cost_cents, unit_price_cents = excluded.unit_price_cents$q$, 'T99 company B upserts over A''s item');
:as_super
select tst.ok((select unit_cost_cents = 1100 from public.catalog_item_costs where item_id = '99000000-0000-4000-8000-000000000001'), 'T99 A''s cost after B''s upsert');
:as_sales_a
select tst.ok(tst.cnt('select 1 from public.catalog_item_costs') = 0, 'T99 sales without view_costs reads no cost');
-- sales edit the price list but not our costs: a cost sent the old way is blanked, not moved
update public.catalog_items set unit_cost_cents = 1, markup_bps = 1 where id = '99000000-0000-4000-8000-000000000001';
:as_super
select tst.ok((select k.unit_cost_cents = 1100 and i.unit_cost_cents is null and i.markup_bps is null
                 from public.catalog_item_costs k join public.catalog_items i on i.id = k.item_id where k.item_id = '99000000-0000-4000-8000-000000000001'),
  'T99 sales without view_costs cannot change a cost through the old column');
-- a tech never sees costs, also with view_costs switched on by mistake (matrix 04 §1)
update public.memberships set permissions_override = coalesce(permissions_override, '{}'::jsonb) || '{"view_costs": true}'
 where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003';
:as_tech_a
select tst.ok(tst.cnt('select 1 from public.catalog_item_costs') = 0 and tst.cnt('select 1 from public.estimate_line_costs') = 0,
  'T99 a tech with view_costs still reads no cost');
:as_super
update public.memberships set permissions_override = permissions_override - 'view_costs'
 where company_id = 'ca000000-0000-0000-0000-000000000000' and user_id = 'a0000000-0000-0000-0000-000000000003';
:as_sales_a
select tst.ok(tst.cnt('select 1 from public.catalog_items where unit_cost_cents is not null or markup_bps is not null') = 0, 'T99 sales sees no cost in catalog_items');
:as_super
select tst.ok(not exists (select 1 from public.catalog_items where unit_cost_cents is not null or vendor_tax_bps is not null or markup_bps is not null),
  'T99 no item anywhere keeps a cost in its own row');
select tst.ok(not has_table_privilege('anon', 'public.catalog_item_costs', 'select'), 'T99 anon has no access to catalog_item_costs');
delete from public.catalog_items where id = '99000000-0000-4000-8000-000000000001';
select tst.ok(not exists (select 1 from public.catalog_item_costs where item_id = '99000000-0000-4000-8000-000000000001'), 'T99 the cost goes with its item');
\echo 'T99 the price list''s cost, supplier tax and markup: only who sees costs reads them; old phones keep working ok'

-- ---------------------------------------------------------------- T100: the tech does not see an estimate's margin (19 §9, P2)
-- totals is «only what the client sees»: totals.marginPct moves to estimate_version_costs (can_view_costs).
:as_tech_a
insert into public.estimates (id, company_id, customer_id, property_id, title)
  values ('a1000000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'T100 tech draft');
-- an old tech build writes the margin it counted (as the app did): it is not his to read back
insert into public.estimate_versions (id, company_id, estimate_id, version_no, totals)
  values ('a1000000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000001', 1,
          '{"total": 50000, "deposit": 5000, "marginPct": "33.3"}') on conflict (id) do nothing;
select tst.ok((select totals = '{"total": 50000, "deposit": 5000}'::jsonb from public.estimate_versions where id = 'a1000000-0000-4000-8000-000000000002'),
  'T100 the tech reads his version: total and deposit, no margin');
select tst.ok(tst.cnt('select 1 from public.estimate_version_costs') = 0, 'T100 the tech reads nothing from estimate_version_costs');
select tst.ok(tst.cnt($q$select 1 from public.estimate_versions where totals ? 'marginPct'$q$) = 0, 'T100 no version the tech reads has a margin');
select tst.fails($q$insert into public.estimate_version_costs (version_id, company_id, margin_pct)
  values ('a1000000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', '99')$q$, 'T100 the tech writes a margin');
:as_office_a
select tst.ok((select margin_pct = '33.3' from public.estimate_version_costs where version_id = 'a1000000-0000-4000-8000-000000000002'),
  'T100 the office reads the margin from estimate_version_costs');
update public.estimate_versions set totals = '{"total": 52000, "deposit": 5200, "marginPct": "35.0"}' where id = 'a1000000-0000-4000-8000-000000000002';
select tst.ok((select margin_pct = '35.0' from public.estimate_version_costs where version_id = 'a1000000-0000-4000-8000-000000000002'), 'T100 a new margin replaces the old');
update public.estimate_versions set totals = '{"total": 52000, "deposit": 5200}' where id = 'a1000000-0000-4000-8000-000000000002';
select tst.ok((select margin_pct = '35.0' from public.estimate_version_costs where version_id = 'a1000000-0000-4000-8000-000000000002'), 'T100 no key — the margin stays');
update public.estimate_versions set totals = '{"total": 52000, "deposit": 5200, "marginPct": null}' where id = 'a1000000-0000-4000-8000-000000000002';
select tst.ok((select margin_pct is null from public.estimate_version_costs where version_id = 'a1000000-0000-4000-8000-000000000002'), 'T100 null — costs not complete, no margin');
select tst.blocked($q$update public.estimate_version_costs set margin_pct = '1'$q$, 'T100 the office writes the margin table directly');
:as_sales_a
select tst.ok(tst.cnt('select 1 from public.estimate_version_costs') = 0, 'T100 sales without view_costs reads no margin');
-- company B «insert or nothing» with A's version id: no margin of A changes (AFTER INSERT fires only for a new row)
:as_owner_b
select tst.blocked($q$insert into public.estimate_versions (id, company_id, estimate_id, version_no, totals)
  values ('a1000000-0000-4000-8000-000000000002', 'cb000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000001', 9, '{"marginPct": "99"}')
  on conflict (id) do nothing$q$, 'T100 company B inserts with A''s version id');
:as_office_a
select tst.ok((select margin_pct is null from public.estimate_version_costs where version_id = 'a1000000-0000-4000-8000-000000000002'), 'T100 B''s insert left A''s margin');
-- the margin is a number as the engine writes it, nothing else (a huge loss is still a number)
update public.estimate_versions set totals = '{"total": 1, "marginPct": "-10000000.0"}' where id = 'a1000000-0000-4000-8000-000000000002';
select tst.ok((select margin_pct = '-10000000.0' from public.estimate_version_costs where version_id = 'a1000000-0000-4000-8000-000000000002'), 'T100 a huge negative margin is kept');
select tst.fails($q$update public.estimate_versions set totals = '{"total": 1, "marginPct": "lots"}' where id = 'a1000000-0000-4000-8000-000000000002'$q$, 'T100 a margin that is not a number');
-- P4: the retired lead cost columns take no value again
select tst.fails($q$update public.leads set cost_cents = 100 where company_id = 'ca000000-0000-0000-0000-000000000000'$q$, 'T99 leads.cost_cents is retired');
select tst.fails($q$update public.lead_sources set default_cost_cents = 100 where company_id = 'ca000000-0000-0000-0000-000000000000'$q$, 'T99 lead_sources.default_cost_cents is retired');
-- a sent version stays locked (t40 is on again after the migration)
:as_owner_a
update public.estimate_versions set locked_at = now() where id = 'a1000000-0000-4000-8000-000000000002';
select tst.fails($q$update public.estimate_versions set totals = '{"total": 1, "marginPct": "9"}' where id = 'a1000000-0000-4000-8000-000000000002'$q$,
  'T100 a locked version does not change, margin or not');
:as_super
select tst.ok(not has_table_privilege('anon', 'public.estimate_version_costs', 'select'), 'T100 anon has no access to estimate_version_costs');
select tst.ok(not exists (select 1 from public.estimate_versions where totals ? 'marginPct'), 'T100 no version anywhere keeps a margin in totals');
select tst.ok(not exists (select 1 from pg_trigger where tgname = 't40_version_lock' and tgenabled <> 'O'), 'T100 t40_version_lock is on');
\echo 'T100 an estimate''s margin: only who sees costs reads it; a sent version stays locked ok'

-- ---------------------------------------------------------------- T107: a version is locked only when its lines match its document (Н1, spec 33 П23.9)
-- The page /p/ draws app.client_doc(calc_inputs); the server's sums come from estimate_line_items. send_estimate
-- locks a version only when, per option, the client-visible lines with a non-zero amount are the same on both sides.
:as_office_a
insert into public.estimates (id, company_id, customer_id, property_id, title)
  values ('a1070000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'T107 lock match');
insert into public.estimate_versions (id, company_id, estimate_id, version_no, tax_enabled, deposit_rule, calc_inputs)
  values ('a1070000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-000000000001', 1, false, '{"kind":"none"}', $j${"options":[
   {"id":"a1070000-0000-4000-8000-0000000000a1","name":"A","recommended":true,"lines":[
     {"id":"a1070000-0000-4000-8000-0000000000b1","name":"Install","group":"labor","quantity":"1","unit":"ea","unitPriceCents":10000},
     {"id":"a1070000-0000-4000-8000-0000000000b2","name":"Guards","group":"material","quantity":"1","unit":"ea","unitPriceCents":5000,"optional":true},
     {"id":"a1070000-0000-4000-8000-0000000000b3","name":"Hanger (BOM)","group":"material","quantity":"40","unit":"ea","unitPriceCents":0,"optional":true,"clientVisible":false},
     {"id":"a1070000-0000-4000-8000-0000000000b4","name":"Left out","group":"material","quantity":"0","unit":"ea","unitPriceCents":7000,"optional":true}]},
   {"id":"a1070000-0000-4000-8000-0000000000a2","name":"B","lines":[
     {"id":"a1070000-0000-4000-8000-0000000000b5","name":"Other add-on","group":"service","quantity":"1","unit":"ea","unitPriceCents":3000,"optional":true}]}],
 "settings":{"tax":{"enabled":false,"rateBps":0,"groups":{}},"deposit":{"kind":"none"},"discount":null}}$j$);
update public.estimates set current_version_id = 'a1070000-0000-4000-8000-000000000002' where id = 'a1070000-0000-4000-8000-000000000001';
insert into public.estimate_options (id, company_id, version_id, name, position, is_recommended) values
  ('a1070000-0000-4000-8000-0000000000a1', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-000000000002', 'A', 0, true), ('a1070000-0000-4000-8000-0000000000a2', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-000000000002', 'B', 1, false);
insert into public.estimate_line_items (id, company_id, option_id, name, quantity, unit_price_cents, is_optional, client_visible, taxable) values
  ('a1070000-0000-4000-8000-0000000000b1', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-0000000000a1', 'Install', 1, 10001, false, true, false),   -- one cent apart from the document
  ('a1070000-0000-4000-8000-0000000000b2', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-0000000000a1', 'Guards', 1, 5000, true, true, false),
  ('a1070000-0000-4000-8000-0000000000b3', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-0000000000a1', 'Hanger (BOM)', 40, 0, true, false, false),
  ('a1070000-0000-4000-8000-0000000000b4', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-0000000000a1', 'Left out', 0, 7000, true, true, false),
  ('a1070000-0000-4000-8000-0000000000b5', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-0000000000a2', 'Other add-on', 1, 3000, true, true, false);
select tst.fails_like($q$select public.send_estimate('a1070000-0000-4000-8000-000000000001', 'tok_t107_0123456789abcdef')$q$, '%do not match%', 'T107 a line one cent apart: not sent');
select tst.ok((select locked_at is null from public.estimate_versions where id = 'a1070000-0000-4000-8000-000000000002')
              and (select status = 'draft' from public.estimates where id = 'a1070000-0000-4000-8000-000000000001'), 'T107 nothing locked, still a draft');
update public.estimate_line_items set unit_price_cents = 10000 where id = 'a1070000-0000-4000-8000-0000000000b1';
-- a line the client would pay for but never see
insert into public.estimate_line_items (id, company_id, option_id, name, quantity, unit_price_cents, taxable) values
  ('a1070000-0000-4000-8000-0000000000b9', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-0000000000a1', 'Not on the page', 1, 100, false);
select tst.fails_like($q$select public.send_estimate('a1070000-0000-4000-8000-000000000001', 'tok_t107_0123456789abcdef')$q$, '%do not match%', 'T107 a line missing from the document: not sent');
delete from public.estimate_line_items where id = 'a1070000-0000-4000-8000-0000000000b9';
-- an add-on on one side, a plain line on the other
update public.estimate_line_items set is_optional = false where id = 'a1070000-0000-4000-8000-0000000000b2';
select tst.fails_like($q$select public.send_estimate('a1070000-0000-4000-8000-000000000001', 'tok_t107_0123456789abcdef')$q$, '%do not match%', 'T107 add-on vs plain line: not sent');
update public.estimate_line_items set is_optional = true where id = 'a1070000-0000-4000-8000-0000000000b2';
-- security-check В1: an option id twice in the document (the page shows «Basic» $100 and «Premium» $900 under one id,
-- the server sums both) — and a line twice in one option
update public.estimate_versions set calc_inputs = jsonb_set(calc_inputs, '{options}', (calc_inputs -> 'options') || jsonb_build_array(calc_inputs #> '{options,0}')) where id = 'a1070000-0000-4000-8000-000000000002';
select tst.fails_like($q$select public.send_estimate('a1070000-0000-4000-8000-000000000001', 'tok_t107_0123456789abcdef')$q$, '%do not match%', 'T107 an option id twice: not sent');
update public.estimate_versions set calc_inputs = jsonb_set(calc_inputs, '{options}', (calc_inputs -> 'options') - 2) where id = 'a1070000-0000-4000-8000-000000000002';
update public.estimate_versions set calc_inputs = jsonb_set(calc_inputs, '{options,0,lines}', (calc_inputs #> '{options,0,lines}') || jsonb_build_array(calc_inputs #> '{options,0,lines,0}')) where id = 'a1070000-0000-4000-8000-000000000002';
select tst.fails_like($q$select public.send_estimate('a1070000-0000-4000-8000-000000000001', 'tok_t107_0123456789abcdef')$q$, '%do not match%', 'T107 a line twice in the document: not sent');
update public.estimate_versions set calc_inputs = jsonb_set(calc_inputs, '{options,0,lines}', (calc_inputs #> '{options,0,lines}') - 4) where id = 'a1070000-0000-4000-8000-000000000002';
-- security-check В2: no document (no options array) but paid lines — the page would show nothing
update public.estimate_versions set calc_inputs = '{"note": "hi"}' where id = 'a1070000-0000-4000-8000-000000000002';
select tst.fails_like($q$select public.send_estimate('a1070000-0000-4000-8000-000000000001', 'tok_t107_0123456789abcdef')$q$, '%do not match%', 'T107 no document, paid lines: not sent');
-- security-check of the review fix: «drawing» does not open the skip — only a version with no calc_inputs at all
update public.estimate_versions set source = 'drawing' where id = 'a1070000-0000-4000-8000-000000000002';
select tst.fails_like($q$select public.send_estimate('a1070000-0000-4000-8000-000000000001', 'tok_t107_0123456789abcdef')$q$, '%do not match%', 'T107 source drawing, a document with no options, paid lines: not sent');
update public.estimate_versions set source = 'scratch' where id = 'a1070000-0000-4000-8000-000000000002';
update public.estimate_versions set calc_inputs = $j${"options":[
   {"id":"a1070000-0000-4000-8000-0000000000a1","name":"A","recommended":true,"lines":[
     {"id":"a1070000-0000-4000-8000-0000000000b1","name":"Install","group":"labor","quantity":"1","unit":"ea","unitPriceCents":10000},
     {"id":"a1070000-0000-4000-8000-0000000000b2","name":"Guards","group":"material","quantity":"1","unit":"ea","unitPriceCents":5000,"optional":true},
     {"id":"a1070000-0000-4000-8000-0000000000b3","name":"Hanger (BOM)","group":"material","quantity":"40","unit":"ea","unitPriceCents":0,"optional":true,"clientVisible":false},
     {"id":"a1070000-0000-4000-8000-0000000000b4","name":"Left out","group":"material","quantity":"0","unit":"ea","unitPriceCents":7000,"optional":true}]},
   {"id":"a1070000-0000-4000-8000-0000000000a2","name":"B","lines":[
     {"id":"a1070000-0000-4000-8000-0000000000b5","name":"Other add-on","group":"service","quantity":"1","unit":"ea","unitPriceCents":3000,"optional":true}]}],
 "settings":{"tax":{"enabled":false,"rateBps":0,"groups":{}},"deposit":{"kind":"none"},"discount":null}}$j$ where id = 'a1070000-0000-4000-8000-000000000002';
-- security-check С1: the discount, the tax and the deposit as the document says
update public.estimate_options set discount_mode = 'pct', discount_value = 5000 where id = 'a1070000-0000-4000-8000-0000000000a1';
select tst.fails_like($q$select public.send_estimate('a1070000-0000-4000-8000-000000000001', 'tok_t107_0123456789abcdef')$q$, '%(discount)%', 'T107 a discount the document does not have: not sent');
update public.estimate_options set discount_mode = null, discount_value = null where id = 'a1070000-0000-4000-8000-0000000000a1';
update public.estimate_versions set tax_enabled = true, tax_rate_bps = 2000 where id = 'a1070000-0000-4000-8000-000000000002';
select tst.fails_like($q$select public.send_estimate('a1070000-0000-4000-8000-000000000001', 'tok_t107_0123456789abcdef')$q$, '%(tax)%', 'T107 a tax the document does not have: not sent');
update public.estimate_versions set tax_enabled = false where id = 'a1070000-0000-4000-8000-000000000002';
update public.estimate_versions set deposit_rule = '{"kind":"pct","bps":10000}' where id = 'a1070000-0000-4000-8000-000000000002';
select tst.fails_like($q$select public.send_estimate('a1070000-0000-4000-8000-000000000001', 'tok_t107_0123456789abcdef')$q$, '%(deposit)%', 'T107 a deposit the document does not have: not sent');
update public.estimate_versions set deposit_rule = '{"kind":"none"}' where id = 'a1070000-0000-4000-8000-000000000002';
-- a quantity that is not a number: the page cannot count it — never matches
update public.estimate_versions set calc_inputs = jsonb_set(calc_inputs, '{options,0,lines,0,quantity}', '"one"') where id = 'a1070000-0000-4000-8000-000000000002';
select tst.fails_like($q$select public.send_estimate('a1070000-0000-4000-8000-000000000001', 'tok_t107_0123456789abcdef')$q$, '%do not match%', 'T107 a quantity that is not a number: not sent');
update public.estimate_versions set calc_inputs = jsonb_set(calc_inputs, '{options,0,lines,0,quantity}', '"1"') where id = 'a1070000-0000-4000-8000-000000000002';
-- a huge price: never matches, the same refusal (not «bigint out of range»)
update public.estimate_versions set calc_inputs = jsonb_set(calc_inputs, '{options,0,lines,0,unitPriceCents}', '1e300') where id = 'a1070000-0000-4000-8000-000000000002';
select tst.fails_like($q$select public.send_estimate('a1070000-0000-4000-8000-000000000001', 'tok_t107_0123456789abcdef')$q$, '%do not match%', 'T107 a huge price: the same refusal');
update public.estimate_versions set calc_inputs = jsonb_set(calc_inputs, '{options,0,lines,0,unitPriceCents}', '10000') where id = 'a1070000-0000-4000-8000-000000000002';
-- review №4: «1e-7» (decimal.js writes a tiny quantity so) is a number: $0 on both sides, it matches
update public.estimate_versions set calc_inputs = jsonb_set(calc_inputs, '{options,1,lines,0,quantity}', '"1e-7"') where id = 'a1070000-0000-4000-8000-000000000002';
update public.estimate_line_items set quantity = 0.0000001 where id = 'a1070000-0000-4000-8000-0000000000b5';
:as_super
select tst.ok(tst.cnt($q$select 1 from app.version_lines_mismatch('a1070000-0000-4000-8000-000000000002')$q$) = 0, 'T107 a quantity of 1e-7: $0 both sides, it matches');
:as_office_a
update public.estimate_versions set calc_inputs = jsonb_set(calc_inputs, '{options,1,lines,0,quantity}', '"1"') where id = 'a1070000-0000-4000-8000-000000000002';
update public.estimate_line_items set quantity = 1 where id = 'a1070000-0000-4000-8000-0000000000b5';
-- security-check С3: a member cannot make a version that is locked from the start
select tst.fails_like($q$insert into public.estimate_versions (id, company_id, estimate_id, version_no, locked_at)
  values ('a1070000-0000-4000-8000-0000000000c9', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-000000000001', 7, now())$q$, '%cannot be locked%', 'T107 a version born locked');
-- a quantity with 5 decimals: both sides count the stored 1.2346 (the engine too, custom.test.ts) → $123.46
update public.estimate_versions set calc_inputs = jsonb_set(calc_inputs, '{options,0,lines,0,quantity}', '"1.23455"') where id = 'a1070000-0000-4000-8000-000000000002';
update public.estimate_line_items set quantity = 1.23455 where id = 'a1070000-0000-4000-8000-0000000000b1';
select tst.ok((select quantity = 1.2346 and line_total_cents = 12346 from public.estimate_line_items where id = 'a1070000-0000-4000-8000-0000000000b1'), 'T107 the line keeps 1.2346 → $123.46');
:as_super
select tst.ok(tst.cnt($q$select 1 from app.version_lines_mismatch('a1070000-0000-4000-8000-000000000002')$q$) = 0, 'T107 the two sides match (hidden BOM, quantity-0 line, other option)');
:as_office_a
select tst.ok(public.send_estimate('a1070000-0000-4000-8000-000000000001', 'tok_t107_0123456789abcdef') = 'tok_t107_0123456789abcdef', 'T107 matching lines: sent');
select tst.ok((select locked_at is not null from public.estimate_versions where id = 'a1070000-0000-4000-8000-000000000002'), 'T107 the version is locked');
:as_super
select tst.ok(not has_function_privilege('authenticated', 'app.version_lines_mismatch(uuid)', 'execute')
              and not has_function_privilege('anon', 'app.version_lines_mismatch(uuid)', 'execute'), 'T107 the check is not callable from the API');
-- review #415 №2: a match exactly as saveEstimate writes it — a pct discount (Math.round(0.05 × 10000) = 500), the tax on
-- with the material group taxed, a pct deposit {"kind":"pct","bps":1000} → sent
:as_office_a
insert into public.estimates (id, company_id, customer_id, property_id, title)
  values ('a1070000-0000-4000-8000-000000000101', 'ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'T107 as saveEstimate');
insert into public.estimate_versions (id, company_id, estimate_id, version_no, tax_enabled, tax_rate_bps, deposit_rule, calc_inputs)
  values ('a1070000-0000-4000-8000-000000000102', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-000000000101', 1, true, 825, '{"kind":"pct","bps":1000}', $j${"options":[
   {"id":"a1070000-0000-4000-8000-0000000001a1","name":"A","recommended":true,"lines":[
     {"id":"a1070000-0000-4000-8000-0000000001b1","name":"Install","group":"labor","quantity":"1","unit":"ea","unitPriceCents":10000},
     {"id":"a1070000-0000-4000-8000-0000000001b2","name":"Gutter","group":"material","quantity":"2","unit":"ft","unitPriceCents":2500}]}],
 "settings":{"tax":{"enabled":true,"rateBps":825,"groups":{"service":false,"labor":false,"material":true}},"deposit":{"kind":"pct","bps":1000},"discount":{"kind":"pct","value":"0.05"}}}$j$);
update public.estimates set current_version_id = 'a1070000-0000-4000-8000-000000000102' where id = 'a1070000-0000-4000-8000-000000000101';
insert into public.estimate_options (id, company_id, version_id, name, position, is_recommended, discount_mode, discount_value)
  values ('a1070000-0000-4000-8000-0000000001a1', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-000000000102', 'A', 0, true, 'pct', 500);
insert into public.estimate_line_items (id, company_id, option_id, line_group, name, quantity, unit_price_cents, taxable) values
  ('a1070000-0000-4000-8000-0000000001b1', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-0000000001a1', 'labor', 'Install', 1, 10000, false),
  ('a1070000-0000-4000-8000-0000000001b2', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-0000000001a1', 'material', 'Gutter', 2, 2500, true);
select tst.ok(public.send_estimate('a1070000-0000-4000-8000-000000000101', 'tok_t107b_0123456789abcdef') = 'tok_t107b_0123456789abcdef', 'T107 discount, tax and deposit as saveEstimate writes them: sent');
-- review #415 №1: the old quick estimate exactly as estimate.add writes it — no document, paid lines, a pct deposit —
-- is not checked: sent and signed on site with the check on
insert into public.estimates (id, company_id, customer_id, property_id, title, created_via)
  values ('a1070000-0000-4000-8000-000000000201', 'ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'T107 quick', 'drawing');
insert into public.estimate_versions (id, company_id, estimate_id, version_no, source, engine_version, totals, deposit_rule, contract_type)
  values ('a1070000-0000-4000-8000-000000000202', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-000000000201', 1, 'drawing', '0.1.0',
          '{"total":15000,"deposit":1500,"marginPct":null}', '{"kind":"pct","value":"0.1","contractType":"ca_hic"}', 'ca_home_improvement');
insert into public.estimate_options (id, company_id, version_id, name, is_recommended)
  values ('a1070000-0000-4000-8000-0000000002a1', 'ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-000000000202', 'Quick', true);
insert into public.estimate_line_items (company_id, option_id, position, name, quantity, unit_price_cents, is_optional, origin)
  values ('ca000000-0000-0000-0000-000000000000', 'a1070000-0000-4000-8000-0000000002a1', 0, 'Gutters', 1, 15000, false, 'assembly');
update public.estimates set current_version_id = 'a1070000-0000-4000-8000-000000000202' where id = 'a1070000-0000-4000-8000-000000000201';
:as_owner_a
select tst.ok(public.send_estimate('a1070000-0000-4000-8000-000000000201') is not null, 'T107 a quick estimate with no document: sent');
select tst.ok(public.sign_estimate_on_site('a1070000-0000-4000-8000-000000000201', 'Walk-in Client', 'M0 0 L2 2') = 'awaiting_countersign',
  'T107 a quick estimate with no document: the client signs on site');
-- security-check В2 stays: a scratch version with a document of no options and paid lines is not sent (above)
:as_super
\echo 'T107 a version is locked only when its lines match its document ok'

-- ---------------------------------------------------------------- T108: portal_accept with ids of hidden add-ons (Н4а, spec 33 П23.9)
-- The client's page cannot show a hidden BOM line or a quantity-0 add-on, but a crafted request can send their ids,
-- an add-on of another option or a plain line: none of them moves the total.
select tst.ok((select total = 12346 from app.estimate_option_totals('a1070000-0000-4000-8000-000000000002', 'a1070000-0000-4000-8000-0000000000a1', null)), 'T108 option A alone: $123.46');
select tst.ok((select total = 12346 from app.estimate_option_totals('a1070000-0000-4000-8000-000000000002', 'a1070000-0000-4000-8000-0000000000a1',
                 array['a1070000-0000-4000-8000-0000000000b3', 'a1070000-0000-4000-8000-0000000000b4', 'a1070000-0000-4000-8000-0000000000b5', 'a1070000-0000-4000-8000-0000000000b1']::uuid[])),
  'T108 hidden BOM, quantity-0 add-on, another option''s add-on, a plain line: the total does not move');
select tst.ok((select total = 17346 from app.estimate_option_totals('a1070000-0000-4000-8000-000000000002', 'a1070000-0000-4000-8000-0000000000a1', array['a1070000-0000-4000-8000-0000000000b2']::uuid[])), 'T108 the visible add-on counts: $173.46');
reset role; reset request.jwt.claim.sub; set role anon;
select tst.ok((public.portal_accept('tok_t107_0123456789abcdef', 'a1070000-0000-4000-8000-0000000000a1',
                 array['a1070000-0000-4000-8000-0000000000b3', 'a1070000-0000-4000-8000-0000000000b4', 'a1070000-0000-4000-8000-0000000000b5']::uuid[], 'Ann Client', 'M0 0 L10 10', true)
               -> 'approval' -> 'selection' ->> 'total')::bigint = 12346, 'T108 the client signs with hidden ids: the server total is $123.46');
:as_super
select tst.ok((select (selection ->> 'total')::bigint = 12346 from public.estimate_approvals where estimate_id = 'a1070000-0000-4000-8000-000000000001' and party = 'customer'),
  'T108 the signed selection keeps $123.46');
\echo 'T108 portal_accept: hidden add-on ids do not move the total ok'

-- ---------------------------------------------------------------- T109: a percent discount longer than 4 digits (debt 3 of «Сметы» №1)
-- The app writes round(fraction × 10000) bps (engine discountBps), the server counts floor(sub × bps / 10000 + 0.5),
-- the lock check rounds the document's fraction the same way: 0.123456 → 1235 bps. The engine's numbers:
-- packages/estimating-engine/test/estimate.test.ts T4b (3 × $333.33 − 12.35% = $876.49).
:as_office_a
insert into public.estimates (id, company_id, customer_id, property_id, title)
  values ('a1090000-0000-4000-8000-000000000001', 'ca000000-0000-0000-0000-000000000000', 'c1a00000-0000-0000-0000-000000000001', 'd1a00000-0000-0000-0000-000000000001', 'T109 discount bps');
insert into public.estimate_versions (id, company_id, estimate_id, version_no, tax_enabled, deposit_rule, calc_inputs)
  values ('a1090000-0000-4000-8000-000000000002', 'ca000000-0000-0000-0000-000000000000', 'a1090000-0000-4000-8000-000000000001', 1, false, '{"kind":"none"}', $j${"options":[
   {"id":"a1090000-0000-4000-8000-0000000000a1","name":"A","recommended":true,"lines":[
     {"id":"a1090000-0000-4000-8000-0000000000b1","name":"Install","group":"labor","quantity":"3","unit":"ea","unitPriceCents":33333}]}],
 "settings":{"tax":{"enabled":false,"rateBps":0,"groups":{}},"deposit":{"kind":"none"},"discount":{"kind":"pct","value":"0.123456"}}}$j$);
update public.estimates set current_version_id = 'a1090000-0000-4000-8000-000000000002' where id = 'a1090000-0000-4000-8000-000000000001';
insert into public.estimate_options (id, company_id, version_id, name, position, is_recommended, discount_mode, discount_value)
  values ('a1090000-0000-4000-8000-0000000000a1', 'ca000000-0000-0000-0000-000000000000', 'a1090000-0000-4000-8000-000000000002', 'A', 0, true, 'pct', 1234);   -- truncated, not rounded
insert into public.estimate_line_items (id, company_id, option_id, name, quantity, unit_price_cents, taxable)
  values ('a1090000-0000-4000-8000-0000000000b1', 'ca000000-0000-0000-0000-000000000000', 'a1090000-0000-4000-8000-0000000000a1', 'Install', 3, 33333, false);
select tst.fails_like($q$select public.send_estimate('a1090000-0000-4000-8000-000000000001', 'tok_t109_0123456789abcdef')$q$, '%do not match%', 'T109 1234 bps for 0.123456: not sent');
update public.estimate_options set discount_value = 1235 where id = 'a1090000-0000-4000-8000-0000000000a1';
select tst.ok(public.send_estimate('a1090000-0000-4000-8000-000000000001', 'tok_t109_0123456789abcdef') = 'tok_t109_0123456789abcdef', 'T109 1235 bps (the engine''s discountBps): sent');
:as_super
select tst.ok((select total = 87649 from app.estimate_option_totals('a1090000-0000-4000-8000-000000000002', 'a1090000-0000-4000-8000-0000000000a1', null)), 'T109 the server''s total = the engine''s $876.49');
\echo 'T109 a percent discount counts whole bps on both sides ok'

\echo 'ALL TESTS PASSED'
