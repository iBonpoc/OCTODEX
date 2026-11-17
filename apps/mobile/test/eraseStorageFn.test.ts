/**
 * The edge function «erase-storage» (spec 50 §3.2, PR 50-3) — its pure handler with fake clients: only a service-role token, only
 * paths of the right shape in the bucket «files», done/fail marks, bounded rounds, no names in logs; delete-account tries it once
 * without ever changing its answer; the function is deployed and configured.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { BATCH, MAX_ROUNDS, drainStorageQueue, handleErase, roleOf, safePath, type EraseDeps, type Row } from "../../../supabase/functions/erase-storage/handler";
import { handleDelete, type DeleteDeps } from "../../../supabase/functions/delete-account/handler";

const C = "ca000000-0000-4000-8000-000000000000";
const row = (n: string, over: Partial<Row> = {}): Row => ({ id: `r-${n}`, bucket: "files", path: `${C}/${n}.jpg`, ...over });
const jwt = (role: string) => `h.${btoa(JSON.stringify({ role })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.s`;
function fake(queue: Row[][], over: Partial<EraseDeps> = {}) {
  const calls: string[] = [];
  const logs: string[] = [];
  const rounds = [...queue];
  const d: EraseDeps = {
    claim: async (limit) => (calls.push(`claim ${limit}`), rounds.shift() ?? []),
    remove: async (b, paths) => (calls.push(`remove ${b} ${paths.join(",")}`), { error: null }),
    done: async (ids) => void calls.push(`done ${ids.join(",")}`),
    fail: async (ids) => void calls.push(`fail ${ids.join(",")}`),
    log: (m) => logs.push(m),
    ...over,
  };
  return { d, calls, logs };
}

describe("unit:eraseStorage — what may be removed", () => {
  it("only <company uuid>/<name> of the bucket files", () => {
    expect(safePath("files", `${C}/a.jpg`)).toBe(true);
    expect(safePath("files", `${C}/sub/a.jpg`)).toBe(true);
    for (const p of ["", "/", "/x", "../x", `${C}/`, `${C}/../cb000000-0000-4000-8000-000000000000/x`, "files/x.jpg", "not-a-uuid/x.jpg", `${C}/a b.jpg`, `${C}/${"x".repeat(600)}`]) {
      expect(safePath("files", p), p).toBe(false);
    }
    expect(safePath("other", `${C}/a.jpg`)).toBe(false);
  });
  it("reads the role claim of a token; garbage is no role", () => {
    expect(roleOf(`Bearer ${jwt("service_role")}`)).toBe("service_role");
    expect(roleOf(`Bearer ${jwt("anon")}`)).toBe("anon");
    expect(roleOf(null)).toBeNull();
    expect(roleOf("Bearer not-a-jwt")).toBeNull();
    expect(roleOf("Bearer a.%%%.c")).toBeNull();
  });
});

describe("unit:eraseStorage — the drain", () => {
  it("claims, removes through the API, marks done; then stops on an empty queue", async () => {
    const { d, calls } = fake([[row("a"), row("b")], []]);
    expect(await drainStorageQueue(d)).toEqual({ removed: 2, failed: 0, refused: 0 });
    expect(calls).toEqual([`claim ${BATCH}`, `remove files ${C}/a.jpg,${C}/b.jpg`, "done r-a,r-b", `claim ${BATCH}`]);
  });
  it("a failed removal counts a try and stops; the names never reach the log", async () => {
    const { d, calls, logs } = fake([[row("a")]], { remove: async () => ({ error: { message: `boom ${C}/a.jpg` } }) });
    expect(await drainStorageQueue(d)).toEqual({ removed: 0, failed: 1, refused: 0 });
    expect(calls.filter((c) => c.startsWith("fail"))).toEqual(["fail r-a"]);
    expect(calls.some((c) => c.startsWith("done"))).toBe(false);
    expect(logs.join(" ")).not.toContain(C);
    expect(logs.join(" ")).not.toContain("a.jpg");
  });
  it("a row of a wrong shape is never sent to the API and counts a failed try", async () => {
    const { d, calls } = fake([[row("a", { path: "../x" }), row("b", { bucket: "other" })], []]);
    expect(await drainStorageQueue(d)).toEqual({ removed: 0, failed: 0, refused: 2 });
    expect(calls.some((c) => c.startsWith("remove"))).toBe(false);
    expect(calls).toContain("fail r-a,r-b");
  });
  it("good and bad rows together: the good go, the bad are refused", async () => {
    const { d, calls } = fake([[row("a"), row("b", { path: "/x" })], []]);
    expect(await drainStorageQueue(d)).toEqual({ removed: 1, failed: 0, refused: 1 });
    expect(calls).toContain(`remove files ${C}/a.jpg`);
    expect(calls).toContain("fail r-b");
  });
  it("never runs for ever: at most MAX_ROUNDS rounds", async () => {
    const { d, calls } = fake(Array.from({ length: 20 }, (_, i) => [row(String(i))]));
    await drainStorageQueue(d);
    expect(calls.filter((c) => c.startsWith("claim")).length).toBe(MAX_ROUNDS);
  });
  it("a claim that throws is a failure, not a crash", async () => {
    const { d, logs } = fake([], { claim: async () => { throw new Error("db down"); } });
    expect(await drainStorageQueue(d)).toEqual({ removed: 0, failed: 1, refused: 0 });
    expect(logs).toEqual(["erase-storage: claim failed"]);
  });
});

describe("unit:eraseStorage — the entry", () => {
  const req = (method: string, auth: string | null) => ({ method, header: (n: string) => (n.toLowerCase() === "authorization" ? auth : null) });
  it("POST with a service-role token drains; anon, a person, no token, GET are refused before any call", async () => {
    const { d, calls } = fake([[row("a")], []]);
    expect((await handleErase(req("POST", `Bearer ${jwt("service_role")}`), d)).status).toBe(200);
    const before = calls.length;
    for (const [m, a] of [["POST", `Bearer ${jwt("anon")}`], ["POST", `Bearer ${jwt("authenticated")}`], ["POST", null], ["POST", "Bearer x"], ["GET", `Bearer ${jwt("service_role")}`]] as const) {
      const r = await handleErase(req(m, a), d);
      expect([403, 405]).toContain(r.status);
    }
    expect(calls.length).toBe(before);
  });
  it("the answer holds counters only", async () => {
    const { d } = fake([[row("a")], []]);
    const r = await handleErase(req("POST", `Bearer ${jwt("service_role")}`), d);
    expect(JSON.parse(r.body)).toEqual({ removed: 1, failed: 0, refused: 0 });
  });
});

describe("unit:eraseStorage — delete-account tries it once and never changes its answer", () => {
  const dreq = { method: "POST", header: (n: string) => (n.toLowerCase() === "authorization" ? "Bearer user.jwt" : null), text: async () => JSON.stringify({ confirm: "DELETE" }) };
  const base = (over: Partial<DeleteDeps> = {}): DeleteDeps => ({
    userOf: async () => "u1",
    deleteAsUser: async () => ({ data: { deleted: true }, error: null }),
    closeSignIn: async () => ({ error: null }),
    wait: async () => {},
    ...over,
  });
  it("calls the storage drain after a successful deletion", async () => {
    let called = 0;
    const r = await handleDelete(dreq, base({ eraseStorage: async () => void called++ }));
    expect(r.status).toBe(200);
    expect(called).toBe(1);
  });
  it("a failing or a hanging drain changes nothing in the answer", async () => {
    const logs: string[] = [];
    const a = await handleDelete(dreq, base({ eraseStorage: async () => { throw new Error("storage down"); }, log: (m) => logs.push(m) }));
    expect(a.status).toBe(200);
    expect(JSON.parse(a.body).deleted).toBe(true);
    expect(logs).toContain("delete-account: storage erase failed");
    const b = await handleDelete(dreq, base({ eraseStorage: () => new Promise(() => {}), wait: async () => {} }));
    expect(b.status).toBe(200);
  });
  it("is not called when the deletion itself failed", async () => {
    let called = 0;
    const r = await handleDelete(dreq, base({ deleteAsUser: async () => ({ error: { message: "x", code: "OD001" } }), eraseStorage: async () => void called++ }));
    expect(r.status).toBe(400);
    expect(called).toBe(0);
  });
});

describe("unit:eraseStorage — deployed and configured", () => {
  const root = path.resolve(__dirname, "../../..");
  const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
  it("release.yml deploys it; config.toml asks for a verified token", () => {
    expect(read(".github/workflows/release.yml")).toMatch(/supabase functions deploy erase-storage --project-ref "\$PROJECT_REF" --yes/);
    expect(read("supabase/config.toml")).toMatch(/\[functions\.erase-storage\]\s*\nverify_jwt = true/);
  });
  it("the entry never logs the service key and takes the paths only from the queue", () => {
    const src = read("supabase/functions/erase-storage/index.ts") + read("supabase/functions/erase-storage/deps.ts");
    expect(src).not.toMatch(/console\.(log|warn|error)\([^)]*(SERVICE|KEY)/);
    expect(src).not.toMatch(/req\.(json|text|url)/); // no path, prefix or bucket from the request
  });
});
