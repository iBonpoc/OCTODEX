/**
 * unit:accountCloud — cloud/account.ts against a fake Supabase and fetch (wave 7а-2b, S22; review #220 №2, №4):
 * every request ends (a hung one becomes «no answer»), the start check reads users.deleted_at, the repeat on start
 * finishes the deletion and wipes the device.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = { hang: false, deletedAt: null as string | null, error: null as { message: string } | null, signedOut: 0, session: true, sessionHang: false };
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
      getSession: () =>
        state.sessionHang
          ? new Promise(() => {})
          : Promise.resolve({ data: { session: state.session ? { access_token: "jwt", user: { id: "u1" } } : null } }),
      signOut: async () => void (state.signedOut += 1),
    },
  },
}));
const storage = new Map<string, string>();
/** keys the device fails to read / to write (#911) */
const failGet = new Set<string>();
const failSet = new Set<string>();
const failSetIf: { fn: ((k: string, v: string) => boolean) | null } = { fn: null };
const failRemove = new Set<string>();
/** what happened to the mark, in order (the one-at-a-time test) */
const markOps: string[] = [];
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getAllKeys: async () => [...storage.keys()],
    multiRemove: async (k: string[]) => k.forEach((x) => storage.delete(x)),
    getItem: async (k: string) => {
      if (failGet.has(k)) throw new Error("SQLITE_BUSY");
      return storage.get(k) ?? null;
    },
    setItem: async (k: string, v: string) => {
      if (failSet.has(k) || failSetIf.fn?.(k, v)) throw new Error("QuotaExceededError");
      storage.set(k, v);
    },
    removeItem: async (k: string) => {
      markOps.push(k === "octo.wipe.pending.v1" ? "remove" : "");
      if (failRemove.has(k)) throw new Error("disk");
      storage.delete(k);
    },
  },
}));
import { callDelete, finishDeletion, finishOnDevice, myAccountState, profileDeleted, START_CHECK_MS, wipeIfPending } from "../src/cloud/account";
import { onDeviceForgotten } from "../src/data/persist";

