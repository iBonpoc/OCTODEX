/**
 * Paying an invoice online from the client page /p/ (step 20в, docs/specs/35-stripe.md). Pure: no Deno, no network — the Deno
 * entry (index.ts) passes the real clients; vitest passes fakes (apps/mobile/test/stripePayFn.test.ts).
 *
 * POST {token, invoiceId} from the client's browser (no sign-in, verify_jwt = false):
 * 1) CORS for our site only (never «*») — a browser courtesy, NOT protection: any script can send any Origin; the /p/ token is
 *    the only key;
 * 2) public.stripe_pay_open checks the /p/ token against the invoice IN THE DATABASE before an attempt is opened (IDOR) and
 *    gives the attempt for the whole online balance (ACH on its way is not asked again);
 * 3) an attempt that already has a PaymentIntent reuses it while the client can still pay it (an Idempotency-Key of Stripe
 *    lives 24 h — a new intent for an old attempt would be a second charge); otherwise a new PaymentIntent — a direct charge on
 *    the contractor's account, the attempt's key as the Idempotency-Key, the attempt in metadata (the webhook finds it);
 * 4) the answer is what the Payment Element needs: client secret, the account, the publishable key, the order of methods —
 *    ACH first from $1,000 (spec 35 §2 п.3: the contractor pays less).
 * 5) rate limits (spec 35 §4д): before the link is looked at — per link (sha256); a link that is NOT found — per address
 *    (HMAC of «pay:» + the IP; IPv6 by /64 and /48; no address — one ceiling for the whole function); a real link never
 *    counts by address; after the link is checked — per invoice (the expensive step). Over a limit → 429 {error:"rate_limited", retryAfter} + Retry-After. The limit itself failing lets the
 *    request through (a payment is never refused for our fault), with a line in the log.
 * Test mode only: a live key is refused until the founder says (spec 35 §3). The key never appears in a log or an answer;
 * Stripe's own error text is not passed on either. Money is never written here: only the webhook (20г) records a payment.
 */
