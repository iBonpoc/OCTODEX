// erase-storage — the Deno entry (spec 50 §3.2, PR 50-3). The logic is in handler.ts, the real clients in deps.ts.
// Deployed by .github/workflows/release.yml after the migrations; verify_jwt = true (supabase/config.toml) and the handler also
// requires the token to be the service key itself: pg_cron (PR 50-6) and delete-account call it with the service key. No other secret.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleErase } from "./handler.ts";
import { storageDeps } from "./deps.ts";

const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req: Request) => {
  const res = await handleErase({ method: req.method, header: (n) => req.headers.get(n) }, storageDeps(admin), SERVICE);
  return new Response(res.body, { status: res.status, headers: res.headers });
});
