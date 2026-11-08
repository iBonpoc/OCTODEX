/**
 * Paying an invoice online from the client page /p/ (step 20в, docs/specs/35-stripe.md). Pure: no Deno, no network — the Deno
 * entry (index.ts) passes the real clients; vitest passes fakes (apps/mobile/test/stripePayFn.test.ts).
 *
 * POST {token, invoiceId} from the client's browser (no sign-in, verify_jwt = false):
 * 1) only our site may call it from a browser (CORS by the Origin, never «*»);
 * 2) public.stripe_pay_open checks the /p/ token against the invoice IN THE DATABASE before an attempt is opened (IDOR) and
 *    gives the attempt for the whole online balance (ACH on its way is not asked again);
 * 3) an attempt that already has a PaymentIntent reuses it while the client can still pay it (an Idempotency-Key of Stripe
 *    lives 24 h — a new intent for an old attempt would be a second charge); otherwise a new PaymentIntent — a direct charge on
 *    the contractor's account, the attempt's key as the Idempotency-Key, the attempt in metadata (the webhook finds it);
 * 4) the answer is what the Payment Element needs: client secret, the account, the publishable key, the order of methods —
 *    ACH first from $1,000 (spec 35 §2 п.3: the contractor pays less).
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
  stripe: StripeCall | null;
  /** "test" (sk_test_ / rk_test_), "live" — refused for now */
  keyMode: "test" | "live" | null;
  /** STRIPE_PUBLISHABLE_KEY (pk_test_…): not a secret, but kept beside the secret key so the two always match */
  publishableKey: string;
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

export function cors(origin: string | null): Record<string, string> | null {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
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
    case "P0002":
      return { status: 404, error: "not_found" };
    case "42501":
      return { status: 403, error: "closed" };
    case "55000":
      return { status: 409, error: "not_connected" };
    case "22023":
      return { status: 409, error: "nothing_to_pay" };
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
  // a browser on another site gets no CORS answer at all; a call without Origin is not a browser of ours either
  if (!c) return json(403, { error: "origin" });
  if (req.method === "OPTIONS") return { status: 204, body: "", headers: { ...c } };
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  const body = parseBody(await req.text().catch(() => ""));
  if (!body) return json(400, { error: "bad request" });
  if (!deps.stripe || !deps.keyMode || !/^pk_(test|live)_/.test(deps.publishableKey)) return json(503, { error: "not_configured" });
  if (deps.keyMode !== "test" || !deps.publishableKey.startsWith("pk_test_")) return json(503, { error: "live_refused" });
  const stripe = deps.stripe;

  let a: Attempt;
  try {
    a = await deps.open(body.token, body.invoiceId);
  } catch (e) {
    const r = refused(e instanceof DbError ? e.code : null);
    if (r.status === 500) deps.log?.("stripe-pay: open failed");
    return json(r.status, { error: r.error });
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

  try {
    if (a.payment_intent_id) {
      // the attempt already has an intent: never a second one while the first can still be paid or is on its way
      const r = await stripe("GET", `/v1/payment_intents/${a.payment_intent_id}`, { account: a.account_id });
      if (r.status !== 200 || !intentOk(r.body)) return fail("intent read", r);
      const st = String(r.body.status);
      if (PAYABLE.has(st)) return ready(r.body);
      if (st === "processing" || st === "succeeded" || st === "requires_capture") return json(200, { state: "processing" });
      // canceled: the webhook closes the attempt, then a new one opens
      return json(409, { error: "retry_later" });
    }
    const r = await stripe("POST", "/v1/payment_intents", { form: intentForm(a), idempotencyKey: a.idempotency_key, account: a.account_id });
    if (r.status !== 200 || !intentOk(r.body)) return fail("intent create", r);
    // keep the intent on the attempt; if this is lost the webhook still finds the attempt by its metadata
    let kept = false;
    for (let i = 0; i < SET_TRIES && !kept; i++) {
      kept = await deps.setIntent(a.attempt_id, r.body.id as string).then(() => true, () => false);
    }
    if (!kept) deps.log?.(`stripe-pay: intent ${String(r.body.id)} not kept on attempt ${a.attempt_id}`);
    return ready(r.body);
  } catch {
    deps.log?.("stripe-pay: failed");
    return json(502, { error: "stripe" });
  }
}
