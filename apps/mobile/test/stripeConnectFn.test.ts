/**
 * unit:stripeConnectFn — the edge function «stripe-connect» (step 20b, docs/specs/35-stripe.md) with a fake Stripe:
 * the uid only from the token; only owner / admin of an open company; test mode only; one account per company
 * (Idempotency-Key), the Standard-equivalent controller; the link only from connect.stripe.com and back to production;
 * the key and Stripe's own error text never in an answer or a log.
 */
import { describe, it, expect } from "vitest";
import { CONTROLLER, accountForm, handleConnect, parseBody, type ConnectDeps, type StripeAnswer, type Target } from "../../../supabase/functions/stripe-connect/handler";

const UID = "a2000000-0000-4000-8000-000000000001";
const CO = "c2000000-0000-4000-8000-000000000001";
const KEY = "sk_test_SECRETxyz";
const req = (o: { method?: string; auth?: string | null; body?: unknown } = {}) => ({
  method: o.method ?? "POST",
  header: (n: string) => (n.toLowerCase() === "authorization" ? (o.auth === undefined ? "Bearer user.jwt" : o.auth) : null),
  text: async () => (typeof o.body === "string" ? o.body : JSON.stringify(o.body ?? { action: "start", companyId: CO })),
});
type Call = { method: string; path: string; form?: Record<string, string>; idem?: string };
function deps(opt: Partial<ConnectDeps> & { tg?: Target | null; answers?: Record<string, StripeAnswer> } = {}) {
  const { tg: tgOpt, answers: ans, ...over } = opt;
  const calls: Call[] = [];
  const saved: Record<string, unknown>[] = [];
  const logs: string[] = [];
  const answers: Record<string, StripeAnswer> = {
    "POST /v1/accounts": { status: 200, body: { id: "acct_New1", charges_enabled: false, requirements: { currently_due: ["x"] } } },
    "POST /v1/account_links": { status: 200, body: { url: "https://connect.stripe.com/setup/s/abc" } },
    "GET /v1/accounts/acct_Old1": { status: 200, body: { id: "acct_Old1", charges_enabled: true } },
    ...ans,
  };
  const tg: Target | null = tgOpt === undefined ? { allowed: true, account_id: null, name: "Acme Gutters", closed: false } : tgOpt;
  const d: ConnectDeps = {
    userOf: async (jwt) => (jwt === "user.jwt" ? UID : null),
    target: async () => tg,
    save: async (_c, a) => (saved.push(a), { charges_enabled: !!a.charges_enabled }),
    stripe: async (method, path, form, idem) => {
      calls.push({ method, path, form, idem });
      return answers[`${method} ${path}`] ?? { status: 404, body: { error: { type: "invalid_request_error", message: `secret ${KEY}` } } };
    },
    keyMode: "test",
    appUrl: "https://octodex.expo.app/",
    log: (m) => logs.push(m),
    ...over,
  };
  return { d, calls, saved, logs };
}
const parse = (r: { body: string }) => JSON.parse(r.body || "null");

describe("unit:stripeConnectFn — who may", () => {
  it("OPTIONS and only POST", async () => {
    expect((await handleConnect(req({ method: "OPTIONS" }), deps().d)).status).toBe(204);
    expect((await handleConnect(req({ method: "GET" }), deps().d)).status).toBe(405);
  });
  it("no or a wrong token: 401, nothing asked", async () => {
    const x = deps();
    expect((await handleConnect(req({ auth: null }), x.d)).status).toBe(401);
    expect((await handleConnect(req({ auth: "Bearer other" }), x.d)).status).toBe(401);
    expect(x.calls).toHaveLength(0);
  });
  it("a strict body", () => {
    expect(parseBody(JSON.stringify({ action: "start", companyId: CO }))).toEqual({ action: "start", companyId: CO });
    expect(parseBody(JSON.stringify({ action: "delete", companyId: CO }))).toBeNull();
    expect(parseBody(JSON.stringify({ action: "start", companyId: "x" }))).toBeNull();
    expect(parseBody(JSON.stringify({ action: "start", companyId: CO, userId: UID }))).toBeNull();
    expect(parseBody("[")).toBeNull();
  });
  it("not owner / admin, an unknown or a closed company: 403, Stripe never called", async () => {
    for (const tg of [{ allowed: false, account_id: null, name: "A", closed: false }, null, { allowed: true, account_id: null, name: "A", closed: true }]) {
      const x = deps({ tg });
      expect((await handleConnect(req(), x.d)).status).toBe(403);
      expect(x.calls).toHaveLength(0);
    }
  });
  it("no key: «not set up»; a live key is refused (test mode only)", async () => {
    expect(parse(await handleConnect(req(), deps({ stripe: null, keyMode: null }).d))).toEqual({ error: "not_configured" });
    const live = deps({ keyMode: "live" });
    const r = await handleConnect(req(), live.d);
    expect(r.status).toBe(503);
    expect(parse(r)).toEqual({ error: "live_refused" });
    expect(live.calls).toHaveLength(0);
  });
});