beforeEach(() => {
  Object.assign(state, { hang: false, deletedAt: null, error: null, signedOut: 0, session: true, sessionHang: false });
  storage.clear();
  failGet.clear();
  failSet.clear();
  failSetIf.fn = null;
  failRemove.clear();
  markOps.length = 0;
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
    for (const k of ["octo.cloud.v1.co-1", "octo.role.v1", "octo.lang.v1"]) storage.set(k, "x");
    storage.set("octo.outbox.v1", "[]");
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

describe("unit:accountCloud — the shared outbox when the device fails (#911)", () => {
  const at = new Date().toISOString();
  const op = (id: string, userId: string) => ({ id, op: { k: "x", id }, at, tries: 0, owner: { userId, companyId: "c1" } });
  const ids = (k: string) => JSON.parse(storage.get(k)!).map((o: { id: string }) => o.id);
  const BOTH = JSON.stringify([op("mine", "u1"), op("theirs", "u9")]);

  it("the outbox is not read: other people's ops stay (nothing removed), the next start filters it", async () => {
    storage.set("octo.outbox.v1", BOTH);
    storage.set("octo.cloud.v1.c1", "cache");
    failGet.add("octo.outbox.v1");
    await finishOnDevice(); // u1
    expect(storage.get("octo.outbox.v1")).toBe(BOTH); // before: read failed → «empty» → the key removed
    expect(storage.has("octo.cloud.v1.c1")).toBe(false);
    expect(storage.get("octo.wipe.pending.v1")).toBe("filter:u1");
    failGet.clear();
    await wipeIfPending();
    expect(ids("octo.outbox.v1")).toEqual(["theirs"]);
    expect(storage.has("octo.wipe.pending.v1")).toBe(false);
  }, 10_000);

  it("a read that keeps failing: the next start never wipes the next person's cache, drafts and role", async () => {
    storage.set("octo.outbox.v1", BOTH);
    failGet.add("octo.outbox.v1");
    await finishOnDevice(); // u1 deleted
    // u9 signs in and works: their cache, a draft, a role
    for (const k of ["octo.cloud.v1.c9", "octo.drafts.v1.e1", "octo.role.v1"]) storage.set(k, "u9's");
    await wipeIfPending(); // the read fails again
    for (const k of ["octo.cloud.v1.c9", "octo.drafts.v1.e1", "octo.role.v1"]) expect(storage.get(k)).toBe("u9's");
    expect(storage.get("octo.outbox.v1")).toBe(BOTH);
    expect(storage.get("octo.wipe.pending.v1")).toBe("filter:u1");
  }, 15_000);

  it("the filtered outbox cannot be written: other people's ops stay (never removed first)", async () => {
    storage.set("octo.outbox.v1", BOTH);
    failSet.add("octo.outbox.v1");
    await finishOnDevice();
    expect(storage.get("octo.outbox.v1")).toBe(BOTH); // before: removed by the wipe, the write back failed
    expect(storage.get("octo.wipe.pending.v1")).toBe("filter:u1");
  });

  it("a broken outbox record is left as it is and not repeated (the store offers «copy and go on»)", async () => {
    storage.set("octo.outbox.v1", '[{"id":"theirs"},');
    await finishOnDevice();
    expect(storage.get("octo.outbox.v1")).toBe('[{"id":"theirs"},');
    expect(storage.has("octo.wipe.pending.v1")).toBe(false);
  });

  it("the refused changes: the same — a failed read keeps other people's", async () => {
    const rej = JSON.stringify([{ id: "r1", owner: { userId: "u1", companyId: "c1" } }, { id: "r9", owner: { userId: "u9", companyId: "c1" } }]);
    storage.set("octo.cloud.v1.rejected", rej);
    failGet.add("octo.cloud.v1.rejected");
    await finishOnDevice();
    expect(storage.get("octo.cloud.v1.rejected")).toBe(rej); // before: a device key — removed
    failGet.clear();
    await wipeIfPending();
    expect(ids("octo.cloud.v1.rejected")).toEqual(["r9"]);
  }, 10_000);
});

describe("unit:accountCloud — the repeat that only filters (review of #911)", () => {
  const at = new Date().toISOString();
  const op = (id: string, userId: string) => ({ id, op: { k: "x", id }, at, tries: 0, owner: { userId, companyId: "c1" } });
  const ids = (k: string) => JSON.parse(storage.get(k)!).map((o: { id: string }) => o.id);

  it("«filter:» never wipes the device in memory (the person signed in now keeps sending); only the shared ops are told", async () => {
    const { onSharedForget } = await import("../src/data/outboxOwner");
    let wiped = 0;
    const told: (string | null)[] = [];
    const off = onDeviceForgotten(() => void (wiped += 1));
    const offShared = onSharedForget((id) => void told.push(id));
    storage.set("octo.outbox.v1", JSON.stringify([op("old", "u1"), op("theirs", "u9")]));
    storage.set("octo.wipe.pending.v1", "filter:u1");
    await wipeIfPending();
    off();
    offShared();
    expect(wiped).toBe(0);
    expect(told).toEqual(["u1"]);
    expect(ids("octo.outbox.v1")).toEqual(["theirs"]);
  });

  it("a later deletion before the repeat: the earlier person's ops go too, never forgotten in the mark", async () => {
    storage.set("octo.outbox.v1", JSON.stringify([op("u0op", "u0"), op("u1op", "u1"), op("theirs", "u9")]));
    storage.set("octo.wipe.pending.v1", "filter:u0");
    failGet.add("octo.outbox.v1");
    await finishOnDevice(); // u1 deleted, the outbox still not read
    expect(storage.get("octo.wipe.pending.v1")).toBe("filter:u1,u0");
    failGet.clear();
    await wipeIfPending();
    expect(ids("octo.outbox.v1")).toEqual(["theirs"]);
    expect(storage.has("octo.wipe.pending.v1")).toBe(false);
  }, 15_000);

  it("the mark is set before the slow part: an app killed while it filters wipes again on the next start", async () => {
    storage.set("octo.outbox.v1", JSON.stringify([op("theirs", "u9")]));
    let markWhileReading: string | undefined;
    const real = storage.get.bind(storage);
    storage.get = (k: string) => {
      if (k === "octo.outbox.v1") markWhileReading = real("octo.wipe.pending.v1");
      return real(k);
    };
    await finishOnDevice();
    storage.get = real;
    expect(markWhileReading).toBe("u1");
    expect(storage.has("octo.wipe.pending.v1")).toBe(false); // all done: the wipe takes it away
  });

  it("the wipe itself fails while the outbox was not read: the whole wipe is repeated («u1»), not only the filter", async () => {
    storage.set("octo.outbox.v1", JSON.stringify([op("mine", "u1"), op("theirs", "u9")]));
    failGet.add("octo.outbox.v1");
    const { default: AS } = await import("@react-native-async-storage/async-storage");
    const realRemove = AS.multiRemove;
    AS.multiRemove = async () => {
      throw new Error("disk");
    };
    await finishOnDevice();
    AS.multiRemove = realRemove;
    expect(storage.get("octo.wipe.pending.v1")).toBe("u1");
  }, 10_000);

  it("a broken refused-changes record is left as it is, no mark", async () => {
    storage.set("octo.cloud.v1.rejected", "{broken");
    await finishOnDevice();
    expect(storage.get("octo.cloud.v1.rejected")).toBe("{broken");
    expect(storage.has("octo.wipe.pending.v1")).toBe(false);
  });
});

describe("unit:accountCloud — one mark for every person still to finish (review of #1010)", () => {
  const at = new Date().toISOString();
  const op = (id: string, userId: string) => ({ id, op: { k: "x", id }, at, tries: 0, owner: { userId, companyId: "c1" } });
  const ids = (k: string) => JSON.parse(storage.get(k)!).map((o: { id: string }) => o.id);

  it("«filter:u0» is pending, u1's wipe fails: the mark asks the whole wipe for both («u1,u0»), the repeat finishes both", async () => {
    storage.set("octo.outbox.v1", JSON.stringify([op("u0op", "u0"), op("u1op", "u1"), op("theirs", "u9")]));
    storage.set("octo.wipe.pending.v1", "filter:u0");
    storage.set("octo.cloud.v1.c1", "u1's cache");
    storage.set("octo.invite.token.v1", "u1's invite");
    failGet.add("octo.outbox.v1");
    const { default: AS } = await import("@react-native-async-storage/async-storage");
    const realRemove = AS.multiRemove;
    AS.multiRemove = async () => {
      throw new Error("disk");
    };
    await finishOnDevice(); // u1
    AS.multiRemove = realRemove;
    expect(storage.get("octo.wipe.pending.v1")).toBe("u1,u0"); // before: «filter:u0» (u1's cache stayed) or «u1» (u0 lost)
    failGet.clear();
    state.session = false;
    await wipeIfPending();
    expect(ids("octo.outbox.v1")).toEqual(["theirs"]);
    expect(storage.has("octo.cloud.v1.c1")).toBe(false);
    expect(storage.has("octo.invite.token.v1")).toBe(false);
    expect(storage.has("octo.wipe.pending.v1")).toBe(false);
  }, 15_000);

  it("an app killed before the wipe with «filter:u0» pending: the mark already asks the whole wipe for u1 and u0", async () => {
    storage.set("octo.outbox.v1", JSON.stringify([op("theirs", "u9")]));
    storage.set("octo.wipe.pending.v1", "filter:u0");
    let markWhileReading: string | undefined;
    const real = storage.get.bind(storage);
    storage.get = (k: string) => {
      if (k === "octo.outbox.v1") markWhileReading = real("octo.wipe.pending.v1");
      return real(k);
    };
    await finishOnDevice();
    storage.get = real;
    expect(markWhileReading).toBe("u1,u0");
  });

  it("the «filter:» mark cannot be written after the wipe: the whole-wipe mark stays — never no mark", async () => {
    storage.set("octo.outbox.v1", JSON.stringify([op("mine", "u1"), op("theirs", "u9")]));
    failGet.add("octo.outbox.v1");
    failSetIf.fn = (k, v) => k === "octo.wipe.pending.v1" && v.startsWith("filter:");
    await finishOnDevice();
    expect(storage.get("octo.wipe.pending.v1")).toBe("u1"); // before: taken away by the wipe, then the write failed — none
    expect(storage.get("octo.outbox.v1")).toContain("theirs");
  }, 10_000);
});

describe("unit:accountCloud — the mark after a wipe that went through (#1013)", () => {
  const at = new Date().toISOString();
  const op = (id: string, userId: string) => ({ id, op: { k: "x", id }, at, tries: 0, owner: { userId, companyId: "c1" } });
  const ids = (k: string) => JSON.parse(storage.get(k)!).map((o: { id: string }) => o.id);
  const nextPerson = () => {
    for (const k of ["octo.cloud.v1.c9", "octo.drafts.v1.e9", "octo.role.v1"]) storage.set(k, "u9's");
  };
  const nextPersonKept = () => {
    for (const k of ["octo.cloud.v1.c9", "octo.drafts.v1.e9", "octo.role.v1"]) expect(storage.get(k)).toBe("u9's");
  };

  it("the mark cannot be taken away after the wipe: the next start never wipes the next person's drafts, cache, role", async () => {
    storage.set("octo.outbox.v1", JSON.stringify([op("mine", "u1"), op("theirs", "u9")]));
    failRemove.add("octo.wipe.pending.v1");
    await finishOnDevice(); // u1, wiped; the mark «u1» stays
    expect(storage.get("octo.wipe.pending.v1")).toBe("u1");
    expect(storage.get("octo.wipe.done.v1")).toBe("u1");
    failRemove.clear();
    nextPerson(); // u9 signs in on the same phone and works
    await wipeIfPending(); // the next start
    nextPersonKept(); // before: wiped with the stale «u1» mark
    expect(ids("octo.outbox.v1")).toEqual(["theirs"]);
    expect(storage.has("octo.wipe.pending.v1")).toBe(false);
    expect(storage.has("octo.wipe.done.v1")).toBe(false);
  }, 10_000);

  it("the «filter:» mark cannot be written after the wipe: the next start only filters", async () => {
    storage.set("octo.outbox.v1", JSON.stringify([op("mine", "u1"), op("theirs", "u9")]));
    failGet.add("octo.outbox.v1");
    failSetIf.fn = (k, v) => k === "octo.wipe.pending.v1" && v.startsWith("filter:");
    await finishOnDevice();
    expect(storage.get("octo.wipe.pending.v1")).toBe("u1");
    expect(storage.get("octo.wipe.done.v1")).toBe("u1");
    failGet.clear();
    failSetIf.fn = null;
    nextPerson();
    await wipeIfPending();
    nextPersonKept();
    expect(ids("octo.outbox.v1")).toEqual(["theirs"]);
    expect(storage.has("octo.wipe.pending.v1")).toBe(false);
  }, 15_000);

  it("«wiped» names only some of the people in the mark: the whole wipe is repeated", async () => {
    storage.set("octo.wipe.pending.v1", "u1,u0");
    storage.set("octo.wipe.done.v1", "u1");
    storage.set("octo.cloud.v1.c0", "u0's");
    await wipeIfPending();
    expect(storage.has("octo.cloud.v1.c0")).toBe(false);
  });

  it("the mark cannot be read: «filter:u0» is not overwritten when the deletion goes through (#1013 №2)", async () => {
    storage.set("octo.wipe.pending.v1", "filter:u0");
    failGet.add("octo.wipe.pending.v1");
    await finishOnDevice();
    expect(storage.get("octo.wipe.pending.v1")).toBe("filter:u0"); // before: overwritten («u1», then taken away)
  }, 10_000);

  it("the repeat on start and a deletion finished on start run one after the other, never in between (#1013 №4)", async () => {
    storage.set("octo.outbox.v1", JSON.stringify([op("u0op", "u0"), op("u1op", "u1"), op("theirs", "u9")]));
    storage.set("octo.wipe.pending.v1", "filter:u0");
    const real = storage.get.bind(storage);
    storage.get = (k: string) => {
      if (k === "octo.wipe.pending.v1") markOps.push("read");
      return real(k);
    };
    await Promise.all([wipeIfPending(), finishOnDevice("u1")]);
    storage.get = real;
    // the repeat reads and takes its mark away before the deletion reads the mark — not after it was rewritten
    expect(markOps.filter(Boolean).slice(0, 3)).toEqual(["read", "remove", "read"]);
    expect(ids("octo.outbox.v1")).toEqual(["theirs"]);
    expect(storage.has("octo.wipe.pending.v1")).toBe(false);
  });
});

describe("unit:accountCloud — the review of #1013", () => {
  const at = new Date().toISOString();
  const op = (id: string, userId: string) => ({ id, op: { k: "x", id }, at, tries: 0, owner: { userId, companyId: "c1" } });
  const nextPerson = () => {
    for (const k of ["octo.cloud.v1.c9", "octo.drafts.v1.e9", "octo.role.v1"]) storage.set(k, "u9's");
  };
  const nextPersonKept = () => {
    for (const k of ["octo.cloud.v1.c9", "octo.drafts.v1.e9", "octo.role.v1"]) expect(storage.get(k)).toBe("u9's");
  };

  it("№1: the mark cannot be taken away on the next start either: «wiped» stays, the start after never wipes", async () => {
    storage.set("octo.wipe.pending.v1", "u1");
    storage.set("octo.wipe.done.v1", "u1");
    nextPerson();
    failRemove.add("octo.wipe.pending.v1");
    await wipeIfPending(); // the next start: the mark still cannot go
    expect(storage.get("octo.wipe.done.v1")).toBe("u1"); // before: «wiped» taken away, the mark «u1» left alone
    failRemove.clear();
    await wipeIfPending(); // the start after
    nextPersonKept();
    expect(storage.has("octo.wipe.pending.v1")).toBe(false);
    expect(storage.has("octo.wipe.done.v1")).toBe(false);
  }, 10_000);

  it("№2: «wiped» cannot be read on start: nothing is wiped and nothing changes until the next start", async () => {
    storage.set("octo.wipe.pending.v1", "u1");
    storage.set("octo.wipe.done.v1", "u1");
    nextPerson();
    failGet.add("octo.wipe.done.v1");
    await wipeIfPending();
    nextPersonKept(); // before: read as «none» → the whole wipe
    expect(storage.get("octo.wipe.pending.v1")).toBe("u1");
  }, 10_000);

  it("№3: the mark could not be read at first but can before the wipe: an older «u0» is finished too", async () => {
    storage.set("octo.outbox.v1", JSON.stringify([op("u0op", "u0"), op("theirs", "u9")]));
    storage.set("octo.wipe.pending.v1", "u0");
    let reads = 0;
    const real = storage.get.bind(storage);
    storage.get = (k: string) => {
      if (k === "octo.wipe.pending.v1" && ++reads <= 3) throw new Error("SQLITE_BUSY");
      return real(k);
    };
    await finishOnDevice(); // u1
    storage.get = real;
    expect(JSON.parse(storage.get("octo.outbox.v1")!).map((o: { id: string }) => o.id)).toEqual(["theirs"]);
    expect(storage.has("octo.wipe.pending.v1")).toBe(false); // before: «u0» left — the next start wipes u9's data
  }, 10_000);

  it("the mark cannot be read at all: a failed wipe still asks to wipe u1; a filter to repeat asks «filter:u1»", async () => {
    failGet.add("octo.wipe.pending.v1");
    const { default: AS } = await import("@react-native-async-storage/async-storage");
    const realRemove = AS.multiRemove;
    AS.multiRemove = async () => {
      throw new Error("disk");
    };
    await finishOnDevice();
    AS.multiRemove = realRemove;
    expect(storage.get("octo.wipe.pending.v1")).toBe("u1");
    storage.delete("octo.wipe.pending.v1");
    storage.set("octo.outbox.v1", JSON.stringify([op("mine", "u1")]));
    failGet.add("octo.outbox.v1");
    await finishOnDevice();
    expect(storage.get("octo.wipe.pending.v1")).toBe("filter:u1");
  }, 20_000);

  it("№5: a wipe that fails takes an older «wiped» away: it never answers the new mark", async () => {
    storage.set("octo.wipe.done.v1", "1");
    const { default: AS } = await import("@react-native-async-storage/async-storage");
    const realRemove = AS.multiRemove;
    AS.multiRemove = async () => {
      throw new Error("disk");
    };
    state.session = false;
    await finishOnDevice(); // the person is not known: «1»
    AS.multiRemove = realRemove;
    expect(storage.get("octo.wipe.pending.v1")).toBe("1");
    expect(storage.has("octo.wipe.done.v1")).toBe(false);
  });

  it("one at a time: a run that fails does not stop the next one", async () => {
    storage.set("octo.wipe.pending.v1", "filter:u0");
    storage.set("octo.outbox.v1", JSON.stringify([op("u0op", "u0"), op("theirs", "u9")]));
    const { default: AS } = await import("@react-native-async-storage/async-storage");
    const realGet = AS.getItem;
    AS.getItem = async () => {
      throw new Error("boom");
    };
    const first = wipeIfPending().catch(() => "failed");
    AS.getItem = realGet;
    await first;
    await wipeIfPending();
    expect(JSON.parse(storage.get("octo.outbox.v1")!).map((o: { id: string }) => o.id)).toEqual(["theirs"]);
  });
});

describe("unit:accountCloud — «wiped» only after the wipe went through (#1013, condition of the director)", () => {
  it("an app killed before «wiped» was written: the next start wipes the device whole", async () => {
    // the deletion set its mark and was killed before multiRemove: no «wiped»
    storage.set("octo.wipe.pending.v1", "u1");
    storage.set("octo.cloud.v1.c1", "u1's cache");
    storage.set("octo.drafts.v1.e1", "u1's draft");
    await wipeIfPending();
    expect(storage.has("octo.cloud.v1.c1")).toBe(false);
    expect(storage.has("octo.drafts.v1.e1")).toBe(false);
    expect(storage.has("octo.wipe.pending.v1")).toBe(false);
  });
  it("«wiped» is written only after multiRemove went through, with the ids of the mark", async () => {
    const { default: AS } = await import("@react-native-async-storage/async-storage");
    const order: string[] = [];
    const realRemove = AS.multiRemove;
    AS.multiRemove = async (ks: readonly string[]) => {
      order.push("wiped device");
      await realRemove(ks);
    };
    const realSet = AS.setItem;
    AS.setItem = async (k: string, v: string) => {
      if (k === "octo.wipe.done.v1") order.push(`done=${v}`);
      await realSet(k, v);
    };
    storage.set("octo.wipe.pending.v1", "filter:u0");
    failRemove.add("octo.wipe.pending.v1");
    failSetIf.fn = (k, v) => k === "octo.wipe.pending.v1" && v.startsWith("filter:");
    await finishOnDevice(); // u1; the mark cannot be changed after the wipe
    AS.multiRemove = realRemove;
    AS.setItem = realSet;
    expect(order).toEqual(["wiped device", "done=u1,u0"]);
    expect(storage.get("octo.wipe.pending.v1")).toBe("u1,u0");
  }, 10_000);
});

describe("unit:accountCloud — the rest after #1016 (#1017)", () => {
  const at = new Date().toISOString();
  const op = (id: string, userId: string) => ({ id, op: { k: "x", id }, at, tries: 0, owner: { userId, companyId: "c1" } });
  const ids = (k: string) => JSON.parse(storage.get(k)!).map((o: { id: string }) => o.id);
  const nextPerson = () => {
    for (const k of ["octo.cloud.v1.c9", "octo.drafts.v1.e9", "octo.role.v1"]) storage.set(k, "u9's");
  };
  const nextPersonKept = () => {
    for (const k of ["octo.cloud.v1.c9", "octo.drafts.v1.e9", "octo.role.v1"]) expect(storage.get(k)).toBe("u9's");
  };

  it("№1: an older «u0» never read, the wipe goes through: the next start never wipes the next person's data, u0's ops go", async () => {
    storage.set("octo.wipe.pending.v1", "u0");
    storage.set("octo.outbox.v1", JSON.stringify([op("u0op", "u0"), op("theirs", "u9")]));
    failGet.add("octo.wipe.pending.v1");
    await finishOnDevice(); // u1: the mark is read neither at first nor before the wipe
    expect(storage.get("octo.wipe.pending.v1")).toBe("u0"); // not known — not overwritten
    failGet.clear();
    nextPerson();
    await wipeIfPending(); // the next start reads «u0»
    nextPersonKept(); // before: «u0» asked the whole wipe — u9's cache, drafts and role gone
    expect(ids("octo.outbox.v1")).toEqual(["theirs"]);
    expect(storage.has("octo.wipe.pending.v1")).toBe(false);
    expect(storage.has("octo.wipe.done.v1")).toBe(false);
  }, 20_000);

  const killedBeforeWipe = async (run: () => Promise<void>) => {
    const { default: AS } = await import("@react-native-async-storage/async-storage");
    const realRemove = AS.multiRemove;
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let atWipe: Map<string, string> | null = null;
    AS.multiRemove = async (ks: readonly string[]) => {
      atWipe = new Map(storage); // the app is killed here
      await held;
      await realRemove(ks);
    };
    try {
      const p = run();
      await vi.waitFor(() => expect(atWipe).not.toBeNull());
      release();
      await p;
    } finally {
      release();
      AS.multiRemove = realRemove;
      failSetIf.fn = null;
      failRemove.clear();
    }
    storage.clear();
    for (const [k, v] of atWipe!) storage.set(k, v);
  };

  it("№2: a new deletion takes an older «wiped» away before its mark: killed before the wipe → the next start wipes", async () => {
    storage.set("octo.wipe.pending.v1", "u1");
    storage.set("octo.wipe.done.v1", "u1");
    storage.set("octo.cloud.v1.c2", "u2's cache");
    failSetIf.fn = (k, v) => k === "octo.wipe.pending.v1" && v === "u2,u1";
    await killedBeforeWipe(() => finishOnDevice("u2"));
    expect(storage.has("octo.wipe.done.v1")).toBe(false); // before: «wiped»=«u1» answered the mark «u1»
    await wipeIfPending();
    expect(storage.has("octo.cloud.v1.c2")).toBe(false);
  }, 10_000);

  it("«*» lies beside «u0», u2 deletes, the mark is not written, killed before the wipe: the next start wipes u2 whole", async () => {
    storage.set("octo.wipe.pending.v1", "u0");
    storage.set("octo.wipe.done.v1", "*");
    storage.set("octo.cloud.v1.c2", "u2's cache");
    failSetIf.fn = (k) => k === "octo.wipe.pending.v1";
    await killedBeforeWipe(() => finishOnDevice("u2"));
    expect(storage.has("octo.wipe.done.v1")).toBe(false);
    await wipeIfPending();
    expect(storage.has("octo.cloud.v1.c2")).toBe(false);
  }, 10_000);

  it("«*» cannot be taken away: the new mark is written with «~» — «*» never answers it, the next start wipes u2 whole", async () => {
    storage.set("octo.wipe.done.v1", "*");
    storage.set("octo.cloud.v1.c2", "u2's cache");
    failRemove.add("octo.wipe.done.v1");
    await killedBeforeWipe(() => finishOnDevice("u2"));
    expect(storage.get("octo.wipe.pending.v1")).toBe("u2,~");
    expect(storage.get("octo.wipe.done.v1")).toBe("*");
    await wipeIfPending();
    expect(storage.has("octo.cloud.v1.c2")).toBe(false);
  }, 15_000);

  it("№3: the wipe fails while the mark was not read: read again and kept («u1,u0»), never overwritten blind", async () => {
    storage.set("octo.wipe.pending.v1", "filter:u0");
    let reads = 0;
    const real = storage.get.bind(storage);
    storage.get = (k: string) => {
      if (k === "octo.wipe.pending.v1" && ++reads <= 6) throw new Error("SQLITE_BUSY");
      return real(k);
    };
    const { default: AS } = await import("@react-native-async-storage/async-storage");
    const realRemove = AS.multiRemove;
    AS.multiRemove = async () => {
      throw new Error("disk");
    };
    try {
      await finishOnDevice(); // u1
    } finally {
      AS.multiRemove = realRemove;
      storage.get = real;
    }
    expect(storage.get("octo.wipe.pending.v1")).toBe("u1,u0"); // before: «u1» — u0's ops never filtered
  }, 20_000);

  it("review №4: the mark not read, «*» not written: an older «wiped» that answers «u0» stays — u9's data never wiped", async () => {
    storage.set("octo.wipe.pending.v1", "u0");
    storage.set("octo.wipe.done.v1", "u0");
    failGet.add("octo.wipe.pending.v1");
    failSetIf.fn = (k) => k === "octo.wipe.done.v1";
    await finishOnDevice();
    failGet.clear();
    failSetIf.fn = null;
    expect(storage.get("octo.wipe.done.v1")).toBe("u0");
    nextPerson();
    await wipeIfPending();
    nextPersonKept();
  }, 20_000);

  it("review №2: «*» lies, u9's wipe fails and «wiped» cannot go: the mark carries «~», the next start wipes", async () => {
    storage.set("octo.wipe.done.v1", "*");
    storage.set("octo.cloud.v1.c9", "u9's cache");
    failRemove.add("octo.wipe.done.v1");
    const { default: AS } = await import("@react-native-async-storage/async-storage");
    const realRemove = AS.multiRemove;
    AS.multiRemove = async () => {
      throw new Error("disk");
    };
    try {
      await finishOnDevice("u9");
    } finally {
      AS.multiRemove = realRemove;
      failRemove.clear();
    }
    expect(storage.get("octo.wipe.pending.v1")).toBe("u9,~");
    storage.set("octo.wipe.done.v1", "*");
    await wipeIfPending();
    expect(storage.has("octo.cloud.v1.c9")).toBe(false);
  }, 20_000);

  it("getSession hangs: the wipe goes on at START_CHECK_MS (only ops without an owner and the mark's people go)", async () => {
    vi.useFakeTimers();
    state.sessionHang = true;
    storage.set("octo.cloud.v1.c1", "u1's cache");
    let done = false;
    const run = finishOnDevice().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(START_CHECK_MS - 100);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    // the sign-out after it waits for nothing that hangs here
    state.sessionHang = false;
    await run;
    expect(storage.has("octo.cloud.v1.c1")).toBe(false);
    expect(storage.has("octo.wipe.pending.v1")).toBe(false);
  });

  it("getSession answers: the timeout timer is cleared (nothing left running after the wipe)", async () => {
    vi.useFakeTimers();
    await finishOnDevice();
    expect(vi.getTimerCount()).toBe(0); // before: the START_CHECK_MS timer stayed
  });
});
