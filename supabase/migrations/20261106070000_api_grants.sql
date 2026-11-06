-- Security audit 06.11, item 4: tables that kept the Supabase default privileges.
-- In Supabase, everything role postgres creates in public gets ALL (incl. TRUNCATE, REFERENCES, TRIGGER) for anon and
-- authenticated. These six tables never revoked it; the app needs only what is granted below (deletes are soft:
-- deleted_at / is_active, cloud/ops.ts). RLS stays as it was.
revoke all on public.catalog_items, public.notifications, public.company_secrets,
              public.company_licenses, public.company_contacts, public.notes
  from anon, authenticated;

grant select, insert, update on public.catalog_items, public.company_secrets,
                                public.company_licenses, public.company_contacts, public.notes
  to authenticated;
-- notifications: read, and mark read (repo.ts, ops.ts notice.read); rows come from server triggers and functions
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- New tables, functions and sequences in public get no rights for anon / authenticated until a migration grants them.
-- (EXECUTE for PUBLIC on new functions is Postgres's own default; core_rls T52 checks what anon can run.)
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
