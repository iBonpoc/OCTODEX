-- #2082 / spec 60: the client's page of an invoice without a signed estimate (/i/<token>).
-- Before: a client saw and paid an invoice only on the estimate's page (/p/), so an invoice with no estimate (standalone,
-- recurring) or of a job moved to «cancelled» went out as text with no link. Now an invoice has its own link, made on the
-- phone like an estimate's (offline), put by the office (public.invoice_link_set), read by anyone holding it
-- (public.portal_invoice). Rule 16: only new tables and functions, a new trigger; nothing dropped or renamed.
-- Rule 18: every new function revoked from public / anon, then granted to who calls it.

-- ---- 1. The links ----------------------------------------------------------------------------------------------------
create table app.invoice_tokens (
  token       text primary key check (char_length(token) between 20 and 128 and token ~ '^[A-Za-z0-9_-]+$'),
  invoice_id  uuid not null,
  company_id  uuid not null,
  created_at  timestamptz not null default clock_timestamp(),
  foreign key (company_id, invoice_id) references public.invoices (company_id, id)
);
create index invoice_tokens_invoice_idx on app.invoice_tokens (invoice_id, created_at desc);
alter table app.invoice_tokens enable row level security;
alter table app.invoice_tokens force row level security;
revoke all on app.invoice_tokens from public, anon, authenticated;
create trigger t11_company_id_immutable before update on app.invoice_tokens for each row execute function app.tg_company_id_immutable();

-- the fingerprints of ended links: the page says «this link is no longer valid», not «not found» (as estimates do)
create table app.invoice_revoked_tokens (
  token_hash  text primary key,
  company_id  uuid not null references public.companies (id),
  invoice_id  uuid not null,
  revoked_at  timestamptz not null default now()
);
alter table app.invoice_revoked_tokens enable row level security;
alter table app.invoice_revoked_tokens force row level security;
revoke all on app.invoice_revoked_tokens from public, anon, authenticated;
create trigger t11_company_id_immutable before update on app.invoice_revoked_tokens for each row execute function app.tg_company_id_immutable();

