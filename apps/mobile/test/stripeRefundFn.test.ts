/**
 * unit:stripeRefundFn — the edge function «stripe-refund» (step 20д, docs/specs/35-stripe.md §4в) with a fake Stripe:
 * the uid only from the token; a strict body; the row before Stripe, its key to Stripe; Stripe's «no» → failed;
 * no answer → the row waits (retry_later), never a second call for an answered row; test mode only; Stripe's text never out.
 */
import { describe, it, expect } from "vitest";
import { DbError, handleRefund, parseBody, type Opened, type RefundDeps, type StripeAnswer } from "../../../supabase/functions/stripe-refund/handler";

const UID = "a2000000-0000-4000-8000-000000000001";
const PAY = "21330000-0000-4000-8000-000000000002";
const ROW = "31330000-0000-4000-8000-000000000001";
const BODY = { paymentId: PAY, amountCents: 5000, reasonKind: "goodwill", reason: " fence ", key: "k-refund-0001" };
const req = (o: { method?: string; auth?: string | null; body?: unknown } = {}) => ({
  method: o.method ?? "POST",
  header: (n: string) => (n.toLowerCase() === "authorization" ? (o.auth === undefined ? "Bearer user.jwt" : o.auth) : null),
  text: async () => (typeof o.body === "string" ? o.body : JSON.stringify(o.body ?? BODY)),
});
const opened = (over: Partial<Opened> = {}): Opened => ({
  id: ROW, payment_id: PAY, amount_cents: 5000, status: "pending", tax_cents: 0, net_cents: 5000, failure_reason: null,
  account_id: "acct_T1", payment_intent: "pi_T1", company_id: "ca000000-0000-0000-0000-000000000000", stripe_refund_id: null,
  fee_cents: 175, platform_fee_cents: 0, idempotency_key: `octodex-refund-${ROW}`, ...over,
});
type Call = { path: string; form: Record<string, string>; idem: string; account: string };
function deps(o: { open?: Opened | Error; answer?: StripeAnswer | Error; over?: Partial<RefundDeps> } = {}) {
  const calls: Call[] = [];
  const settled: Record<string, unknown>[] = [];
  const logs: string[] = [];
  const d: RefundDeps = {
    userOf: async (jwt) => (jwt === "user.jwt" ? UID : null),
    open: async () => {
      if (o.open instanceof Error) throw o.open;
      return o.open ?? opened();
    },
    settle: async (id, s) => (settled.push(s), { id, status: s.error ? "failed" : s.status, amount_cents: 5000, tax_cents: 0, net_cents: 5000, stripe_refund_id: s.id }),
    stripe: async (path, form, idem, account) => {
      calls.push({ path, form, idem, account });
      if (o.answer instanceof Error) throw o.answer;
      return o.answer ?? { status: 200, body: { id: "re_T1", status: "succeeded", amount: 5000, payment_intent: "pi_T1" } };
    },
    keyMode: "test",
    log: (m) => logs.push(m),
    ...o.over,
  };
  return { d, calls, settled, logs };
}
const parse = (r: { body: string }) => JSON.parse(r.body || "null");

