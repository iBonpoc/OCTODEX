-- #1304 (docs/specs/40): «Notes» and «Terms & conditions» of an estimate; the company's default Terms by the client's language.
-- * companies.estimate_settings.terms_by_lang = {"en": …, "es": …, "ru": …}: en is the fallback, es / ru optional; only these
--   keys, strings of at most 10000 characters (app.tg_company_estimate_terms, t08 — the same limit as the phone, TERMS_MAX).
-- * Rule 16, step 1: the old single estimate_settings.terms stays and equals terms_by_lang.en — new phones write both, an
--   older phone writes only `terms` (its company.save re-reads the row and keeps terms_by_lang). t08 makes them one: en
--   changed → terms := en; else terms changed → en := terms; both changed and differ → en wins (the newer phone). Rows
--   before this migration: terms → terms_by_lang.en (below). Step 2 (after 1.0, a separate PR): drop `terms` and t08's sync.
-- * The estimate's own Terms are a snapshot in the version: calc_inputs.terms (the phone's doc.terms) and its copy in
--   estimate_versions.terms_text (a column since core, never written) — t08_terms_text derives it from calc_inputs on every
--   write of calc_inputs, so every way of saving (save_estimate_version, the older separate requests, an older phone) agrees.
--   Sending locks the version (t40): the text the client signs never moves with a later change of the company's default.
-- * What the client reads (/p/, its PDF): app.client_doc passes `terms` (only a string); public.portal_estimate adds the
--   company's terms_by_lang (not for a signed estimate: it keeps the old single text it showed then) — the page picks (features/estimateTerms termsForClient): the estimate's own text when the key is
--   there ("" — no block), else the client's language → en → the old `terms`. The page's company.terms stays (a cached page).
-- Rights: no new policies — companies_update lets only owner / admin change the defaults (core); a version is written by
-- whoever may write the estimate. Rule 18: the new functions revoked from everyone (triggers and the definer page call them).
-- Rule 16: the same signatures (create or replace), only bodies grow; a check «not valid» (no scan of the old rows, no lock).
-- Tests: supabase/tests/core_rls.sql T205; apps/mobile/test/estimateTerms.test.ts, estimateTermsStore.test.ts.

