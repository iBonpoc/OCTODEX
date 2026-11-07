-- Пуши, напоминания о лиде (docs/specs/27 §4.10; security-check #305 №2): the reminders run every minute and must not
-- read all leads or all pushes. leads and push_outbox are big tables (rule 16): concurrently, in a file of its own.
-- !! This file holds ONLY `create index concurrently` statements (supabase db push runs it outside a transaction).
create index concurrently if not exists leads_unanswered_idx on public.leads (received_at) where status = 'new' and first_response_at is null and deleted_at is null and archived_at is null;
create index concurrently if not exists push_outbox_source_idx on public.push_outbox (source_id, kind, user_id) where source_id is not null;
