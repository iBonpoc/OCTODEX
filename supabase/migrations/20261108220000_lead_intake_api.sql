-- Lead intake, PR 2 (docs/specs/34 §3): the Edge Function lead-intake reaches the pipeline through PostgREST, which
-- serves only schema public. Two thin doors to app.intake_lead / app.intake_form_info — service_role only (rule 18):
-- anon and authenticated never call them (T52, T120).
create or replace function public.intake_submit(p_kind text, p_token_hash text, p_event_key text, p_payload_hash text,
                                               p_ip_hash text, p_payload jsonb, p_checks jsonb default '{}')
returns jsonb language sql security definer set search_path = '' as $$
  select app.intake_lead(p_kind, p_token_hash, p_event_key, p_payload_hash, p_ip_hash, p_payload, coalesce(p_checks, '{}'::jsonb));
$$;
revoke all on function public.intake_submit(text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.intake_submit(text, text, text, text, text, jsonb, jsonb) to service_role;

create or replace function public.intake_form(p_token_hash text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select app.intake_form_info(p_token_hash);
$$;
revoke all on function public.intake_form(text) from public, anon, authenticated;
grant execute on function public.intake_form(text) to service_role;
