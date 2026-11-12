/**
 * unit:persistKeep — #1189 (review of #1187, «пользовательские данные не терять»): a record the phone cannot use as it
 * is never goes without a copy. A cache (not strict) that is not JSON, or not of the expected shape, is copied to
 * `octo.broken.<key>.<time>` before it is started over; after a failed read, the first write over it reads it once more
 * and copies it; the newest 3 copies of a key stay; a full device (the web's localStorage) makes room from the older
 * copies; a record written over without a copy is noted in the storage log (the key, when, why). Red before #1189.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => import("./support/miniReact"));
const storage = new Map<string, string>();
/** reads of these keys fail (SQLITE_BUSY) — a number: that many times */
const failing = new Map<string, number>();
/** reads of these keys wait for the promise (a slow device: the copy is under way) */
const holdReads = new Map<string, Promise<void>>();
/** the device's room in characters (the web's localStorage ~5 MB); null — no limit */
let quota: number | null = null;
const used = () => [...storage.entries()].reduce((s, [k, v]) => s + k.length + v.length, 0);
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => {
      const h = holdReads.get(k);
      if (h) await h;
      const n = failing.get(k) ?? 0;
      if (n > 0) {
        failing.set(k, n - 1);
        throw new Error("SQLITE_BUSY");
      }
      return storage.get(k) ?? null;
    },
    setItem: async (k: string, v: string) => {
      if (quota !== null && used() - (storage.has(k) ? k.length + storage.get(k)!.length : 0) + k.length + v.length > quota) throw new Error("QuotaExceededError");
      storage.set(k, v);
    },
    getAllKeys: async () => [...storage.keys()],
    removeItem: async (k: string) => void storage.delete(k),
    multiRemove: async (ks: string[]) => ks.forEach((k) => storage.delete(k)),
  },
}));
import { render, settle } from "./support/miniReact";
import { BROKEN_KEEP, BROKEN_MAX_CHARS, BROKEN_MAX_CHARS_WEB, READ_TRIES, STORAGE_LOG_KEY, flushAllWriters, forgetDeviceState, keepBrokenCopy, noteStorageLoss, usePersistentState } from "../src/data/persist";
import { normalizeDB } from "../src/data/normalize";
import { makeSeed } from "../src/data/seed";

type V = { db: { items: string[] } };
const K = "octo.db.v5";
const copies = (k = K) => [...storage.entries()].filter(([x]) => x.startsWith(`octo.broken.${k}.`));
const Comp = () => usePersistentState<V>(K, { db: { items: ["fresh"] } }, { validate: (v) => Array.isArray(v?.db?.items) });
type Out = ReturnType<typeof usePersistentState<V>>;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const logOf = () => JSON.parse(storage.get(STORAGE_LOG_KEY) ?? "[]") as { key: string; at: string; what: string }[];
type Gate = { open: () => void };
const gateReads = (k: string): Gate => {
  let open!: () => void;
  holdReads.set(k, new Promise<void>((r) => (open = r)));
  return { open: () => (holdReads.delete(k), open()) };
};
/** a hook whose read failed every try: loaded, empty, the first write owes a copy */
async function afterFailedRead(Hook: () => unknown = Comp): Promise<{ out: () => Out; unmount: () => void; rerender?: unknown }> {
  storage.set(K, JSON.stringify({ db: { items: ["the person's own"] } }));
  failing.set(K, READ_TRIES);
  const root = render(Hook as () => Out, {});
  for (let i = 0; i < 40 && !(root.out as Out)[2]; i++) {
    await wait(200);
    await settle();
  }
  expect((root.out as Out)[2]).toBe(true);
  return { out: () => root.out as Out, unmount: () => root.unmount() };
}

beforeEach(() => {
  storage.clear();
  holdReads.clear();
  failing.clear();
  quota = null;
});

