/**
 * unit:stripeWebhookFn — the edge function «stripe-webhook» (step 20г, docs/specs/35-stripe.md) on events SIGNED here with a
 * test secret, the way Stripe signs them (HMAC-SHA256 of «t.raw body», WebCrypto as in Deno): the signature first, over the raw
 * bytes; 5 minutes of tolerance; the intent read back for its method and Stripe's fee; 55000 and failures → 500 (Stripe
 * retries); nothing of the event and no secret in a log.
 */
import { describe, it, expect } from "vitest";
import { DbError, TOLERANCE_S, handleHook, hmacHex, methodAndFee, sameText, verifySignature, type HookDeps, type StripeAnswer } from "../../../supabase/functions/stripe-webhook/handler";

const SECRET = "whsec_test_FIXTURE";
const NOW = 1_800_000_000;
const ev = (over: Record<string, unknown> = {}) => ({
  id: "evt_1",
  type: "payment_intent.succeeded",
  account: "acct_T1",
  livemode: false,
  data: { object: { id: "pi_1", currency: "usd", amount: 150000, amount_received: 150000, metadata: { company_id: "ca000000-0000-0000-0000-000000000000", attempt_id: "a1" }, billing_details: { name: "Jane Client" } } },
  ...over,
});
async function signed(body: string, o: { t?: number; secret?: string } = {}) {
  const t = o.t ?? NOW;
  return `t=${t},v1=${await hmacHex(o.secret ?? SECRET, `${t}.${body}`)},v0=deadbeef`;
}
const req = (body: string, sig: string | null, method = "POST", len?: string) => ({
  method,
  header: (n: string) => (n.toLowerCase() === "stripe-signature" ? sig : n.toLowerCase() === "content-length" ? (len ?? null) : null),
  text: async () => body,
});
const expanded = {
  id: "pi_1",
  payment_method: { id: "pm_1", type: "us_bank_account" },
  latest_charge: { id: "ch_1", balance_transaction: { fee_details: [{ type: "stripe_fee", amount: 500 }, { type: "application_fee", amount: 75 }] } },
};
function deps(o: Partial<HookDeps> & { answer?: StripeAnswer | Error; fail?: DbError } = {}) {
  const { answer, fail, ...over } = o;
  const applied: { event: Record<string, unknown>; method: string | null; fee: number | null }[] = [];
  const reads: string[] = [];
  const logs: string[] = [];
  const d: HookDeps = {
    secret: SECRET,
    now: () => NOW,
    stripe: async (path, account) => {
      reads.push(`${account} ${path}`);
      if (answer instanceof Error) throw answer;
      return answer ?? { status: 200, body: expanded };
    },
    keyMode: "test",
    apply: async (event, method, fee) => {
      if (fail) throw fail;
      applied.push({ event, method, fee });
      return "processed";
    },
    log: (m) => logs.push(m),
    ...over,
  };
  return { d, applied, reads, logs };
}

describe("stripe-webhook: the signature first", () => {
  it("a body signed with our secret is applied", async () => {
    const body = JSON.stringify(ev());
    const { d, applied } = deps();
    const r = await handleHook(req(body, await signed(body)), d);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ result: "processed" });
    expect(applied).toHaveLength(1);
  });
  it("no signature, another secret, a changed byte, an old or a future timestamp — 400, nothing applied, nothing read", async () => {
    const body = JSON.stringify(ev());
    const cases = [
      null,
      "",
      "t=1800000000",
      await signed(body, { secret: "whsec_other" }),
      await signed(body, { t: NOW - TOLERANCE_S - 1 }),
      await signed(body, { t: NOW + TOLERANCE_S + 1 }),
    ];
    for (const sig of cases) {
      const { d, applied, reads } = deps();
      expect((await handleHook(req(body, sig), d)).status).toBe(400);
      expect(applied).toEqual([]);
      expect(reads).toEqual([]);
    }
    // the signature is over the raw bytes: the same JSON with one more space is another body
    const { d, applied } = deps();
    expect((await handleHook(req(body.replace(":", ": "), await signed(body)), d)).status).toBe(400);
    expect(applied).toEqual([]);
  });
  it("within the tolerance; any of several v1 (a rolled secret) may match", async () => {
    const body = JSON.stringify(ev());
    expect(await verifySignature(body, await signed(body, { t: NOW - TOLERANCE_S }), SECRET, NOW)).toBe(true);
    const good = (await signed(body)).split(",")[1];
    expect(await verifySignature(body, `t=${NOW},v1=${"0".repeat(64)},${good}`, SECRET, NOW)).toBe(true);
    expect(sameText("abc", "abd")).toBe(false);
    expect(sameText("abc", "abc")).toBe(true);
  });
  it("no secret set — 503, nothing read", async () => {
    const body = JSON.stringify(ev());
    const { d, applied } = deps({ secret: "" });
    expect((await handleHook(req(body, await signed(body)), d)).status).toBe(503);
    expect(applied).toEqual([]);
  });
  it("only POST; a signed body that is not a Stripe event — 400", async () => {
    const { d } = deps();
    expect((await handleHook(req("{}", null, "GET"), d)).status).toBe(405);
    for (const b of ["not json", JSON.stringify({ id: "x", type: "y", data: { object: {} } }), JSON.stringify({ id: "evt_1", type: "a" })]) {
      expect((await handleHook(req(b, await signed(b)), d)).status).toBe(400);
    }
  });
});