describe("unit:stripeConnectFn — start and status", () => {
  it("start: one account per company (Idempotency-Key), the Standard-equivalent controller, then a link back to production", async () => {
    const x = deps();
    const r = await handleConnect(req(), x.d);
    expect(r.status).toBe(200);
    expect(parse(r)).toMatchObject({ connected: true, url: "https://connect.stripe.com/setup/s/abc", charges_enabled: false });
    expect(x.calls[0]).toMatchObject({ method: "POST", path: "/v1/accounts", idem: `octodex-connect-${CO}` });
    expect(x.calls[0]!.form).toEqual(accountForm(CO));
    expect(Object.keys(x.calls[0]!.form!).some((k) => k.includes("name"))).toBe(false);
    expect(x.calls[0]!.form).toMatchObject({ ...CONTROLLER, country: "US", "metadata[company_id]": CO });
    expect(CONTROLLER["controller[losses][payments]"]).toBe("stripe");
    expect(x.saved).toHaveLength(1);
    expect(x.calls[1]!.form).toEqual({
      account: "acct_New1", type: "account_onboarding",
      refresh_url: "https://octodex.expo.app/company/payments?stripe=refresh",
      return_url: "https://octodex.expo.app/company/payments?stripe=return",
    });
  });
  it("start with an account: no second account, only a fresh link", async () => {
    const x = deps({ tg: { allowed: true, account_id: "acct_Old1", name: "A", closed: false } });
    expect((await handleConnect(req(), x.d)).status).toBe(200);
    expect(x.calls.map((c) => c.path)).toEqual(["/v1/account_links"]);
    expect(x.calls[0]!.form!.account).toBe("acct_Old1");
  });
  it("status: none yet — nothing asked; with an account — read from Stripe and kept", async () => {
    const none = deps();
    expect(parse(await handleConnect(req({ body: { action: "status", companyId: CO } }), none.d))).toEqual({ connected: false });
    expect(none.calls).toHaveLength(0);
    const x = deps({ tg: { allowed: true, account_id: "acct_Old1", name: "A", closed: false } });
    expect(parse(await handleConnect(req({ body: { action: "status", companyId: CO } }), x.d))).toEqual({ connected: true, charges_enabled: true });
    expect(x.saved).toEqual([{ id: "acct_Old1", charges_enabled: true }]);
  });
  it("a link not from connect.stripe.com is never passed on", async () => {
    const x = deps({ answers: { "POST /v1/account_links": { status: 200, body: { url: "https://evil.test/x" } } } });
    const r = await handleConnect(req(), x.d);
    expect(r.status).toBe(502);
    expect(r.body).not.toContain("evil");
  });
  it("Stripe refuses: 502 without Stripe's text; the key is never in an answer or a log", async () => {
    const x = deps({ answers: { "POST /v1/accounts": { status: 400, body: { error: { type: "invalid_request_error", message: `bad ${KEY}` } } } } });
    const r = await handleConnect(req(), x.d);
    expect(r.status).toBe(502);
    expect(parse(r)).toEqual({ error: "stripe" });
    expect(x.saved).toHaveLength(0);
    expect(x.logs.join(" ")).toContain("invalid_request_error");
    expect(r.body + x.logs.join(" ")).not.toContain(KEY);
  });
  it("an account id that is not Stripe's is not kept", async () => {
    const x = deps({ answers: { "POST /v1/accounts": { status: 200, body: { id: "acct_bad id" } } } });
    expect((await handleConnect(req(), x.d)).status).toBe(502);
    expect(x.saved).toHaveLength(0);
  });
  it("a live account in an answer is refused even with a test key", async () => {
    const x = deps({ answers: { "POST /v1/accounts": { status: 200, body: { id: "acct_Live1", livemode: true } } } });
    expect(parse(await handleConnect(req(), x.d))).toEqual({ error: "live_refused" });
    expect(x.saved).toHaveLength(0);
    const y = deps({ tg: { allowed: true, account_id: "acct_Old1", name: "A", closed: false }, answers: { "GET /v1/accounts/acct_Old1": { status: 200, body: { id: "acct_Old1", livemode: true } } } });
    expect(parse(await handleConnect(req({ body: { action: "status", companyId: CO } }), y.d))).toEqual({ error: "live_refused" });
  });
  it("the account is made but the save fails once: tried again, kept, one account", async () => {
    let n = 0;
    const x = deps({ save: async () => { if (n++ === 0) throw new Error("db"); return { charges_enabled: false }; } });
    expect((await handleConnect(req(), x.d)).status).toBe(200);
    expect(n).toBe(2);
    expect(x.calls.filter((c) => c.path === "/v1/accounts")).toHaveLength(1);
  });
  it("the save keeps failing: 502, the account id in the log for the operator, no link", async () => {
    const x = deps({ save: async () => { throw new Error("db"); } });
    const r = await handleConnect(req(), x.d);
    expect(r.status).toBe(502);
    expect(x.logs.join(" ")).toContain("acct_New1");
    expect(x.calls.some((c) => c.path === "/v1/account_links")).toBe(false);
  });
  it("the network fails: 502, nothing kept", async () => {
    const x = deps({ stripe: async () => { throw new Error(`timeout ${KEY}`); } });
    const r = await handleConnect(req(), x.d);
    expect(r.status).toBe(502);
    expect(r.body + x.logs.join(" ")).not.toContain(KEY);
  });
});