describe("unit:persistKeep — #1189", () => {
  it("not JSON: copied before it is started over, then the fresh start is written", async () => {
    storage.set(K, "{broken");
    const root = render(Comp, {});
    await settle();
    await wait(50);
    await settle();
    expect((root.out as Out)[2]).toBe(true);
    expect(copies().map(([, v]) => v)).toEqual(["{broken"]);
    (root.out as Out)[1]({ db: { items: ["mine"] } });
    await settle();
    await wait(300);
    expect(JSON.parse(storage.get(K)!)).toEqual({ db: { items: ["mine"] } });
    root.unmount();
  });
  it("not of the expected shape: copied the same", async () => {
    storage.set(K, JSON.stringify({ db: { items: "not a list", mine: "keep me" } }));
    const root = render(Comp, {});
    await settle();
    await wait(50);
    await settle();
    expect(copies().map(([, v]) => JSON.parse(v).db.mine)).toEqual(["keep me"]);
    root.unmount();
  });
  it("a failed read: the first write over it reads it once more and copies it first", async () => {
    storage.set(K, JSON.stringify({ db: { items: ["the person's own"] } }));
    failing.set(K, READ_TRIES);
    const root = render(Comp, {});
    for (let i = 0; i < 40 && !(root.out as Out)[2]; i++) {
      await wait(200);
      await settle();
    }
    expect((root.out as Out)[2]).toBe(true);
    (root.out as Out)[1]({ db: { items: ["new"] } });
    await settle();
    await wait(400);
    expect(JSON.parse(storage.get(K)!)).toEqual({ db: { items: ["new"] } });
    expect(copies().map(([, v]) => JSON.parse(v).db.items)).toEqual([["the person's own"]]);
    root.unmount();
  }, 20_000);
  it("read again failed too: written all the same (the app never locks), and the loss is noted with its key", async () => {
    storage.set(K, JSON.stringify({ db: { items: ["the person's own"] } }));
    failing.set(K, READ_TRIES + 1);
    const root = render(Comp, {});
    for (let i = 0; i < 40 && !(root.out as Out)[2]; i++) {
      await wait(200);
      await settle();
    }
    (root.out as Out)[1]({ db: { items: ["new"] } });
    await settle();
    await wait(400);
    expect(JSON.parse(storage.get(K)!)).toEqual({ db: { items: ["new"] } });
    const log = JSON.parse(storage.get(STORAGE_LOG_KEY) ?? "[]") as { key: string; at: string; what: string }[];
    expect(log.map((x) => x.key)).toEqual([K]);
    expect(log[0]!.what).toMatch(/written over/);
    root.unmount();
  }, 20_000);
  it(`the newest ${BROKEN_KEEP} copies of a key stay; other keys' copies are not touched`, async () => {
    storage.set("octo.broken.other.1", "x");
    for (let i = 1; i <= 5; i++) expect(await keepBrokenCopy(K, `v${i}`, 1000 + i)).toBe(true);
    expect(copies().map(([, v]) => v).sort()).toEqual(["v3", "v4", "v5"]);
    expect(storage.has("octo.broken.other.1")).toBe(true);
  });
  it("a full device (the web's localStorage): the oldest copies make room one at a time — only as many as needed; nothing fits — false", async () => {
    const big = "x".repeat(1000);
    await keepBrokenCopy(K, big, 1);
    await keepBrokenCopy(K, big, 2);
    quota = used() + 200;
    expect(await keepBrokenCopy(K, big, 3)).toBe(true);
    expect(copies().map(([k]) => k)).toEqual([`octo.broken.${K}.2`, `octo.broken.${K}.3`]);
    storage.clear();
    quota = 10;
    expect(await keepBrokenCopy(K, big, 4)).toBe(false);
  });
});

