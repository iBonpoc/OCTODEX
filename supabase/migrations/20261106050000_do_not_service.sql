-- Wave 4b-1 «Do not service» (docs/specs/04-clients-and-properties.md §12, PRD CUST-US-13).
-- A client marked do_not_service gets nothing NEW: no job, no estimate, no visit, no sending of an old draft,
-- no move of an estimate or a visit onto them (a job's client is not changed at all — «Работы» t14),
-- no new client link. What is already open stays as it is (jobs, visits, invoices, payments, signed copies).
-- On the move into do_not_service the open (unsigned) estimate links of the client are revoked, so the client sees
-- «link not valid» on /p/ and never reaches a signature that would have to create a job.
-- The app hides the buttons (features/clients.ts canServe); this is the guard for the offline queue, an old build,
-- a second phone. Error: P0001 'customer_do_not_service'.

-- ---- what this migration owns: nothing for anon / authenticated --------------------------------------------------

-- the clients of a row among these that are closed for new work. Definer: a tech inserting a visit may not read the
-- client row under RLS. FOR SHARE (security-check 06.11): a send or a new job waits for a mark being set at the same
-- moment, so no link is issued after the mark revoked the client's links.
create or replace function app.no_service_among(p_company_id uuid, p_customer_ids uuid[])
returns uuid[] language sql volatile security definer set search_path = '' as $$
  select coalesce(array_agg(c.id), '{}') from (
    select c.id from public.customers c
     where c.company_id = p_company_id and c.id = any (p_customer_ids) and c.status = 'do_not_service'
       for share
  ) c
$$;
revoke all on function app.no_service_among(uuid, uuid[]) from public, anon, authenticated;

-- every client a row touches: its own client and the owner of its property; for a visit also its job's and lead's
-- (security-check 06.11: all of them, not the first one found — a job of client X at a property of client Y)
create or replace function app.no_service_clients(p_table text, p_company_id uuid, p_customer_id uuid, p_property_id uuid, p_job_id uuid, p_lead_id uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    p_customer_id,
    (select p.customer_id from public.properties p where p.id = p_property_id and p.company_id = p_company_id),
    (select j.customer_id from public.jobs j where p_table = 'visits' and j.id = p_job_id and j.company_id = p_company_id),
    (select l.customer_id from public.leads l where p_table = 'visits' and l.id = p_lead_id and l.company_id = p_company_id)
  ], null)
$$;
revoke all on function app.no_service_clients(text, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function app.tg_no_service_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_new uuid[]; v_old uuid[] := '{}'; v_closed uuid[]; v_fresh boolean;
begin
  -- another company's row: RLS refuses it; no answer here tells whether a client of another company is marked
  -- (the trigger runs as its owner, so «who» is the signed-in user, not current_user)
  if auth.uid() is not null and not app.is_member(new.company_id) then
    return new;
  end if;
  if tg_table_name = 'visits' then
    v_new := app.no_service_clients('visits', new.company_id, null, new.property_id, new.job_id, new.lead_id);
    if tg_op = 'UPDATE' then
      v_old := app.no_service_clients('visits', old.company_id, null, old.property_id, old.job_id, old.lead_id);
    end if;
  else
    v_new := app.no_service_clients(tg_table_name, new.company_id, new.customer_id, new.property_id, null, null);
    if tg_op = 'UPDATE' then
      v_old := app.no_service_clients(tg_table_name, old.company_id, old.customer_id, old.property_id, null, null);
    end if;
  end if;
  -- something new for a client: a new row, a restored one, and for an estimate a send, a revival into the open
  -- statuses, a signature or a new client link. Editing what is open (the same clients) stays allowed.
  v_fresh := tg_op = 'INSERT';
  if not v_fresh then
    v_fresh := old.deleted_at is not null and new.deleted_at is null;
  end if;
  if not v_fresh and tg_table_name = 'estimates' then
    -- (separate statement: plpgsql resolves every field of an expression, and jobs / visits have no status / token here)
    v_fresh := (new.status in ('sent', 'viewed') and old.status not in ('sent', 'viewed'))
            or (new.status in ('awaiting_countersign', 'approved') and old.status is distinct from new.status)
            or (new.public_token is not null and old.public_token is null);
  end if;
  if not v_fresh then
    -- only the clients this update adds (a move onto the client); the clients it already had are open work
    select coalesce(array_agg(x), '{}') into v_new from unnest(v_new) x where not (x = any (v_old));
  end if;
  if cardinality(v_new) = 0 then
    return new;
  end if;
  v_closed := app.no_service_among(new.company_id, v_new);
  if cardinality(v_closed) > 0 then
    raise exception 'customer_do_not_service' using errcode = 'P0001',
      hint = 'the client is marked «do not service»: no new jobs, estimates or visits';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_no_service_guard() from public, anon, authenticated;

-- t44_ sorts after t04_visit_property (fills visits.property_id first) and after t25_estimate_send_and_guard.
-- jobs: a new or restored job; a direct change of jobs.customer_id is refused by «Работы» (t14, 20261106046000),
-- a move of the address onto another client's property is checked here.
drop trigger if exists t44_no_service_guard on public.jobs;
create trigger t44_no_service_guard before insert or update of property_id, deleted_at on public.jobs
  for each row execute function app.tg_no_service_guard();
drop trigger if exists t44_no_service_guard on public.estimates;
create trigger t44_no_service_guard before insert or update of customer_id, property_id, status, public_token, deleted_at on public.estimates
  for each row execute function app.tg_no_service_guard();
drop trigger if exists t44_no_service_guard on public.visits;
create trigger t44_no_service_guard before insert or update of job_id, lead_id, property_id, deleted_at on public.visits
  for each row execute function app.tg_no_service_guard();

-- the move into do_not_service revokes the client's open, unsigned links (docs/08-security.md «Отзыв»), the same
-- way as public.revoke_estimate_link: the token goes to revoked_link_tokens, the estimate history gets a line.
-- Signed estimates (awaiting_countersign, approved) keep their page: the client was promised their copy there.
create or replace function app.revoke_customer_links(p_company_id uuid, p_customer_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e record;
begin
  for e in select id, company_id, public_token from public.estimates
            where company_id = p_company_id and customer_id = p_customer_id   -- also deleted ones: a restore must not bring a link back
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
