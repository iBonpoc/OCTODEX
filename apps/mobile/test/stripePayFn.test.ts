/**
 * unit:stripePayFn — the edge function «stripe-pay» (step 20в, docs/specs/35-stripe.md) with a fake Stripe and database:
 * only our site (CORS by Origin, never «*»); the /p/ token goes to the database untouched (IDOR is checked there, T131) and its
 * refusals become short codes; test mode only; a direct charge on the contractor's account with the attempt's key; an attempt
 * with an intent reuses it; ACH first from $1,000; the key and Stripe's own text never in an answer or a log.
 */
import { describe, it, expect } from "vitest";
import {
  ALLOWED_ORIGINS,
  DbError,
  handlePay,
  intentForm,
  methodsFor,
  parseBody,
  type Attempt,
  type PayDeps,
  type StripeAnswer,
  clientIp,
  ipKey,
  netKey,
} from "../../../supabase/functions/stripe-pay/handler";
import * as intake from "../../../supabase/functions/lead-intake/handler";

const SITE = ALLOWED_ORIGINS[0];
const TOKEN = "tok_inv_0123456789abcdef";
const INV = "11310000-0000-4000-8000-000000000001";
const KEY = "sk_test_SECRETxyz";
const req = (o: { method?: string; origin?: string | null; body?: unknown; ip?: string | null } = {}) => ({
  method: o.method ?? "POST",
  header: (n: string) =>
    n.toLowerCase() === "origin" ? (o.origin === undefined ? SITE : o.origin)
      : n.toLowerCase() === "cf-connecting-ip" ? (o.ip === undefined ? "203.0.113.7" : o.ip)
      : n.toLowerCase() === "x-forwarded-for" ? "198.51.100.9" : null,
  text: async () => (typeof o.body === "string" ? o.body : JSON.stringify(o.body ?? { token: TOKEN, invoiceId: INV })),
});
const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  attempt_id: "a1310000-0000-4000-8000-000000000001",
  company_id: "ca000000-0000-0000-0000-000000000000",
  invoice_id: INV,
  amount_cents: 150000,
  idempotency_key: `pa:${INV}:150000:1`,
  account_id: "acct_T1",
  payment_intent_id: null,
  status: "open",
  ...over,
});
const pi = (over: Record<string, unknown> = {}) => ({
  id: "pi_New1",
  amount: 150000,
  currency: "usd",
  livemode: false,
  status: "requires_payment_method",
  client_secret: "pi_New1_secret_abc",
  metadata: { attempt_id: "a1310000-0000-4000-8000-000000000001" },
  ...over,
});
type Call = { method: string; path: string; form?: Record<string, string>; idem?: string; account: string };
function deps(opt: Partial<PayDeps> & { a?: Attempt | Error; answers?: Record<string, StripeAnswer>; setFails?: number } = {}) {
  const { a: aOpt, answers: ans, setFails = 0, ...over } = opt;
  const calls: Call[] = [];
  const opened: [string, string][] = [];
  const kept: [string, string][] = [];
  const closed: string[] = [];
  const logs: string[] = [];
  let fails = setFails;
  const answers: Record<string, StripeAnswer> = { "POST /v1/payment_intents": { status: 200, body: pi() }, ...ans };
  const d: PayDeps = {
    open: async (t, i) => {
      opened.push([t, i]);
      if (aOpt instanceof Error) throw aOpt;
      return aOpt ?? attempt();
    },
    closeAttempt: async (p) => {
      closed.push(p);
    },
    setIntent: async (a, p) => {
      if (fails-- > 0) throw new Error("down");
      kept.push([a, p]);
    },
    stripe: async (method, path, o) => {
      calls.push({ method, path, form: o.form, idem: o.idempotencyKey, account: o.account });
      return answers[`${method} ${path}`] ?? { status: 404, body: { error: { type: "invalid_request_error", message: "No such thing: " + KEY } } };
    },
    keyMode: "test",
    publishableKey: "pk_test_PUBLIC",
    rate: async () => null,
    invoiceRate: async () => null,
    sha256: async (x) => `sha(${x})`,
    hmac: async (x) => `hmac(${x})`,
    ipHeaders: ["cf-connecting-ip"],
    log: (m) => logs.push(m),
    ...over,
  };
  return { d, calls, opened, kept, logs, closed };
}
const body = (r: { body: string }) => JSON.parse(r.body);

