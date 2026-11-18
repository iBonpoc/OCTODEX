-- Issue #1982 (found by the security check of PR #1979): the logs of the erasure must not carry the text of a Postgres error.
-- The text can hold values (a storage path, an id of a person) and lands in the database log. Only SQLSTATE stays — the way the
-- schedule of 50-6 (20261117220000) already does it.
--   * app.erase_queue_run() — the same body as in 20261117200000, only the warning prints sqlstate;
--   * public.delete_account(text, uuid[]) — the same body as in 20261117160000, only the warning prints sqlstate.
-- Rule 16: create or replace, nothing renamed or dropped. Rule 18: the rights are set again exactly as they were.

create or replace function app.erase_queue_run()
returns int language plpgsql security definer set search_path = '' as $$
declare
  q record;
  v_done int := 0;
  v_keys constant text[] := array['title', 'his_registration_number', 'color'];
  f record;
begin
  for q in select * from app.erase_queue where done_at is null and tries < 5 order by at, user_id for update skip locked loop
    begin
      perform set_config('app.erasing_journal', 'on', true);
      update public.audit_log
         set before = app.redact_person_json(before, v_keys), after = app.redact_person_json(after, v_keys)
       where entity_type = 'memberships' and entity_id = any (q.membership_ids)
         and (coalesce(before ?| v_keys, false) or coalesce(after ?| v_keys, false));
      perform set_config('app.erasing_journal', '', true);
      update public.catalog_price_history set by = null where by = q.user_id;
      update public.catalog_cost_history set by = null where by = q.user_id;
      -- 50-3: the person's own profile picture — the object goes to the Storage queue (only the Storage API removes objects), the file row goes
      -- now. «Own» is what the guard of 20261115160000 lets a picture be: the person's own photo, linked to no job, visit, client or measurement.
      -- A file that is not such a photo is never touched, whatever the profile pointed at.
      if q.avatar_file_id is not null then
        select ff.id, ff.storage_key into f from public.files ff
         where ff.id = q.avatar_file_id and ff.created_by = q.user_id and ff.kind = 'photo'
           and ff.job_id is null and ff.visit_id is null and ff.customer_id is null and ff.measurement_id is null;
        if found then
          if f.storage_key is null then
            delete from public.files where id = f.id;     -- never uploaded: no object
          elsif f.storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(/[A-Za-z0-9._-]+)+$' and f.storage_key !~ '(^|/)\.\.(/|$)' and length(f.storage_key) <= 512 then
            insert into app.storage_erase_queue (bucket, path) values ('files', f.storage_key) on conflict (bucket, path) do nothing;
            delete from public.files where id = f.id;
          else
            -- a key of an odd shape (the app's own is <company>/<id>.<ext>): the queue refuses it and the rest of the erasure must not fail with
            -- it — the row stays (the object keeps its reference), the warning says so, a person looks at it
            raise warning 'erase_queue_run: a profile picture key of an odd shape was left for a person to look at';
          end if;
        end if;
      end if;
      -- nothing of the person is left in what this job owns
      if exists (select 1 from public.audit_log a
                  where a.entity_type = 'memberships' and a.entity_id = any (q.membership_ids)
                    and (coalesce((a.before ->> 'title'), (a.before ->> 'his_registration_number'), (a.before ->> 'color'),
                                  (a.after ->> 'title'), (a.after ->> 'his_registration_number'), (a.after ->> 'color')) is not null))
         or exists (select 1 from public.catalog_price_history where by = q.user_id)
         or exists (select 1 from public.catalog_cost_history where by = q.user_id)
         or (q.avatar_file_id is not null and exists (select 1 from public.files ff where ff.id = q.avatar_file_id and ff.created_by = q.user_id
                and ff.kind = 'photo' and ff.job_id is null and ff.visit_id is null and ff.customer_id is null and ff.measurement_id is null
                and (ff.storage_key is null or ff.storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(/[A-Za-z0-9._-]+)+$'))) then
        raise exception 'erasure by the queue incomplete';
      end if;
      update app.erase_queue set done_at = now() where user_id = q.user_id;
      v_done := v_done + 1;
    exception when others then
      perform set_config('app.erasing_journal', '', true);
      raise warning 'erase_queue_run failed for one person: %', sqlstate;
      update app.erase_queue set tries = tries + 1 where user_id = q.user_id;
    end;
  end loop;
  return v_done;
end;
$$;

revoke all on function app.erase_queue_run() from public, anon, authenticated;
grant execute on function app.erase_queue_run() to service_role;

create or replace function public.delete_account(p_confirm text, p_close_companies uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  begin
    if v_me is null or app.is_anonymous_user() then
      raise exception 'sign in first' using errcode = 'OD001';
    end if;
    -- a lock wait never hangs until the statement timeout (→ «try again»)
    perform set_config('lock_timeout', '5s', true);
    -- my profile row first: two taps at once — the second waits here and then sees the first one's result
    perform 1 from public.users u where u.id = v_me for update;
    -- again (the answer was lost, or the sign-in is closed by Auth later): nothing changes, it is a success
    if exists (select 1 from public.users u where u.id = v_me and u.deleted_at is not null) then
      return jsonb_build_object('deleted', true, 'repeat', true);
    end if;
    if btrim(coalesce(p_confirm, '')) not in ('DELETE', 'УДАЛИТЬ', 'ELIMINAR') then
      raise exception 'type the word to confirm' using errcode = 'OD001';
    end if;
    if not app.signed_in_recently() then
      raise exception 'sign in again first' using errcode = 'OD001';
    end if;
    return app.erase_account(v_me, p_close_companies);
  exception
    when sqlstate 'OD001' then
      raise;
    when deadlock_detected or serialization_failure or lock_not_available or query_canceled then
      raise exception 'try again' using errcode = 'OD001';
    when others then
      -- SQLSTATE only: the text of a Postgres error may hold values (a path, an id)
      raise warning 'delete_account failed: %', sqlstate;
      raise exception 'account deletion failed' using errcode = 'OD002';
  end;
end;
$$;
revoke all on function public.delete_account(text, uuid[]) from public, anon;
grant execute on function public.delete_account(text, uuid[]) to authenticated;
