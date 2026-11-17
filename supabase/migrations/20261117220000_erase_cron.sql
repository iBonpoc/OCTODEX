-- Spec 50 §3.2/§6, PR 50-6 (K1, epic #1940, stage 1): the erasure jobs get their schedule.
--   * app.erase_cron()  — what pg_cron runs every 15 minutes, as one call, each step on its own (one failing step never stops the next):
--       1. app.erase_queue_run()    — the personal tails of an erased person in the journal and the price histories (50-2);
--       2. app.erase_purge_done()   — rows that are done for more than 7 days leave both queues (the queue must not become a list of
--                                      erased people: spec 50 §6, data minimisation);
--       3. app.erase_stuck()        — the alarm: rows that gave up after 5 tries (a warning in the log of the database; the panel of spec 45
--                                      reads the same function, so the alarm has one source);
--       4. app.erase_kick()         — one HTTP call to the edge function erase-storage, which drains app.storage_erase_queue (50-3).
--   * the kick takes the address and the key from Vault (erase_fn_url, erase_fn_key; put there once by the operator, docs/11-setup-guide.md).
--     The key is the LEGACY service_role JWT: the new «sb_secret_…» keys are not JWTs and the function (verify_jwt = true) would refuse them.
--     No Vault, no pg_net, no secrets → false, silently. Errors never print the key.
--   * the schedule exists only where pg_cron exists (not in the local test database); a repeat of the migration makes no second job.
-- Nothing here promises a term to anybody: the terms of spec 50 §6 stay in the spec until the lawyer has read them (6b of the plan).
-- Rule 16: only new objects. Rule 18: every function is revoked from public, anon, authenticated; service_role only where the app's role calls it.

-- ---- 1. the alarm: rows that gave up -------------------------------------------------------------------------------------
create or replace function app.erase_stuck()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_people int;
  v_objects int;
begin
  select count(*) into v_people from app.erase_queue where done_at is null and tries >= 5;
  select count(*) into v_objects from app.storage_erase_queue where done_at is null and tries >= 5;
  if v_people + v_objects > 0 then
    -- counts only: no id, no path, nothing of the person
    raise warning 'erase: % person row(s) and % storage object(s) gave up after 5 tries', v_people, v_objects;
  end if;
  return v_people + v_objects;
end;
$$;
revoke all on function app.erase_stuck() from public, anon, authenticated;
grant execute on function app.erase_stuck() to service_role;

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
  -- only our own functions host; a key that is not a JWT (three parts) is refused here, not at the function
  if v_url is null or v_key is null or v_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/functions/v1/erase-storage$' or v_key !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then
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

-- ---- 4. the one call of the schedule -------------------------------------------------------------------------------------
create or replace function app.erase_cron()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_run int := 0;
  v_purged int := 0;
  v_stuck int := 0;
  v_kick boolean := false;
begin
  begin
    select count(*) into v_run from app.erase_queue where done_at is null and tries < 5;
    perform app.erase_queue_run();
  exception when others then
    raise warning 'erase_queue_run failed: %', sqlstate;
  end;
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
  return jsonb_build_object('waiting', v_run, 'purged', v_purged, 'stuck', v_stuck, 'kick', v_kick);
end;
$$;
revoke all on function app.erase_cron() from public, anon, authenticated;
grant execute on function app.erase_cron() to service_role;

-- ---- 5. the schedule — only where pg_cron exists -------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
  if to_regnamespace('cron') is not null then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = $1' using 'erase-queue';
    -- the time limit is in the job's own command: a «set» on the function does not stop a running statement (PG16)
    execute $q$select cron.schedule('erase-queue', '*/15 * * * *', 'set statement_timeout = ''30s''; select app.erase_cron()')$q$;
  end if;
end;
$$;
