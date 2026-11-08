// stripe-refund — the Deno entry of the edge function (step 20д, docs/specs/35-stripe.md §4в). The logic is in handler.ts.
// Deployed by .github/workflows/release.yml after the migrations; verify_jwt = true (supabase/config.toml): only a signed-in
// person; owner/admin is checked by public.stripe_refund_open.
// Secrets (Supabase → Edge Functions → Secrets; the founder sets them, never in chat or the repo): STRIPE_SECRET_KEY — test only.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { DbError, handleRefund, type Opened, type StripeAnswer } from "./handler.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_VERSION = "2024-06-20";
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new DbError(error.code ?? null, error.message ?? "");
  return data as T;
}
const keyMode = !KEY ? null : /^(sk|rk)_test_/.test(KEY) ? "test" : "live";

async function stripe(path: string, form: Record<string, string>, idempotencyKey: string, account: string): Promise<StripeAnswer> {
  const r = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`, "Stripe-Version": STRIPE_VERSION, "Stripe-Account": account,
      "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": idempotencyKey,
    },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(10000),
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as Record<string, unknown> | null };
}

Deno.serve(async (req: Request) => {
  const res = await handleRefund(
    { method: req.method, header: (n) => req.headers.get(n), text: () => req.text() },
    {
      userOf: async (jwt) => (await admin.auth.getUser(jwt)).data.user?.id ?? null,
      open: (userId, b) => rpc<Opened>("stripe_refund_open", {
        p_user_id: userId, p_payment_id: b.paymentId, p_amount_cents: b.amountCents,
        p_reason_kind: b.reasonKind, p_reason: b.reason, p_key: b.key,
      }),
      settle: (refundId, s) => rpc("stripe_refund_settle", { p_refund_id: refundId, p_stripe: s }),
      stripe: KEY ? stripe : null,
      keyMode,
      log: (m) => console.warn(m),
    },
  );
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: res.headers });
});
