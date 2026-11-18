-- #2097 (founder 18.11, audit #2004 КЛ-09): «Позже» in «Разбор дел» puts a reason off until a chosen day, for the whole
-- company (one triage for the office, the same on every phone), and it comes back by itself on that day.
--
-- public.attention_snoozes — one row per (company, reason): item_id is the id of the app's reason (buildAttention:
-- «sch-<job>», «done-<job>», «noinv-<job>»…, stable for the same subject and kind); until = when it comes back; null = lifted
-- («Отменить», or put back). No delete: lifting writes until = null, so a repeat from the offline queue and two phones
-- writing at once end in one row — the last write wins.
--
-- Writes go through public.snooze_attention (security definer): only who sees «Разбор дел» (the office: owner, admin,
-- office, sales — app.is_staff, the same people as the app's triage tab), only in their own company; «by» and updated_at are
-- the server's (auth.uid(), now()), never sent by the phone. Reading: the same people, their company only.
-- rule 18: revoke from everyone, then select / execute for authenticated only.

create table public.attention_snoozes (
  company_id  uuid not null references public.companies (id) on delete cascade,
  item_id     text not null check (length(item_id) between 1 and 200),
  until       timestamptz,
  by          uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  primary key (company_id, item_id)
);

-- a row never moves to another company (as every table with company_id, T-check «company_id immutable»)
create trigger t11_company_id_immutable before update on public.attention_snoozes
  for each row execute function app.tg_company_id_immutable();

alter table public.attention_snoozes enable row level security;
alter table public.attention_snoozes force row level security;
revoke all on public.attention_snoozes from public, anon, authenticated;
grant select on public.attention_snoozes to authenticated;

create policy attention_snoozes_select on public.attention_snoozes for select to authenticated
  using (app.is_staff(company_id));
-- the writes of snooze_attention pass force RLS by these rules too (as member_prefs): nobody has insert / update rights on
-- the table, so the rules open nothing to a client
create policy attention_snoozes_insert on public.attention_snoozes for insert
  with check (app.is_staff(company_id));
create policy attention_snoozes_update on public.attention_snoozes for update
  using (app.is_staff(company_id))
  with check (app.is_staff(company_id));

create or replace function public.snooze_attention(p_company_id uuid, p_item_id text, p_until timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_company_id is null or not app.is_staff(p_company_id) then
    raise exception 'only the office puts a reason off' using errcode = '42501';
  end if;
  if p_item_id is null or length(p_item_id) not between 1 and 200 then
    raise exception 'item_id: 1 to 200 characters' using errcode = '22023';
  end if;
  insert into public.attention_snoozes (company_id, item_id, until, by, updated_at)
  values (p_company_id, p_item_id, p_until, auth.uid(), now())
  on conflict (company_id, item_id) do update set until = excluded.until, by = excluded.by, updated_at = excluded.updated_at;
end $$;

revoke all on function public.snooze_attention(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.snooze_attention(uuid, text, timestamptz) to authenticated;
