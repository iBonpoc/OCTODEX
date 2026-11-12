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
/** the device's room in characters (the web's localStorage ~5 MB); null — no limit */
let quota: number | null = null;
const used = () => [...storage.entries()].reduce((s, [k, v]) => s + k.length + v.length, 0);
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => {
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
    multiRemove: async (ks: string[]) => ks.forEach((k) => storage.delete(k)),
  },
}));
import { render, settle } from "./support/miniReact";
import { BROKEN_KEEP, READ_TRIES, STORAGE_LOG_KEY, keepBrokenCopy, usePersistentState } from "../src/data/persist";

type V = { db: { items: string[] } };
const K = "octo.db.v5";
const copies = (k = K) => [...storage.entries()].filter(([x]) => x.startsWith(`octo.broken.${k}.`));
const Comp = () => usePersistentState<V>(K, { db: { items: ["fresh"] } }, { validate: (v) => Array.isArray(v?.db?.items) });
type Out = ReturnType<typeof usePersistentState<V>>;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  storage.clear();
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
  it("a full device (the web's localStorage): the older copies of the key make room; nothing fits — false", async () => {
    const big = "x".repeat(1000);
    await keepBrokenCopy(K, big, 1);
    await keepBrokenCopy(K, big, 2);
    quota = used() + 200;
    expect(await keepBrokenCopy(K, big, 3)).toBe(true);
    expect(copies().map(([k]) => k)).toEqual([`octo.broken.${K}.3`]);
    quota = used() + 10;
    storage.clear();
    quota = 10;
    expect(await keepBrokenCopy(K, big, 4)).toBe(false);
  });
});
