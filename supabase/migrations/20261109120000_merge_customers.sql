-- Step 17 C3: duplicate clients and their merge (docs/specs/04 §13, map S3d).
-- * customers.not_duplicate_ids — «not a duplicate»: the pair is not shown (written by the office with a plain update).
-- * public.merge_customers(p_keep, p_drop) — one transaction, owner / admin only: everything of the second client moves to
--   the kept one (people with a shared phone / email become one person, as app.move_lead_people), the second becomes
--   archived + merged_into_customer_id. A repeat of the same merge changes nothing; numbers and amounts never change.
-- * The guards of invoices, payments, signed estimates and «do not service» let through only that exact change
--   (customer_id B → A) and only inside this function: app.merging_customer() checks a one-time row of
--   app.customer_merge_runs (no one but this function writes it) for this very transaction; a flag alone is not enough.
-- * t01_follow_merged_customer: a row an old phone still sends for the merged client lands on the kept one (rule 16).
-- Rule 16: only added (a column, a table, functions, triggers); the redefined guards keep every check they had.

alter table public.customers add column if not exists not_duplicate_ids uuid[] not null default '{}';

create table if not exists app.customer_merge_runs (
  id         uuid primary key default public.uuid_generate_v7(),
  drop_id    uuid not null,
  keep_id    uuid not null,
  txid       bigint not null default txid_current(),
  at         timestamptz not null default now()
);
revoke all on app.customer_merge_runs from public, anon, authenticated;

