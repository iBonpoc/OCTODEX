-- Lead intake (docs/specs/34 §3): one lead per provider's lead id in a company — a webhook replay with a new event key
-- does not make a second lead of the same Thumbtack / LSA lead. leads is big (rule 16): concurrently, in a file of its own.
-- !! This file holds ONLY `create index concurrently` statements (supabase db push runs it outside a transaction).
create unique index concurrently if not exists leads_provider_ref_idx on public.leads (company_id, provider, provider_ref) where provider_ref is not null and deleted_at is null;
