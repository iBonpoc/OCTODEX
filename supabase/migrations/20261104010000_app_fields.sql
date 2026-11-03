-- =============================================================================
-- OCTODEX: поля и таблицы, которые нужны приложению волны 1–4 поверх ядра.
-- Сущности из docs/04-domain-model.md: Expense, File, EstimateApproval (подмножество полей).
-- Упрощения (записаны в supabase/README.md):
--   * ChecklistResponse хранится в visits.checklist (jsonb [{id,label,done}]) до шаблонов чек-листов;
--   * подпись клиента — SVG-путь в visits.signature_svg / estimate_approvals.signature_svg (файл PNG/PDF — позже);
--   * jobs.contract_total_cents — сумма договора (итог выбранного варианта), пока её пишет приложение.
-- =============================================================================

alter table public.visits
  add column if not exists scope         text[] not null default '{}',
  add column if not exists checklist     jsonb  not null default '[]'::jsonb,
  add column if not exists signature_svg text;

alter table public.jobs
  add column if not exists contract_total_cents bigint check (contract_total_cents >= 0);

-- ---- Expense ----------------------------------------------------------------
create table public.expenses (
  id               uuid primary key default public.uuid_generate_v7(),
  company_id       uuid not null references public.companies (id),
  date             date not null default current_date,
  vendor           text not null,
  document_number  text,
  amount_cents     bigint not null,
  tax_cents        bigint not null default 0,
  currency         char(3) not null default 'USD',
  category         text not null check (category in ('materials', 'fuel', 'tools', 'dump_fee', 'subcontractor', 'marketing', 'other')),
  job_id           uuid,
  customer_id      uuid,
  receipt_file_id  uuid,
  paid_by          text check (paid_by in ('company_card', 'cash', 'employee_reimburse')),
  idempotency_key  text unique,
  created_offline  boolean not null default false,
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  foreign key (company_id, job_id) references public.jobs (company_id, id),
  foreign key (company_id, customer_id) references public.customers (company_id, id)
);
create index expenses_job_idx on public.expenses (company_id, job_id);

-- ---- File (metadata; binary in Storage bucket "files", path <company_id>/...) --
create table public.files (
  id              uuid primary key default public.uuid_generate_v7(),
  company_id      uuid not null references public.companies (id),
  storage_key     text,
  mime            text,
  size            bigint,
  kind            text not null check (kind in ('photo', 'receipt', 'signature', 'drawing', 'document')),
  job_id          uuid,
  visit_id        uuid,
  stage           text check (stage in ('before', 'during', 'after', 'other')),
  client_visible  boolean not null default true,
  taken_at        timestamptz,
  upload_status   text not null default 'local' check (upload_status in ('local', 'uploading', 'uploaded', 'failed')),
  created_at_device timestamptz, synced_at timestamptz, origin_device_id uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  unique (company_id, id),
  foreign key (company_id, job_id) references public.jobs (company_id, id),
  foreign key (company_id, visit_id) references public.visits (company_id, id)
);
create index files_visit_idx on public.files (company_id, visit_id);

-- ---- EstimateApproval (client decision, signed on site or in the portal) ------
create table public.estimate_approvals (
  id              uuid primary key default public.uuid_generate_v7(),
  company_id      uuid not null references public.companies (id),
  estimate_id     uuid not null,
  version_id      uuid,
  option_id       uuid,
  decision        text not null default 'approved' check (decision in ('approved', 'declined')),
  signer_name     text,
  signature_svg   text,
  esign_consent   boolean not null default false,
  channel         text not null default 'on_site' check (channel in ('on_site', 'portal')),
  signed_at       timestamptz not null default now(),
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz, row_version bigint not null default 1,
  foreign key (company_id, estimate_id) references public.estimates (company_id, id)
);
create trigger t01_append_only before update or delete on public.estimate_approvals
  for each row execute function app.tg_append_only();

do $$
declare t regclass;
begin
  foreach t in array array['public.expenses', 'public.files']::regclass[] loop
    perform app.attach_standard_triggers(t);
  end loop;
end $$;
create trigger t10_service_fields before insert on public.estimate_approvals
  for each row execute function app.tg_service_fields();

-- ---- New company gets the standard lead sources ------------------------------
create or replace function app.tg_company_seed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.lead_sources (company_id, name, kind, is_system)
  values (new.id, 'Google', 'organic', true),
         (new.id, 'Thumbtack', 'paid_per_lead', true),
         (new.id, 'Yelp', 'paid_ads', true),
         (new.id, 'Website', 'organic', true),
         (new.id, 'Referral', 'referral', true),
         (new.id, 'Repeat', 'repeat', true);
  return null;
end;
$$;
create trigger t91_company_seed after insert on public.companies
  for each row execute function app.tg_company_seed();

-- ---- RLS ----------------------------------------------------------------------
alter table public.expenses enable row level security;
alter table public.expenses force row level security;
alter table public.files enable row level security;
alter table public.files force row level security;
alter table public.estimate_approvals enable row level security;
alter table public.estimate_approvals force row level security;

create policy expenses_select on public.expenses for select to authenticated
  using (app.is_staff(company_id) or (app.has_role(company_id, array['tech']) and created_by = (select auth.uid())));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (app.is_member(company_id) and (job_id is null or app.is_staff(company_id) or app.is_job_assignee(job_id)));
create policy expenses_update on public.expenses for update to authenticated
  using (app.is_staff(company_id) or created_by = (select auth.uid()))
  with check (app.is_staff(company_id) or created_by = (select auth.uid()));

create policy files_select on public.files for select to authenticated
  using (app.is_staff(company_id) or (app.has_role(company_id, array['tech'])
         and (created_by = (select auth.uid()) or (visit_id is not null and app.is_visit_assignee(visit_id)))));
create policy files_insert on public.files for insert to authenticated
  with check (app.is_member(company_id));
create policy files_update on public.files for update to authenticated
  using (app.is_staff(company_id) or created_by = (select auth.uid()))
  with check (app.is_staff(company_id) or created_by = (select auth.uid()));

create policy estimate_approvals_select on public.estimate_approvals for select to authenticated
  using (app.is_member(company_id) and app.can_read_estimate(estimate_id));
create policy estimate_approvals_insert on public.estimate_approvals for insert to authenticated
  with check (app.is_member(company_id) and app.can_read_estimate(estimate_id));

revoke all on public.expenses, public.files, public.estimate_approvals from anon, authenticated;
grant select, insert, update on public.expenses, public.files to authenticated;
grant select, insert on public.estimate_approvals to authenticated;

-- ---- Storage bucket for photos, receipts, signatures (path = <company_id>/<file>) --
insert into storage.buckets (id, name, public) values ('files', 'files', false)
on conflict (id) do nothing;
create policy files_bucket_read on storage.objects for select to authenticated
  using (bucket_id = 'files' and app.is_member(((storage.foldername(name))[1])::uuid));
create policy files_bucket_write on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and app.is_member(((storage.foldername(name))[1])::uuid));
