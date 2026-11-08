/**
 * «Компания → Лиды → Приём заявок» (step 16, docs/specs/34-lead-intake.md §3в, PR 3): pure rules of the settings screen.
 * A way in is a company's request form (its public link /f/<token>) or a webhook key for Zapier / Make (shown once).
 * The form takes requests only when the operator set the function's secret INTAKE_IP_SECRET — the screen says so in words.
 */
import type { StatusName } from "@octo/design-tokens";

export interface IntakeEndpoint {
  id: string;
  kind: "form" | "webhook";
  publicToken?: string;
  tokenHint: string;
  sourceId: string;
  enabled: boolean;
  smsConsent: boolean;
  captcha: boolean;
  dailyLimit: number;
  rotatedAt?: string;
}
export interface IntakeEvent {
  id: string;
  endpointId: string;
  at: string;
  status: "accepted" | "merged" | "held" | "rejected" | "invalid";
  reason?: string;
  leadId?: string;
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
}

/** the page a homeowner opens; works from the app's own site (the same one the client estimate page /p/ uses) */
export const formLink = (origin: string, token: string) => `${origin.replace(/\/+$/, "")}/f/${token}`;

/**
 * The code for the contractor's own site: a plain link that opens the page in a new tab (no iframe: the app's site sets
 * no per-page frame rules, spec 34 §3в). Only the escaped link and the words go in: nothing to break their page.
 */
export function siteSnippet(link: string, label: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(label)}</a>`;
}

export type Readiness = "checking" | "unknown" | "noSecret" | "none" | "off" | "on" | "notMine";
/**
 * One line on top of the screen (the director's rule 08.11: a form without the IP secret is never silently «on»):
 * unknown — the function did not answer (offline); noSecret — the operator has not set INTAKE_IP_SECRET, the form takes
 * nothing; none — no form yet; off — switched off; on — takes requests.
 */
export function readiness(status: { ipSecret: boolean } | null | undefined, form: IntakeEndpoint | undefined, director = true): Readiness {
  if (status === undefined) return "checking"; // the function has not answered yet — not «no connection»
  if (!status) return "unknown";
  if (!status.ipSecret) return "noSecret";
  if (!director) return "notMine"; // the office does not read the ways in (owner / admin only): never «no form»
  if (!form) return "none";
  return form.enabled ? "on" : "off";
}
export const READINESS_TONE: Record<Readiness, StatusName> = { checking: "neutral", unknown: "neutral", noSecret: "bad", none: "neutral", off: "warn", on: "ok", notMine: "neutral" };

/** held requests first (they wait for a decision), newest first */
export const heldFirst = (events: IntakeEvent[]) =>
  [...events].sort((a, b) => Number(b.status === "held") - Number(a.status === "held") || b.at.localeCompare(a.at));

/** the person of a request, from its kept fields (the database clears them after 30 / 90 days) */
export function eventFromRow(r: Record<string, unknown>): IntakeEvent {
  // only the four fields the screen shows are read (name:payload->>name …): no address or utm in the office's memory
  const s = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    id: String(r.id), endpointId: String(r.endpoint_id), at: String(r.received_at),
    status: r.status as IntakeEvent["status"], reason: s(r.reason), leadId: s(r.lead_id),
    name: s(r.name), phone: s(r.phone), email: s(r.email), message: s(r.message),
  };
}
export function endpointFromRow(r: Record<string, unknown>): IntakeEndpoint {
  return {
    id: String(r.id), kind: r.kind === "webhook" ? "webhook" : "form",
    publicToken: typeof r.public_token === "string" ? r.public_token : undefined,
    tokenHint: String(r.token_hint ?? ""), sourceId: String(r.source_id), enabled: r.enabled === true,
    smsConsent: r.sms_consent_enabled === true, captcha: r.captcha_required === true,
    dailyLimit: Number(r.daily_limit ?? 100), rotatedAt: typeof r.rotated_at === "string" ? r.rotated_at : undefined,
  };
}
