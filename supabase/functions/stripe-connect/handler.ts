/**
 * «Компания → Онлайн-оплата» on the server (step 20b, docs/specs/35-stripe.md). Pure: no Deno, no network — the Deno entry
 * (index.ts) passes the real clients; vitest passes fakes (apps/mobile/test/stripeConnectFn.test.ts).
 *
 * POST {action: "status" | "start", companyId}:
 * 1) the person comes with their own JWT (verify_jwt = true); the uid is taken ONLY from the token;
 * 2) public.stripe_connect_target says whether they may (the owner only, active; the company not closed);
 * 3) "status" reads the account from Stripe and keeps what it says; "start" makes the company's one connected account
 *    (an Idempotency-Key per company: a double tap or a retry is the same account) and an onboarding link of Stripe.
 * Test mode only: a live key is refused until the founder says (spec 35 §3). The key never appears in a log or an answer;
 * Stripe's own error text is not passed on either.
 */
export interface Target {
  allowed: boolean;
  account_id: string | null;
  name: string;
  closed: boolean;
}
export interface StripeAnswer {
  status: number;
  body: Record<string, unknown> | null;
}
export interface ConnectDeps {
  /** the verified user id of the bearer token (auth.getUser), or null */
  userOf: (jwt: string) => Promise<string | null>;
  /** public.stripe_connect_target(user, company) as service_role; null — no such company */
  target: (userId: string, companyId: string) => Promise<Target | null>;
  /** public.stripe_account_save(company, account) as service_role */
  save: (companyId: string, account: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** one call of the Stripe API (form-encoded); null when no key is set */
  stripe: ((method: "GET" | "POST", path: string, form?: Record<string, string>, idempotencyKey?: string) => Promise<StripeAnswer>) | null;
  /** "test" (sk_test_ / rk_test_), "live" — refused for now */
  keyMode: "test" | "live" | null;
  /** the app's site the onboarding returns to (always production, never a PR preview) */
  appUrl: string;
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

/** Standard-equivalent (spec 35 §2 п.2, the founder's В2 is open): losses on Stripe, fees on the account, the full Stripe
 *  dashboard, Stripe collects the requirements. Switching to an Express-equivalent is this one constant. */
export const CONTROLLER: Record<string, string> = {
  "controller[fees][payer]": "account",
  "controller[losses][payments]": "stripe",
  "controller[requirement_collection]": "stripe",
  "controller[stripe_dashboard][type]": "full",
};
export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
/** a made account is kept this many times before «failed» */
export const SAVE_TRIES = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCT = /^acct_[A-Za-z0-9]{1,64}$/;
const json = (status: number, body: unknown): Res => ({ status, body: JSON.stringify(body), headers: { ...CORS, "Content-Type": "application/json" } });

export function parseBody(raw: string): { action: "status" | "start"; companyId: string } | null {
  let v: unknown;
  try {
    v = JSON.parse(raw || "null");
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== "action" && k !== "companyId")) return null;
  if (o.action !== "status" && o.action !== "start") return null;
  if (typeof o.companyId !== "string" || !UUID.test(o.companyId)) return null;
  return { action: o.action, companyId: o.companyId.toLowerCase() };
}

/** the fields of the account form: our company, the US, card + ACH */
/** The same fields on every try (no name: Stripe's form asks it): a retry with the same Idempotency-Key is the same account,
 *  never «keys reused with other parameters» (security-check 20b №2). */
export function accountForm(companyId: string): Record<string, string> {
  return {
    country: "US",
    "metadata[company_id]": companyId,
    "capabilities[card_payments][requested]": "true",
    "capabilities[us_bank_account_ach_payments][requested]": "true",
    ...CONTROLLER,
  };
}

export async function handleConnect(req: Req, deps: ConnectDeps): Promise<Res> {
  if (req.method === "OPTIONS") return { status: 204, body: "", headers: { ...CORS } };
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  const jwt = /^Bearer\s+(\S+)$/i.exec(req.header("authorization") ?? "")?.[1];
  if (!jwt) return json(401, { error: "sign in first" });
  const uid = await deps.userOf(jwt).catch(() => null);
  if (!uid) return json(401, { error: "sign in first" });
  const body = parseBody(await req.text().catch(() => ""));
  if (!body) return json(400, { error: "bad request" });
  const tg = await deps.target(uid, body.companyId).catch(() => undefined);
  if (tg === undefined) {
    deps.log?.("stripe-connect: target failed");
    return json(500, { error: "failed" });
  }
  if (!tg || !tg.allowed || tg.closed) return json(403, { error: "not allowed" });
  if (!deps.stripe || !deps.keyMode) return json(503, { error: "not_configured" });
  if (deps.keyMode !== "test") return json(503, { error: "live_refused" });
  const stripe = deps.stripe;
  const fail = (what: string, r?: StripeAnswer) => {
    const type = r?.body && typeof r.body.error === "object" && r.body.error ? String((r.body.error as Record<string, unknown>).type ?? "") : "";
    deps.log?.(`stripe-connect: ${what} ${r?.status ?? "no answer"} ${type}`.trim());
    return json(502, { error: "stripe" });
  };
  try {
    let acct = tg.account_id;
    if (body.action === "status") {
      if (!acct) return json(200, { connected: false });
      const r = await stripe("GET", `/v1/accounts/${acct}`);
      if (r.status !== 200 || !r.body || r.body.id !== acct) return fail("account read", r);
      if (r.body.livemode === true) return json(503, { error: "live_refused" });
      return json(200, { connected: true, ...(await deps.save(body.companyId, r.body)) });
    }
    // start: the company's one account, then a fresh onboarding link (a link lives minutes — never stored)
    let state: Record<string, unknown> | null = null;
    if (!acct) {
      const r = await stripe("POST", "/v1/accounts", accountForm(body.companyId), `octodex-connect-${body.companyId}`);
      if (r.status !== 200 || !r.body || typeof r.body.id !== "string" || !ACCT.test(r.body.id)) return fail("account create", r);
      if (r.body.livemode === true) return json(503, { error: "live_refused" });   // a second guard beside the key's prefix
      acct = r.body.id;
      // the account exists at Stripe now: keep it, a few tries — a lost save would make the next «start» a second account
      for (let i = 0; i < SAVE_TRIES && !state; i++) {
        state = await deps.save(body.companyId, r.body).catch(() => null);
      }
      if (!state) {
        deps.log?.(`stripe-connect: account ${acct} made but not kept`);   // an account id is not a secret: the operator links it
        return json(502, { error: "stripe" });
      }
    }
    const base = deps.appUrl.replace(/\/+$/, "");
    const l = await stripe("POST", "/v1/account_links", {
      account: acct,
      type: "account_onboarding",
      refresh_url: `${base}/company/payments?stripe=refresh`,
      return_url: `${base}/company/payments?stripe=return`,
    });
    const url = l.body?.url;
    if (l.status !== 200 || typeof url !== "string" || !url.startsWith("https://connect.stripe.com/")) return fail("link", l);
    return json(200, { connected: true, url, ...(state ?? {}) });
  } catch {
    deps.log?.("stripe-connect: failed");
    return json(502, { error: "stripe" });
  }
}
