-- Client page in the client's language (CLAUDE.md rule 7; docs/specs/07-estimates.md §2.1; wave E1).
-- A client opens /p/<token> on their own phone: the app has no data there, so the language comes from the server.
-- portal_estimate gains exactly one field, doc_language, and nothing else (the function is public by token).
-- Order, the same as docLanguageFor in the app: the client's main person → the lead's main person → the lead →
-- the company's default for documents → 'en'.
-- The existing body is kept as app.portal_estimate_base (moved, not copied), so it cannot drift from a copy;
-- portal_accept / portal_pay_simulated keep calling public.portal_estimate and get doc_language too.
-- !! The page body is edited in app.portal_estimate_base. `create or replace function public.portal_estimate`
--    in a later migration replaces this wrapper and DROPS the client's language (test T19 catches it).

alter function public.portal_estimate(text) set schema app;
alter function app.portal_estimate(text) rename to portal_estimate_base;
revoke all on function app.portal_estimate_base(text) from public, anon, authenticated;

create or replace function app.estimate_doc_language(p_estimate_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.preferred_language from public.customers cu join public.contacts c on c.id = cu.primary_contact_id
      where cu.id = e.customer_id and c.deleted_at is null),
    (select c.preferred_language from public.contacts c
      where e.lead_id is not null and c.lead_id = e.lead_id and c.customer_id is null and c.is_primary and c.deleted_at is null
      limit 1),
    (select l.language from public.leads l where l.id = e.lead_id),
    co.doc_language,
    'en')
  from public.estimates e join public.companies co on co.id = e.company_id
  where e.id = p_estimate_id;
$$;
revoke all on function app.estimate_doc_language(uuid) from public, anon, authenticated;

create function public.portal_estimate(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  v_id uuid;
begin
  r := app.portal_estimate_base(p_token);
  if r is null then
    return null;
  end if;
  select id into v_id from public.estimates where public_token = p_token and deleted_at is null;
  return r || jsonb_build_object('doc_language', app.estimate_doc_language(v_id));
end;
$$;
revoke all on function public.portal_estimate(text) from public;
grant execute on function public.portal_estimate(text) to anon, authenticated;