create or replace function app.invoice_tokens_revoke(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into app.invoice_revoked_tokens (token_hash, company_id, invoice_id)
  select encode(sha256(convert_to(k.token, 'UTF8')), 'hex'), k.company_id, k.invoice_id from app.invoice_tokens k where k.invoice_id = p_invoice_id
  on conflict (token_hash) do nothing;
  delete from app.invoice_tokens where invoice_id = p_invoice_id;
end;
$$;
revoke all on function app.invoice_tokens_revoke(uuid) from public, anon, authenticated;

-- ---- 2. The office puts the link the phone made ------------------------------------------------------------------------
-- One live link per invoice: a second call answers with the live one (a repeat from the queue, a second phone).
-- Not a draft, not a void invoice; a client marked «do not service» gets no new link. Another company's invoice, a missing
-- one and a role that does not send invoices get the same «not found» (no existence oracle).
create or replace function public.invoice_link_set(p_invoice_id uuid, p_token text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
  v_company uuid;
  v_live text;
begin
  select company_id into v_company from public.invoices where id = p_invoice_id and deleted_at is null;
  if v_company is null or auth.uid() is null or not app.has_role(v_company, array['owner', 'admin', 'office']) then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;
  select * into i from public.invoices where id = p_invoice_id and company_id = v_company and deleted_at is null for update;
  if not found then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;
  select k.token into v_live from app.invoice_tokens k where k.invoice_id = i.id order by k.created_at desc, k.token limit 1;
  if v_live is not null then
    return v_live;
  end if;
  if i.status <> 'sent' then
    raise exception 'only a sent invoice gets a client link (status %)', i.status using errcode = '22023';
  end if;
  if exists (select 1 from public.customers c where c.id = i.customer_id and c.company_id = i.company_id and c.status = 'do_not_service') then
    raise exception 'customer_do_not_service' using errcode = 'P0001',
      hint = 'the client is marked «do not service»: no new links';
  end if;
  if p_token is null or char_length(p_token) not between 20 and 128 or p_token !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'a link token is 20–128 letters, digits, - or _' using errcode = '22023';
  end if;
  -- a token once revoked never comes back (an old phone's queue), and a token is never shared with another invoice
  if exists (select 1 from app.invoice_revoked_tokens r where r.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
     or exists (select 1 from app.invoice_tokens k where k.token = p_token) then
    raise exception 'this link token cannot be used' using errcode = '22023';
  end if;
  insert into app.invoice_tokens (token, invoice_id, company_id) values (p_token, i.id, i.company_id);
  return p_token;
end;
$$;
revoke all on function public.invoice_link_set(uuid, text) from public, anon, authenticated;
grant execute on function public.invoice_link_set(uuid, text) to authenticated;

-- the office side reads the live link (owner, admin, office, sales — who see invoices); a tech gets nothing
create or replace function public.invoice_link(p_invoice_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select k.token from app.invoice_tokens k join public.invoices i on i.id = k.invoice_id and i.company_id = k.company_id
   where k.invoice_id = p_invoice_id and i.deleted_at is null
     and app.has_role(i.company_id, array['owner', 'admin', 'office', 'sales'])
   order by k.created_at desc, k.token limit 1;
$$;
revoke all on function public.invoice_link(uuid) from public, anon, authenticated;
grant execute on function public.invoice_link(uuid) to authenticated;

-- ---- 3. The page ------------------------------------------------------------------------------------------------------
-- Only what the client sees: the company's face and how to pay, the client's name and language, the invoice's sums and
-- payments. No costs, notes, other invoices, people of the company. States: closed company → its name only; void → its
-- name and phone; an ended link → «revoked»; an unknown token → null (the page says «link not valid» for both).
create or replace function public.portal_invoice(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  i  public.invoices;
  co public.companies;
  v_lang text;
begin
  if p_token is null then
    return null;
  end if;
  select inv.* into i from app.invoice_tokens k join public.invoices inv on inv.id = k.invoice_id and inv.company_id = k.company_id
   where k.token = p_token and inv.deleted_at is null;
  if not found then
    if exists (select 1 from app.invoice_revoked_tokens r where r.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')) then
      return jsonb_build_object('status', 'revoked');
    end if;
    return null;
  end if;
  select * into co from public.companies where id = i.company_id;
  if co.closed_at is not null then
    return jsonb_build_object('status', 'closed', 'company', jsonb_build_object('name', coalesce(nullif(co.dba, ''), co.name)));
  end if;
  -- the client's language: their main person → the company's default for documents → en (rule 7, as the estimate's page)
  select coalesce(
           (select c.preferred_language from public.customers cu join public.contacts c on c.id = cu.primary_contact_id
             where cu.id = i.customer_id and c.deleted_at is null),
           co.doc_language, 'en') into v_lang;
  if i.status = 'void' then
    return jsonb_build_object('status', 'void', 'doc_language', v_lang,
      'company', jsonb_build_object('name', coalesce(nullif(co.dba, ''), co.name), 'phone', co.phone));
  end if;
  return jsonb_build_object(
    'status', case when i.total_cents - i.paid_cents <= 0 then 'paid' else 'open' end,
    'doc_language', v_lang,
    'company', jsonb_build_object(
      'name', coalesce(nullif(co.dba, ''), co.name), 'phone', co.phone, 'email', co.email, 'website', co.website,
      'license', co.license_number,
      'licenses', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'number', l.number, 'classes', l.classes) order by l.created_at)
                              from public.company_licenses l
                             where l.company_id = co.id and l.on_documents and l.deleted_at is null), '[]'::jsonb),
      'zelle', nullif(btrim(co.payment_settings ->> 'zelle'), ''),
      'check_payable_to', nullif(btrim(co.payment_settings ->> 'check_payable_to'), '')),
    'customer', (select jsonb_build_object('name', cu.display_name) from public.customers cu where cu.id = i.customer_id and cu.company_id = i.company_id),
    'invoice', jsonb_build_object(
      'number', i.number, 'title', i.title, 'kind', i.kind, 'sent_at', i.sent_at, 'due_date', i.due_date,
      'subtotal', i.subtotal_cents, 'discount', i.discount_cents, 'tax', i.tax_cents, 'total', i.total_cents,
      'paid', i.paid_cents, 'balance', i.total_cents - i.paid_cents),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('received_at', p.received_at, 'amount', p.amount_cents - p.refunded_cents,
                                                              'method', p.method, 'receipt', p.receipt_number) order by p.received_at)
                            from public.payments p
                           where p.company_id = i.company_id and p.invoice_id = i.id
                             and p.status in ('succeeded', 'partially_refunded') and p.amount_cents - p.refunded_cents > 0), '[]'::jsonb));
end;
$$;
revoke all on function public.portal_invoice(text) from public, anon, authenticated;
grant execute on function public.portal_invoice(text) to anon, authenticated;

-- ---- 4. A void invoice ends its links ----------------------------------------------------------------------------------
create or replace function app.tg_invoice_void_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'void' and old.status is distinct from 'void' then
    perform app.invoice_tokens_revoke(new.id);
  end if;
  return new;
end;
$$;
revoke all on function app.tg_invoice_void_links() from public, anon, authenticated;
drop trigger if exists t45_invoice_void_links on public.invoices;
create trigger t45_invoice_void_links after update of status on public.invoices
  for each row execute function app.tg_invoice_void_links();
