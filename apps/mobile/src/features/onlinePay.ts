/**
 * «Компания → Онлайн-оплата» (step 20b, docs/specs/35-stripe.md): what the state of the company's Stripe account means.
 * Pure — the screen (app/company/payments.tsx) and unit:onlinePay use it. Test mode only for now.
 */
import type { StatusName } from "@octo/design-tokens";

/** what the server keeps (public.stripe_accounts, the columns the app may read) */
export interface OnlinePayState {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: number;
  disabledReason: string | null;
  livemode: boolean;
}
export type OnlinePayReadiness = "checking" | "unknown" | "notSet" | "off" | "pending" | "restricted" | "ready";

export function stateFromRow(r: Record<string, unknown>): OnlinePayState {
  return {
    chargesEnabled: r.charges_enabled === true,
    payoutsEnabled: r.payouts_enabled === true,
    detailsSubmitted: r.details_submitted === true,
    requirementsDue: typeof r.requirements_due === "number" && r.requirements_due > 0 ? Math.floor(r.requirements_due) : 0,
    disabledReason: typeof r.disabled_reason === "string" && r.disabled_reason ? r.disabled_reason : null,
    livemode: r.livemode === true,
  };
}

/**
 * undefined — not asked yet; "unknown" — no answer; "notSet" — the platform has no Stripe key (the founder's part);
 * null — the company has no account. Charges on = ready, even while Stripe still asks for something (payouts may wait).
 */
export function readiness(s: OnlinePayState | null | undefined | "unknown" | "notSet"): OnlinePayReadiness {
  if (s === undefined) return "checking";
  if (s === "unknown" || s === "notSet") return s;
  if (!s) return "off";
  if (s.chargesEnabled) return "ready";
  if (s.disabledReason && s.detailsSubmitted) return "restricted";
  return "pending";
}
export const READINESS_TONE: Record<OnlinePayReadiness, StatusName> = {
  checking: "neutral", unknown: "neutral", notSet: "info", off: "neutral", pending: "warn", restricted: "bad", ready: "ok",
};
/** the main button: connect, continue Stripe's form, or nothing (ready / the founder has not set Stripe up) */
export function action(r: OnlinePayReadiness): "connect" | "continue" | null {
  if (r === "off") return "connect";
  if (r === "pending" || r === "restricted") return "continue";
  return null;
}
/** the answer of the edge function → the state, or why there is none */
export function fromAnswer(status: number | null, body: unknown): { state: OnlinePayState | null | "unknown" | "notSet"; url?: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (status === 503 && (b.error === "not_configured" || b.error === "live_refused")) return { state: "notSet" };
  if (status !== 200) return { state: "unknown" };
  const url = typeof b.url === "string" && b.url.startsWith("https://connect.stripe.com/") ? b.url : undefined;
  if (b.connected !== true) return { state: null, url };
  return { state: "charges_enabled" in b ? stateFromRow(b) : { ...stateFromRow({}), detailsSubmitted: false }, url };
}
