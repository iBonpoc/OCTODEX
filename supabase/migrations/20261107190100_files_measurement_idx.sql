-- M5d (20261107190000): indexes of the new keys of public.files (a big table) — built CONCURRENTLY, phones keep writing.
-- !! This file holds ONLY `create index concurrently` statements (supabase db push runs it outside a transaction).
-- Partial «… IS NOT NULL»: almost every file is a visit's, not a measurement's (T61 accepts this form for a key).
create index concurrently if not exists files_measurement_id_company_id_fk_idx on public.files (measurement_id, company_id) where measurement_id is not null;
create index concurrently if not exists files_element_id_measurement_id_company_id_fk_idx on public.files (element_id, measurement_id, company_id) where element_id is not null;
