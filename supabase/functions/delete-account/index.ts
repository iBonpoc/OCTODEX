// «Удалить аккаунт» — the Deno entry of the edge function (7а-2a, S22; docs/specs/19 §6.7). The logic is in handler.ts.
// Deployed by .github/workflows/release.yml after the migrations; verify_jwt = true (supabase/config.toml).
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleDelete } from "./handler.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req: Request) => {
  const res = await handleDelete(
    { method: req.method, header: (n) => req.headers.get(n), text: () => req.text() },
    {
      userOf: async (jwt) => (await admin.auth.getUser(jwt)).data.user?.id ?? null,
      deleteAsUser: async (jwt, confirm, closeCompanies) => {
        // the person's own client: the RPC runs with THEIR rights and auth.uid()
        const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
        const { data, error } = await asUser.rpc("delete_account", { p_confirm: confirm, p_close_companies: closeCompanies });
        return { data, error: error ? { message: error.message } : null };
      },
      closeSignIn: async (uid) => {
        const { error } = await admin.auth.admin.deleteUser(uid, true);
        return { error: error ? { message: error.message } : null };
      },
      log: (m) => console.warn(m),
    },
  );
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: res.headers });
});
