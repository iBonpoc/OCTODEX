-- Р-7: what the app may write on the company row. The policy companies_update stays (owner, admin — PRD 01 §3: in the
-- settings the admin is the owner's equal; Stripe, closing the company and handing it over stay the owner's and go through
-- the server's functions). Before, the grant covered every column; now the update grant is the columns the app writes —
-- every version of it (every revision of apps/mobile/src: companyToDb, company.save, visit settings), so an old
-- phone's queued «save the settings» is not refused (rule 16). The insert grant: id and name (sign-up writes the name).
-- The rest (numbering, public_slug, tax / gutter settings, deleted_at, checklist_since…) — the server's functions and
-- service_role only.
-- The default lead assignee: only an active member of this company who is not a subcontractor (as app.intake_assignee
-- reads it), checked when the app changes it (a stored one who has since left does not block saving the other settings;
-- the server's own writes — erasing an account — are not stopped).
-- db T431–T432.
-- Rule 18: the trigger function — for nobody.

revoke insert, update on public.companies from anon, authenticated;
grant insert (id, name) on public.companies to authenticated;
grant update (
  name, dba, legal_name, entity_type, phone, email, website,
  address_line1, address_city, address_state, address_zip,
  mailing_address_line1, mailing_address_city, mailing_address_state, mailing_address_zip,
  timezone, doc_language, brand, contract_settings, estimate_settings, payment_settings, onboarding_state,
  lead_default_assignee_id, lead_settings, schedule_settings, business_hours, visit_settings,
  trades -- companyToDb wrote it from ca9d6efe (Wave 7) until ed5d902f (S16, directions): an old phone's queued save
) on public.companies to authenticated;

create or replace function app.tg_company_lead_assignee()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.lead_default_assignee_id is not null
     and (tg_op = 'INSERT' or new.lead_default_assignee_id is distinct from old.lead_default_assignee_id)
     and not exists (select 1 from public.memberships m
                      where m.company_id = new.id and m.user_id = new.lead_default_assignee_id
                        and m.status = 'active' and m.deleted_at is null and m.role <> 'subcontractor') then
    raise exception 'the default lead assignee must be an active member of the company' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_company_lead_assignee() from public, anon, authenticated;
drop trigger if exists t07_company_lead_assignee on public.companies;
create trigger t07_company_lead_assignee before insert or update of lead_default_assignee_id on public.companies
  for each row execute function app.tg_company_lead_assignee();