describe("unit:stripeRefundFn — who and what", () => {
  it("OPTIONS, only POST, a token", async () => {
    expect((await handleRefund(req({ method: "OPTIONS" }), deps().d)).status).toBe(204);
    expect((await handleRefund(req({ method: "GET" }), deps().d)).status).toBe(405);
    const x = deps();
    expect((await handleRefund(req({ auth: null }), x.d)).status).toBe(401);
    expect((await handleRefund(req({ auth: "Bearer other" }), x.d)).status).toBe(401);
    expect(x.calls).toHaveLength(0);
  });
  it("a strict body", () => {
    expect(parseBody(JSON.stringify(BODY))).toMatchObject({ paymentId: PAY, amountCents: 5000, reason: "fence" });
    for (const bad of [
      { ...BODY, amountCents: 0 }, { ...BODY, amountCents: 1.5 }, { ...BODY, amountCents: "5000" }, { ...BODY, reasonKind: "whim" },
      { ...BODY, key: "short" }, { ...BODY, paymentId: "x" }, { ...BODY, userId: UID }, { ...BODY, reason: "x".repeat(501) },
    ]) expect(parseBody(JSON.stringify(bad))).toBeNull();
    expect(parseBody("{")).toBeNull();
  });
  it("test mode only, no key — nothing asked", async () => {
    const live = deps({ over: { keyMode: "live" } });
    expect(parse(await handleRefund(req(), live.d)).error).toBe("live_refused");
    const none = deps({ over: { stripe: null, keyMode: null } });
    expect(parse(await handleRefund(req(), none.d)).error).toBe("not_configured");
    expect(live.calls.length + none.calls.length).toBe(0);
  });
  it("the database refuses: 403 for the role, our word for the rest, never Stripe", async () => {
    const role = deps({ open: new DbError("42501", "only owner/admin can refund") });
    expect((await handleRefund(req(), role.d)).status).toBe(403);
    for (const w of ["refund_above_available", "refund_disputed", "refund_in_progress", "refund_not_stripe"]) {
      const x = deps({ open: new DbError("23514", w) });
      const r = await handleRefund(req(), x.d);
      expect([r.status, parse(r).error]).toEqual([200, w]);
      expect(x.calls).toHaveLength(0);
    }
    expect((await handleRefund(req(), deps({ open: new DbError("XX000", "boom") }).d)).status).toBe(500);
  });
});

describe("unit:stripeRefundFn — Stripe", () => {
  it("the row's key and metadata go to the connected account; the answer is kept", async () => {
    const x = deps();
    const r = parse(await handleRefund(req(), x.d));
    expect(x.calls).toEqual([{
      path: "/v1/refunds", idem: `octodex-refund-${ROW}`, account: "acct_T1",
      form: { payment_intent: "pi_T1", amount: "5000", reason: "requested_by_customer", "metadata[octo_refund_id]": ROW, "metadata[company_id]": "ca000000-0000-0000-0000-000000000000" },
    }]);
    expect(r.refund).toMatchObject({ id: ROW, status: "succeeded" });
    expect(JSON.stringify(r)).not.toMatch(/re_T1|acct_|pi_/);
  });
  it("our application fee back in proportion only when there is one", async () => {
    const x = deps({ open: opened({ platform_fee_cents: 50 }) });
    await handleRefund(req(), x.d);
    expect(x.calls[0].form.refund_application_fee).toBe("true");
  });
  it("an answered row is never sent to Stripe again", async () => {
    for (const o of [opened({ status: "succeeded" }), opened({ stripe_refund_id: "re_T1" }), opened({ status: "failed" })]) {
      const x = deps({ open: o });
      expect(parse(await handleRefund(req(), x.d)).refund.id).toBe(ROW);
      expect(x.calls).toHaveLength(0);
    }
  });
  it("Stripe says no → failed with its code, not its text", async () => {
    const x = deps({ answer: { status: 400, body: { error: { type: "invalid_request_error", code: "charge_already_refunded", message: "secret sk_test_X" } } } });
    const r = await handleRefund(req(), x.d);
    expect(parse(r).error).toBe("stripe_refused");
    expect(x.settled).toEqual([{ error: "charge_already_refunded" }]);
    expect(r.body + x.logs.join()).not.toMatch(/sk_test|secret/);
  });
  it("no answer, 5xx, 429, idempotency in use → the row waits, nothing settled", async () => {
    for (const a of [new Error("timeout"), { status: 500, body: null }, { status: 429, body: { error: { type: "rate_limit_error" } } },
      { status: 400, body: { error: { type: "idempotency_error" } } }, { status: 401, body: { error: { type: "authentication_error" } } }] as (StripeAnswer | Error)[]) {
      const x = deps({ answer: a });
      expect(parse(await handleRefund(req(), x.d)).error).toBe("retry_later");
      expect(x.settled).toHaveLength(0);
    }
  });
  it("a live answer is not kept", async () => {
    const x = deps({ answer: { status: 200, body: { id: "re_T1", livemode: true } } });
    expect(parse(await handleRefund(req(), x.d)).error).toBe("live_refused");
    expect(x.settled).toHaveLength(0);
  });
});