export interface Attempt {
  attempt_id: string;
  company_id: string;
  invoice_id: string;
  amount_cents: number;
  idempotency_key: string;
  account_id: string;
  payment_intent_id: string | null;
  status: string;
  /** intents of this invoice's other attempts the client could still pay — cancelled here (one invoice, one charge) */
  stale_intents?: string[];
}
export interface StripeAnswer {
  status: number;
  body: Record<string, unknown> | null;
}
export type StripeCall = (
  method: "GET" | "POST",
  path: string,
  opts: { form?: Record<string, string>; idempotencyKey?: string; account: string },
) => Promise<StripeAnswer>;
/** a database error: its SQLSTATE, or null when the call itself failed */
export class DbError extends Error {
  constructor(public code: string | null) {
    super(`db ${code ?? ""}`);
  }
}
export interface PayDeps {
  /** public.stripe_pay_open(token, invoice) as service_role; throws DbError */
  open: (token: string, invoiceId: string) => Promise<Attempt>;
  /** public.stripe_pay_set_intent(attempt, intent) as service_role */
  setIntent: (attemptId: string, intentId: string) => Promise<unknown>;
  /** public.stripe_pay_close_attempt(intent) as service_role: the attempt of an intent we cancelled is closed at once */
  closeAttempt: (intentId: string) => Promise<unknown>;
  stripe: StripeCall | null;
  /** "test" (sk_test_ / rk_test_), "live" — refused for now */
  keyMode: "test" | "live" | null;
  /** STRIPE_PUBLISHABLE_KEY (pk_test_…): not a secret, but kept beside the secret key so the two always match */
  publishableKey: string;
  /** public.pay_rate_take(token hash) → null (go on) or seconds to wait; throws when the database fails */
  rate: (tokenHash: string) => Promise<number | null>;
  /** public.pay_rate_miss(ip hash, net hash): the link was not found — the address pays; null or seconds to wait */
  rateMiss: (ipHash: string | null, netHash: string | null) => Promise<number | null>;
  /** public.pay_invoice_rate_take(invoice) → null or seconds to wait */
  invoiceRate: (invoiceId: string) => Promise<number | null>;
  sha256: (s: string) => Promise<string>;
  /** HMAC-SHA256 with INTAKE_IP_SECRET; null when it is missing (then only the token and the whole-function ceiling count) */
  hmac: ((s: string) => Promise<string>) | null;
  /** the request headers trusted for the client's IP — in production only cf-connecting-ip (index.ts) */
  ipHeaders: string[];
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

/** the sites that may call it from a browser: the production site only (a PR preview pays nothing) */
export const ALLOWED_ORIGINS: readonly string[] = ["https://octodex.expo.app"];
/** from this balance ACH comes first (spec 35 §2 п.3) */
export const ACH_FIRST_CENTS = 100000;
/** the states in which the client can still pay an existing PaymentIntent */
const PAYABLE = new Set(["requires_payment_method", "requires_confirmation", "requires_action"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
const PI = /^pi_[A-Za-z0-9]{1,64}$/;
export const SET_TRIES = 3;
/** a refusal of the limit never asks to wait longer than this (the window is 10 minutes) */
const MAX_WAIT_S = 600;

// ---- the client's IP — the same rules as lead-intake (a function imports no other function's file; unit:stripePayFn checks
// that the two give the same keys) ----
/** cf-connecting-ip (Cloudflare) first; without it the LAST address of a list header. Production trusts cf-connecting-ip only */
export function clientIp(req: Req, headers: string[]): string | null {
  for (const h of headers) {
    const v = req.header(h);
    if (!v) continue;
    const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
    const ip = parts[parts.length - 1];
    if (ip && ip.length <= 45 && /^[0-9a-fA-F:.]+$/.test(ip)) return ip;
  }
  return null;
}
const v4mapped = (ip: string) => /^::ffff:(\d{1,3}(\.\d{1,3}){3})$/i.exec(ip)?.[1];
/** an IPv6 client owns a whole /64: the limit counts the network, not one of its addresses */
export function ipKey(ip: string): string {
  const v4 = v4mapped(ip);
  if (v4) return v4;
  if (!ip.includes(":")) return ip;
  const [head, tail] = ip.split("::");
  const a = head ? head.split(":") : [];
  const b = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const full = tail !== undefined ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b] : a;
  return `${full.slice(0, 4).map((x) => (x || "0").toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
/** the /48 of an IPv6 address (a site), for the second limit; null for IPv4 */
export function netKey(ip: string): string | null {
  const k = ipKey(ip);
  if (!k.endsWith("::/64")) return null;
  return `${k.split(":").slice(0, 3).join(":")}::/48`;
}

export function cors(origin: string | null): Record<string, string> | null {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    // the page may read how long to wait (429)
    "Access-Control-Expose-Headers": "Retry-After",
    Vary: "Origin",
  };
}

export function parseBody(raw: string): { token: string; invoiceId: string } | null {
  let v: unknown;
  try {
    v = JSON.parse(raw || "null");
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== "token" && k !== "invoiceId")) return null;
  if (typeof o.token !== "string" || !TOKEN.test(o.token)) return null;
  if (typeof o.invoiceId !== "string" || !UUID.test(o.invoiceId)) return null;
  return { token: o.token, invoiceId: o.invoiceId.toLowerCase() };
}

/** the order of methods in the Payment Element: ACH first from $1,000, a card first below */
export function methodsFor(amountCents: number): ("us_bank_account" | "card")[] {
  return amountCents >= ACH_FIRST_CENTS ? ["us_bank_account", "card"] : ["card", "us_bank_account"];
}

export function intentForm(a: Attempt): Record<string, string> {
  const form: Record<string, string> = {
    amount: String(a.amount_cents),
    currency: "usd",
    "metadata[attempt_id]": a.attempt_id,
    "metadata[company_id]": a.company_id,
    "metadata[invoice_id]": a.invoice_id,
  };
  methodsFor(a.amount_cents).forEach((m, i) => (form[`payment_method_types[${i}]`] = m));
  // no application_fee_amount yet: our share is the founder's В3 (spec 35 §2 п.3)
  return form;
}

/** the database's refusal → what the page is told (never the database's text) */
function refused(code: string | null): { status: number; error: string } {
  switch (code) {
    case "P0002": // an unknown link answers as a foreign invoice does: no «this token exists» oracle
    case "22023":
      return { status: 409, error: "nothing_to_pay" };
    case "42501":
      return { status: 403, error: "closed" };
    case "55000":
      return { status: 409, error: "not_connected" };
    default:
      return { status: 500, error: "failed" };
  }
}

export async function handlePay(req: Req, deps: PayDeps): Promise<Res> {
  const c = cors(req.header("origin"));
  const json = (status: number, body: unknown): Res => ({
    status,
    body: JSON.stringify(body),
    headers: { ...(c ?? {}), "Content-Type": "application/json" },
  });
  // CORS only: a browser on another site gets no answer it may read. Not a protection — curl sends any Origin; the token is the key
  if (!c) return json(403, { error: "origin" });
  if (req.method === "OPTIONS") return { status: 204, body: "", headers: { ...c } };
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  const body = parseBody(await req.text().catch(() => ""));
  if (!body) return json(400, { error: "bad request" });
  if (!deps.stripe || !deps.keyMode || !/^pk_(test|live)_/.test(deps.publishableKey)) return json(503, { error: "not_configured" });
  if (deps.keyMode !== "test" || !deps.publishableKey.startsWith("pk_test_")) return json(503, { error: "live_refused" });
  const stripe = deps.stripe;

  const busy = (wait: number) => {
    const s = Math.min(MAX_WAIT_S, Math.max(1, Math.ceil(wait)));
    return { ...json(429, { error: "rate_limited", retryAfter: s }), headers: { ...c, "Content-Type": "application/json", "Retry-After": String(s) } };
  };
  // the address of a miss: HMAC of «pay:» + the IP (IPv6 by /64 and /48); no secret, no trusted header or a failing HMAC —
  // no address, then the whole-function ceiling counts (never «no limit»)
  const missWait = async (): Promise<number | null> => {
    const ip = clientIp(req, deps.ipHeaders);
    if (!deps.hmac || !ip) deps.log?.(`stripe-pay: no ${deps.hmac ? "trusted ip header" : "ip secret"} — the whole-function ceiling counts`);
    const hmac = deps.hmac;
    const net = ip ? netKey(ip) : null;
    const [ipHash, netHash] = hmac && ip
      ? await Promise.all([hmac(`pay:${ipKey(ip)}`), net ? hmac(`pay:${net}`) : Promise.resolve(null)]).catch(() => {
          deps.log?.("stripe-pay: ip hmac failed — the whole-function ceiling counts");
          return [null, null] as const;
        })
      : ([null, null] as const);
    return deps.rateMiss(ipHash, netHash);
  };
  // the limit by the link — before the database looks at it (spec 35 §4д)
  try {
    const wait = await deps.rate(await deps.sha256(body.token));
    if (wait !== null && wait !== undefined) return busy(wait);
  } catch {
    deps.log?.("stripe-pay: rate limit failed — let through");
  }

  let a: Attempt;
  try {
    a = await deps.open(body.token, body.invoiceId);
  } catch (e) {
    const code = e instanceof DbError ? e.code : null;
    // an unknown link or a foreign invoice: the ADDRESS pays for the miss (a request with a real link never counts by address —
    // director's review of #454: a neighbour on the same network must not block the honest client)
    if (code === "P0002" || code === "22023") {
      const wait = await missWait().catch(() => {
        deps.log?.("stripe-pay: miss limit failed");
        return null;
      });
      if (wait !== null && wait !== undefined) return busy(wait);
    }
    const r = refused(code);
    if (r.status === 500) deps.log?.("stripe-pay: open failed");
    return json(r.status, { error: r.error });
  }
  // the expensive step (cancel / create an intent): per invoice, whatever link or address it comes from
  try {
    const wait = await deps.invoiceRate(a.invoice_id);
    if (wait !== null && wait !== undefined) return busy(wait);
  } catch {
    deps.log?.("stripe-pay: invoice rate limit failed — let through");
  }
  const fail = (what: string, r?: StripeAnswer) => {
    const type = r?.body && typeof r.body.error === "object" && r.body.error ? String((r.body.error as Record<string, unknown>).type ?? "") : "";
    deps.log?.(`stripe-pay: ${what} ${r?.status ?? "no answer"} ${type}`.trim());
    return json(502, { error: "stripe" });
  };
  const ready = (pi: Record<string, unknown>) =>
    json(200, {
      state: "ready",
      clientSecret: pi.client_secret,
      account: a.account_id,
      publishableKey: deps.publishableKey,
      amountCents: a.amount_cents,
      methods: methodsFor(a.amount_cents),
    });
  const intentOk = (pi: Record<string, unknown> | null): pi is Record<string, unknown> =>
    !!pi && typeof pi.id === "string" && PI.test(pi.id) && pi.livemode !== true && pi.amount === a.amount_cents &&
    pi.currency === "usd" && typeof pi.client_secret === "string" &&
    (pi.metadata as Record<string, unknown> | undefined)?.attempt_id === a.attempt_id;

  let reopened = false;
  try {
    // an old tab, another amount, a failed try: their intents can still be paid — cancel them before this one is handed out.
    // A refused cancel may mean that intent is already PAID or on its way (no webhook yet): then no new intent at all
    // (director's review 20в №1 — tab A paid PI1, tab B must not get PI2)
    for (const old of a.stale_intents ?? []) {
      if (!PI.test(old) || old === a.payment_intent_id) continue;
      const c = await stripe("POST", `/v1/payment_intents/${old}/cancel`, { account: a.account_id }).catch(() => null);
      let st = c?.status === 200 ? String(c.body?.status ?? "canceled") : null;
      if (st === null) {
        const g = await stripe("GET", `/v1/payment_intents/${old}`, { account: a.account_id }).catch(() => null);
        st = g?.status === 200 && g.body?.id === old ? String(g.body.status) : null;
      }
      if (st === "processing" || st === "succeeded" || st === "requires_capture") return json(200, { state: "processing" });
      if (st !== "canceled") {
        deps.log?.(`stripe-pay: an older intent of attempt ${a.attempt_id} is still payable`);
        return json(502, { error: "stripe" });   // never two payable intents for one invoice
      }
      await deps.closeAttempt(old).catch(() => deps.log?.("stripe-pay: close failed"));
    }
    if (a.payment_intent_id) {
      // the attempt already has an intent: never a second one while the first can still be paid or is on its way
      const r = await stripe("GET", `/v1/payment_intents/${a.payment_intent_id}`, { account: a.account_id });
      if (r.status !== 200 || !intentOk(r.body)) return fail("intent read", r);
      const st = String(r.body.status);
      if (PAYABLE.has(st)) return ready(r.body);
      if (st === "processing" || st === "succeeded" || st === "requires_capture") return json(200, { state: "processing" });
      // canceled (by Stripe or an old tab of ours): close its attempt now and open a fresh one — once
      if (st === "canceled" && !reopened) {
        await deps.closeAttempt(a.payment_intent_id).catch(() => deps.log?.("stripe-pay: close failed"));
        try {
          a = await deps.open(body.token, body.invoiceId);
        } catch (e) {
          const rf = refused(e instanceof DbError ? e.code : null);
          return json(rf.status, { error: rf.error });
        }
        reopened = true;
        if (!a.payment_intent_id) return create();
      }
      return json(409, { error: "retry_later" });
    }
    return await create();
  } catch {
    deps.log?.("stripe-pay: failed");
    return json(502, { error: "stripe" });
  }

  async function create(): Promise<Res> {
    const r = await stripe("POST", "/v1/payment_intents", { form: intentForm(a), idempotencyKey: a.idempotency_key, account: a.account_id });
    if (r.status !== 200 || !intentOk(r.body)) return fail("intent create", r);
    // keep the intent on the attempt; if this is lost the webhook still finds the attempt by its metadata
    let kept = false;
    for (let i = 0; i < SET_TRIES && !kept; i++) {
      kept = await deps.setIntent(a.attempt_id, r.body.id as string).then(() => true, () => false);
    }
    if (!kept) {
      // not handed out: after Stripe's 24 h the same key would make a second intent the webhook could not match (security 20в №3)
      deps.log?.(`stripe-pay: intent ${String(r.body.id)} not kept on attempt ${a.attempt_id}`);
      return json(502, { error: "stripe" });
    }
    return ready(r.body);
  }
}
