/**
 * unit:demoKeepStore — #1189 п.1: a demo record of an older version without a list (no `expenses`, no `visits`) opens as
 * it is — the missing lists empty — never replaced by a fresh demo (the person's own records were lost so). Red before.
 * Harness as test/suppliersStore.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => import("./support/miniReact"));
vi.mock("react/jsx-runtime", () => import("./support/miniReact"));
vi.mock("react/jsx-dev-runtime", () => import("./support/miniReact"));
vi.mock("expo-crypto", () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
    getAllKeys: async () => [...storage.keys()],
    multiRemove: async (ks: string[]) => ks.forEach((k) => storage.delete(k)),
    removeItem: async (k: string) => void storage.delete(k),
  },
}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
const auth = { ready: true, session: null as object | null, company: null as object | null, userId: null as string | null };
vi.mock("@/cloud/auth", () => ({ useAuth: () => auth }));
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((a) => (resolve = a));
  return { promise, resolve };
};
const server = { loads: [] as Deferred<unknown>[], sends: [] as { op: { k: string } & Record<string, unknown>; d: Deferred<void> }[] };
vi.mock("@/cloud/repo", async (orig) => ({
  ...(await orig<object>()),
  loadCompanyDB: () => {
    const d = deferred<unknown>();
    server.loads.push(d);
    return d.promise;
  },
}));
vi.mock("@/cloud/ops", async (orig) => ({
  ...(await orig<object>()),
  applyOp: (op: { k: string }) => {
    const d = deferred<void>();
    server.sends.push({ op: op as { k: string } & Record<string, unknown>, d });
    return d.promise;
  },
  renewSession: async () => {},
  sendVisitPoint: () => new Promise(() => {}),
}));
vi.mock("@/cloud/outboxTiming", () => ({ SEND_AFTER_MS: 0, readyToSend: () => true }));
vi.mock("@/data/appActive", () => ({ onAppActive: () => () => {}, onAppLeave: () => () => {} }));
vi.mock("@/data/outboxRetry", async (orig) => ({ ...(await orig<object>()), backoffMs: () => 0 }));

import { render, settle, type Root } from "./support/miniReact";
import { StoreProvider } from "../src/data/store";
import { makeSeed } from "../src/data/seed";
import type { CatalogItem, DB, Supplier } from "../src/data/types";

type Value = { db: DB; mode: string };
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
let root: Root<P> | null = null;

beforeEach(() => {
  storage.clear();
  server.loads.length = 0;
  Object.assign(auth, { session: null, userId: null, company: null });
});
afterEach(() => {
  root?.unmount();
  root = null;
});

describe("unit:demoKeepStore — #1189", () => {
  for (const gone of ["expenses", "visits"] as const) {
    it(`a demo record without «${gone}»: the person's own client stays, the list is empty`, async () => {
      const seed = makeSeed();
      const db = { ...seed, customers: [...seed.customers, { ...seed.customers[0]!, id: "c-mine", name: "My own client (test)" }] } as Record<string, unknown>;
      delete db[gone];
      storage.set("octo.db.v5", JSON.stringify({ day: "2026-11-01", db }));
      const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
      for (let i = 0; i < 40 && !(r.out && valueOf(r).db.customers.some((c) => c.id === "c-mine")); i++) {
        await settle();
        await new Promise((res) => setTimeout(res, 20));
      }
      expect(valueOf(r).mode).toBe("demo");
      expect(valueOf(r).db.customers.some((c) => c.id === "c-mine")).toBe(true);
      expect(valueOf(r).db[gone]).toEqual(gone === "visits" ? expect.any(Array) : []);
    });
  }
});
