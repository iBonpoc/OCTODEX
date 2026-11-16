// «Получить код» for a new address — the Deno entry of the edge function (docs/specs/52 §8 Р10, #1756). The logic is in
// handler.ts. Deployed by .github/workflows/release.yml; verify_jwt = false (supabase/config.toml): a person without an
// account has no token — the function makes only an account with the email, nothing else.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleRequestCode } from "./handler.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req: Request) => {
  const res = await handleRequestCode(
    { method: req.method, header: (n) => req.headers.get(n), text: () => req.text() },
    {
      // no password, no user_metadata: nothing in the account a stranger could have set (spec 52 §8)
      createUser: async (email) => {
        const { error } = await admin.auth.admin.createUser({ email, email_confirm: false });
        return { error: error ? { message: error.message, code: (error as { code?: string }).code, status: error.status } : null };
      },
      log: (m) => console.warn(m),
    },
  );
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: res.headers });
});
