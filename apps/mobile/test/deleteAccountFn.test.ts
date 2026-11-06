/**
 * The edge function «delete-account» (7а-2a, S22; docs/specs/19 §6.7) — its pure handler with fake clients:
 * only POST/OPTIONS, the uid only from the verified token (never the body), a strict body, the RPC as the person first,
 * then the sign-in closed by Auth; a failed close is «pending» (data already closed) and a repeat finishes it;
 * the service key is never in an answer or a log.
 */
import { describe, it, expect } from "vitest";
import { CLEARED_METADATA, CORS, handleDelete, parseBody, type DeleteDeps } from "../../../supabase/functions/delete-account/handler";

const UID = "a5000000-0000-4000-8000-000000000001";
const C1 = "c5000000-0000-4000-8000-000000000002";
const SECRET = "service-role-secret-xyz";
const req = (o: { method?: string; auth?: string | null; body?: string }) => ({
  method: o.method ?? "POST",
  header: (n: string) => (n.toLowerCase() === "authorization" ? (o.auth === undefined ? "Bearer user.jwt" : o.auth) : null),
  text: async () => o.body ?? JSON.stringify({ confirm: "DELETE" }),
});
function deps(over: Partial<DeleteDeps> = {}) {
  const calls: string[] = [];
  const logs: string[] = [];
  const d: DeleteDeps = {
    userOf: async (jwt) => (calls.push(`user ${jwt}`), jwt === "user.jwt" ? UID : null),
    deleteAsUser: async (jwt, confirm, cc) => (calls.push(`rpc ${jwt} ${confirm} ${cc.join(",")}`), { data: { deleted: true, repeat: false }, error: null }),
    closeSignIn: async (uid) => (calls.push(`close ${uid}`), { error: null }),
    log: (m) => logs.push(m),
    wait: async () => {},
    ...over,
  };
  return { d, calls, logs };
}