-- the defaults by language as the page may read them: only en / es / ru, strings, not blank
create or replace function app.estimate_terms_by_lang(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce((select jsonb_object_agg(k.key, k.value)
                     from jsonb_each(case when jsonb_typeof(p -> 'terms_by_lang') = 'object' then p -> 'terms_by_lang' else '{}'::jsonb end) k
                    where k.key in ('en', 'es', 'ru') and jsonb_typeof(k.value) = 'string' and btrim(k.value #>> '{}') <> ''), '{}'::jsonb);
$$;
revoke all on function app.estimate_terms_by_lang(jsonb) from public, anon, authenticated;

create or replace function app.tg_company_estimate_terms()
returns trigger language plpgsql set search_path = '' as $$
declare
  s      jsonb := coalesce(new.estimate_settings, '{}'::jsonb);
  o      jsonb := case when tg_op = 'UPDATE' then coalesce(old.estimate_settings, '{}'::jsonb) else '{}'::jsonb end;
  k      text;
  en_new text;
  en_old text;
  t_new  text;
  t_old  text;
begin
  if jsonb_typeof(s) <> 'object' then
    return new;  -- not this trigger's business (the column's own shape)
  end if;
  -- only what this write changes is checked: an older row's value the migration could not move (too long, not a text)
  -- never blocks a save of the other settings (an older phone writes estimate_settings whole)
  if s ? 'terms_by_lang' and (s -> 'terms_by_lang') is distinct from (o -> 'terms_by_lang') then
    if jsonb_typeof(s -> 'terms_by_lang') <> 'object' then
      raise exception 'estimate_settings.terms_by_lang: not an object' using errcode = '22023', hint = 'estimate_terms_shape';
    end if;
    for k in select jsonb_object_keys(s -> 'terms_by_lang') loop
      if k not in ('en', 'es', 'ru') or jsonb_typeof(s -> 'terms_by_lang' -> k) <> 'string'
         or char_length(s -> 'terms_by_lang' ->> k) > 10000 then
        raise exception 'estimate_settings.terms_by_lang: % is not a text of en / es / ru up to 10000 characters', k
          using errcode = '22023', hint = 'estimate_terms_shape';
      end if;
    end loop;
  end if;
  if s ? 'terms' and (s -> 'terms') is distinct from (o -> 'terms') and (jsonb_typeof(s -> 'terms') not in ('string', 'null') or char_length(s ->> 'terms') > 10000) then
    raise exception 'estimate_settings.terms: not a text up to 10000 characters' using errcode = '22023', hint = 'estimate_terms_shape';
  end if;
  en_new := nullif(btrim(s -> 'terms_by_lang' ->> 'en'), '');
  en_old := nullif(btrim(o -> 'terms_by_lang' ->> 'en'), '');
  t_new  := nullif(btrim(s ->> 'terms'), '');
  t_old  := nullif(btrim(o ->> 'terms'), '');
  if en_new is distinct from en_old then
    -- a new phone changed en (and wins over an older phone's `terms` in the same write): the old key follows
    s := jsonb_set(s, '{terms}', coalesce(to_jsonb(s -> 'terms_by_lang' ->> 'en'), 'null'::jsonb));
  elsif t_new is distinct from t_old then
    -- an older phone changed the old key: en follows, es / ru stay
    s := jsonb_set(s, '{terms_by_lang}',
           case when t_new is null then coalesce(s -> 'terms_by_lang', '{}'::jsonb) - 'en'
                else coalesce(s -> 'terms_by_lang', '{}'::jsonb) || jsonb_build_object('en', s ->> 'terms') end);
  end if;
  new.estimate_settings := s;
  return new;
end;
$$;
revoke all on function app.tg_company_estimate_terms() from public, anon, authenticated;

-- the rows before: the old single text is the English one (before the trigger: nothing to sync yet)
update public.companies
   set estimate_settings = estimate_settings || jsonb_build_object('terms_by_lang', jsonb_build_object('en', estimate_settings ->> 'terms'))
 where jsonb_typeof(estimate_settings) = 'object' and not (estimate_settings ? 'terms_by_lang')
   and jsonb_typeof(estimate_settings -> 'terms') = 'string' and btrim(estimate_settings ->> 'terms') <> ''
   and char_length(estimate_settings ->> 'terms') <= 10000;

create trigger t08_company_estimate_terms before insert or update of estimate_settings on public.companies
  for each row execute function app.tg_company_estimate_terms();

-- the version's copy of its Terms: from the document, on every write of it (an older phone's document has none: null)
create or replace function app.tg_version_terms_text()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.terms_text := case when jsonb_typeof(new.calc_inputs -> 'terms') = 'string' then new.calc_inputs ->> 'terms' end;
  return new;
end;
$$;
revoke all on function app.tg_version_terms_text() from public, anon, authenticated;
-- on every write of the row (not only of calc_inputs): the copy is never set apart from the document
create trigger t08_terms_text before insert or update on public.estimate_versions
  for each row execute function app.tg_version_terms_text();
-- rule16: small (a check «not valid»: no scan of the old rows; new writes only — the phone caps the text the same, TERMS_MAX)
alter table public.estimate_versions
  add constraint estimate_versions_terms_text_len check (terms_text is null or char_length(terms_text) <= 10000) not valid;

-- what the client reads of an estimate: its own Terms too (20261112210000 + `terms`)
create or replace function app.client_doc(p jsonb, p_signed boolean)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'object' then
    app.jsonb_scalars(p, array['note'])
    -- #1304: the estimate's own Terms (a snapshot frozen by sending) — only a string; none = an estimate made before #1304
    || case when jsonb_typeof(p -> 'terms') = 'string' then jsonb_build_object('terms', p -> 'terms') else '{}'::jsonb end
    || jsonb_build_object('options', coalesce((
         select jsonb_agg(
                  app.jsonb_scalars(o.value, array['id', 'name', 'recommended'])
                  -- РС-6: the option's sections as the client reads them (app.client_sections)
                  || case when jsonb_typeof(o.value -> 'sections') = 'array' then jsonb_build_object('sections', app.client_sections(o.value -> 'sections')) else '{}'::jsonb end
                  || jsonb_build_object('lines', coalesce((
                       select jsonb_agg(app.jsonb_scalars(l.value,
                                array['id', 'name', 'description', 'group', 'quantity', 'unit', 'unitPriceCents', 'optional', 'selected'])
                              -- a sectionId: a string of at most 64 characters, or no link (the phone the same)
                              || case when jsonb_typeof(l.value -> 'sectionId') = 'string' and (l.value ->> 'sectionId') <> ''
                                           and length(l.value ->> 'sectionId') <= 64
                                      then jsonb_build_object('sectionId', l.value ->> 'sectionId') else '{}'::jsonb end
                              order by l.ordinality)
                         from jsonb_array_elements(case when jsonb_typeof(o.value -> 'lines') = 'array' then o.value -> 'lines' else '[]'::jsonb end)
                              with ordinality l
                        where jsonb_typeof(l.value) = 'object'
                          -- a line hidden from the client goes whole (also «false» as a string or 0) — only at $0, as the
                          -- engine counts it (РС-6): a priced line marked hidden is a visible one (the client's total holds it)
                          and not (coalesce(lower(l.value ->> 'clientVisible'), 'true') in ('false', '0')
                                   and (coalesce(p_signed, false)
                                        or case when jsonb_typeof(l.value -> 'unitPriceCents') = 'number' then (l.value ->> 'unitPriceCents')::numeric = 0 else true end))
                          -- a line the page cannot draw goes whole too (the page would fail on it)
                          and jsonb_typeof(l.value -> 'name') = 'string'
                          and jsonb_typeof(l.value -> 'group') = 'string'
                          and jsonb_typeof(l.value -> 'quantity') in ('string', 'number')
                          and jsonb_typeof(l.value -> 'unitPriceCents') = 'number'
                          -- quantity 0: the part is left out (spec 33 П23.9)
                          and (l.value ->> 'quantity') !~ '^[[:space:]]*[+-]?(0+([.]0*)?|[.]0+)[[:space:]]*$'), '[]'::jsonb))
                  order by o.ordinality)
           from jsonb_array_elements(case when jsonb_typeof(p -> 'options') = 'array' then p -> 'options' else '[]'::jsonb end)
                with ordinality o
          where jsonb_typeof(o.value) = 'object'), '[]'::jsonb))
    || case when jsonb_typeof(p -> 'settings') = 'object' then jsonb_build_object('settings',
         app.jsonb_scalars(p -> 'settings', array['caHic'])
         || case when (p -> 'settings') ? 'discount' then jsonb_build_object('discount',
              app.jsonb_scalars(p -> 'settings' -> 'discount', array['kind', 'value', 'cents'])) else '{}'::jsonb end
         || case when jsonb_typeof(p -> 'settings' -> 'tax') = 'object' then jsonb_build_object('tax',
              app.jsonb_scalars(p -> 'settings' -> 'tax', array['enabled', 'rateBps', 'ratePpm'])
              || case when jsonb_typeof(p -> 'settings' -> 'tax' -> 'groups') = 'object' then jsonb_build_object('groups',
                   app.jsonb_scalars(p -> 'settings' -> 'tax' -> 'groups', array['service', 'labor', 'material'])) else '{}'::jsonb end)
            else '{}'::jsonb end
         || case when jsonb_typeof(p -> 'settings' -> 'deposit') = 'object' then jsonb_build_object('deposit',
              app.jsonb_scalars(p -> 'settings' -> 'deposit', array['kind', 'bps', 'cents'])) else '{}'::jsonb end)
       else '{}'::jsonb end
    -- spec 33 П24.7: the attached pages, only what the page may draw (app.doc_pages)
    || case when jsonb_typeof(p -> 'pages') = 'array' then jsonb_build_object('pages', app.doc_pages(p -> 'pages')) else '{}'::jsonb end
  end;
$$;

-- the page: the company's defaults by language too (20261110030000 + terms_by_lang)
create or replace function public.portal_estimate(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  r jsonb;
  v_id uuid;
  v_company uuid;
begin
  r := app.portal_estimate_base(p_token);
  if r is null then
    return null;
  end if;
  select id, company_id into v_id, v_company from public.estimates where id = app.estimate_of_token(p_token) and deleted_at is null;
  if r ->> 'status' = 'closed' then
    return r || jsonb_build_object('doc_language', app.estimate_doc_language(v_id));
  end if;
  -- #1304: the company's default Terms by language — the page shows them only for an estimate without its own
  -- (features/estimateTerms termsForClient: the client's language → en → the old single text)
  -- a signed estimate without its own Terms (made before #1304) keeps what it showed then — the old single text
  -- (company.terms), never a newer default in another language (security-check of #1304)
  if r ? 'doc' and coalesce(r ->> 'status', '') not in ('approved', 'awaiting_countersign') and coalesce(jsonb_typeof(r -> 'approval'), 'null') = 'null' then
    r := jsonb_set(r, '{company,terms_by_lang}',
           coalesce((select app.estimate_terms_by_lang(co.estimate_settings) from public.companies co where co.id = v_company), '{}'::jsonb));
  end if;
  return r || jsonb_build_object(
    'doc_language', app.estimate_doc_language(v_id),
    'simulated_pay', app.company_simulates_payments(v_company),
    -- the company's Stripe account takes charges; the page then shows the real Payment Element
    'online_pay', exists (select 1 from public.stripe_accounts s where s.company_id = v_company and s.charges_enabled)
                  and exists (select 1 from public.estimates e where e.id = v_id and app.estimate_link_open(e)),
    -- ACH on its way per invoice of this estimate: not money yet, but the client must not pay it twice
    'pending', coalesce((select jsonb_object_agg(x.invoice_id, x.cents)
                           from (select p.invoice_id, sum(p.amount_cents) as cents
                                   from public.payments p join public.invoices i on i.id = p.invoice_id
                                   join public.jobs j on j.id = i.job_id
                                  where j.estimate_id = v_id and p.status = 'pending' and p.deleted_at is null
                                    and i.deleted_at is null and i.status = 'sent'
                                  group by p.invoice_id) x), '{}'::jsonb));
end;
$$;
