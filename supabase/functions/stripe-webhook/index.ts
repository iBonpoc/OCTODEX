// stripe-webhook — the Deno entry of the edge function (step 20г, docs/specs/35-stripe.md). The logic is in handler.ts.
// Deployed by .github/workflows/release.yml after the migrations; verify_jwt = false (supabase/config.toml): Stripe has no JWT —
// its signature over the raw body is the key. Secrets of the function (Supabase → Edge Functions → Secrets; the founder sets
// them, never in chat or the repo): STRIPE_WEBHOOK_SECRET — the whsec_ of the Connect endpoint (Stripe → Developers →
// Webhooks, «Events on connected accounts»); STRIPE_SECRET_KEY — test mode only, to read the intent's method and fee.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { DbError, handleHook, type StripeAnswer } from "./handler.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
// the same API version as stripe-connect and stripe-pay
const STRIPE_VERSION = "2024-06-20";
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
// as service_role (the doors are granted to it only — rule 18), the same helper as stripe-pay / stripe-connect
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new DbError(error.code ?? null);
  return data as T;
}
const keyMode = !KEY ? null : /^(sk|rk)_test_/.test(KEY) ? "test" : "live";

async function stripe(path: string, account: string): Promise<StripeAnswer> {
  const r = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${KEY}`, "Stripe-Version": STRIPE_VERSION, "Stripe-Account": account },
    signal: AbortSignal.timeout(10000),
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as Record<string, unknown> | null };
}

Deno.serve(async (req: Request) => {
  const res = await handleHook(
    // the raw body exactly as Stripe sent it: the signature is over these bytes
    { method: req.method, header: (n) => req.headers.get(n), text: () => req.text() },
    {
      secret: SECRET,
      now: () => Math.floor(Date.now() / 1000),
      stripe: KEY ? stripe : null,
      keyMode,
      apply: async (event, method, fee) => String(await rpc<string>("stripe_webhook_apply", { p_event: event, p_method: method, p_fee_cents: fee })),
      log: (m) => console.warn(m),
    },
  );
  return new Response(res.body, { status: res.status, headers: res.headers });
});
