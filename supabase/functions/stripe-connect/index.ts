// stripe-connect — the Deno entry of the edge function (step 20b, docs/specs/35-stripe.md). The logic is in handler.ts.
// Deployed by .github/workflows/release.yml after the migrations; verify_jwt = true (supabase/config.toml).
// Secret of the function (Supabase → Edge Functions → Secrets; the founder sets it, never in chat or the repo):
// STRIPE_SECRET_KEY — test mode only (sk_test_ / rk_test_); without it the screen says «not set up yet».
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleConnect, type StripeAnswer, type Target } from "./handler.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const APP_URL = "https://octodex.expo.app";
// one API version for every call: what the code reads does not change under it
const STRIPE_VERSION = "2024-06-20";
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`rpc ${name} ${error.code ?? ""}`);
  return data as T;
}
const keyMode = !KEY ? null : /^(sk|rk)_test_/.test(KEY) ? "test" : "live";

async function stripe(method: "GET" | "POST", path: string, form?: Record<string, string>, idem?: string): Promise<StripeAnswer> {
  const headers: Record<string, string> = { Authorization: `Bearer ${KEY}`, "Stripe-Version": STRIPE_VERSION };
  if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idem) headers["Idempotency-Key"] = idem;
  const r = await fetch(`https://api.stripe.com${path}`, {
    method, headers, body: form ? new URLSearchParams(form).toString() : undefined, signal: AbortSignal.timeout(10000),
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as Record<string, unknown> | null };
}

Deno.serve(async (req: Request) => {
  const res = await handleConnect(
    { method: req.method, header: (n) => req.headers.get(n), text: () => req.text() },
    {
      userOf: async (jwt) => (await admin.auth.getUser(jwt)).data.user?.id ?? null,
      target: (u, c) => rpc<Target | null>("stripe_connect_target", { p_user_id: u, p_company_id: c }),
      save: (c, a) => rpc<Record<string, unknown>>("stripe_account_save", { p_company_id: c, p_account: a }),
      stripe: KEY ? stripe : null,
      keyMode,
      appUrl: APP_URL,
      log: (m) => console.warn(m),
    },
  );
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: res.headers });
});
