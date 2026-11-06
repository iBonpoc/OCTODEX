-- Заглушка Supabase Auth ТОЛЬКО для локальных тестов (в Supabase всё это уже есть).
-- Применяется до миграции: миграция ссылается на auth.uid() и auth.users.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id                  uuid primary key,
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- Как в Supabase: sub из JWT, который PostgREST кладёт в request.jwt.claim.sub.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Minimal Storage stub (Supabase provides the real schema)
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, updated_at timestamptz, unique (bucket_id, name));
alter table storage.objects enable row level security;
-- as in Supabase: the API roles reach storage.objects, RLS decides
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;

-- As in Supabase: objects that role postgres creates in public get ALL for anon, authenticated, service_role
-- (security audit 06.11, item 5: without these lines the rights tests were falsely green).
-- Only once, before the migrations (a row in the stub's own table): core_rls.sql includes this file again after
-- them, when the migrations have already revoked these defaults.
create table if not exists auth.octo_stub_steps (step text primary key, done_at timestamptz not null default now());
revoke all on auth.octo_stub_steps from public, anon, authenticated;
do $$
begin
  if not exists (select 1 from auth.octo_stub_steps where step = 'supabase default privileges') then
    insert into auth.octo_stub_steps (step) values ('supabase default privileges');
    alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
  end if;
end $$;
