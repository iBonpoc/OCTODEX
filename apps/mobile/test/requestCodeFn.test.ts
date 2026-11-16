/**
 * The edge function «request-code» (docs/specs/52 §8 Р10, #1756) — its pure handler with a fake admin client:
 * only POST/OPTIONS; a strict body { email }; the account is made with the email only; a known address gets the same
 * answer as a new one; Auth failing → 503 «retry»; the address never in a log; CORS only for our sites.
 */
import { describe, it, expect } from "vitest";
import { handleRequestCode, isKnown, parseBody, type RequestCodeDeps } from "../../../supabase/functions/request-code/handler";

const req = (o: { method?: string; body?: string; origin?: string | null }) => ({
  method: o.method ?? "POST",
  header: (n: string) => (n.toLowerCase() === "origin" ? (o.origin ?? null) : null),
  text: async () => o.body ?? JSON.stringify({ email: "New.Person@Example.com " }),
});
function deps(over: Partial<RequestCodeDeps> = {}) {
  const made: string[] = [];
  const logs: string[] = [];
  const d: RequestCodeDeps = { createUser: async (e) => (made.push(e), { error: null }), log: (m) => logs.push(m), ...over };
  return { d, made, logs };
}

describe("request-code: the body", () => {
  it("exactly { email } with one plausible address, trimmed and lower-cased", () => {
    expect(parseBody(JSON.stringify({ email: " A@B.co " }))).toEqual({ email: "a@b.co" });
    for (const b of ["", "nope", "[]", "null", JSON.stringify({}), JSON.stringify({ email: 5 }), JSON.stringify({ email: "a@b" }), JSON.stringify({ email: "a b@c.d" }),
      JSON.stringify({ email: "a@b.co", password: "x" }), JSON.stringify({ email: "a@b.co", data: { full_name: "Support" } }), JSON.stringify({ email: `${"a".repeat(250)}@b.co` })])
      expect(parseBody(b), b).toBeNull();
  });
});

describe("request-code: the answer", () => {
  it("a new address: the account with the email only, 200 {ok}", async () => {
    const { d, made } = deps();
    const r = await handleRequestCode(req({}), d);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ ok: true });
    expect(made).toEqual(["new.person@example.com"]);
  });
  it("a known address: the very same answer (nothing tells whether an account exists)", async () => {
    const known = deps({ createUser: async () => ({ error: { message: "A user with this email address has already been registered", code: "email_exists", status: 422 } }) });
    const fresh = deps();
    const a = await handleRequestCode(req({}), known.d);
    const b = await handleRequestCode(req({}), fresh.d);
    expect(a.status).toBe(b.status);
    expect(a.body).toBe(b.body);
    expect(isKnown({ message: "User already registered" })).toBe(true);
    expect(isKnown({ message: "Database error creating new user" })).toBe(false);
  });
  it("Auth refusing or throwing → 503 «retry»; the log has no address", async () => {
    const refused = deps({ createUser: async () => ({ error: { message: "Database error creating new user", code: "unexpected_failure", status: 500 } }) });
    const r = await handleRequestCode(req({}), refused.d);
    expect(r.status).toBe(503);
    expect(JSON.parse(r.body)).toEqual({ error: "retry" });
    const thrown = deps({ createUser: async () => { throw new Error("fetch failed new.person@example.com"); } });
    expect((await handleRequestCode(req({}), thrown.d)).status).toBe(503);
    for (const l of [...refused.logs, ...thrown.logs]) expect(l).not.toMatch(/@|example/);
  });
  it("a bad body → 400, nothing made; GET → 405; OPTIONS → 204", async () => {
    const { d, made } = deps();
    expect((await handleRequestCode(req({ body: JSON.stringify({ email: "x" }) }), d)).status).toBe(400);
    expect((await handleRequestCode(req({ method: "GET" }), d)).status).toBe(405);
    expect((await handleRequestCode(req({ method: "OPTIONS" }), d)).status).toBe(204);
    expect(made).toEqual([]);
  });
  it("CORS: our site is named, another site is not, never «*»", async () => {
    const ours = await handleRequestCode(req({ method: "OPTIONS", origin: "https://gorix.expo.app" }), deps().d);
    expect(ours.headers["Access-Control-Allow-Origin"]).toBe("https://gorix.expo.app");
    const other = await handleRequestCode(req({ origin: "https://evil.example" }), deps().d);
    expect(other.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
