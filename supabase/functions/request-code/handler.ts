/**
 * «Получить код» for a NEW address (docs/specs/52 §8 Р10, #1756). Pure: no Deno, no network — index.ts passes the real
 * admin client, vitest passes fakes (apps/mobile/test/requestCodeFn.test.ts).
 *
 * New accounts are made only here, once «Allow new users to sign up» is off in the project: the account has the email
 * and nothing else — no password, no name, no metadata. The app then asks Supabase Auth for the code itself
 * (`signInWithOtp`, `shouldCreateUser: false`), so the email limits of Auth stay where they are.
 * The answer is the same for a new and a known address (nothing tells whether an account exists).
 * No log carries the address; the service-role key never appears in an answer or a log.
 */
export interface RequestCodeDeps {
  /** auth.admin.createUser({ email, email_confirm: false }) under service_role */
  createUser: (email: string) => Promise<{ error?: { message: string; code?: string; status?: number } | null }>;
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

// the app's own sites (production, PR previews) and a local web build get the answer; the phone app sends no Origin (#1605)
export const SITE_ORIGIN = /^https:\/\/gorix(--[a-z0-9]+(-[a-z0-9]+)*)?\.expo\.app$/;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
export const allowedOrigin = (origin: string | null) => !!origin && (SITE_ORIGIN.test(origin) || LOCAL_ORIGIN.test(origin));
export const CORS: Record<string, string> = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  Vary: "Origin",
};
const corsFor = (origin: string | null): Record<string, string> =>
  allowedOrigin(origin) ? { ...CORS, "Access-Control-Allow-Origin": origin! } : { ...CORS };
const json = (status: number, body: unknown): Res => ({ status, body: JSON.stringify(body), headers: { ...CORS, "Content-Type": "application/json" } });

/** the longest address a mailbox can have (RFC 5321) */
export const MAX_EMAIL = 254;
/** one plain address: no spaces, one «@», a dot in the domain */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** the body: exactly { email } with a plausible address; anything else → null */
export function parseBody(text: string): { email: string } | null {
  if (text.length > 1024) return null;
  let b: unknown;
  try {
    b = JSON.parse(text);
  } catch {
    return null;
  }
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const keys = Object.keys(b);
  if (keys.length !== 1 || keys[0] !== "email") return null;
  const raw = (b as { email: unknown }).email;
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL || !EMAIL.test(email)) return null;
  return { email };
}

/** Auth says the address already has an account: the same answer as for a new one */
export function isKnown(e: { message: string; code?: string; status?: number }): boolean {
  return e.code === "email_exists" || e.code === "user_already_exists" || /already (been )?registered|already exists/i.test(e.message);
}

export async function handleRequestCode(req: Req, deps: RequestCodeDeps): Promise<Res> {
  const res = await handle(req, deps);
  return { ...res, headers: { ...res.headers, ...corsFor(req.header("origin")) } };
}

async function handle(req: Req, deps: RequestCodeDeps): Promise<Res> {
  if (req.method === "OPTIONS") return { status: 204, body: "", headers: { ...CORS } };
  if (req.method !== "POST") return json(405, { error: "method" });
  const body = parseBody(await req.text().catch(() => ""));
  if (!body) return json(400, { error: "email" });
  let r: Awaited<ReturnType<RequestCodeDeps["createUser"]>>;
  try {
    r = await deps.createUser(body.email);
  } catch {
    deps.log?.("request-code: createUser threw");
    return json(503, { error: "retry" });
  }
  if (r.error && !isKnown(r.error)) {
    // never the address in a log; the status and Auth's code are enough to read a failure
    deps.log?.(`request-code: createUser refused (${r.error.status ?? "-"} ${r.error.code ?? "-"})`);
    return json(503, { error: "retry" });
  }
  // new or known — one answer
  return json(200, { ok: true });
}
