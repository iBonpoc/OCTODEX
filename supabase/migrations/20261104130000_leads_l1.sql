-- Leads wave L1 (docs/14-leads-spec.md §2.1, §3.2, §13 Р9–Р15): lead number, interest, snooze, call attempts,
-- reminder and archive marks. No new lead status: "snoozed" and "archived" are fields, so the funnel stays honest.

-- 1. Lead number L-0001: assigned by the server, its own counter per company (like EST/INV).
alter table app.company_numbering drop constraint if exists company_numbering_doc_type_check;
alter table app.company_numbering add constraint company_numbering_doc_type_check
  check (doc_type in ('estimate', 'job', 'invoice', 'receipt', 'purchase_order', 'change_order', 'lead'));

alter table public.leads add column if not exists number text;

-- existing leads get numbers in the order they arrived. Triggers are off for this one update so it does not
-- stamp updated_at (the app reads it as "last activity") or bump row_version on every old lead.
alter table public.leads disable trigger user;
do $$
declare r record;
begin
  for r in select id, company_id from public.leads where number is null order by company_id, received_at, created_at loop
    update public.leads set number = app.next_document_number(r.company_id, 'lead', 'L') where id = r.id;
  end loop;
end $$;
alter table public.leads enable trigger user;

drop trigger if exists t20_number on public.leads;
create trigger t20_number before insert or update on public.leads
  for each row execute function app.tg_assign_number('lead', 'L');

create unique index if not exists leads_company_number_uq on public.leads (company_id, number) where number is not null;

-- 2. Marks on the lead.
alter table public.leads
  add column if not exists interest       text check (interest in ('hot', 'warm', 'cold')),
  add column if not exists snoozed_until  timestamptz,
  add column if not exists snooze_reason  text,
  add column if not exists call_attempts  integer not null default 0 check (call_attempts >= 0),
  add column if not exists reminded_at    timestamptz,
  add column if not exists ask_again_at   timestamptz,
  add column if not exists archived_at    timestamptz;

-- a lead is snoozed only while it is open (unanswered-call attempts are reset by tg_lead_first_response below)
create or replace function app.tg_lead_snooze_open()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status in ('won', 'lost', 'declined', 'archived') then
    new.snoozed_until := null;
    new.snooze_reason := null;
  end if;
  return new;
end;
$$;
drop trigger if exists t30_lead_snooze_open on public.leads;
create trigger t30_lead_snooze_open before update on public.leads
  for each row execute function app.tg_lead_snooze_open();

-- 3. Lead settings of the company (docs/14 §6.1); the app falls back to defaults for missing keys.
alter table public.companies add column if not exists lead_settings jsonb not null default '{}'::jsonb;

-- 4. A call is a conversation only if someone answered (docs/14 §13 Р13). An unanswered call or a voicemail
--    (activities.meta.outcome = no_answer | voicemail) counts as an attempt: the reply timer keeps running.
create or replace function app.tg_lead_first_response()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_missed boolean := new.kind = 'call' and coalesce(new.meta ->> 'outcome', 'answered') in ('no_answer', 'voicemail');
begin
  if new.subject_type = 'lead' and new.kind in ('call', 'sms', 'email', 'marketplace', 'reply') and coalesce(new.direction, 'out') = 'out' then
    if v_missed then
      update public.leads
         set call_attempts = call_attempts + 1,
             last_outbound_at = greatest(coalesce(last_outbound_at, new.at), new.at)
       where id = new.subject_id and company_id = new.company_id;
    else
      update public.leads
         set first_response_at = coalesce(first_response_at, new.at),
             first_response_kind = coalesce(first_response_kind, case when new.kind = 'reply' then 'manual' else new.kind end),
             last_outbound_at = greatest(coalesce(last_outbound_at, new.at), new.at),
             call_attempts = 0,
             status = case when status = 'new' then 'contacted' else status end
       where id = new.subject_id and company_id = new.company_id;
    end if;
  end if;
  return null;
end;
$$;