describe("delete-account: who and how", () => {
  it("OPTIONS → 204 with CORS for POST/OPTIONS only; other methods → 405", async () => {
    const o = await handleDelete(req({ method: "OPTIONS" }), deps().d);
    expect(o.status).toBe(204);
    expect(o.headers["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    expect(CORS["Access-Control-Allow-Methods"]).not.toMatch(/GET|PUT|DELETE|PATCH/);
    for (const m of ["GET", "PUT", "DELETE"]) expect((await handleDelete(req({ method: m }), deps().d)).status).toBe(405);
  });
  it("no token or a bad token → 401, nothing deleted", async () => {
    for (const auth of [null, "", "Basic abc", "Bearer bad.jwt"]) {
      const { d, calls } = deps();
      const r = await handleDelete(req({ auth }), d);
      expect(r.status, String(auth)).toBe(401);
      expect(calls.some((c) => c.startsWith("rpc") || c.startsWith("close"))).toBe(false);
    }
  });
  it("the uid comes from the token, never from the body (a body with a user id is refused)", async () => {
    const { d, calls } = deps();
    const r = await handleDelete(req({ body: JSON.stringify({ confirm: "DELETE", userId: "b0000000-0000-0000-0000-000000000001" }) }), d);
    expect(r.status).toBe(400);
    expect(calls.some((c) => c.startsWith("rpc") || c.startsWith("close"))).toBe(false);
  });
  it("a strict body: the word (≤ 20) and up to 20 company ids", () => {
    expect(parseBody('{"confirm":"DELETE"}')).toEqual({ confirm: "DELETE", closeCompanies: [] });
    expect(parseBody(JSON.stringify({ confirm: "DELETE", closeCompanies: [C1] }))).toEqual({ confirm: "DELETE", closeCompanies: [C1] });
    for (const bad of ["", "null", "[]", "{not json", '{"confirm":5}', JSON.stringify({ confirm: "x".repeat(21) }), JSON.stringify({ confirm: "DELETE", closeCompanies: ["nope"] }), JSON.stringify({ confirm: "DELETE", closeCompanies: Array(21).fill(C1) })])
      expect(parseBody(bad), bad).toBeNull();
  });
});

describe("delete-account: the order", () => {
  it("the RPC as the person first, then Auth closes the sign-in of the same uid", async () => {
    const { d, calls } = deps();
    const r = await handleDelete(req({ body: JSON.stringify({ confirm: "УДАЛИТЬ", closeCompanies: [C1] }) }), d);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toMatchObject({ deleted: true, auth: "done" });
    expect(calls).toEqual([`user user.jwt`, `rpc user.jwt УДАЛИТЬ ${C1}`, `close ${UID}`]);
  });
  it("our refusal (OD001: last owner, stale sign-in) → 400 with its words and which company; the sign-in is NOT closed", async () => {
    const { d, calls } = deps({ deleteAsUser: async () => ({ error: { message: "the company keeps at least one active owner", code: "OD001", details: C1 } }) });
    const r = await handleDelete(req({}), d);
    expect(r.status).toBe(400);
    expect(JSON.parse(r.body)).toEqual({ error: "the company keeps at least one active owner", detail: C1 });
    expect(calls.some((c) => c.startsWith("close"))).toBe(false);
  });
  it("any other database or network error → 500 «account deletion failed», no internals", async () => {
    for (const e of [{ message: "Could not find the function public.delete_account in the schema cache", code: "PGRST202" }, { message: "canceling statement due to statement timeout", code: "57014" }, { message: "fetch failed https://kgia.supabase.co" }]) {
      const { d, calls } = deps({ deleteAsUser: async () => ({ error: e }) });
      const r = await handleDelete(req({}), d);
      expect(r.status).toBe(500);
      expect(JSON.parse(r.body)).toEqual({ error: "account deletion failed" });
      expect(r.body).not.toMatch(/schema|timeout|supabase|PGRST/);
      expect(calls.some((c) => c.startsWith("close"))).toBe(false);
    }
  });
  it("Auth failing for a moment is retried (up to 3) before «pending»", async () => {
    let n = 0;
    const { d } = deps({ closeSignIn: async () => (++n < 3 ? { error: { message: "busy" } } : { error: null }) });
    const r = await handleDelete(req({}), d);
    expect(JSON.parse(r.body)).toMatchObject({ auth: "done" });
    expect(n).toBe(3);
  });
  it("Auth fails after the data is closed → 200 auth: pending; a repeat (RPC says repeat) closes the sign-in", async () => {
    let fail = true;
    const { d, logs } = deps({ closeSignIn: async () => (fail ? { error: { message: `boom ${SECRET}`.replace(SECRET, "x") } } : { error: null }) });
    const r1 = await handleDelete(req({}), d);
    expect(JSON.parse(r1.body)).toMatchObject({ deleted: true, auth: "pending" });
    expect(logs.length).toBe(1); // one «pending» line after 3 tries
    fail = false;
    const again = deps({ deleteAsUser: async () => ({ data: { deleted: true, repeat: true }, error: null }) });
    const r2 = await handleDelete(req({}), { ...again.d, closeSignIn: d.closeSignIn });
    expect(JSON.parse(r2.body)).toMatchObject({ deleted: true, auth: "done", result: { repeat: true } });
  });
  it("a thrown client error is an answer, not a crash", async () => {
    const r = await handleDelete(req({}), deps({ deleteAsUser: async () => { throw new Error("network down"); } }).d);
    expect(r.status).toBe(500);
  });
});

describe("delete-account: no secrets out", () => {
  it("a key inside a failing RPC or Auth error never reaches the answer or the log (review #214 №5)", async () => {
    // the database / network error carries the key
    const rpc = deps({ deleteAsUser: async () => ({ error: { message: `connection failed key=${SECRET}`, code: "08006", details: SECRET } }) });
    const r1 = await handleDelete(req({}), rpc.d);
    expect(r1.body).not.toContain(SECRET);
    expect(rpc.logs.join(" ")).not.toContain(SECRET);
    // a thrown client error with the key
    const thrown = deps({ deleteAsUser: async () => { throw new Error(`fetch ${SECRET}`); } });
    const r2 = await handleDelete(req({}), thrown.d);
    expect(r2.body).not.toContain(SECRET);
    expect(thrown.logs.join(" ")).not.toContain(SECRET);
    // Auth fails with the key in its message, three times
    const auth = deps({ closeSignIn: async () => ({ error: { message: `admin api ${SECRET}` } }) });
    const r3 = await handleDelete(req({}), auth.d);
    expect(JSON.parse(r3.body)).toMatchObject({ auth: "pending" });
    expect(r3.body).not.toContain(SECRET);
    expect(auth.logs.join(" ")).not.toContain(SECRET);
    expect(auth.logs.join(" ")).not.toContain(UID);
  });
  it("tries Auth with a growing pause between the tries", async () => {
    const pauses: number[] = [];
    const { d } = deps({ closeSignIn: async () => ({ error: { message: "busy" } }), wait: async (ms) => void pauses.push(ms) });
    await handleDelete(req({}), d);
    expect(pauses).toEqual([300, 600]);
  });
  it("clears every name / contact field Supabase keeps in user_metadata", () => {
    for (const k of ["full_name", "name", "email", "phone", "email_verified", "phone_verified", "sub", "avatar_url"]) expect(CLEARED_METADATA).toHaveProperty(k, null);
  });
  it("the Deno entry reads the key only from the environment and never logs or returns it", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../../supabase/functions/delete-account/index.ts", import.meta.url), "utf8");
    expect(src).toMatch(/Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
    expect(src).not.toMatch(/console\.\w+\([^)]*SERVICE/);
    expect(src).not.toMatch(/JSON\.stringify\([^)]*SERVICE/);
    const cfg = readFileSync(new URL("../../../supabase/config.toml", import.meta.url), "utf8");
    expect(cfg).toMatch(/\[functions\.delete-account\]\s*\nverify_jwt = true/);
  });
});
