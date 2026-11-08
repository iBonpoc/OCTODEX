/**
 * «Приём заявок» on the server (docs/specs/34 PR 3; migration 20261108210000). These need the network: a link or a key
 * is made by the server and a held request becomes a lead there — not queued offline (like «Команда», 13 §3.13).
 * Only the owner / admin read and change the ways in; the office reads the journal and decides held requests (T112).
 */
import { endpointFromRow, eventFromRow, type IntakeEndpoint, type IntakeEvent } from "@/features/intakeSettings";
import { supabase } from "./client";

const call = async <T,>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

/** at most 10 ways in per company (intake_endpoint_create refuses more) */
export async function listEndpoints(companyId: string): Promise<IntakeEndpoint[]> {
  const { data, error } = await supabase
    .from("intake_endpoints")
    .select("id, kind, public_token, token_hint, source_id, enabled, captcha_required, sms_consent_enabled, daily_limit, rotated_at")
    .eq("company_id", companyId).is("deleted_at", null).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => endpointFromRow(r as Record<string, unknown>));
}
/** the last 50 requests — the screen shows a journal, not an archive */
export async function listEvents(companyId: string): Promise<IntakeEvent[]> {
  const { data, error } = await supabase
    .from("intake_events")
    .select("id, endpoint_id, received_at, status, reason, lead_id, name:payload->>name, phone:payload->>phone, email:payload->>email, message:payload->>message")
    .eq("company_id", companyId).order("received_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => eventFromRow(r as Record<string, unknown>));
}
export const createEndpoint = (companyId: string, kind: "form" | "webhook", sourceId: string) =>
  call<{ id: string; token: string }>("intake_endpoint_create", { p_company_id: companyId, p_kind: kind, p_source_id: sourceId });
export const rotateEndpoint = (id: string) => call<{ id: string; token: string }>("intake_endpoint_rotate", { p_endpoint_id: id });
export const setEndpoint = (id: string, o: { enabled?: boolean; smsConsent?: boolean }) =>
  call<void>("intake_endpoint_set", { p_endpoint_id: id, p_enabled: o.enabled ?? null, p_sms_consent_enabled: o.smsConsent ?? null });
export const decideEvent = (id: string, accept: boolean) =>
  call<{ status: string; lead_id?: string }>("intake_event_decide", { p_event_id: id, p_accept: accept });