describe("stripe-webhook: method and fee", () => {
  it("the intent is read back on the event's account with the method and the balance transaction", async () => {
    const body = JSON.stringify(ev());
    const { d, applied, reads } = deps();
    await handleHook(req(body, await signed(body)), d);
    expect(reads).toEqual(["acct_T1 /v1/payment_intents/pi_1?expand[]=payment_method&expand[]=latest_charge.balance_transaction"]);
    // ACH, Stripe's fee only (not our application fee); the event goes as Stripe sent it
    expect(applied[0].method).toBe("ach");
    expect(applied[0].fee).toBe(500);
    expect(applied[0].event).toEqual(ev());
  });
  it("methodAndFee: a card; no balance transaction yet — no fee", () => {
    expect(methodAndFee({ payment_method: { type: "card" }, latest_charge: "ch_1" })).toEqual({ method: "card", fee: null });
    expect(methodAndFee({ payment_method: "pm_1" })).toEqual({ method: null, fee: null });
    expect(methodAndFee(null)).toEqual({ method: null, fee: null });
  });
  it("succeeded and a passing failure to read the intent (5xx, 429, no answer) — 500, Stripe retries", async () => {
    const body = JSON.stringify(ev());
    for (const answer of [{ status: 500, body: null }, { status: 429, body: null }, new Error("down")]) {
      const { d, applied } = deps({ answer });
      expect((await handleHook(req(body, await signed(body)), d)).status).toBe(500);
      expect(applied).toEqual([]);
    }
  });
  it("a lasting refusal (401, 403, 404, another id) — the payment is applied all the same, without method and fee", async () => {
    const body = JSON.stringify(ev());
    for (const answer of [{ status: 401, body: null }, { status: 403, body: null }, { status: 404, body: null }, { status: 200, body: { id: "pi_other" } }]) {
      const { d, applied, logs } = deps({ answer });
      expect((await handleHook(req(body, await signed(body)), d)).status).toBe(200);
      expect(applied[0]).toMatchObject({ method: null, fee: null });
      expect(logs.join(" ")).toContain("without method and fee");
    }
  });
  it("processing that cannot be read is applied without method and fee (the event's own types decide)", async () => {
    const body = JSON.stringify(ev({ type: "payment_intent.processing" }));
    const { d, applied } = deps({ answer: { status: 503, body: null } });
    expect((await handleHook(req(body, await signed(body)), d)).status).toBe(200);
    expect(applied[0]).toMatchObject({ method: null, fee: null });
  });
  it("not ours (no attempt in metadata), a type the database does not apply, a live key or a charge event — nothing is read", async () => {
    const own = ev();
    (own.data.object as Record<string, unknown>).metadata = {};
    for (const [e, over] of [
      [own, {}],
      [ev({ type: "payment_intent.created" }), {}],
      [ev(), { keyMode: "live" as const }],
      [ev({ type: "charge.refunded", data: { object: { id: "ch_1", payment_intent: "pi_1", amount_refunded: 10 } } }), {}],
    ] as const) {
      const body = JSON.stringify(e);
      const { d, reads, applied } = deps(over);
      expect((await handleHook(req(body, await signed(body)), d)).status).toBe(200);
      expect(reads).toEqual([]);
      expect(applied[0]).toMatchObject({ method: null, fee: null });
    }
  });
  it("a live event is not applied at all (test mode only)", async () => {
    const body = JSON.stringify(ev({ livemode: true, type: "account.updated", data: { object: { id: "acct_T1", livemode: true } } }));
    const { d, reads, applied } = deps();
    const r = await handleHook(req(body, await signed(body)), d);
    expect([r.status, JSON.parse(r.body).result]).toEqual([200, "ignored"]);
    expect(reads).toEqual([]);
    expect(applied).toEqual([]);
  });
  it("a body over 1 MB is not read", async () => {
    const { d, applied } = deps();
    expect((await handleHook(req("{}", "t=1,v1=" + "0".repeat(64), "POST", "2000000"), d)).status).toBe(413);
    expect(applied).toEqual([]);
  });
});

describe("stripe-webhook: what Stripe is told", () => {
  it("55000 (not recorded yet) and any failure → 500; a signed event the database refuses → 200 (no three days of retries)", async () => {
    const body = JSON.stringify(ev({ type: "charge.refunded", data: { object: { id: "ch_1", payment_intent: "pi_1" } } }));
    const sig = await signed(body);
    expect((await handleHook(req(body, sig), deps({ fail: new DbError("55000") }).d)).status).toBe(500);
    expect((await handleHook(req(body, sig), deps({ fail: new DbError(null) }).d)).status).toBe(500);
    const rej = await handleHook(req(body, sig), deps({ fail: new DbError("22023") }).d);
    expect([rej.status, JSON.parse(rej.body).result]).toEqual([200, "rejected"]);
  });
  it("no client's data and no secret in the log", async () => {
    const body = JSON.stringify(ev());
    const { d, logs } = deps({ answer: { status: 500, body: null } });
    await handleHook(req(body, await signed(body)), d);
    expect(logs.length).toBe(1);   // a passing failure: logged once, nothing of the client
    expect(logs.join(" ")).not.toContain("Jane");
    expect(logs.join(" ")).not.toContain(SECRET);
  });
});