describe("unit:persistKeep — the code-reviewer of #1189", () => {
  it("№1: the account is deleted while the copy is under way — neither the copy nor the old person's record lands", async () => {
    const h = await afterFailedRead();
    const gate = gateReads(K);
    h.out()[1]({ db: { items: ["new"] } });
    await settle();
    await wait(300);
    // the wipe: the device's keys go, the states forget
    storage.clear();
    forgetDeviceState(() => true);
    gate.open();
    await settle();
    await wait(400);
    expect([...storage.keys()]).toEqual([]);
    h.unmount();
    await wait(50);
    expect([...storage.keys()]).toEqual([]);
  }, 20_000);
  it("№1: a copy whose write ends after the wipe goes too", async () => {
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const store = await import("@react-native-async-storage/async-storage");
    const real = store.default.setItem;
    store.default.setItem = (async (k: string, v: string) => {
      if (k.startsWith("octo.broken.")) await slow;
      return real(k, v);
    }) as typeof real;
    try {
      const p = keepBrokenCopy(K, "old", 7);
      await wait(10);
      forgetDeviceState(() => true);
      release();
      expect(await p).toBe(false);
      expect(copies()).toEqual([]);
    } finally {
      store.default.setItem = real;
    }
  });
  it("№2: changes made during the copy are written in order, the last last — and a flush (the app leaves) does not lose them", async () => {
    const h = await afterFailedRead();
    const gate = gateReads(K);
    h.out()[1]({ db: { items: ["a"] } });
    await settle();
    h.out()[1]({ db: { items: ["b"] } });
    await settle();
    flushAllWriters();
    h.out()[1]({ db: { items: ["c"] } });
    await settle();
    await wait(300);
    expect(JSON.parse(storage.get(K)!).db.items).toEqual(["the person's own"]);
    gate.open();
    await settle();
    await wait(400);
    expect(JSON.parse(storage.get(K)!)).toEqual({ db: { items: ["c"] } });
    expect(copies().map(([, v]) => JSON.parse(v).db.items)).toEqual([["the person's own"]]);
    h.unmount();
  }, 20_000);
  it("№2: unmounted (a key change, the store fell back) during the copy: the last change still lands on its key", async () => {
    const h = await afterFailedRead();
    const gate = gateReads(K);
    h.out()[1]({ db: { items: ["last"] } });
    await settle();
    h.unmount();
    gate.open();
    await settle();
    await wait(100);
    expect(JSON.parse(storage.get(K)!)).toEqual({ db: { items: ["last"] } });
  }, 20_000);
  it(`№3: all caches' copies stay within ${BROKEN_MAX_CHARS} characters — the oldest go first and are noted; a larger one is not kept`, async () => {
    const third = "x".repeat(Math.floor(BROKEN_MAX_CHARS / 3));
    expect(await keepBrokenCopy("octo.cloud.v1.a", third, 1)).toBe(true);
    expect(await keepBrokenCopy("octo.cloud.v1.b", third, 2)).toBe(true);
    expect(await keepBrokenCopy(K, third, 3)).toBe(true);
    expect(await keepBrokenCopy(K, third, 4)).toBe(true);
    const all = [...storage.keys()].filter((k) => k.startsWith("octo.broken.")).sort();
    expect(all).toEqual(["octo.broken.octo.cloud.v1.b.2", `octo.broken.${K}.3`, `octo.broken.${K}.4`]);
    await wait(10);
    expect(logOf().map((x) => x.what)).toEqual([expect.stringMatching(/removed for room: octo\.broken\.octo\.cloud\.v1\.a\.1/)]);
    expect(await keepBrokenCopy(K, "x".repeat(BROKEN_MAX_CHARS + 1), 5)).toBe(false);
    await wait(10);
    expect(logOf().at(-1)!.what).toMatch(/too large/);
  });
  it("№4: the outbox's copies (strict, «Сохранить копию») are never cut or removed for a cache's copy", async () => {
    for (let i = 1; i <= 5; i++) expect(await keepBrokenCopy("octo.outbox.v1", `ops${i}`, i, { whole: true })).toBe(true);
    const half = "x".repeat(Math.floor(BROKEN_MAX_CHARS / 2) + 10);
    await keepBrokenCopy(K, half, 10);
    await keepBrokenCopy(K, half, 11);
    expect(copies("octo.outbox.v1").length).toBe(5);
    expect(copies().map(([k]) => k)).toEqual([`octo.broken.${K}.11`]);
  });
  it("№5: the record written over is found by the log: its copy's key is noted", async () => {
    const h = await afterFailedRead();
    h.out()[1]({ db: { items: ["new"] } });
    await settle();
    await wait(400);
    const [copy] = copies();
    expect(copy).toBeDefined();
    expect(logOf().map((x) => x.what)).toEqual([`written over after a failed read: the record before is kept at ${copy![0]}`]);
    h.unmount();
  }, 20_000);
  it("the read-path copy refused (the device full): started over, the record is not written over", async () => {
    storage.set(K, "{broken");
    quota = used();
    const root = render(Comp, {});
    await settle();
    await wait(100);
    await settle();
    expect((root.out as Out)[2]).toBe(true);
    await wait(300);
    expect(storage.get(K)).toBe("{broken");
    quota = null;
    await wait(10);
    expect(copies()).toEqual([]);
    root.unmount();
  });
  it("№8: a store record whose lists are of the wrong type opens (they are taken as missing), never crashes", () => {
    const d = { ...makeSeed(), visits: {} as never, jobs: "x" as never, expenses: 3 as never };
    for (const mode of ["demo", "cloud"] as const) {
      const n = normalizeDB(d, mode);
      expect(Array.isArray(n.visits) && Array.isArray(n.jobs) && Array.isArray(n.expenses)).toBe(true);
    }
  });
  it("№9: two notes at the same moment — both are in the log", async () => {
    await Promise.all([noteStorageLoss("a", "one"), noteStorageLoss("b", "two")]);
    expect(logOf().map((x) => x.key)).toEqual(["a", "b"]);
  });
});

