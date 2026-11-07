-- Пуши П3 (docs/specs/27-push.md §4.4–4.5): sending. The queue of П1 (public.push_outbox) is taken by the edge function
-- send-push, which pg_cron wakes once a minute through ONE pg_net call (app.push_kick; no HTTP in any trigger).
-- 1. public.push_claim — takes due rows atomically (skip locked), checks the person again AT SENDING TIME (active member,
--    role, not deleted, the company not closed) and looks up their phones now; old rows (> 24 h) are skipped; rows stuck
--    in «sending» go back to «pending».
-- 2. public.push_finish — sent / retry (pause 2^(n−1) min, after 5 tries failed) / failed; the error is a short code only.
-- 3. public.push_tickets + push_receipts_due / push_receipts_done — Expo receipts after 15 min; DeviceNotRegistered
--    switches the phone off (revoked_reason = 'not_registered').
-- 4. app.push_kick — reads the address and the key of send-push from Vault; no secrets → does nothing.
-- 5. pg_net / pg_cron — created only where they exist (the local test database has neither); schedules without doubles.
-- All new functions: service_role only (rule 18); the queue functions never return text of a push — only ids, kinds,
-- routes and the phones' tokens (the only caller, send-push, needs them).
-- Nothing is renamed or dropped (rule 16); app.purge_push_outbox is replaced in full (body of 20261107090000 + tickets).

-- ---- 1. Tickets of Expo (one per sent message to one phone) -----------------------------------------------------------
create table public.push_tickets (
  ticket_id   text primary key check (ticket_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  outbox_id   uuid not null references public.push_outbox (id) on delete cascade,
  device_id   uuid not null references public.push_devices (id) on delete cascade,
  created_at  timestamptz not null default now(),
  checked_at  timestamptz
);
create index push_tickets_due_idx on public.push_tickets (created_at) where checked_at is null;
create index push_tickets_outbox_idx on public.push_tickets (outbox_id);
create index push_tickets_device_idx on public.push_tickets (device_id);

alter table public.push_tickets enable row level security;
alter table public.push_tickets force row level security;
-- the server only: no rights and no rules for the app's roles; the functions below run as postgres (rules «to postgres»,
-- as push_outbox: they work even without BYPASSRLS)
revoke all on table public.push_tickets from public, anon, authenticated, service_role;
create policy push_tickets_select_server on public.push_tickets for select to postgres
  using (current_user not in ('authenticated', 'anon'));
create policy push_tickets_insert_server on public.push_tickets for insert to postgres
  with check (current_user not in ('authenticated', 'anon'));
create policy push_tickets_update_server on public.push_tickets for update to postgres
  using (current_user not in ('authenticated', 'anon')) with check (current_user not in ('authenticated', 'anon'));
create policy push_tickets_delete_server on public.push_tickets for delete to postgres
  using (current_user not in ('authenticated', 'anon'));

-- ---- 2. Limits ----------------------------------------------------------------------------------------------------------
create or replace function app.push_max_tries() returns integer language sql immutable set search_path = '' as $$ select 5 $$;
revoke all on function app.push_max_tries() from public, anon, authenticated;

-- a short code of an error (as email_outbox.error): never the text of Expo, a token or a name
create or replace function app.push_error_code(p text)
returns text language sql immutable set search_path = '' as $$
  select case when p is null then null when p ~ '^[a-z0-9_.:-]{1,64}$' then p else 'other' end;
$$;
revoke all on function app.push_error_code(text) from public, anon, authenticated;

-- Is the person still someone who gets this push (§4.4: checked again at sending time)? The same rules as the queue
-- (app.push_recipients): an active member, not deleted, not a subcontractor, the role of the kind; the company not closed.
create or replace function app.push_still_recipient(p_row public.push_outbox)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_author uuid;
begin
  if app.company_closed(p_row.company_id) then
    return false;
  end if;
  if p_row.kind = 'estimate.client_signed' then
    select e.owner_user_id into v_author
      from public.notifications n join public.estimates e on e.id = n.estimate_id and e.company_id = n.company_id
     where n.id = p_row.notification_id;
    return p_row.user_id in (select app.push_recipients(p_row.company_id, array['owner', 'admin'], v_author));
  elsif p_row.kind = 'payment.received' then
    return p_row.user_id in (select app.push_recipients(p_row.company_id, array['owner', 'admin'], null));
  else
    -- the kinds of П4 (a visit, a lead): who is assigned is decided when queued; here — still an active member
    return p_row.user_id in (select app.push_recipients(p_row.company_id, array[]::text[], p_row.user_id));
  end if;
