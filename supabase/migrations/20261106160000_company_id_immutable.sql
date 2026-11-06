-- Security #2, PR-5 (docs/specs/19-db-security.md §7.1): a row never moves to another company.
--
-- 1. t11_company_id_immutable was missing on 13 tables with company_id (member_prefs and legal_acceptance from 130000 and 140000 too). Reachable today: company_secrets (an owner /
--    admin of two companies moved the EIN of A into B: the policy checks the role on the old and the new row
--    separately). The others are closed by grants or other triggers today; the trigger keeps them closed when a
--    grant or a server function appears later. The guard test T59 fails on any new table without it.
--    The trigger is attached directly, not with app.attach_standard_triggers (that one also adds t10, which needs
--    updated_at / row_version these tables do not have). The message no longer reads old.id: company_secrets,
--    customer_tags and job_tags have no id column (the trigger would fail with «record has no field id»).
-- 2. member_signatures_update: WITH CHECK also asks for membership (a former member passed the policy; only the
--    t10 guard stopped him).
-- 3. storage.objects UPDATE: USING checks the old name, WITH CHECK the new one, each on its own — a staff member of
--    two companies renamed <A>/<file>.jpg into <B>/<file>.jpg. An update now keeps the bucket and the name of the
--    object (the app only re-uploads with upsert, under the same name). No trigger is possible on storage.objects
--    (owned by supabase_storage_admin), so the check is in the policy.

create or replace function app.tg_company_id_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'company_id is immutable (% %)', tg_table_name, coalesce(to_jsonb(old) ->> 'id', '-') using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare t regclass;
begin
  foreach t in array array[
    'public.audit_log', 'public.company_secrets', 'public.customer_tags', 'public.email_outbox',
    'public.estimate_approvals', 'public.invitations', 'public.job_tags', 'public.legal_acceptance', 'public.member_prefs', 'public.member_signatures',
    'public.notifications', 'public.revoked_link_tokens', 'public.status_events'
  ]::regclass[] loop
    execute format('drop trigger if exists t11_company_id_immutable on %s', t);
    execute format('create trigger t11_company_id_immutable before update on %s
                    for each row execute function app.tg_company_id_immutable()', t);
  end loop;
end $$;

-- 2 ------------------------------------------------------------------------------------------------
alter policy member_signatures_update on public.member_signatures
  using (user_id = (select auth.uid()) and app.is_member(company_id))
  with check (user_id = (select auth.uid()) and app.is_member(company_id));

-- 3 ------------------------------------------------------------------------------------------------
-- The row being updated is still in the statement's snapshot with its old values when WITH CHECK runs.
-- !! Must stay STABLE: a volatile SQL function takes a fresh snapshot and would see the new name (T59 (5) catches it).
-- Answers only about objects the caller may write anyway (not an oracle for other companies' objects).
-- Side effects: Storage «move» is always refused now (the app never moves); «copy» is an insert, checked as one.
-- Safe only while authenticated has no DELETE policy on storage.objects (T59 (5) checks it): with one, a single
-- statement «delete B/x; update A/y set id, name = B/x» would pass the snapshot check.
create or replace function app.file_object_kept(p_id uuid, p_bucket text, p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.can_write_file_object(p_name)
     and exists (select 1 from storage.objects o where o.id = p_id and o.bucket_id = p_bucket and o.name = p_name);
$$;
revoke all on function app.file_object_kept(uuid, text, text) from public, anon;
grant execute on function app.file_object_kept(uuid, text, text) to authenticated;

drop policy if exists files_bucket_update on storage.objects;
create policy files_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and app.can_write_file_object(name))
  with check (bucket_id = 'files' and app.can_write_file_object(name) and app.file_object_kept(id, bucket_id, name));
