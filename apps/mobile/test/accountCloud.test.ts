/**
 * unit:accountCloud — cloud/account.ts against a fake Supabase and fetch (wave 7а-2b, S22; review #220 №2, №4):
 * every request ends (a hung one becomes «no answer»), the start check reads users.deleted_at, the repeat on start
 * finishes the deletion and wipes the device.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = { hang: false, deletedAt: null as string | null, error: null as { message: string } | null, signedOut: 0, session: true };
function query() {
  let signal: AbortSignal | undefined;
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in"]) q[m] = () => q;
  q.abortSignal = (s: AbortSignal) => ((signal = s), q);
  q.maybeSingle = () =>
    new Promise((ok, no) => {
      if (state.hang) {
        signal?.addEventListener("abort", () => no(new Error("AbortError")));
        return;
      }
      ok({ data: state.error ? null : { deleted_at: state.deletedAt }, error: state.error });
    });
  return q;
}
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: () => query(),
    auth: {
      getSession: async () => ({ data: { session: state.session ? { access_token: "jwt", user: { id: "u1" } } : null } }),
      signOut: async () => void (state.signedOut += 1),
    },
  },
}));
const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getAllKeys: async () => [...storage.keys()],
    multiRemove: async (k: string[]) => k.forEach((x) => storage.delete(x)),
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
    removeItem: async (k: string) => void storage.delete(k),
  },
}));
import { callDelete, finishDeletion, finishOnDevice, myAccountState, profileDeleted, wipeIfPending } from "../src/cloud/account";
import { onDeviceForgotten } from "../src/data/persist";

beforeEach(() => {
  Object.assign(state, { hang: false, deletedAt: null, error: null, signedOut: 0, session: true });
  storage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("unit:accountCloud — the start check", () => {
  it("users.deleted_at: set → true, null → false, an error → null (asked again later)", async () => {
    state.deletedAt = "2026-11-06T12:00:00Z";
    expect(await profileDeleted("u1")).toBe(true);
    state.deletedAt = null;
    expect(await profileDeleted("u1")).toBe(false);
    state.error = { message: "Failed to fetch" };
    expect(await profileDeleted("u1")).toBeNull();
  });
  it("a hung request ends at the timeout as «no answer» (the app opens, the deletion screen is not stuck)", async () => {
    state.hang = true;
    expect(await profileDeleted("u1", 30)).toBeNull();
    expect(await myAccountState(30)).toBe("unknown");
  });
});

describe("unit:accountCloud — the edge function call", () => {
  it("a hung call is aborted at the timeout (→ «no answer», the repeat asks the server)", async () => {
    vi.stubGlobal("fetch", (_u: string, init: { signal: AbortSignal }) => new Promise((_ok, no) => init.signal.addEventListener("abort", () => no(new Error("AbortError")))));
    await expect(callDelete("DELETE", [], 30)).rejects.toThrow(/Abort/);
  });
  it("sends only {confirm, closeCompanies?} with the person's token; the answer as it is", async () => {
    const seen: { url: string; body: string; auth: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: { body: string; headers: Record<string, string> }) => {
      seen.push({ url, body: init.body, auth: init.headers.Authorization });
      return { status: 400, json: async () => ({ error: "type the word to confirm" }) };
    });
    expect(await callDelete("DELETE", ["co-1"])).toEqual({ status: 400, body: { error: "type the word to confirm" } });
    expect(seen[0]!.url).toMatch(/\/functions\/v1\/delete-account$/);
    expect(JSON.parse(seen[0]!.body)).toEqual({ confirm: "DELETE", closeCompanies: ["co-1"] });
    expect(seen[0]!.auth).toBe("Bearer jwt");
  });
  it("no session — 401 without a request", async () => {
    state.session = false;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect((await callDelete("DELETE", [])).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("unit:accountCloud — the repeat on start finishes it and wipes the device", () => {
  it("«repeat» answer → wipe (cloud caches, outbox, role…) and a local sign-out", async () => {
    for (const k of ["octo.cloud.v1.co-1", "octo.outbox.v1", "octo.role.v1", "octo.lang.v1"]) storage.set(k, "x");
    vi.stubGlobal("fetch", async () => ({ status: 200, json: async () => ({ deleted: true, auth: "done", result: { repeat: true } }) }));
    await finishDeletion();
    expect([...storage.keys()]).toEqual(["octo.lang.v1"]);
    expect(state.signedOut).toBe(1);
  });
});

describe("unit:accountCloud — the store in memory is forgotten with the device (19 §6.12, store debt)", () => {
  it("after the wipe every device key held in memory is reset; a key of the phone itself is not", async () => {
    const heard: string[] = [];
    const off = onDeviceForgotten((wiped) => {
      for (const k of ["octo.outbox.v1", "octo.role.v1", "octo.cloud.v1.c1", "octo.lang.v1"]) if (wiped(k)) heard.push(k);
    });
    storage.set("octo.outbox.v1", "[]");
    let before = false;
    const offOrder = onDeviceForgotten(() => void (before = storage.has("octo.outbox.v1")));
    await finishOnDevice();
    offOrder();
    // the outbox is filtered, not reset (another person's unsent ops stay, rule 6): the store drops only its own
    expect(heard).toEqual(["octo.role.v1", "octo.cloud.v1.c1"]);
    expect(before).toBe(true); // forgotten BEFORE the wipe (review #231 №4): no write can land after it
    expect(storage.has("octo.outbox.v1")).toBe(false);
    heard.length = 0;
    await wipeIfPending(); // nothing pending: nothing forgotten
    expect(heard).toEqual([]);
    storage.set("octo.wipe.pending.v1", "1");
    await wipeIfPending();
    expect(heard).toHaveLength(2);
    off();
  });
  it("another person's unsent ops on this phone stay; the deleted person's and old ones without an owner go", async () => {
    const at = new Date().toISOString();
    const op = (id: string, owner?: { userId: string; companyId: string }) => ({ id, op: { k: "x", id }, at, tries: 0, ...(owner ? { owner } : {}) });
    storage.set("octo.outbox.v1", JSON.stringify([op("mine", { userId: "u1", companyId: "c1" }), op("old"), op("theirs", { userId: "u9", companyId: "c1" }), op("theirs2", { userId: "u9", companyId: "c7" })]));
    storage.set("octo.role.v1", '"tech"');
    await finishOnDevice(); // the session's person is u1 (the mock)
    expect(JSON.parse(storage.get("octo.outbox.v1")!).map((o: { id: string }) => o.id)).toEqual(["theirs", "theirs2"]);
    expect(storage.has("octo.role.v1")).toBe(false);
    // the repeat on start without a session (review #240 №2): the mark names the deleted person
    state.session = false;
    storage.set("octo.outbox.v1", JSON.stringify([op("mine2", { userId: "u1", companyId: "c2" }), op("theirs3", { userId: "u9", companyId: "c1" })]));
    storage.set("octo.wipe.pending.v1", "u1");
    await wipeIfPending();
    expect(JSON.parse(storage.get("octo.outbox.v1")!).map((o: { id: string }) => o.id)).toEqual(["theirs3"]);
    expect(storage.has("octo.wipe.pending.v1")).toBe(false);
    // an older mark ("1"): whose is not known — only ownerless ops go
    storage.set("octo.outbox.v1", JSON.stringify([op("mine3", { userId: "u1", companyId: "c2" }), op("old2")]));
    storage.set("octo.wipe.pending.v1", "1");
    await wipeIfPending();
    expect(JSON.parse(storage.get("octo.outbox.v1")!).map((o: { id: string }) => o.id)).toEqual(["mine3"]);
    state.session = true;
    // an older mark ("1") while ANOTHER person is signed in now (u1's wipe failed, u2 signed in, the app restarted):
    // never the session's person — u2's unsent ops stay (review #244, rule 6)
    state.session = true; // the session mock is u1 here: it stands for whoever is signed in now
    storage.set("octo.outbox.v1", JSON.stringify([op("now-signed-in", { userId: "u1", companyId: "c1" }), op("old3")]));
    storage.set("octo.wipe.pending.v1", "1");
    await wipeIfPending();
    expect(JSON.parse(storage.get("octo.outbox.v1")!).map((o: { id: string }) => o.id)).toEqual(["now-signed-in"]);
    // the start check knows the person even after the session is gone: finishOnDevice(uid)
    state.session = false;
    storage.set("octo.outbox.v1", JSON.stringify([op("mine4", { userId: "u7", companyId: "c1" }), op("theirs4", { userId: "u9", companyId: "c1" })]));
    await finishOnDevice("u7");
    expect(JSON.parse(storage.get("octo.outbox.v1")!).map((o: { id: string }) => o.id)).toEqual(["theirs4"]);
    state.session = true;
    // nothing of anyone else: the key goes
    storage.set("octo.outbox.v1", JSON.stringify([op("mine", { userId: "u1", companyId: "c1" })]));
    await finishOnDevice();
    expect(storage.has("octo.outbox.v1")).toBe(false);
  });
});
