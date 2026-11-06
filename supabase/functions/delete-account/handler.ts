/**
 * «Удалить аккаунт» on the server (7а-2a, story map S22; docs/specs/19 §6.7). Pure: no Deno, no network — the Deno
 * entry (index.ts) passes the real clients; vitest passes fakes (apps/mobile/test/deleteAccountFn.test.ts).
 *
 * 1) the person comes with their own JWT (verify_jwt = true; the uid is taken ONLY from the token, never from the body);
 * 2) public.delete_account runs AS THE PERSON: the checks (fresh sign-in, the word, the last owner) and the erasing are
 *    one SQL transaction;
 * 3) then Supabase Auth closes the sign-in itself: auth.admin.deleteUser(uid, shouldSoftDelete = true) under service_role.
 *    If 3 fails the data is already closed (account_alive); the answer says auth: "pending" and a repeat finishes it
 *    (delete_account answers repeat: true).
 * The service-role key never appears in a log or an answer.
 */
export interface DeleteDeps {
  /** the verified user id of the bearer token (auth.getUser), or null */
  userOf: (jwt: string) => Promise<string | null>;
  /** public.delete_account(p_confirm, p_close_companies) with the person's JWT */
  deleteAsUser: (jwt: string, confirm: string, closeCompanies: string[]) => Promise<{ data?: unknown; error?: { message: string } | null }>;
  /** auth.admin.deleteUser(uid, true) with the service role */
  closeSignIn: (uid: string) => Promise<{ error?: { message: string } | null }>;
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

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status: number, body: unknown): Res => ({ status, body: JSON.stringify(body), headers: { ...CORS, "Content-Type": "application/json" } });

/** the request body: {confirm: string, closeCompanies?: uuid[] (≤ 20)} — anything else is refused */
export function parseBody(raw: string): { confirm: string; closeCompanies: string[] } | null {
  let v: unknown;
  try {
    v = JSON.parse(raw || "null");
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== "confirm" && k !== "closeCompanies")) return null;
  if (typeof o.confirm !== "string" || o.confirm.length > 20) return null;
  const cc = o.closeCompanies ?? [];
  if (!Array.isArray(cc) || cc.length > 20 || !cc.every((x) => typeof x === "string" && UUID.test(x))) return null;
  return { confirm: o.confirm, closeCompanies: cc as string[] };
}

export async function handleDelete(req: Req, deps: DeleteDeps): Promise<Res> {
  if (req.method === "OPTIONS") return { status: 204, body: "", headers: { ...CORS } };
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  const auth = req.header("authorization") ?? "";
  const jwt = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
  if (!jwt) return json(401, { error: "sign in first" });
  const uid = await deps.userOf(jwt).catch(() => null);
  if (!uid) return json(401, { error: "sign in first" });
  const body = parseBody(await req.text().catch(() => ""));
  if (!body) return json(400, { error: "bad request" });
  const r: { data?: unknown; error?: { message: string } | null } = await deps
    .deleteAsUser(jwt, body.confirm, body.closeCompanies)
    .catch((e: Error) => ({ error: { message: e.message } }));
  if (r.error) {
    // our refusals («sign in again first», «the company keeps at least one active owner», …) go as they are; the
    // database already hides anything internal behind «account deletion failed»
    return json(400, { error: r.error.message });
  }
  const closed = await deps.closeSignIn(uid).catch((e: Error) => ({ error: { message: e.message } }));
  if (closed.error) {
    deps.log?.(`delete-account: auth soft delete pending for ${uid}`);
    return json(200, { deleted: true, auth: "pending", result: r.data ?? null });
  }
  return json(200, { deleted: true, auth: "done", result: r.data ?? null });
}
