/**
 * A refund on the server (step 20д, docs/specs/35-stripe.md §4в). Needs the network: the server decides (PRD 16 §105) —
 * never queued offline. A record (cash, check, Zelle, …) → public.refund_record; a Stripe payment → the edge function
 * stripe-refund. The same key on a retry: never a second refund. Our words only — never the server's or Stripe's text.
 */
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/config/backend";
import { refundError, type RefundError, type RefundKind } from "@/features/payments/refund";
import { supabase } from "./client";

const CALL_MS = 25_000;
export interface RefundAsk {
  paymentId: string;
  amountCents: number;
  reasonKind: RefundKind;
  reason: string | null;
  key: string;
}
export type RefundAnswer =
  | { ok: true; status: "succeeded" | "pending" | "failed" | "canceled"; taxCents: number; netCents: number }
  | { ok: false; error: RefundError };

const fromRow = (r: Record<string, unknown> | null | undefined): RefundAnswer | null => {
  if (!r || typeof r !== "object" || typeof r.status !== "string") return null;
  const status = r.status as "succeeded" | "pending" | "failed" | "canceled";
  // Stripe said no to this one: a failed refund, nothing moved
  if (status === "failed" || status === "canceled") return { ok: false, error: "stripe_refused" };
  return { ok: true, status, taxCents: Number(r.tax_cents ?? 0), netCents: Number(r.net_cents ?? 0) };
};

export async function refundRecord(a: RefundAsk): Promise<RefundAnswer> {
  try {
    const { data, error } = await supabase.rpc("refund_record", {
      p_payment_id: a.paymentId, p_amount_cents: a.amountCents, p_reason_kind: a.reasonKind, p_reason: a.reason, p_key: a.key,
    });
    if (error) return { ok: false, error: error.code === "42501" ? "not_allowed" : refundError(error.message) };
    return fromRow(data as Record<string, unknown>) ?? { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "offline" };
  }
}

export async function refundStripe(a: RefundAsk): Promise<RefundAnswer> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) return { ok: false, error: "not_allowed" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CALL_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-refund`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(a),
      signal: ctl.signal,
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.status === 403) return { ok: false, error: "not_allowed" };
    if (body?.error) return { ok: false, error: refundError(body.error) };
    return fromRow(body?.refund as Record<string, unknown>) ?? { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "retry_later" };   // no answer: the refund may be on its way; the same key resumes it
  } finally {
    clearTimeout(timer);
  }
}
