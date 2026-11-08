/**
 * A refund of a card / ACH payment (step 20д, docs/specs/35-stripe.md §4в). Pure: no Deno, no network — the Deno entry
 * (index.ts) passes the real clients; vitest passes fakes (apps/mobile/test/stripeRefundFn.test.ts).
 *
 * POST {paymentId, amountCents, reasonKind, reason?, key}:
 * 1) the person comes with their own JWT (verify_jwt = true); the uid is taken ONLY from the token;
 * 2) public.stripe_refund_open(uid, …) checks owner/admin, the limit (paid − refunded − on its way), a dispute — and keeps a
 *    «pending» row BEFORE Stripe is called; a retry (the same key, or another tab with the same amount) is that same row;
 * 3) POST /v1/refunds on the connected account with Idempotency-Key = the row (one row — one Stripe refund) and
 *    metadata.octo_refund_id (the webhook ties to the row even when it comes first);
 * 4) public.stripe_refund_settle keeps Stripe's answer. Stripe said no → «failed», no money moved. No answer (a timeout,
 *    5xx, 429) → the row stays pending: the next tap resumes it with the same key, nothing doubles.
 * Refusals the person can act on are 200 {error}: the app shows our words, never Stripe's text. Test mode only.
 */
export interface Opened {
  id: string;
  payment_id: string;
  amount_cents: number;
  status: "pending" | "succeeded" | "failed" | "canceled";
  tax_cents: number | null;
  net_cents: number | null;
  failure_reason: string | null;
  account_id: string;
  payment_intent: string;
  company_id: string;
  stripe_refund_id: string | null;
  /** seconds since the row was made, by the database's clock */
  age_s: number;
  fee_cents: number;
  platform_fee_cents: number;
  idempotency_key: string;
}
export interface StripeAnswer {
  status: number;
  body: Record<string, unknown> | null;
}
export class DbError extends Error {
  constructor(public code: string | null, public text: string = "") {
    super(`db ${code ?? ""}`);
  }
}
export interface RefundDeps {
  userOf: (jwt: string) => Promise<string | null>;
  /** public.stripe_refund_open as service_role; throws DbError */
  open: (userId: string, b: RefundBody) => Promise<Opened>;
  /** public.stripe_refund_inflight as service_role: the refund of this payment that has not reached Stripe yet, or null */
  inflight: (userId: string, paymentId: string) => Promise<Pick<Opened, "id" | "amount_cents" | "age_s" | "account_id" | "payment_intent" | "status"> | null>;
  /** public.stripe_refund_settle as service_role */
  settle: (refundId: string, stripe: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** one call of the Stripe API on the connected account; form and key only for POST */
  stripe: ((method: "GET" | "POST", path: string, account: string, form?: Record<string, string>, idempotencyKey?: string) => Promise<StripeAnswer>) | null;
  keyMode: "test" | "live" | null;
  log?: (msg: string) => void;
}
export interface Req {
  method: string;
  header: (name: string) => string | null;
  text: () => Promise<string>;
}
export interface Res {
  status: number;
  body: string;
  headers: Record<string, string>;
}
export interface RefundBody {
  paymentId: string;
  amountCents: number;
  reasonKind: "rescission" | "cancellation" | "goodwill" | "other";
  reason: string | null;
  key: string;
}

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9:_-]{8,100}$/;
const RE = /^(re|pyr)_[A-Za-z0-9]{1,64}$/;
/** a refund row older than this that never reached Stripe is asked about at Stripe before anything else (its call times out in 10 s) */
export const STALE_S = 120;
const KINDS = ["rescission", "cancellation", "goodwill", "other"] as const;
/** the database's refusals the person can act on (raise exception '<word>') */
export const REFUSALS = ["refund_above_available", "refund_disputed", "refund_in_progress", "refund_not_refundable", "refund_not_stripe"] as const;
const json = (status: number, body: unknown): Res => ({ status, body: JSON.stringify(body), headers: { ...CORS, "Content-Type": "application/json" } });

export function parseBody(raw: string): RefundBody | null {
  let v: unknown;
  try {
    v = JSON.parse(raw || "null");
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).some((k) => !["paymentId", "amountCents", "reasonKind", "reason", "key"].includes(k))) return null;
  if (typeof o.paymentId !== "string" || !UUID.test(o.paymentId)) return null;
  if (typeof o.amountCents !== "number" || !Number.isSafeInteger(o.amountCents) || o.amountCents <= 0) return null;
  if (typeof o.reasonKind !== "string" || !(KINDS as readonly string[]).includes(o.reasonKind)) return null;
  if (o.reason != null && (typeof o.reason !== "string" || o.reason.length > 500)) return null;
  if (typeof o.key !== "string" || !KEY.test(o.key)) return null;
  return {
    paymentId: o.paymentId.toLowerCase(),
    amountCents: o.amountCents,
    reasonKind: o.reasonKind as RefundBody["reasonKind"],
    reason: typeof o.reason === "string" && o.reason.trim() ? o.reason.trim() : null,
    key: o.key,
  };
}

/** the row as the app sees it: no Stripe ids, no account */
const shown = (r: Record<string, unknown>) => ({
  id: r.id, status: r.status, amount_cents: r.amount_cents, tax_cents: r.tax_cents, net_cents: r.net_cents, failure_reason: r.failure_reason ?? null,
});