-- true only inside merge_customers of this transaction, for exactly the pair it moves
create or replace function app.merging_customer(p_old uuid, p_new uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_old is not null and p_new is not null and exists (
    select 1 from app.customer_merge_runs r
     where r.id = nullif(current_setting('app.merging_customer', true), '')::uuid
       and r.drop_id = p_old and r.keep_id = p_new and r.txid = txid_current());
$$;
revoke all on function app.merging_customer(uuid, uuid) from public, anon, authenticated;

/* ---------- guards: the same checks, plus the one merge change ---------- */

create or replace function app.tg_invoice_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_recalc boolean := coalesce(current_setting('app.invoice_recalc', true), '') = 'on'
                      and current_user not in ('authenticated', 'anon');
  v_merge boolean := false;
begin
  if tg_op = 'INSERT' then
    new.paid_cents := 0;
    new.payment_status := 'unpaid';
    if new.status = 'void' then
      raise exception 'invoice cannot be created void' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- the client merge (merge_customers): only customer_id B → A, only inside that function (S3d)
  if new.customer_id is distinct from old.customer_id and current_user not in ('authenticated', 'anon') then
    v_merge := app.merging_customer(old.customer_id, new.customer_id);
  end if;

  if not v_recalc then                    -- a direct change, not the recalc from payments
    new.paid_cents := old.paid_cents;
    new.payment_status := old.payment_status;
  end if;

  if old.status = 'void' and not v_merge then
    raise exception 'void invoice % is immutable', old.number using errcode = '42501';
  end if;

  if not v_recalc then
    if old.status <> 'draft' and (
         new.subtotal_cents is distinct from old.subtotal_cents
      or new.discount_cents is distinct from old.discount_cents
      or new.tax_cents      is distinct from old.tax_cents
      or new.total_cents    is distinct from old.total_cents
      or new.tax_enabled    is distinct from old.tax_enabled
      or new.tax_rate_id    is distinct from old.tax_rate_id
      or new.tax_rate_bps   is distinct from old.tax_rate_bps
      or new.tax_profile_id is distinct from old.tax_profile_id
      or new.tax_mode       is distinct from old.tax_mode
      or new.include_purchase_tax_in_cost is distinct from old.include_purchase_tax_in_cost
      or new.currency       is distinct from old.currency
      or (new.customer_id   is distinct from old.customer_id and not v_merge)
      or new.job_id         is distinct from old.job_id
      or new.kind           is distinct from old.kind
      or new.source_estimate_version_id is distinct from old.source_estimate_version_id
      or new.revision       is distinct from old.revision
      or (old.sent_at is not null and new.sent_at is distinct from old.sent_at)) then
      raise exception 'invoice % is sent: its amounts do not change (void it and issue a new one)', old.number
        using errcode = '42501';
    end if;
    if new.total_cents is distinct from old.total_cents and new.total_cents < old.paid_cents then
      raise exception 'invoice % total % is below what is paid %', old.number, new.total_cents, old.paid_cents
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status = 'void' and old.status <> 'void' then
    if auth.uid() is not null and not app.has_role(new.company_id, array['owner', 'admin']) then
      raise exception 'only owner/admin can void an invoice' using errcode = '42501';
    end if;
    if old.paid_cents <> 0 or exists (
         select 1 from public.payments p
         where p.invoice_id = old.id and p.status in ('pending', 'succeeded', 'partially_refunded')
           and p.amount_cents - p.refunded_cents > 0) then
      raise exception 'invoice % has payments; refund or move to credit before void', old.number
        using errcode = 'check_violation';
    end if;
    new.voided_at := coalesce(new.voided_at, now());
    new.voided_by := coalesce(auth.uid(), new.voided_by);
  end if;
  return new;
end;
$$;

create or replace function app.tg_estimate_send_and_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_days int; v_tz text; v_merge boolean := false;
begin
  -- security-check 05.11: the two signing statuses are set only by the signing functions — never by a direct
  -- insert or update from the app or the page. Two conditions together: the call runs inside a security definer
  -- function (current_user is its owner, not authenticated / anon) AND that function marked this very estimate
  -- (app.signing_estimate). The flag alone is settable by anyone; the role alone lets any other definer through.
  if (tg_op = 'INSERT' and new.status <> 'draft' and current_user in ('authenticated', 'anon')) then
    raise exception 'a new estimate starts as a draft' using errcode = '42501';
  end if;
  if new.status in ('awaiting_countersign', 'approved')
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and (current_user in ('authenticated', 'anon')
          or coalesce(current_setting('app.signing_estimate', true), '') <> new.id::text) then
    raise exception 'only a signature moves an estimate to % (portal_accept / sign_estimate_on_site / countersign_estimate)', new.status
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.customer_id is distinct from old.customer_id and current_user not in ('authenticated', 'anon') then
    -- the client merge (merge_customers, S3d): a signed estimate moves to the kept client and nothing else changes
    v_merge := app.merging_customer(old.customer_id, new.customer_id);
  end if;
  if tg_op = 'UPDATE' and (current_user in ('authenticated', 'anon')
                           or coalesce(current_setting('app.signing_estimate', true), '') <> new.id::text) then
    -- what the client signed is frozen: the client, the place, the lead and the versions (security-check 05.11)
    if old.status in ('awaiting_countersign', 'approved')
       and (case when v_merge then old.customer_id else new.customer_id end, new.property_id, new.lead_id, new.sent_version_id, new.current_version_id)
           is distinct from (old.customer_id, old.property_id, old.lead_id, old.sent_version_id, old.current_version_id) then
      raise exception 'a signed estimate keeps its client, property, lead and versions' using errcode = '42501';
    end if;
    -- the link (token, valid until, revoke) changes only through send_estimate / revoke_estimate_link
    if (new.public_token, new.link_revoked_at) is distinct from (old.public_token, old.link_revoked_at)
       or (new.expires_at is distinct from old.expires_at and not (new.status = 'sent' and old.status in ('draft', 'expired'))) then
      raise exception 'the client link changes only through send_estimate / revoke_estimate_link' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' and new.public_token is not null and current_user in ('authenticated', 'anon') then
    raise exception 'the client link is made by send_estimate' using errcode = '42501';
  end if;
  -- every send of a new version gets a fresh "valid until" (founder: extend = send again with a new date)
  if tg_op = 'UPDATE' and new.status = 'sent' and old.status is distinct from 'sent' and old.status in ('draft', 'expired') then
    select coalesce(nullif(estimate_settings ->> 'valid_days', '')::int, 7), timezone into v_days, v_tz
      from public.companies where id = new.company_id;
    new.expires_at := (now() at time zone coalesce(v_tz, 'America/Los_Angeles'))::date + greatest(v_days, 1);
  end if;
  return new;
end;
$$;

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
    -- the client merge (merge_customers, S3d): moving B's open work onto a kept client marked «do not service» is not
    -- «new work» — the same jobs and estimates, now under one card (the mark stays and keeps stopping new ones)
    if tg_op = 'UPDATE' and new.customer_id is distinct from old.customer_id
       and app.merging_customer(old.customer_id, new.customer_id) then
      return new;
    end if;
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

/* ---------- an old phone that does not know about the merge ---------- */

create or replace function app.tg_follow_merged_customer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_to uuid; v_n int := 0;
begin
  if tg_op = 'UPDATE' and new.customer_id is not distinct from old.customer_id then
    return new;
  end if;
  loop
    exit when new.customer_id is null or v_n >= 10;
    select c.merged_into_customer_id into v_to from public.customers c
     where c.id = new.customer_id and c.company_id = new.company_id;
    exit when v_to is null;
    new.customer_id := v_to;
    v_n := v_n + 1;
  end loop;
  if v_n > 0 and tg_table_name = 'contacts' then
    -- the kept client already has its main person: the moved one joins as another person
    if exists (select 1 from public.contacts c where c.customer_id = new.customer_id and c.is_primary and c.deleted_at is null
                and c.id <> new.id) then
      new.is_primary := false;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.tg_follow_merged_customer() from public, anon, authenticated;

create or replace function app.tg_follow_merged_subject()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_to uuid; v_n int := 0;
begin
  if new.subject_type <> 'customer' or (tg_op = 'UPDATE' and new.subject_id is not distinct from old.subject_id) then
    return new;
  end if;
  loop
    exit when v_n >= 10;
    select c.merged_into_customer_id into v_to from public.customers c
     where c.id = new.subject_id and c.company_id = new.company_id;
    exit when v_to is null;
    new.subject_id := v_to;
    v_n := v_n + 1;
  end loop;
  return new;
end;
$$;
revoke all on function app.tg_follow_merged_subject() from public, anon, authenticated;

create or replace trigger t01_follow_merged_customer before insert or update of customer_id on public.contacts
  for each row execute function app.tg_follow_merged_customer();
create or replace trigger t01_follow_merged_customer before insert or update of customer_id on public.properties
  for each row execute function app.tg_follow_merged_customer();
create or replace trigger t01_follow_merged_customer before insert or update of customer_id on public.leads
  for each row execute function app.tg_follow_merged_customer();
create or replace trigger t01_follow_merged_customer before insert or update of customer_id on public.estimates
  for each row execute function app.tg_follow_merged_customer();
create or replace trigger t01_follow_merged_customer before insert or update of customer_id on public.jobs
  for each row execute function app.tg_follow_merged_customer();
create or replace trigger t01_follow_merged_customer before insert or update of customer_id on public.invoices
  for each row execute function app.tg_follow_merged_customer();
create or replace trigger t01_follow_merged_customer before insert or update of customer_id on public.payments
  for each row execute function app.tg_follow_merged_customer();
create or replace trigger t01_follow_merged_customer before insert or update of customer_id on public.payment_attempts
  for each row execute function app.tg_follow_merged_customer();
create or replace trigger t01_follow_merged_customer before insert or update of customer_id on public.expenses
  for each row execute function app.tg_follow_merged_customer();
create or replace trigger t01_follow_merged_customer before insert or update of customer_id on public.files
  for each row execute function app.tg_follow_merged_customer();
create or replace trigger t01_follow_merged_subject before insert or update of subject_id on public.activities
  for each row execute function app.tg_follow_merged_subject();
create or replace trigger t01_follow_merged_subject before insert or update of subject_id on public.notes
  for each row execute function app.tg_follow_merged_subject();
create or replace trigger t01_follow_merged_subject before insert or update of subject_id on public.tasks
  for each row execute function app.tg_follow_merged_subject();

/* ---------- the merge ---------- */

create or replace function public.merge_customers(p_keep uuid, p_drop uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.customers;
  b public.customers;
  r record;
  v_run uuid;
  v_target uuid;
  v_primary uuid;
  v_pos int;
  v_now timestamptz := now();
  v_moved jsonb := '{}';
  v_ids uuid[];
  v_people uuid[] := '{}';
  v_inflight boolean;
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'merge_same_client' using errcode = '22023';
  end if;
  -- both rows locked in one order: two merges of the same pair never interleave
  perform 1 from public.customers where id in (p_keep, p_drop) order by id for update;
  select * into a from public.customers where id = p_keep;
  select * into b from public.customers where id = p_drop;
  -- another company's client, an unknown one, or not owner / admin: the same refusal (nothing is told about the rows)
  if a.id is null or b.id is null or a.company_id <> b.company_id
     or not app.has_role(a.company_id, array['owner', 'admin']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- a repeat of the same merge (the queue sent it twice): nothing more to do
  if b.merged_into_customer_id = a.id then
    return jsonb_build_object('kept', a.id, 'merged', b.id, 'repeat', true);
  end if;
  if a.merged_into_customer_id is not null or b.merged_into_customer_id is not null
     or a.deleted_at is not null or b.deleted_at is not null then
    raise exception 'merge_already_merged' using errcode = '22023';
  end if;
  -- money on its way (a card or bank payment, a refund): merge after it settles
  select exists (select 1 from public.payment_attempts x where x.customer_id = b.id and x.status in ('open', 'processing'))
      or exists (select 1 from public.payments x where x.customer_id = b.id and x.status = 'pending')
    into v_inflight;
  if not v_inflight and to_regclass('public.refunds') is not null then
    execute 'select exists (select 1 from public.refunds f join public.payments p on p.id = f.payment_id
                             where p.customer_id = $1 and f.status = ''pending'')' into v_inflight using b.id;
  end if;
  if v_inflight then
    raise exception 'merge_payment_in_flight' using errcode = '55000';
  end if;

  insert into app.customer_merge_runs (drop_id, keep_id) values (b.id, a.id) returning id into v_run;
  perform set_config('app.merging_customer', v_run::text, true);

  /* people: the same person (a shared phone or email) becomes one, the others join the kept client */
  v_primary := a.primary_contact_id;
  if v_primary is null then
    select id into v_primary from public.contacts where customer_id = a.id and is_primary and deleted_at is null;
  end if;
  for r in select * from public.contacts where customer_id = b.id and deleted_at is null order by is_primary desc, created_at, id loop
    v_target := null;
    select c.id into v_target
      from public.contacts c
     where c.customer_id = a.id and c.deleted_at is null
       and (exists (select 1 from app.contact_phone_keys(c.id) x(k) join app.contact_phone_keys(r.id) y(k) on x.k = y.k where x.k is not null)
            or exists (select 1 from app.contact_email_keys(c.id) x(k) join app.contact_email_keys(r.id) y(k) on x.k = y.k where x.k is not null))
     order by c.is_primary desc, c.created_at
     limit 1;
    if v_target is not null then
      -- a person known only by its own columns (made before C1) first gets them as rows, so new rows do not hide them
      insert into public.contact_phones (company_id, contact_id, number, label, is_primary, position)
      select c.company_id, c.id, trim(c.phone), 'mobile', true, 0 from public.contacts c
       where c.id in (v_target, r.id) and coalesce(trim(c.phone), '') <> ''
         and not exists (select 1 from public.contact_phones p where p.contact_id = c.id and p.deleted_at is null);
      insert into public.contact_emails (company_id, contact_id, address, is_primary, position)
      select c.company_id, c.id, trim(c.email), true, 0 from public.contacts c
       where c.id in (v_target, r.id) and position('@' in coalesce(c.email, '')) > 1
         and not exists (select 1 from public.contact_emails e where e.contact_id = c.id and e.deleted_at is null);
      select coalesce(max(position) + 1, 0) into v_pos from public.contact_phones where contact_id = v_target and deleted_at is null;
      insert into public.contact_phones (company_id, contact_id, number, label, is_primary, position)
      select a.company_id, v_target, p.number, p.label,
             not exists (select 1 from public.contact_phones x where x.contact_id = v_target and x.is_primary and x.deleted_at is null) and p.is_primary,
             v_pos + p.position
        from public.contact_phones p
       where p.contact_id = r.id and p.deleted_at is null
         and app.phone_key(p.number) is not null
         and app.phone_key(p.number) not in (select k from app.contact_phone_keys(v_target) t(k) where k is not null);
      select coalesce(max(position) + 1, 0) into v_pos from public.contact_emails where contact_id = v_target and deleted_at is null;
      insert into public.contact_emails (company_id, contact_id, address, is_primary, position)
      select a.company_id, v_target, e.address,
             not exists (select 1 from public.contact_emails x where x.contact_id = v_target and x.is_primary and x.deleted_at is null) and e.is_primary,
             v_pos + e.position
        from public.contact_emails e
       where e.contact_id = r.id and e.deleted_at is null
         and lower(trim(e.address)) not in (select k from app.contact_email_keys(v_target) t(k) where k is not null);
      update public.contact_phones set deleted_at = v_now where contact_id = r.id and deleted_at is null;
      update public.contact_emails set deleted_at = v_now where contact_id = r.id and deleted_at is null;
      update public.contacts set deleted_at = v_now, is_primary = false where id = r.id;
      update public.activities set contact_id = v_target where contact_id = r.id;
      update public.properties set contact_ids = array(select distinct case when x = r.id then v_target else x end from unnest(contact_ids) x)
       where company_id = a.company_id and r.id = any (contact_ids);
    else
      update public.contacts
         set customer_id = a.id,
             is_primary = (v_primary is null),
             role = case when r.role = 'main' and v_primary is not null then 'other' else r.role end
       where id = r.id;
      if v_primary is null then
        v_primary := r.id;
      end if;
    end if;
    v_people := v_people || r.id;
  end loop;
  v_moved := v_moved || jsonb_build_object('contacts', to_jsonb(v_people));

  /* everything else that belongs to the client: the same rows, the kept client (numbers and amounts stay) */
  with m as (update public.properties set customer_id = a.id where customer_id = b.id returning id)
  select coalesce(array_agg(id), '{}') into v_ids from m;  v_moved := v_moved || jsonb_build_object('properties', to_jsonb(v_ids));
  with m as (update public.leads set customer_id = a.id where customer_id = b.id returning id)
  select coalesce(array_agg(id), '{}') into v_ids from m;  v_moved := v_moved || jsonb_build_object('leads', to_jsonb(v_ids));
  with m as (update public.leads set referred_by_customer_id = a.id where referred_by_customer_id = b.id returning id)
  select coalesce(array_agg(id), '{}') into v_ids from m;  v_moved := v_moved || jsonb_build_object('leads_referred', to_jsonb(v_ids));
  with m as (update public.estimates set customer_id = a.id where customer_id = b.id returning id)
  select coalesce(array_agg(id), '{}') into v_ids from m;  v_moved := v_moved || jsonb_build_object('estimates', to_jsonb(v_ids));
  with m as (update public.jobs set customer_id = a.id where customer_id = b.id returning id)
  select coalesce(array_agg(id), '{}') into v_ids from m;  v_moved := v_moved || jsonb_build_object('jobs', to_jsonb(v_ids));
  with m as (update public.invoices set customer_id = a.id where customer_id = b.id returning id)
  select coalesce(array_agg(id), '{}') into v_ids from m;  v_moved := v_moved || jsonb_build_object('invoices', to_jsonb(v_ids));
  with m as (update public.payments set customer_id = a.id where customer_id = b.id returning id)
  select coalesce(array_agg(id), '{}') into v_ids from m;  v_moved := v_moved || jsonb_build_object('payments', to_jsonb(v_ids));
  with m as (update public.payment_attempts set customer_id = a.id where customer_id = b.id returning id)
  select coalesce(array_agg(id), '{}') into v_ids from m;  v_moved := v_moved || jsonb_build_object('payment_attempts', to_jsonb(v_ids));
  with m as (update public.expenses set customer_id = a.id where customer_id = b.id returning id)
  select coalesce(array_agg(id), '{}') into v_ids from m;  v_moved := v_moved || jsonb_build_object('expenses', to_jsonb(v_ids));
  with m as (update public.files set customer_id = a.id where customer_id = b.id returning id)
  select coalesce(array_agg(id), '{}') into v_ids from m;  v_moved := v_moved || jsonb_build_object('files', to_jsonb(v_ids));
  with m as (update public.lead_sources set customer_id = a.id where customer_id = b.id returning id)
  select coalesce(array_agg(id), '{}') into v_ids from m;  v_moved := v_moved || jsonb_build_object('lead_sources', to_jsonb(v_ids));
  -- the client's history, notes and tasks (status_events are append-only history of B itself: they stay)
  with m as (update public.activities set subject_id = a.id where subject_type = 'customer' and subject_id = b.id and company_id = a.company_id returning id)
  select coalesce(array_agg(id), '{}') into v_ids from m;  v_moved := v_moved || jsonb_build_object('activities', to_jsonb(v_ids));
  with m as (update public.notes set subject_id = a.id where subject_type = 'customer' and subject_id = b.id and company_id = a.company_id returning id)
  select coalesce(array_agg(id), '{}') into v_ids from m;  v_moved := v_moved || jsonb_build_object('notes', to_jsonb(v_ids));
  with m as (update public.tasks set subject_id = a.id where subject_type = 'customer' and subject_id = b.id and company_id = a.company_id returning id)
  select coalesce(array_agg(id), '{}') into v_ids from m;  v_moved := v_moved || jsonb_build_object('tasks', to_jsonb(v_ids));
  -- tags: both sets; own fields: B's value only where the kept one has none (a value never moves to another record)
  insert into public.customer_tags (company_id, customer_id, tag_id)
  select company_id, a.id, tag_id from public.customer_tags where customer_id = b.id
  on conflict do nothing;
  insert into public.custom_field_values (company_id, field_id, entity_id, value)
  select v.company_id, v.field_id, a.id, v.value from public.custom_field_values v
    join public.custom_fields f on f.id = v.field_id and f.entity = 'customer' and f.archived_at is null
   where v.entity_id = b.id and v.deleted_at is null
     and not exists (select 1 from public.custom_field_values w where w.field_id = v.field_id and w.entity_id = a.id and w.deleted_at is null);

  /* the kept card: its own values stay, the empty ones come from the second; «do not service» of either stays */
  update public.customers set
    first_name = coalesce(nullif(first_name, ''), b.first_name),
    last_name = coalesce(nullif(last_name, ''), b.last_name),
    company_name = coalesce(nullif(company_name, ''), b.company_name),
    billing_address_line1 = coalesce(billing_address_line1, b.billing_address_line1),
    billing_address_line2 = case when billing_address_line1 is null then b.billing_address_line2 else billing_address_line2 end,
    billing_address_unit = case when billing_address_line1 is null then b.billing_address_unit else billing_address_unit end,
    billing_address_city = case when billing_address_line1 is null then b.billing_address_city else billing_address_city end,
    billing_address_state = case when billing_address_line1 is null then b.billing_address_state else billing_address_state end,
    billing_address_zip = case when billing_address_line1 is null then b.billing_address_zip else billing_address_zip end,
    lead_source_id = coalesce(lead_source_id, b.lead_source_id),
    notes = case when coalesce(b.notes, '') = '' then notes when coalesce(notes, '') = '' then b.notes else notes || E'\n' || b.notes end,
    tags = array(select distinct x from unnest(tags || b.tags) x),
    primary_contact_id = coalesce(primary_contact_id, v_primary),
    status = case when b.status = 'do_not_service' and status <> 'do_not_service' then 'do_not_service'
                  when status = 'archived' and b.status <> 'archived' then 'active' else status end,
    do_not_service_reason = case when status = 'do_not_service' then do_not_service_reason
                                 when b.status = 'do_not_service' then b.do_not_service_reason else do_not_service_reason end,
    not_duplicate_ids = array(select distinct x from unnest(not_duplicate_ids || b.not_duplicate_ids) x where x not in (a.id, b.id))
   where id = a.id;
  update public.customers set status = 'archived', do_not_service_reason = null, merged_into_customer_id = a.id where id = b.id;

  insert into public.audit_log (company_id, actor_type, actor_id, entity_type, entity_id, action, before, after)
  values (a.company_id, 'user', auth.uid(), 'customers', b.id, 'merge', to_jsonb(b) || jsonb_build_object('kept', to_jsonb(a)),
          jsonb_build_object('kept_id', a.id, 'moved', v_moved));
  delete from app.customer_merge_runs where id = v_run;
  perform set_config('app.merging_customer', '', true);
  return jsonb_build_object('kept', a.id, 'merged', b.id, 'repeat', false);
end;
$$;
revoke all on function public.merge_customers(uuid, uuid) from public, anon;
grant execute on function public.merge_customers(uuid, uuid) to authenticated;
