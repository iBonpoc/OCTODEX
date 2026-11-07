-- C1 (docs/specs/33-gutters-module.md §1 S0b, §4, П2.1 K6; founder О1–О2, 07.11.2026): add-on modules of a company.
-- A row per (company, module): switched on, 7-day trial, paid until, the module's settings.
-- Founder О2: after the trial without payment NOTHING of the module is saved — app.module_active() is false and every
-- module table and function checks it on the server, not only the app.
-- Nothing is renamed or dropped (rule 16 step 1): companies.gutter_settings is copied here; it is dropped in a later PR,
-- after no app version reads it (it never did: the app has no reader of gutter_settings).

create table public.company_modules (
  company_id    uuid not null references public.companies (id) on delete cascade,
  module_key    text not null check (module_key ~ '^[a-z][a-z0-9_]{1,30}$'),
  enabled       boolean not null default false,
  -- set once, on the first switch-on; switching off and on again never restarts the trial
  trial_ends_at timestamptz,
  -- set by the operator / billing only (step «Оплаты», K5); null = not paid
  paid_until    timestamptz,
  settings      jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  row_version   integer not null default 1,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  primary key (company_id, module_key)
);

-- a row never moves to another company (T59 guard)
create trigger t11_company_id_immutable before update on public.company_modules
  for each row execute function app.tg_company_id_immutable();

alter table public.company_modules enable row level security;
alter table public.company_modules force row level security;
revoke all on public.company_modules from anon, authenticated;
-- members read their company's modules; nobody writes the table directly: only the functions below
grant select on public.company_modules to authenticated;
create policy company_modules_select on public.company_modules for select to authenticated
  using (app.is_member(company_id));

-- rule 16 step 1: carry the old per-company gutter settings over (switched off; the owner switches the module on)
insert into public.company_modules (company_id, module_key, enabled, settings)
select id, 'gutters', false, gutter_settings
  from public.companies
 where gutter_settings is not null and gutter_settings <> '{}'::jsonb
on conflict do nothing;

-- Is the module usable now: switched on, and in its trial or paid. Module tables call this in their RLS rules.
create or replace function app.module_active(p_company_id uuid, p_module_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_modules cm
     where cm.company_id = p_company_id
       and cm.module_key = p_module_key
       and cm.enabled
       and (cm.trial_ends_at > now() or cm.paid_until > now())
  );
$$;
-- rule 18: called from RLS rules and by the signed-in app (to show «Подключить»); never by anon
revoke all on function app.module_active(uuid, text) from public, anon, authenticated;
grant execute on function app.module_active(uuid, text) to authenticated, service_role;

-- Owner / admin switches a module on. The first time it starts the 7-day trial (founder О2).
create or replace function public.module_enable(p_company_id uuid, p_module_key text)
returns public.company_modules language plpgsql security definer set search_path = '' as $$
declare r public.company_modules;
begin
  if auth.uid() is null or not app.has_role(p_company_id, array['owner', 'admin']) then
    raise exception 'only the owner or an admin switches modules' using errcode = '42501';
  end if;
  insert into public.company_modules (company_id, module_key, enabled, trial_ends_at, updated_by)
  values (p_company_id, p_module_key, true, now() + interval '7 days', auth.uid())
  on conflict (company_id, module_key) do update
     set enabled = true,
         trial_ends_at = coalesce(public.company_modules.trial_ends_at, excluded.trial_ends_at),
         row_version = public.company_modules.row_version + 1,
         updated_at = now(),
         updated_by = auth.uid()
  returning * into r;
  return r;
end;
$$;
revoke all on function public.module_enable(uuid, text) from public, anon, authenticated;
grant execute on function public.module_enable(uuid, text) to authenticated;

-- Owner / admin switches a module off: nothing is deleted, old estimates and drafts stay readable.
create or replace function public.module_disable(p_company_id uuid, p_module_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app.has_role(p_company_id, array['owner', 'admin']) then
    raise exception 'only the owner or an admin switches modules' using errcode = '42501';
  end if;
  update public.company_modules
     set enabled = false, row_version = row_version + 1, updated_at = now(), updated_by = auth.uid()
   where company_id = p_company_id and module_key = p_module_key;
end;
$$;
revoke all on function public.module_disable(uuid, text) from public, anon, authenticated;
grant execute on function public.module_disable(uuid, text) to authenticated;

-- Owner / admin saves the module's settings. Only while the module is active (founder О2: after the trial nothing is
-- saved). p_base_row_version: the version the phone edited; a newer one on the server is a conflict, nothing is lost
-- silently (spec 33 K9) — the app re-reads and shows both.
create or replace function public.module_save_settings(p_company_id uuid, p_module_key text, p_settings jsonb, p_base_row_version integer)
returns public.company_modules language plpgsql security definer set search_path = '' as $$
declare r public.company_modules;
begin
  if auth.uid() is null or not app.has_role(p_company_id, array['owner', 'admin']) then
    raise exception 'only the owner or an admin changes module settings' using errcode = '42501';
  end if;
  if not app.module_active(p_company_id, p_module_key) then
    raise exception 'module % is not active: trial ended or switched off', p_module_key using errcode = 'P0001', hint = 'module_inactive';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'settings must be an object' using errcode = '22023';
  end if;
  update public.company_modules
     set settings = p_settings, row_version = row_version + 1, updated_at = now(), updated_by = auth.uid()
   where company_id = p_company_id and module_key = p_module_key and row_version = p_base_row_version
  returning * into r;
  if r is null then
    raise exception 'module settings changed by someone else' using errcode = '40001', hint = 'row_version_conflict';
  end if;
  return r;
end;
$$;
revoke all on function public.module_save_settings(uuid, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.module_save_settings(uuid, text, jsonb, integer) to authenticated;