end;
$$;
revoke all on function app.push_still_recipient(public.push_outbox) from public, anon, authenticated;

-- ---- 3. Claim ---------------------------------------------------------------------------------------------------------
-- [{id, kind, route, devices: [{device_id, token, lang}]}] — the rows now «sending», tries + 1. next_try_at of a row in
-- «sending» is the moment it was taken (a row taken > 10 min ago and never finished went down with its run).
create or replace function public.push_claim(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r       public.push_outbox;
  v_dev   jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  -- stuck in «sending» (the function died): back to the queue; with no tries left — failed
  update public.push_outbox
     set status = case when tries >= app.push_max_tries() then 'failed' else 'pending' end,
         error = case when tries >= app.push_max_tries() then 'stuck' else error end,
         next_try_at = now()
   where status = 'sending' and next_try_at < now() - interval '10 minutes';
  -- yesterday's payment is noise: a row older than 24 h is not sent
  update public.push_outbox set status = 'skipped', error = 'expired'
   where status = 'pending' and created_at < now() - interval '24 hours';

  for r in
    select * from public.push_outbox
     where status = 'pending' and next_try_at <= now()
     order by next_try_at, id
     limit v_limit
     for update skip locked
  loop
    if not app.push_still_recipient(r) then
      update public.push_outbox set status = 'skipped', error = 'not_member' where id = r.id;
      continue;
    end if;
    -- the phones NOW: after a phone was handed over, the old owner's pushes never reach it
    select jsonb_agg(jsonb_build_object('device_id', d.id, 'token', d.expo_token, 'lang', d.lang) order by d.last_seen_at desc)
      into v_dev
      from public.push_devices d
     where d.user_id = r.user_id and d.revoked_at is null;
    if v_dev is null then
      update public.push_outbox set status = 'skipped', error = 'no_device' where id = r.id;
      continue;
    end if;
    update public.push_outbox set status = 'sending', tries = tries + 1, next_try_at = now(), error = null where id = r.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', r.id, 'kind', r.kind, 'route', r.route, 'devices', v_dev));
  end loop;
  return v_out;
end;
$$;
revoke all on function public.push_claim(integer) from public, anon, authenticated;
grant execute on function public.push_claim(integer) to service_role;

-- ---- 4. Finish --------------------------------------------------------------------------------------------------------
-- p_status: 'sent' (p_tickets = [{ticket_id, device_id}] — only phones of this person are kept), 'retry', 'failed'.
-- Only a row in «sending» changes. Returns the new status (null: the row was not «sending»).
create or replace function public.push_finish(p_id uuid, p_status text, p_tickets jsonb default null, p_error text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  r      public.push_outbox;
  v_new  text;
  v_err  text := app.push_error_code(p_error);
begin
  if p_status is null or p_status not in ('sent', 'retry', 'failed') then
    raise exception 'unknown status' using errcode = '22023';
  end if;
  select * into r from public.push_outbox where id = p_id and status = 'sending' for update;
  if not found then
    return null;
  end if;
  if p_status = 'sent' then
    insert into public.push_tickets (ticket_id, outbox_id, device_id)
    select t.ticket_id, r.id, d.id
      from jsonb_to_recordset(case when jsonb_typeof(p_tickets) = 'array' then p_tickets else '[]'::jsonb end)
           as t(ticket_id text, device_id uuid)
      join public.push_devices d on d.id = t.device_id and d.user_id = r.user_id
     where t.ticket_id ~ '^[A-Za-z0-9_-]{1,64}$'
    on conflict (ticket_id) do nothing;
    update public.push_outbox
       set status = 'sent', sent_at = now(), error = null,
           ticket_ids = (select array_agg(ticket_id order by ticket_id) from public.push_tickets where outbox_id = r.id)
     where id = r.id;
    return 'sent';
  elsif p_status = 'retry' and r.tries < app.push_max_tries() then
    -- 1, 2, 4, 8 min after tries 1..4 (§4.4)
    update public.push_outbox
       set status = 'pending', error = v_err, next_try_at = now() + make_interval(mins => (2 ^ (r.tries - 1))::integer)
     where id = r.id;
    return 'pending';
  else
    v_new := 'failed';
    update public.push_outbox set status = v_new, error = coalesce(v_err, 'failed') where id = r.id;
    return v_new;
  end if;
end;
$$;
revoke all on function public.push_finish(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.push_finish(uuid, text, jsonb, text) to service_role;

-- ---- 5. Receipts ------------------------------------------------------------------------------------------------------
-- [{ticket_id, device_id}] of tickets older than 15 min and not checked. Expo keeps receipts 24 h: older tickets are
-- marked checked without asking.
create or replace function public.push_receipts_due(p_limit integer default 300)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_out jsonb;
begin
  update public.push_tickets set checked_at = now() where checked_at is null and created_at < now() - interval '24 hours';
  select coalesce(jsonb_agg(jsonb_build_object('ticket_id', t.ticket_id, 'device_id', t.device_id) order by t.created_at), '[]'::jsonb)
    into v_out
    from (select ticket_id, device_id, created_at from public.push_tickets
           where checked_at is null and created_at <= now() - interval '15 minutes'
           order by created_at limit greatest(1, least(coalesce(p_limit, 300), 1000))) t;
  return v_out;
end;
$$;
revoke all on function public.push_receipts_due(integer) from public, anon, authenticated;
grant execute on function public.push_receipts_due(integer) to service_role;

-- p_checked — tickets whose receipt came (any status); p_gone — phones Expo says are not registered any more
-- (DeviceNotRegistered, from a receipt or a ticket): they go off and get nothing until the app registers again.
create or replace function public.push_receipts_done(p_checked text[], p_gone uuid[] default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.push_tickets set checked_at = now() where ticket_id = any (coalesce(p_checked, '{}')) and checked_at is null;
  update public.push_devices set revoked_at = now(), revoked_reason = 'not_registered'
   where id = any (coalesce(p_gone, '{}')) and revoked_at is null;
end;
$$;
revoke all on function public.push_receipts_done(text[], uuid[]) from public, anon, authenticated;
grant execute on function public.push_receipts_done(text[], uuid[]) to service_role;

-- ---- 6. Keeping: the body of 20261107090000 plus the tickets (2 days) -------------------------------------------------
create or replace function app.purge_push_outbox()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.push_tickets where created_at < now() - interval '2 days';
  delete from public.push_outbox where created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  -- switched-off phones are kept 30 days too (to see why a push did not come), then go
  delete from public.push_devices where revoked_at < now() - interval '30 days';
  return n;
end;
$$;
revoke all on function app.purge_push_outbox() from public, anon, authenticated;

-- ---- 7. The kick: one HTTP call from pg_cron --------------------------------------------------------------------------
-- The address of send-push and its key live in Vault (push_fn_url, push_fn_key; put there once by the operator,
-- docs/11-setup-guide.md). No Vault, no pg_net or no secrets → false, silently. Errors never print the key.
create or replace function app.push_kick()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_key text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return false;
  end if;
  execute $q$select (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_fn_url' order by s.created_at desc limit 1),
                    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_fn_key' order by s.created_at desc limit 1)$q$
     into v_url, v_key;
  if v_url is null or v_key is null or v_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/' or length(v_key) < 16 then
    return false;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
    using v_url, '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'x-push-key', v_key);
  return true;
exception when others then
  raise warning 'push kick failed: %', sqlstate;
  return false;
end;
$$;
revoke all on function app.push_kick() from public, anon, authenticated;

-- ---- 8. pg_net, pg_cron and the schedules — only where they exist ----------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    if to_regnamespace('extensions') is not null then
      create extension if not exists pg_net with schema extensions;
    else
      create extension if not exists pg_net;
    end if;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
  if to_regnamespace('cron') is not null then
    -- a repeat of this migration never makes a second schedule
    execute 'select cron.unschedule(jobid) from cron.job where jobname = any ($1)' using array['send-push', 'push-purge'];
    execute $q$select cron.schedule('send-push', '* * * * *', 'select app.push_kick()')$q$;
    execute $q$select cron.schedule('push-purge', '17 4 * * *', 'select app.purge_push_outbox()')$q$;
  end if;
end;
$$;
