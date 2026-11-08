// stripe-pay — the Deno entry of the edge function (step 20в, docs/specs/35-stripe.md). The logic is in handler.ts.
// Deployed by .github/workflows/release.yml after the migrations; verify_jwt = false (supabase/config.toml): the client
// pays from /p/ without an account — the /p/ token is the key, checked in public.stripe_pay_open.
// Secrets of the function (Supabase → Edge Functions → Secrets; the founder sets them, never in chat or the repo):
// STRIPE_SECRET_KEY — test mode only (sk_test_ / rk_test_); STRIPE_PUBLISHABLE_KEY — pk_test_ of the same Stripe account;
// INTAKE_IP_SECRET — the same secret as lead-intake (the HMAC of the client's IP for the rate limit, spec 35 §4д; the value is
// prefixed «pay:», so the two functions' hashes never match). Without it the limit counts the link and one ceiling for all.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { DbError, handlePay, type Attempt, type StripeAnswer } from "./handler.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const PK = Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? "";
const IP_SECRET = Deno.env.get("INTAKE_IP_SECRET");
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const hmacKey = IP_SECRET
  ? crypto.subtle.importKey("raw", enc.encode(IP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  : null;
// the same API version as stripe-connect: what the code reads does not change under it
const STRIPE_VERSION = "2024-06-20";
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new DbError(error.code ?? null);
  return data as T;
}
const keyMode = !KEY ? null : /^(sk|rk)_test_/.test(KEY) ? "test" : "live";

async function stripe(
  method: "GET" | "POST",
  path: string,
  opts: { form?: Record<string, string>; idempotencyKey?: string; account: string },
): Promise<StripeAnswer> {
  const headers: Record<string, string> = { Authorization: `Bearer ${KEY}`, "Stripe-Version": STRIPE_VERSION, "Stripe-Account": opts.account };
  if (opts.form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const r = await fetch(`https://api.stripe.com${path}`, {
    method, headers, body: opts.form ? new URLSearchParams(opts.form).toString() : undefined, signal: AbortSignal.timeout(10000),
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as Record<string, unknown> | null };
}

Deno.serve(async (req: Request) => {
  const res = await handlePay(
    { method: req.method, header: (n) => req.headers.get(n), text: () => req.text() },
    {
      open: (token, invoiceId) => rpc<Attempt>("stripe_pay_open", { p_token: token, p_invoice_id: invoiceId }),
      setIntent: (attemptId, intentId) => rpc("stripe_pay_set_intent", { p_attempt_id: attemptId, p_intent_id: intentId }),
      closeAttempt: (intentId) => rpc("stripe_pay_close_attempt", { p_intent_id: intentId }),
      stripe: KEY ? stripe : null,
      keyMode,
      publishableKey: PK,
      rate: (tokenHash) => rpc<number | null>("pay_rate_take", { p_token_hash: tokenHash }),
      rateMiss: (ipHash, netHash) => rpc<number | null>("pay_rate_miss", { p_ip_hash: ipHash, p_net_hash: netHash }),
      invoiceRate: (invoiceId) => rpc<number | null>("pay_invoice_rate_take", { p_invoice_id: invoiceId }),
      sha256: async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s))),
      hmac: hmacKey ? async (s) => hex(await crypto.subtle.sign("HMAC", await hmacKey, enc.encode(s))) : null,
      // only Cloudflare's header: x-forwarded-for may carry what the client wrote (as lead-intake)
      ipHeaders: ["cf-connecting-ip"],
      log: (m) => console.warn(m),
    },
  );
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: res.headers });
});
