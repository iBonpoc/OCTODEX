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
    await finishOnDevice();
    expect(heard).toEqual(["octo.outbox.v1", "octo.role.v1", "octo.cloud.v1.c1"]);
    heard.length = 0;
    await wipeIfPending(); // nothing pending: nothing forgotten
    expect(heard).toEqual([]);
    storage.set("octo.wipe.pending.v1", "1");
    await wipeIfPending();
    expect(heard).toHaveLength(3);
    off();
  });
});
