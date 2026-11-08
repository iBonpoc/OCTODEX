/**
 * Stripe's webhook (step 20г, docs/specs/35-stripe.md). Pure: no Deno, no network — the Deno entry (index.ts) passes the real
 * clients; vitest passes fakes and events signed with a test secret (apps/mobile/test/stripeWebhookFn.test.ts).
 *
 * POST from Stripe (a Connect endpoint: events of the contractors' accounts), verify_jwt = false:
 * 1) the Stripe-Signature over the RAW body is checked FIRST (HMAC-SHA256 of «t.body», 5 minutes of tolerance, compared in
 *    constant time) — app.stripe_event_apply trusts the event's «account», so nothing unsigned reaches the database;
 * 2) for a PaymentIntent event the intent is read back from Stripe with its payment method and the charge's balance
 *    transaction: the method (card / ACH) and Stripe's fee — the event itself carries neither;
 * 3) public.stripe_webhook_apply(event, method, fee): metadata.company_id is checked against the account's company there;
 * 4) the answer tells Stripe whether to send again: 55000 («not recorded yet») and any failure → 500; a bad signature → 400.
 * Test mode only: no live key is used to read. Nothing of the event (no client's data) and no secret goes to a log.
 */
export interface StripeAnswer {
  status: number;
  body: Record<string, unknown> | null;
}
export class DbError extends Error {
  constructor(public code: string | null) {
    super(`db ${code ?? ""}`);
  }
}
export interface HookDeps {
  /** STRIPE_WEBHOOK_SECRET (whsec_…) of the Connect endpoint */
  secret: string;
  /** seconds since 1970 */
  now: () => number;
  /** GET of the Stripe API on the connected account; null when no key */
  stripe: ((path: string, account: string) => Promise<StripeAnswer>) | null;
  keyMode: "test" | "live" | null;
  /** public.stripe_webhook_apply(event, method, fee) as service_role; throws DbError */
  apply: (event: Record<string, unknown>, method: "card" | "ach" | null, feeCents: number | null) => Promise<string>;
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

export const TOLERANCE_S = 300;
const EVT = /^evt_[A-Za-z0-9]{1,64}$/;
const PI = /^pi_[A-Za-z0-9]{1,64}$/;
const ACCT = /^acct_[A-Za-z0-9]{1,64}$/;
const json = (status: number, body: unknown): Res => ({ status, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
export async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}
/** equal strings in time that does not depend on where they differ */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Stripe-Signature: «t=…,v1=…[,v1=…]» — true only for a fresh timestamp and a v1 made with our secret over this very body */
export async function verifySignature(raw: string, header: string | null, secret: string, nowS: number): Promise<boolean> {
  if (!header || !secret) return false;
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t" && /^\d{1,12}$/.test(v)) t = Number(v);
    if (k === "v1" && /^[0-9a-f]{64}$/.test(v)) v1.push(v);
  }
  if (t === null || !v1.length || Math.abs(nowS - t) > TOLERANCE_S) return false;
  const want = await hmacHex(secret, `${t}.${raw}`);
  let ok = false;
  for (const s of v1) ok = sameText(s, want) || ok;   // every candidate is compared: no early exit
  return ok;
}

/** the method and Stripe's own fee from an intent read with expand[]=payment_method and latest_charge.balance_transaction */
export function methodAndFee(pi: Record<string, unknown> | null): { method: "card" | "ach" | null; fee: number | null } {
  const pm = pi?.payment_method as Record<string, unknown> | null | undefined;
  const type = pm && typeof pm === "object" ? pm.type : undefined;
  const method = type === "card" ? "card" : type === "us_bank_account" ? "ach" : null;
  const ch = pi?.latest_charge as Record<string, unknown> | null | undefined;
  const bt = ch && typeof ch === "object" ? (ch.balance_transaction as Record<string, unknown> | null) : null;
  let fee: number | null = null;
  if (bt && typeof bt === "object" && Array.isArray(bt.fee_details)) {
    // only Stripe's fee: our application fee is platform_fee_cents (from the intent) — never counted twice
    fee = 0;
    for (const f of bt.fee_details as Record<string, unknown>[]) {
      if (f?.type === "stripe_fee" && Number.isInteger(f.amount) && (f.amount as number) >= 0) fee += f.amount as number;
    }
  }
  return { method, fee };
}

export async function handleHook(req: Req, deps: HookDeps): Promise<Res> {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  if (!deps.secret) return json(503, { error: "not_configured" });
  const raw = await req.text().catch(() => "");
  // the signature first: not a byte of the body is read as JSON before it
  if (!(await verifySignature(raw, req.header("stripe-signature"), deps.secret, deps.now()))) return json(400, { error: "signature" });
  let ev: Record<string, unknown>;
  try {
    ev = JSON.parse(raw);
  } catch {
    return json(400, { error: "bad event" });
  }
  const obj = (ev?.data as Record<string, unknown> | undefined)?.object as Record<string, unknown> | undefined;
  if (!ev || typeof ev !== "object" || typeof ev.id !== "string" || !EVT.test(ev.id) || typeof ev.type !== "string" || !obj || typeof obj !== "object") {
    return json(400, { error: "bad event" });
  }

  let method: "card" | "ach" | null = null;
  let fee: number | null = null;
  const account = typeof ev.account === "string" && ACCT.test(ev.account) ? ev.account : null;
  if (ev.type.startsWith("payment_intent.") && typeof obj.id === "string" && PI.test(obj.id) && account && ev.livemode !== true && deps.stripe && deps.keyMode === "test") {
    const r = await deps
      .stripe(`/v1/payment_intents/${obj.id}?expand[]=payment_method&expand[]=latest_charge.balance_transaction`, account)
      .catch(() => null);
    if (r?.status === 200 && r.body?.id === obj.id) {
      ({ method, fee } = methodAndFee(r.body));
    } else if (ev.type === "payment_intent.succeeded") {
      // the money has come: its fee must not be lost — Stripe sends the event again
      deps.log?.(`stripe-webhook: intent read ${r?.status ?? "no answer"} for ${ev.id}`);
      return json(500, { error: "retry" });
    }
  }

  try {
    const result = await deps.apply(ev, method, fee);
    return json(200, { result });
  } catch (e) {
    const code = e instanceof DbError ? e.code : null;
    if (code === "22023") return json(400, { error: "bad event" });
    // 55000: the payment is not recorded yet — the transaction rolled back, the journal has no row; Stripe retries
    deps.log?.(`stripe-webhook: apply ${code ?? "failed"} for ${ev.id}`);
    return json(500, { error: "retry" });
  }
}
