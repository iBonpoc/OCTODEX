-- Wave 4b-1 «Do not service» (docs/specs/04-clients-and-properties.md §12, PRD CUST-US-13).
-- A client marked do_not_service gets nothing NEW: no job, no estimate, no visit, no sending of an old draft,
-- no move of an estimate or a visit onto them (a job's client is not changed at all — «Работы» t14),
-- no new client link. What is already open stays as it is (jobs, visits, invoices, payments, signed copies).
-- On the move into do_not_service the open (unsigned) estimate links of the client are revoked, so the client sees
-- «link not valid» on /p/ and never reaches a signature that would have to create a job.
-- The app hides the buttons (features/clients.ts canServe); this is the guard for the offline queue, an old build,
-- a second phone. Error: P0001 'customer_do_not_service'.

-- ---- what this migration owns: nothing for anon / authenticated --------------------------------------------------

-- is this client closed for new work? (definer: a tech inserting a visit may not read the client row under RLS)
create or replace function app.customer_no_service(p_company_id uuid, p_customer_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select c.status = 'do_not_service' from public.customers c
                    where c.id = p_customer_id and c.company_id = p_company_id), false)
$$;
revoke all on function app.customer_no_service(uuid, uuid) from public, anon, authenticated;

create or replace function app.tg_no_service_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_customer uuid;
begin
  if tg_table_name = 'visits' then
    if tg_op = 'UPDATE' and (new.job_id, new.lead_id, new.property_id) is not distinct from (old.job_id, old.lead_id, old.property_id) then
      return new;
    end if;
    -- the client of a visit: its job → its lead → its property
    select j.customer_id into v_customer from public.jobs j where j.id = new.job_id and j.company_id = new.company_id;
    if v_customer is null and new.lead_id is not null then
      select l.customer_id into v_customer from public.leads l where l.id = new.lead_id and l.company_id = new.company_id;
    end if;
    if v_customer is null and new.property_id is not null then
      select p.customer_id into v_customer from public.properties p where p.id = new.property_id and p.company_id = new.company_id;
    end if;
  elsif tg_table_name = 'jobs' then
    -- insert only: a direct change of jobs.customer_id is refused by «Работы» (t14, migration 20261106046000)
    v_customer := new.customer_id;
  else -- estimates: a new one, a move to another client, a send (status → sent) or a new client link
    if tg_op = 'UPDATE'
       and new.customer_id is not distinct from old.customer_id
       and not (new.status = 'sent' and old.status is distinct from 'sent')
       and not (new.public_token is not null and old.public_token is null) then
      return new;
    end if;
    v_customer := new.customer_id;
  end if;
  if v_customer is not null and app.customer_no_service(new.company_id, v_customer) then
    raise exception 'customer_do_not_service' using errcode = 'P0001',
      hint = 'the client is marked «do not service»: no new jobs, estimates or visits';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_no_service_guard() from public, anon, authenticated;

-- t44_ sorts after t04_visit_property (fills visits.property_id first) and after t25_estimate_send_and_guard
drop trigger if exists t44_no_service_guard on public.jobs;
create trigger t44_no_service_guard before insert on public.jobs
  for each row execute function app.tg_no_service_guard();
drop trigger if exists t44_no_service_guard on public.estimates;
create trigger t44_no_service_guard before insert or update of customer_id, status, public_token on public.estimates
  for each row execute function app.tg_no_service_guard();
drop trigger if exists t44_no_service_guard on public.visits;
create trigger t44_no_service_guard before insert or update of job_id, lead_id, property_id on public.visits
  for each row execute function app.tg_no_service_guard();

-- the move into do_not_service revokes the client's open, unsigned links (docs/08-security.md «Отзыв»), the same
-- way as public.revoke_estimate_link: the token goes to revoked_link_tokens, the estimate history gets a line.
-- Signed estimates (awaiting_countersign, approved) keep their page: the client was promised their copy there.
create or replace function app.revoke_customer_links(p_company_id uuid, p_customer_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e record;
begin
  for e in select id, company_id, public_token from public.estimates
            where company_id = p_company_id and customer_id = p_customer_id and deleted_at is null
              and public_token is not null and status in ('draft', 'sent', 'viewed', 'declined', 'expired')
            for update
  loop
    insert into public.revoked_link_tokens (token_hash, company_id, estimate_id)
    values (encode(sha256(convert_to(e.public_token, 'UTF8')), 'hex'), e.company_id, e.id)
    on conflict (token_hash) do nothing;
    perform set_config('app.signing_estimate', e.id::text, true);
    update public.estimates set public_token = null, link_revoked_at = now() where id = e.id;
    perform set_config('app.signing_estimate', '', true);
    insert into public.activities (company_id, subject_type, subject_id, kind, body, meta)
    values (e.company_id, 'estimate', e.id, 'edited', 'link revoked', jsonb_build_object('action', 'link_revoked', 'why', 'do_not_service'));
  end loop;
end;
$$;
revoke all on function app.revoke_customer_links(uuid, uuid) from public, anon, authenticated;

create or replace function app.tg_customer_no_service_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'do_not_service' and old.status is distinct from 'do_not_service' then
    perform app.revoke_customer_links(new.company_id, new.id);
  end if;
  return new;
end;
$$;
revoke all on function app.tg_customer_no_service_links() from public, anon, authenticated;
drop trigger if exists t44_customer_no_service_links on public.customers;
create trigger t44_customer_no_service_links after update of status on public.customers
  for each row execute function app.tg_customer_no_service_links();

-- clients marked before this migration: their open links are revoked now (the current base, CLAUDE.md rule 15)
select app.revoke_customer_links(c.company_id, c.id) from public.customers c where c.status = 'do_not_service';