describe("stripe-pay: who may call", () => {
  it("only our production site; the CORS answer names it, never «*»", async () => {
    const { d, opened } = deps();
    for (const origin of [null, "https://evil.example", "https://octodex--pr-12.expo.app", "http://octodex.expo.app"]) {
      const r = await handlePay(req({ origin }), d);
      expect(r.status).toBe(403);
      expect(r.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    }
    expect(opened).toEqual([]);
    const pre = await handlePay(req({ method: "OPTIONS" }), d);
    expect(pre.status).toBe(204);
    expect(pre.headers["Access-Control-Allow-Origin"]).toBe(SITE);
    expect(pre.headers.Vary).toBe("Origin");
  });
  it("a bad body opens nothing", async () => {
    expect(parseBody(JSON.stringify({ token: TOKEN, invoiceId: INV }))).toEqual({ token: TOKEN, invoiceId: INV });
    for (const b of ["nope", { token: "short", invoiceId: INV }, { token: TOKEN, invoiceId: "x" }, { token: TOKEN, invoiceId: INV, amount: 1 }, [1]]) {
      const { d, opened } = deps();
      expect((await handlePay(req({ body: b }), d)).status).toBe(400);
      expect(opened).toEqual([]);
    }
  });
  it("the token and the invoice go to the database as they came — it decides (T131)", async () => {
    const { d, opened } = deps();
    await handlePay(req(), d);
    expect(opened).toEqual([[TOKEN, INV]]);
  });
  it("the database's refusals become short codes, never its text", async () => {
    const cases: [string | null, number, string][] = [
      ["P0002", 409, "nothing_to_pay"],
      ["42501", 403, "closed"],
      ["22023", 409, "nothing_to_pay"],
      ["55000", 409, "not_connected"],
      [null, 500, "failed"],
    ];
    for (const [code, status, error] of cases) {
      const { d, calls } = deps({ a: new DbError(code) });
      const r = await handlePay(req(), d);
      expect([r.status, body(r).error]).toEqual([status, error]);
      expect(calls).toEqual([]);
    }
  });
});

describe("stripe-pay: test mode only", () => {
  it("no key, a live key or a live publishable key — no payment", async () => {
    expect(body(await handlePay(req(), deps({ stripe: null, keyMode: null }).d)).error).toBe("not_configured");
    expect(body(await handlePay(req(), deps({ keyMode: "live" }).d)).error).toBe("live_refused");
    expect(body(await handlePay(req(), deps({ publishableKey: "pk_live_X" }).d)).error).toBe("live_refused");
    expect(body(await handlePay(req(), deps({ publishableKey: "" }).d)).error).toBe("not_configured");
  });
  it("a live intent from Stripe is not handed to the page", async () => {
    const { d } = deps({ answers: { "POST /v1/payment_intents": { status: 200, body: pi({ livemode: true }) } } });
    expect((await handlePay(req(), d)).status).toBe(502);
  });
});

describe("stripe-pay: the PaymentIntent", () => {
  it("a direct charge on the contractor's account, the attempt's key, the attempt in metadata, kept on the attempt", async () => {
    const { d, calls, kept } = deps();
    const r = await handlePay(req(), d);
    expect(r.status).toBe(200);
    expect(body(r)).toEqual({
      state: "ready",
      clientSecret: "pi_New1_secret_abc",
      account: "acct_T1",
      publishableKey: "pk_test_PUBLIC",
      amountCents: 150000,
      methods: ["us_bank_account", "card"],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/v1/payment_intents", account: "acct_T1", idem: `pa:${INV}:150000:1` });
    expect(calls[0].form).toMatchObject({
      amount: "150000",
      currency: "usd",
      "metadata[attempt_id]": "a1310000-0000-4000-8000-000000000001",
      "metadata[company_id]": "ca000000-0000-0000-0000-000000000000",
      "payment_method_types[0]": "us_bank_account",
      "payment_method_types[1]": "card",
    });
    expect(calls[0].form).not.toHaveProperty("application_fee_amount");
    expect(kept).toEqual([["a1310000-0000-4000-8000-000000000001", "pi_New1"]]);
  });
  it("ACH first from $1,000, a card first below", () => {
    expect(methodsFor(100000)).toEqual(["us_bank_account", "card"]);
    expect(methodsFor(99999)).toEqual(["card", "us_bank_account"]);
    expect(intentForm(attempt({ amount_cents: 5000 }))["payment_method_types[0]"]).toBe("card");
  });
  it("an intent for another amount or attempt is not handed to the page", async () => {
    for (const bad of [pi({ amount: 1 }), pi({ metadata: { attempt_id: "other" } }), pi({ currency: "eur" }), pi({ id: "x" })]) {
      const { d } = deps({ answers: { "POST /v1/payment_intents": { status: 200, body: bad } } });
      expect((await handlePay(req(), d)).status).toBe(502);
    }
  });
  it("the intent is kept after a few tries; when it is not, it is not handed out (a retry gets the same intent by the key)", async () => {
    const two = deps({ setFails: 2 });
    expect((await handlePay(req(), two.d)).status).toBe(200);
    expect(two.kept).toHaveLength(1);
    const lost = deps({ setFails: 9 });
    const r = await handlePay(req(), lost.d);
    expect(r.status).toBe(502);
    expect(r.body).not.toContain("secret");
    expect(lost.logs.join(" ")).toContain("not kept");
  });
  it("the invoice's other payable intents are cancelled, their attempts closed at once, before a new one is handed out", async () => {
    const a = attempt({ stale_intents: ["pi_Old1", "pi_Old2", "bad/../x"] });
    const { d, calls, closed } = deps({
      a,
      answers: {
        "POST /v1/payment_intents/pi_Old1/cancel": { status: 200, body: { status: "canceled" } },
        "POST /v1/payment_intents/pi_Old2/cancel": { status: 400, body: {} },
        "GET /v1/payment_intents/pi_Old2": { status: 200, body: { id: "pi_Old2", status: "canceled" } },
      },
    });
    expect((await handlePay(req(), d)).status).toBe(200);
    expect(calls.map((c) => `${c.method} ${c.path} ${c.account}`)).toEqual([
      "POST /v1/payment_intents/pi_Old1/cancel acct_T1",
      "POST /v1/payment_intents/pi_Old2/cancel acct_T1",
      "GET /v1/payment_intents/pi_Old2 acct_T1",
      "POST /v1/payment_intents acct_T1",
    ]);
    expect(closed).toEqual(["pi_Old1", "pi_Old2"]);
  });
  it("an older intent already paid or on its way (cancel refused, no webhook yet) — no new intent: «processing»", async () => {
    for (const status of ["succeeded", "processing", "requires_capture"]) {
      const a = attempt({ stale_intents: ["pi_Paid"] });
      const { d, calls, closed } = deps({
        a,
        answers: {
          "POST /v1/payment_intents/pi_Paid/cancel": { status: 400, body: { error: { type: "invalid_request_error" } } },
          "GET /v1/payment_intents/pi_Paid": { status: 200, body: { id: "pi_Paid", status } },
        },
      });
      const r = await handlePay(req(), d);
      expect(body(r)).toEqual({ state: "processing" });
      expect(calls.some((c) => c.path === "/v1/payment_intents" && c.method === "POST")).toBe(false);
      expect(closed).toEqual([]);
    }
  });
  it("an older intent that cannot be cancelled nor read — no second payable intent", async () => {
    const a = attempt({ stale_intents: ["pi_Old1"] });
    const { d, calls } = deps({ a, answers: { "POST /v1/payment_intents/pi_Old1/cancel": { status: 500, body: null }, "GET /v1/payment_intents/pi_Old1": { status: 500, body: null } } });
    expect((await handlePay(req(), d)).status).toBe(502);
    expect(calls.some((c) => c.path === "/v1/payment_intents" && c.method === "POST")).toBe(false);
  });
  it("an attempt with an intent reuses it — no second intent", async () => {
    const a = attempt({ payment_intent_id: "pi_Old1" });
    const { d, calls } = deps({ a, answers: { "GET /v1/payment_intents/pi_Old1": { status: 200, body: pi({ id: "pi_Old1", client_secret: "pi_Old1_secret" }) } } });
    const r = await handlePay(req(), d);
    expect(body(r).clientSecret).toBe("pi_Old1_secret");
    expect(calls.map((c) => `${c.method} ${c.path} ${c.account}`)).toEqual(["GET /v1/payment_intents/pi_Old1 acct_T1"]);
  });
  it("an intent on its way (ACH processing) is not paid again; a canceled one waits for the webhook", async () => {
    const a = attempt({ payment_intent_id: "pi_Old1" });
    const on = deps({ a, answers: { "GET /v1/payment_intents/pi_Old1": { status: 200, body: pi({ id: "pi_Old1", status: "processing" }) } } });
    expect(body(await handlePay(req(), on.d))).toEqual({ state: "processing" });
    expect(on.calls).toHaveLength(1);
    // canceled: its attempt is closed at once and a fresh one gets a new intent — no «retry later» until the webhook
    let opens = 0;
    const gone = deps({ answers: { "GET /v1/payment_intents/pi_Old1": { status: 200, body: pi({ id: "pi_Old1", status: "canceled" }) } } });
    gone.d.open = async () => (opens++ === 0 ? a : attempt({ attempt_id: "a1310000-0000-4000-8000-000000000001", idempotency_key: "pa:new:2" }));
    const r = await handlePay(req(), gone.d);
    expect(body(r).state).toBe("ready");
    expect(gone.closed).toEqual(["pi_Old1"]);
    expect(gone.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /v1/payment_intents/pi_Old1", "POST /v1/payment_intents"]);
    expect(gone.calls[1].idem).toBe("pa:new:2");
  });
  it("Stripe's error text and the key never reach the answer or the log", async () => {
    const { d, logs } = deps({ answers: { "POST /v1/payment_intents": { status: 400, body: { error: { type: "card_error", message: `bad ${KEY}` } } } } });
    const r = await handlePay(req(), d);
    expect(r.status).toBe(502);
    expect(r.body).not.toContain(KEY);
    expect(logs.join(" ")).not.toContain(KEY);
    expect(logs.join(" ")).toContain("card_error");
  });
});

describe("stripe-pay: rate limits (spec 35 §4д)", () => {
  type Rated = [string, string | null, string | null];
  it("the link and the address are counted as hashes, before the database looks at the link", async () => {
    const seen: Rated[] = [];
    const { d, opened } = deps({ rate: async (t, i, n) => (seen.push([t, i, n]), null) });
    expect((await handlePay(req(), d)).status).toBe(200);
    expect(seen).toEqual([[`sha(${TOKEN})`, "hmac(pay:203.0.113.7)", null]]);
    expect(opened.length).toBe(1);
  });
  it("only Cloudflare's header; IPv6 by its /64 and /48", async () => {
    const seen: Rated[] = [];
    const { d } = deps({ rate: async (t, i, n) => (seen.push([t, i, n]), null) });
    await handlePay(req({ ip: "2001:db8:abcd:12:1:2:3:4" }), d);
    expect(seen[0][1]).toBe("hmac(pay:2001:db8:abcd:12::/64)");
    expect(seen[0][2]).toBe("hmac(pay:2001:db8:abcd::/48)");
    seen.length = 0;
    await handlePay(req({ ip: null }), d); // x-forwarded-for is what the client wrote: not trusted
    expect(seen[0][1]).toBeNull();
  });
  it("over the limit: 429 with Retry-After and CORS, the link is not looked at, Stripe is not called", async () => {
    const { d, opened, calls } = deps({ rate: async () => 240 });
    const r = await handlePay(req(), d);
    expect(r.status).toBe(429);
    expect(body(r)).toEqual({ error: "rate_limited", retryAfter: 240 });
    expect(r.headers["Retry-After"]).toBe("240");
    expect(r.headers["Access-Control-Allow-Origin"]).toBe(SITE);
    expect(opened).toEqual([]);
    expect(calls).toEqual([]);
  });
  it("the invoice limit is checked after the link, before any intent is made or cancelled", async () => {
    let inv = "";
    const { d, opened, calls } = deps({ invoiceRate: async (i) => ((inv = i), 30), a: attempt({ stale_intents: ["pi_Old1"] }) });
    const r = await handlePay(req(), d);
    expect(r.status).toBe(429);
    expect(inv).toBe(INV);
    expect(opened.length).toBe(1);
    expect(calls).toEqual([]);
  });
  it("no IP secret: the link still counts (with no address — the whole-function ceiling), and it is in the log", async () => {
    const seen: Rated[] = [];
    const { d, logs } = deps({ hmac: null, rate: async (t, i, n) => (seen.push([t, i, n]), null) });
    expect((await handlePay(req(), d)).status).toBe(200);
    expect(seen).toEqual([[`sha(${TOKEN})`, null, null]]);
    expect(logs.join(" ")).toContain("no ip secret");
    expect(logs.join(" ")).not.toContain("203.0.113.7");
  });
  it("an HMAC that fails counts as no IP (the whole-function ceiling), never no limit", async () => {
    const seen: Rated[] = [];
    const { d, logs } = deps({ hmac: async () => { throw new Error("key"); }, rate: async (t, i, n) => (seen.push([t, i, n]), null) });
    expect((await handlePay(req(), d)).status).toBe(200);
    expect(seen).toEqual([[`sha(${TOKEN})`, null, null]]);
    expect(logs.join(" ")).toContain("ip hmac failed");
  });
  it("the page may read Retry-After", async () => {
    const { d } = deps({ rate: async () => 60 });
    expect((await handlePay(req(), d)).headers["Access-Control-Expose-Headers"]).toBe("Retry-After");
  });
  it("the limit failing lets the payment through, with a line in the log", async () => {
    const { d, logs } = deps({ rate: async () => { throw new Error("db"); }, invoiceRate: async () => { throw new Error("db"); } });
    expect((await handlePay(req(), d)).status).toBe(200);
    expect(logs.join(" ")).toContain("rate limit failed");
  });
  it("a wait is whole seconds between 1 and 600", async () => {
    for (const [w, want] of [[0.2, "1"], [9999, "600"]] as const) {
      const { d } = deps({ rate: async () => w });
      expect((await handlePay(req(), d)).headers["Retry-After"]).toBe(want);
    }
  });
  it("a bad body is refused before anything is counted", async () => {
    let n = 0;
    const { d } = deps({ rate: async () => (n++, null) });
    expect((await handlePay(req({ body: { token: "x" } }), d)).status).toBe(400);
    expect(n).toBe(0);
  });
});

describe("stripe-pay: the client's IP is read as lead-intake reads it", () => {
  it("the same keys for IPv4, IPv4-in-IPv6, IPv6 and lists", () => {
    for (const ip of ["203.0.113.7", "::ffff:203.0.113.7", "2001:db8:abcd:12:1:2:3:4", "2001:DB8::1", "::1", "fe80::"]) {
      expect(ipKey(ip)).toBe(intake.ipKey(ip));
      expect(netKey(ip)).toBe(intake.netKey(ip));
    }
    const r = { method: "POST", url: "https://x/", text: async () => "", header: (n: string): string | null => (n === "cf-connecting-ip" ? "10.0.0.1, 203.0.113.7" : n === "x-bad" ? "<script>" : null) };
    for (const hs of [["cf-connecting-ip"], ["x-bad"], ["x-none"]]) expect(clientIp(r, hs)).toBe(intake.clientIp(r, hs));
  });
});
