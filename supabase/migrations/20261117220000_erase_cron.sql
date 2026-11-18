-- Spec 50 §3.2/§6, PR 50-6 (K1, epic #1940, stage 1): the erasure jobs get their schedule.
--   * TWO jobs, so that a slow step never stops the other (a statement_timeout cancels the whole call, and a rolled-back call also drops a queued HTTP call):
--       «erase-people»  every 15 min: app.erase_queue_run() — the personal tails of an erased person in the journal and the price histories (50-2);
--       «erase-storage» every 15 min: app.erase_cron() — each step on its own: app.erase_purge_done() (rows done for more than 7 days leave both
--         queues: the queue must not become a list of erased people, spec 50 §6), app.erase_stuck() (the alarm: rows that gave up after 5 tries or
--         wait for more than 2 days — a warning in the database log and the counts in the answer; the panel of spec 45 reads the same function),
--         app.erase_kick() (one HTTP call to the edge function erase-storage, which drains app.storage_erase_queue, 50-3).
--   * app.erase_retry() — for the operator (service_role): gives the rows that gave up five more tries.
--   * the kick takes the address and the key from Vault (erase_fn_url, erase_fn_key; put there once by the operator, docs/11-setup-guide.md §8).
--     The key is the LEGACY service_role JWT: the new «sb_secret_…» keys are not JWTs and the function (verify_jwt = true) would refuse them.
--     The address must be a project host «<20 letters>.supabase.co» (app.erase_kick_ok, tested): the strongest key never goes elsewhere.
--     No Vault, no pg_net, no secrets → false, silently. Errors never print the key. «true» means only «the call is queued in pg_net»:
--     a refused key shows as 401/403 in net._http_response and as rows that wait (the alarm counts them after 2 days).
--   * the schedule exists only where pg_cron exists (not in the local test database); a repeat of the migration makes no second job.
-- Nothing here promises a term to anybody: the terms of spec 50 §6 stay in the spec until the lawyer has read them (6b of the plan).
-- Rule 16: only new objects. Rule 18: every function is revoked from public, anon, authenticated; service_role only where the app's role calls it.

-- ---- 1. the alarm: rows that gave up or wait too long ---------------------------------------------------------------------
create or replace function app.erase_stuck()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_people int;
  v_objects int;
begin
  select count(*) into v_people from app.erase_queue
   where done_at is null and (tries >= 5 or at < now() - interval '2 days');
  select count(*) into v_objects from app.storage_erase_queue
   where done_at is null and (tries >= 5 or at < now() - interval '2 days');
  if v_people + v_objects > 0 then
    -- counts only: no id, no path, nothing of the person
    raise warning 'erase: % person row(s) and % storage object(s) gave up after 5 tries or wait for more than 2 days', v_people, v_objects;
  end if;
  return v_people + v_objects;
end;
$$;
revoke all on function app.erase_stuck() from public, anon, authenticated;
grant execute on function app.erase_stuck() to service_role;

-- the operator's hand: the rows that gave up get five more tries (after the cause is fixed: a key, a deploy)
create or replace function app.erase_retry()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_a int;
  v_b int;
begin
  update app.erase_queue set tries = 0 where done_at is null and tries >= 5;
  get diagnostics v_a = row_count;
  update app.storage_erase_queue set tries = 0 where done_at is null and tries >= 5;
  get diagnostics v_b = row_count;
  return v_a + v_b;
end;
$$;
revoke all on function app.erase_retry() from public, anon, authenticated;
grant execute on function app.erase_retry() to service_role;

-- ---- 2. cleanup of what is done ------------------------------------------------------------------------------------------
create or replace function app.erase_purge_done()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_a int;
  v_b int;
begin
  delete from app.erase_queue where done_at is not null and done_at < now() - interval '7 days';
  get diagnostics v_a = row_count;
  delete from app.storage_erase_queue where done_at is not null and done_at < now() - interval '7 days';
  get diagnostics v_b = row_count;
  return v_a + v_b;
end;
$$;
revoke all on function app.erase_purge_done() from public, anon, authenticated;
grant execute on function app.erase_purge_done() to service_role;

-- ---- 3. the kick: one HTTP call to erase-storage -------------------------------------------------------------------------
-- the address and the key are checked by a pure function (tested on both sides): a project host only, and a key of three JWT parts
create or replace function app.erase_kick_ok(p_url text, p_key text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_url ~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/erase-storage$'
              and p_key ~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$', false);
$$;
revoke all on function app.erase_kick_ok(text, text) from public, anon, authenticated;
grant execute on function app.erase_kick_ok(text, text) to service_role;

create or replace function app.erase_kick()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_key text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return false;
  end if;
  execute $q$select (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'erase_fn_url' order by s.created_at desc limit 1),
                    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'erase_fn_key' order by s.created_at desc limit 1)$q$
     into v_url, v_key;
  if not app.erase_kick_ok(v_url, v_key) then
    return false;
  end if;
  -- nothing waits: no call
  if not exists (select 1 from app.storage_erase_queue where done_at is null and tries < 5) then
    return false;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
    using v_url, '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key);
  return true;
exception when others then
  raise warning 'erase kick failed: %', sqlstate;
  return false;
end;
$$;
revoke all on function app.erase_kick() from public, anon, authenticated;
grant execute on function app.erase_kick() to service_role;

-- ---- 4. the storage side of the schedule: three steps, none of them can hold the others (all short) ----------------------
create or replace function app.erase_cron()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_purged int := 0;
  v_stuck int := 0;
  v_kick boolean := false;
begin
  begin
    v_purged := app.erase_purge_done();
  exception when others then
    raise warning 'erase_purge_done failed: %', sqlstate;
  end;
  begin
    v_stuck := app.erase_stuck();
  exception when others then
    raise warning 'erase_stuck failed: %', sqlstate;
  end;
  v_kick := app.erase_kick();
  return jsonb_build_object('purged', v_purged, 'stuck', v_stuck, 'kick', v_kick);
end;
$$;
revoke all on function app.erase_cron() from public, anon, authenticated;
grant execute on function app.erase_cron() to service_role;

-- ---- 5. the schedule — only where pg_cron exists -------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
    exception when others then
      raise warning 'erase: pg_cron could not be created (%): no schedule', sqlstate;
    end;
  end if;
  if to_regnamespace('cron') is not null then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = any ($1)' using array['erase-queue', 'erase-people', 'erase-storage'];
    -- the time limit is in the job's own command: a «set» on the function does not stop a running statement (PG16)
    execute $q$select cron.schedule('erase-people', '*/15 * * * *', 'set statement_timeout = ''60s''; select app.erase_queue_run()')$q$;
    execute $q$select cron.schedule('erase-storage', '7,22,37,52 * * * *', 'set statement_timeout = ''30s''; select app.erase_cron()')$q$;
  end if;
end;
$$;
