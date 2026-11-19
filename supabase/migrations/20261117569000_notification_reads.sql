-- Р-8b: each person has their own «read» on the bell. Until now one column notifications.read_at served the whole company:
-- sales opening the bell put out «задаток оплачен» for the owner and the office, one dispatcher put it out for the other.
--   1. public.notification_reads (notification, person): a row = this person has read it. Only one's own rows are seen and
--      written, only for a notification one sees (notifications_select); the server sets who, the company and the time.
--   2. The moment of the split, a constant of this migration: public.notifications_split_at(). A notification the company
--      read before it (read_at before the split) stays read for everyone, so nothing lights up again after the update;
--      read_at written after it is an old build's and lights nothing out for the others.
--   3. Rule 16, step 1: read_at stays. Old builds keep writing it, now owner, admin and office only (an old sales build's
--      mark goes to 0 rows, no refusal); its value is the server's time (now()) and never back to null.
--      Step 2 (read_at is not written or read) — a separate PR when no old build is left.
-- Rule 18: the new functions — revoke, then execute to authenticated where the app calls them; the trigger functions — for
-- nobody. The app marks through public.mark_notifications_read (1). A deleted account's marks are erased with its other own rows (app.erase_personal_rows, 4). App: cloud/ops.ts
-- notice.read, cloud/repo.ts (noticeRead). Test T435.

-- 1 ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id         uuid not null default auth.uid(),
  company_id      uuid not null references public.companies (id),
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);
create index if not exists notification_reads_company_user_idx on public.notification_reads (company_id, user_id);

-- who, the company and the time are the server's (the app sends the notification's id and its company)
create or replace function app.tg_notification_read_fill()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.user_id := auth.uid();
  end if;
  new.company_id := coalesce((select n.company_id from public.notifications n where n.id = new.notification_id), new.company_id);
  new.read_at := now();
  return new;
end;
$$;
revoke all on function app.tg_notification_read_fill() from public, anon, authenticated;
drop trigger if exists t10_notification_read_fill on public.notification_reads;
create trigger t10_notification_read_fill before insert on public.notification_reads
  for each row execute function app.tg_notification_read_fill();
-- (no update is granted; the company of a mark never changes all the same — every table with company_id)
drop trigger if exists t11_company_id_immutable on public.notification_reads;
create trigger t11_company_id_immutable before update on public.notification_reads
  for each row execute function app.tg_company_id_immutable();

alter table public.notification_reads enable row level security;
alter table public.notification_reads force row level security;
create policy notification_reads_select on public.notification_reads for select to authenticated
  using (user_id = (select auth.uid()));
-- the notification is looked up under the caller's own read rule (notifications_select): not one he does not see
create policy notification_reads_insert on public.notification_reads for insert to authenticated
  with check (user_id = (select auth.uid()) and app.is_member(company_id)
              and exists (select 1 from public.notifications n where n.id = notification_reads.notification_id
                                                                   and n.company_id = notification_reads.company_id));

revoke all on public.notification_reads from anon, authenticated;
grant select on public.notification_reads to authenticated;
grant insert (notification_id, company_id) on public.notification_reads to authenticated;

-- what the app calls (cloud/ops.ts notice.read): my marks for the notices I see; an id the server does not know (a notice
-- made on the phone), one removed or no longer visible is left out quietly — the others are marked, nothing is refused.
-- Invoker: the notices are read, and the marks written, under the caller's own rules.
create or replace function public.mark_notifications_read(p_ids uuid[])
returns void language sql security invoker set search_path = '' as $$
  insert into public.notification_reads (notification_id, company_id)
  select n.id, n.company_id from public.notifications n where n.id = any (coalesce(p_ids, '{}'::uuid[]))
  on conflict (notification_id, user_id) do nothing;
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon, authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- 2 ---------------------------------------------------------------------------------------------------------------------
do $do$
begin
  execute format($f$create or replace function public.notifications_split_at()
    returns timestamptz language sql immutable set search_path = '' as $b$ select %L::timestamptz $b$ $f$, now());
end;
$do$;
revoke all on function public.notifications_split_at() from public, anon, authenticated;
grant execute on function public.notifications_split_at() to authenticated;

-- 3 ---------------------------------------------------------------------------------------------------------------------
-- the shared column so far was the phone's clock: a mark «from the future» (a phone ahead) would count as written after
-- the split and light up again — such marks take the server's time first (few rows; the trigger below is not there yet)
update public.notifications set read_at = now() where read_at > now();
alter policy notifications_update on public.notifications
  using (app.has_role(company_id, array['owner', 'admin', 'office']))
  with check (app.has_role(company_id, array['owner', 'admin', 'office']));

-- an old build's mark: the server's time, and a read notification is not made unread again
create or replace function app.tg_notification_read_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.read_at := case when new.read_at is null then old.read_at else coalesce(old.read_at, now()) end;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_notification_read_at() from public, anon, authenticated;
drop trigger if exists t10_notification_read_at on public.notifications;
create trigger t10_notification_read_at before update of read_at on public.notifications
  for each row execute function app.tg_notification_read_at();

-- 4 ---------------------------------------------------------------------------------------------------------------------
-- a deleted account's «read» marks go with the person's other own rows (the same function, its signature and rights kept;
-- the body of 20261107110000 plus one line)
create or replace function app.erase_personal_rows(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.member_prefs where user_id = p_user;
  delete from public.user_locations where user_id = p_user;
  -- Пуши П1: no phone of a deleted person gets anything again; queued pushes to them go too
  -- the lock of register_push_device: a registration running now finishes first, a later one sees the account deleted
  perform pg_advisory_xact_lock(hashtext('push_devices:' || p_user::text));
  delete from public.push_devices where user_id = p_user;
  delete from public.push_outbox where user_id = p_user;
  -- Пуши П4: the person's switches go too
  delete from public.push_prefs where user_id = p_user;
  -- Р-8b: the person's own «read» marks on the bell (notification_reads, 20261117569000)
  delete from public.notification_reads where user_id = p_user;
  -- the deletion must really have erased them (security-check П1 №2): else the whole account deletion rolls back
  if exists (select 1 from public.push_devices where user_id = p_user) or exists (select 1 from public.push_outbox where user_id = p_user)
     or exists (select 1 from public.push_prefs where user_id = p_user) then
    raise exception 'push rows of the person were not erased' using errcode = '42501';
  end if;
  -- the owner guard (110000) checks a switched-off owner row as if the role changed; this is the system erasing the
  -- person's own mark, as delete_account's own memberships update does (security-check 7б-2: else the deletion rolls back)
  perform set_config('app.accepting_invite', 'on', true);
  update public.memberships set location_notice_ack_at = null where user_id = p_user and location_notice_ack_at is not null;
  perform set_config('app.accepting_invite', '', true);
end;
$$;
revoke all on function app.erase_personal_rows(uuid) from public, anon, authenticated;