describe("unit:persistKeep — the code-reviewer of #1189, 2nd round", () => {
  it("№1: after a restart the outbox's copy is still never removed for a cache's copy (the strict key is known from its hook)", async () => {
    // the outbox's copy, from an earlier start of the app
    storage.set("octo.broken.octo.outbox.v1.1", "x".repeat(Math.floor(BROKEN_MAX_CHARS / 2)));
    vi.resetModules();
    const fresh = await import("../src/data/persist");
    // the same mini React the fresh module renders with
    const mini = (await import("react")) as unknown as typeof import("./support/miniReact");
    const Out = () => fresh.usePersistentState<unknown[]>("octo.outbox.v1", [], { strict: true, immediate: true });
    const root = mini.render(Out, {});
    await mini.settle();
    // room for both (the outbox's copy counts — #1260 З2): the cache's copy lands, and the outbox's is not removed for it
    expect(await fresh.keepBrokenCopy("octo.cloud.v1.a", "o".repeat(Math.floor(BROKEN_MAX_CHARS * 0.3)), 4)).toBe(true);
    expect(await fresh.keepBrokenCopy(K, "y".repeat(Math.floor(BROKEN_MAX_CHARS * 0.4)), 5)).toBe(true);
    expect(storage.has("octo.broken.octo.cloud.v1.a.4")).toBe(false);
    expect(storage.has("octo.broken.octo.outbox.v1.1")).toBe(true);
    root.unmount();
  });
  it("№2: a copy that cannot be read counts as the whole limit (it goes for room first)", async () => {
    storage.set("octo.broken.octo.cloud.v1.a.1", "big");
    failing.set("octo.broken.octo.cloud.v1.a.1", 1);
    expect(await keepBrokenCopy(K, "new", 2)).toBe(true);
    expect(storage.has("octo.broken.octo.cloud.v1.a.1")).toBe(false);
    expect(copies().map(([, v]) => v)).toEqual(["new"]);
  });
  it("№4: this key's oldest copy goes only once the new one is on the device", async () => {
    // the 4th lands first, then the oldest of the key goes
    await keepBrokenCopy(K, "a", 1);
    await keepBrokenCopy(K, "b", 2);
    await keepBrokenCopy(K, "c", 3);
    expect(await keepBrokenCopy(K, "d", 4)).toBe(true);
    expect(copies().map(([, v]) => v).sort()).toEqual(["b", "c", "d"]);
  });
  it("№7: a failed read, then a read that works (the key back) — the first write makes no copy, no line in the log", async () => {
    storage.set(K, JSON.stringify({ db: { items: ["the person's own"] } }));
    failing.set(K, READ_TRIES);
    const Keyed = ({ k }: { k: string }) => usePersistentState<V>(k, { db: { items: ["fresh"] } }, { validate: (v) => Array.isArray(v?.db?.items) });
    const root = render(Keyed, { k: K });
    for (let i = 0; i < 40 && !(root.out as Out)[2]; i++) {
      await wait(200);
      await settle();
    }
    root.rerender({ k: "octo.other.v1" });
    await settle();
    await wait(50);
    root.rerender({ k: K });
    await settle();
    await wait(50);
    await settle();
    expect((root.out as Out)[0]).toEqual({ db: { items: ["the person's own"] } });
    (root.out as Out)[1]({ db: { items: ["the person's own", "more"] } });
    await settle();
    await wait(400);
    expect(JSON.parse(storage.get(K)!).db.items).toEqual(["the person's own", "more"]);
    expect(copies()).toEqual([]);
    expect(logOf()).toEqual([]);
    root.unmount();
  }, 20_000);
});

