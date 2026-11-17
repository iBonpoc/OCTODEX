// erase-storage — the Deno entry (spec 50 §3.2, PR 50-3). The logic is in handler.ts, the real clients in deps.ts.
// Deployed by .github/workflows/release.yml after the migrations; verify_jwt = true (supabase/config.toml) and the handler also
// requires role = service_role in the token: pg_cron (PR 50-6) and delete-account call it with the service key. No other secret.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleErase } from "./handler.ts";
import { storageDeps } from "./deps.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req: Request) => {
  const res = await handleErase({ method: req.method, header: (n) => req.headers.get(n) }, storageDeps(admin));
  return new Response(res.body, { status: res.status, headers: res.headers });
});
