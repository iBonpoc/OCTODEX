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
  deleteAsUser: (jwt: string, confirm: string, closeCompanies: string[]) => Promise<{ data?: unknown; error?: DbError | null }>;
  /** auth.admin.updateUserById(uid, {user_metadata: cleared}) then auth.admin.deleteUser(uid, true), service role */
  closeSignIn: (uid: string) => Promise<{ error?: { message: string } | null }>;
  log?: (msg: string) => void;
  /** the pause between the tries of closeSignIn (ms); tests pass a no-op */
  wait?: (ms: number) => Promise<void>;
}
/** what Supabase may keep about the person in user_metadata after a soft delete — cleared first (review #214 №3) */
export const CLEARED_METADATA = { full_name: null, name: null, avatar_url: null, picture: null, locale: null, email: null, phone: null, email_verified: null, phone_verified: null, sub: null } as const;
export interface DbError {
  message: string;
  code?: string;
  details?: string | null;
}
/** our own refusals in public.delete_account (SQLSTATE OD001): their words go to the app; anything else does not */
export const OWN_ERROR = "OD001";
/** Auth may fail for a moment: the sign-in close is tried this many times before «pending» */
export const CLOSE_TRIES = 3;
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
  const r: { data?: unknown; error?: DbError | null } = await deps
    .deleteAsUser(jwt, body.confirm, body.closeCompanies)
    .catch((e: Error) => ({ error: { message: e.message } }));
  if (r.error) {
    // our refusals («sign in again first», «the company keeps at least one active owner» + which company, …) go as
    // they are; anything else (a missing function, the network, a timeout) never shows its internals (security-check №2)
    if (r.error.code === OWN_ERROR) return json(400, { error: r.error.message, detail: r.error.details ?? null });
    deps.log?.(`delete-account: rpc failed (${r.error.code ?? "no code"})`);
    return json(500, { error: "account deletion failed" });
  }
  // the data is closed; now the sign-in — a few tries (a «pending» account could sign in but do nothing — №1)
  let closed: { error?: { message: string } | null } = { error: { message: "not tried" } };
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; i < CLOSE_TRIES && closed.error; i++) {
    if (i > 0) await wait(300 * i);
    closed = await deps.closeSignIn(uid).catch((e: Error) => ({ error: { message: e.message } }));
  }
  if (closed.error) {
    deps.log?.("delete-account: auth soft delete pending");
    return json(200, { deleted: true, auth: "pending", result: r.data ?? null });
  }
  return json(200, { deleted: true, auth: "done", result: r.data ?? null });
}