describe("unit:persistKeep — the security check of #1260", () => {
  it("З1: the account deleted while a copy is under way — no line in the storage log (it names the person's company and id)", async () => {
    const h = await afterFailedRead();
    const gate = gateReads(K);
    h.out()[1]({ db: { items: ["new"] } });
    await settle();
    await wait(300);
    storage.clear();
    forgetDeviceState(() => true);
    gate.open();
    await settle();
    await wait(400);
    expect(storage.has(STORAGE_LOG_KEY)).toBe(false);
    // a note made before the wipe and written after it: not written either
    const g0 = (await import("../src/data/persist")).deviceGeneration();
    forgetDeviceState(() => true);
    await noteStorageLoss("octo.cloud.v1.c1.u1", "late (test)", undefined, g0);
    expect(storage.has(STORAGE_LOG_KEY)).toBe(false);
    h.unmount();
  }, 20_000);
  it("З2: on the web all copies stay within 1 million characters, the outbox's copies counted — the sign-in token still fits", async () => {
    const w = globalThis as { window?: unknown };
    const had = "window" in w;
    w.window = { localStorage: {} };
    try {
      quota = 1_700_000;
      storage.set("octo.broken.octo.outbox.v1.1", "o".repeat(500_000));
      // the outbox's hook is known (its copies are kept whole)
      const Ob = () => usePersistentState<unknown[]>("octo.outbox.v1", [], { strict: true, immediate: true });
      const ob = render(Ob, {});
      await settle();
      expect(await keepBrokenCopy("octo.cloud.v1.a", "a".repeat(400_000), 2)).toBe(true);
      // the next copy: with the outbox's it would be over the web's limit — the older cache copy goes
      expect(await keepBrokenCopy(K, "k".repeat(400_000), 3)).toBe(true);
      const broken = [...storage.entries()].filter(([k]) => k.startsWith("octo.broken.")).reduce((n, [, v]) => n + v.length, 0);
      expect(broken).toBeLessThanOrEqual(BROKEN_MAX_CHARS_WEB);
      expect(storage.has("octo.broken.octo.outbox.v1.1")).toBe(true);
      // the sign-in (Supabase keeps its token in the same storage): written, and signing out removes it
      const store = (await import("@react-native-async-storage/async-storage")).default;
      await store.setItem("sb-test-auth-token", "t".repeat(300_000));
      expect(storage.has("sb-test-auth-token")).toBe(true);
      await store.multiRemove(["sb-test-auth-token"]);
      expect(storage.has("sb-test-auth-token")).toBe(false);
      // the outbox's copies alone leave no room for a cache's: not written
      storage.set("octo.broken.octo.outbox.v1.2", "o".repeat(450_000));
      expect(await keepBrokenCopy(K, "k".repeat(100_000), 4)).toBe(false);
      ob.unmount();
    } finally {
      if (!had) delete w.window;
    }
  });
});