export async function handleRefund(req: Req, deps: RefundDeps): Promise<Res> {
  if (req.method === "OPTIONS") return { status: 204, body: "", headers: { ...CORS } };
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  const jwt = /^Bearer\s+(\S+)$/i.exec(req.header("authorization") ?? "")?.[1];
  if (!jwt) return json(401, { error: "sign in first" });
  const uid = await deps.userOf(jwt).catch(() => null);
  if (!uid) return json(401, { error: "sign in first" });
  const body = parseBody(await req.text().catch(() => ""));
  if (!body) return json(400, { error: "bad request" });
  if (!deps.stripe || !deps.keyMode) return json(200, { error: "not_configured" });
  if (deps.keyMode !== "test") return json(200, { error: "live_refused" });

  const stripe = deps.stripe;
  const refused = (e: unknown, what: string) => {
    if (e instanceof DbError && e.code === "42501") return json(403, { error: "not_allowed" });
    const word = e instanceof DbError ? REFUSALS.find((w) => e.text.includes(w)) : undefined;
    if (word) return json(200, { error: word });
    deps.log?.(`stripe-refund: ${what} failed ${e instanceof DbError ? e.code ?? "" : ""}`.trim());
    return json(500, { error: "failed" });
  };

  // A refund of this payment that never reached Stripe a while ago (a timeout, a closed tab): did Stripe make it? Asked by
  // its metadata, so a retry after Stripe forgot the Idempotency-Key (24 h) never makes a second real refund (security 20д №4),
  // and a stuck row never blocks another amount for ever (№5).
  let inf: Awaited<ReturnType<RefundDeps["inflight"]>>;
  try {
    inf = await deps.inflight(uid, body.paymentId);
  } catch (e) {
    return refused(e, "inflight");
  }
  if (inf && inf.age_s >= STALE_S) {
    let l: StripeAnswer;
    try {
      l = await stripe("GET", `/v1/refunds?payment_intent=${encodeURIComponent(inf.payment_intent)}&limit=100`, inf.account_id);
    } catch {
      return json(200, { error: "retry_later" });
    }
    const list = l.status === 200 && l.body && Array.isArray(l.body.data) ? (l.body.data as Record<string, unknown>[]) : null;
    if (!list) {
      deps.log?.(`stripe-refund: list ${l.status}`);
      return json(200, { error: "retry_later" });
    }
    const made = list.find((x) => (x.metadata as Record<string, unknown> | undefined)?.octo_refund_id === inf!.id);
    try {
      if (made) {
        const kept = await deps.settle(inf.id, made);
        if (inf.amount_cents === body.amountCents) return json(200, { refund: shown(kept) });   // that was this very refund
      } else if (l.body!.has_more === true) {
        return json(200, { error: "retry_later" });
      } else if (inf.amount_cents !== body.amountCents) {
        await deps.settle(inf.id, { error: "not_sent" });   // Stripe never made it: the other amount may go
      }
    } catch {
      deps.log?.("stripe-refund: settle failed");
      return json(200, { error: "retry_later" });
    }
  }

  let o: Opened;
  try {
    o = await deps.open(uid, body);
  } catch (e) {
    return refused(e, "open");
  }
  // already answered (a repeat after the answer, or the webhook was first): never a second call to Stripe
  if (o.status !== "pending" || o.stripe_refund_id) return json(200, { refund: shown(o as unknown as Record<string, unknown>) });

  const form: Record<string, string> = {
    payment_intent: o.payment_intent,
    amount: String(o.amount_cents),
    reason: "requested_by_customer",
    "metadata[octo_refund_id]": o.id,
    "metadata[company_id]": o.company_id,
  };
  // our part of the fee goes back in proportion (PRD 09 §139); Stripe's own processing fee does not come back
  if (o.platform_fee_cents > 0) form.refund_application_fee = "true";
  let r: StripeAnswer;
  try {
    r = await stripe("POST", "/v1/refunds", o.account_id, form, o.idempotency_key);
  } catch {
    deps.log?.("stripe-refund: no answer");
    return json(200, { error: "retry_later", refund: shown(o as unknown as Record<string, unknown>) });
  }
  const err = r.body && typeof r.body.error === "object" && r.body.error ? (r.body.error as Record<string, unknown>) : null;
  try {
    if (r.status === 200 && r.body && typeof r.body.id === "string" && RE.test(r.body.id)) {
      if (r.body.livemode === true) {
        deps.log?.("stripe-refund: live answer");
        return json(200, { error: "live_refused" });
      }
      const kept = await deps.settle(o.id, r.body);
      return json(200, { refund: shown(kept) });
    }
    // Stripe said no to this refund (already refunded, disputed, not enough balance): failed, nothing moved
    if ((r.status === 400 || r.status === 402 || r.status === 404) && err && err.type !== "idempotency_error") {
      const code = typeof err.code === "string" && /^[a-z_]{1,60}$/.test(err.code) ? err.code : "stripe";
      deps.log?.(`stripe-refund: refused ${r.status} ${code}`);
      const kept = await deps.settle(o.id, { error: code });
      return json(200, { error: "stripe_refused", refund: shown(kept) });
    }
  } catch {
    deps.log?.("stripe-refund: settle failed");
    return json(200, { error: "retry_later", refund: shown(o as unknown as Record<string, unknown>) });
  }
  // 401/403 (our key), 409, 429, 5xx: Stripe may yet do it — the row waits, the same key resumes it
  deps.log?.(`stripe-refund: later ${r.status} ${err ? String(err.type ?? "") : ""}`.trim());
  return json(200, { error: "retry_later", refund: shown(o as unknown as Record<string, unknown>) });
}
