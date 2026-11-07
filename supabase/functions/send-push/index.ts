// send-push — the Deno entry of the edge function (Пуши П3, docs/specs/27-push.md §4.5). The logic is in handler.ts.
// Deployed by .github/workflows/release.yml after the migrations; verify_jwt = false (supabase/config.toml): pg_cron calls
// it through app.push_kick with the header x-push-key. Secrets of the function (Supabase → Edge Functions → Secrets):
// PUSH_FN_KEY (the same value as push_fn_key in Vault) and EXPO_ACCESS_TOKEN (enhanced push security). Never logged.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { EXPO_RECEIPTS_URL, EXPO_SEND_URL, handlePush, type ClaimRow, type HttpAnswer, type Ticket } from "./handler.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FN_KEY = Deno.env.get("PUSH_FN_KEY");
const EXPO_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN");
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  // the message of the database may be logged by the runtime: it never holds a token (push_* raise only short words)
  if (error) throw new Error(`rpc ${name} ${error.code ?? ""}`);
  return data as T;
}

async function post(url: string, body: unknown): Promise<HttpAnswer> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (EXPO_TOKEN) headers.Authorization = `Bearer ${EXPO_TOKEN}`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

Deno.serve(async (req: Request) => {
  const res = await handlePush({ method: req.method, header: (n) => req.headers.get(n) }, FN_KEY, {
    claim: (limit) => rpc<ClaimRow[]>("push_claim", { p_limit: limit }),
    finish: async (id, status, tickets, error) => {
      await rpc("push_finish", { p_id: id, p_status: status, p_tickets: tickets, p_error: error });
    },
    receiptsDue: (limit) => rpc<Ticket[]>("push_receipts_due", { p_limit: limit }),
    receiptsDone: async (checked, gone) => {
      await rpc("push_receipts_done", { p_checked: checked, p_gone: gone });
    },
    expoSend: (messages) => post(EXPO_SEND_URL, messages),
    expoReceipts: (ids) => post(EXPO_RECEIPTS_URL, { ids }),
    log: (m) => console.log(m),
  });
  return new Response(res.body, { status: res.status, headers: res.headers });
});
