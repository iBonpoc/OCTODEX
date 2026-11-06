-- Wave 7б-1 (docs/specs/03 §12): personal settings of a person in a company, the same on every device.
-- One row per membership; typed columns are the white list of what can be stored. The person reads only their own row;
-- writes go through public.set_my_prefs (security definer, only for yourself, only in a company you are an active member of):
-- a plain upsert would need the right to write company_id / user_id.

create table public.member_prefs (
  company_id     uuid not null,
  user_id        uuid not null,
  plan_show_done boolean not null default false,
  updated_at     timestamptz not null default now(),
  primary key (company_id, user_id),
  foreign key (company_id, user_id) references public.memberships (company_id, user_id) on delete cascade
);

alter table public.member_prefs enable row level security;
alter table public.member_prefs force row level security;
revoke all on public.member_prefs from anon, authenticated;
grant select on public.member_prefs to authenticated;

create policy member_prefs_select on public.member_prefs for select to authenticated
  using (user_id = (select auth.uid()) and app.is_member(company_id));

create or replace function public.set_my_prefs(p_company_id uuid, p_plan_show_done boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_company_id is null or not app.is_member(p_company_id) then
    raise exception 'only a member sets their own settings' using errcode = '42501';
  end if;
  insert into public.member_prefs (company_id, user_id, plan_show_done, updated_at)
  values (p_company_id, auth.uid(), coalesce(p_plan_show_done, false), now())
  on conflict (company_id, user_id) do update set plan_show_done = excluded.plan_show_done, updated_at = excluded.updated_at;
end $$;

revoke all on function public.set_my_prefs(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_my_prefs(uuid, boolean) to authenticated;
