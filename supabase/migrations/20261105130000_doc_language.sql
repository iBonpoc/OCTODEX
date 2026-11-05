-- Client language (founder's rule 05.11.2026, docs/specs/07-estimates.md §2.1): what goes to a client (estimate PDF,
-- invoice, receipt, the /p/ page, SMS and email texts) is in the client's language, not the app's. The order:
-- person → client (its main person) → lead → company. This is the company's default for clients: English in the US.
-- A person's language is contacts.preferred_language; a lead's is leads.language. Client languages: English, Spanish,
-- Russian (founder's decision В11, 05.11.2026).
alter table public.companies add column if not exists doc_language text not null default 'en';
alter table public.companies drop constraint if exists companies_doc_language_check;
alter table public.companies add constraint companies_doc_language_check check (doc_language in ('en', 'es', 'ru'));
alter table public.contacts drop constraint if exists contacts_preferred_language_check;
alter table public.contacts add constraint contacts_preferred_language_check check (preferred_language in ('en', 'es', 'ru'));
alter table public.leads drop constraint if exists leads_language_check;
alter table public.leads add constraint leads_language_check check (language in ('en', 'es', 'ru'));
