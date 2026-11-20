/**
 * unit:itemVariantStore — #2227 review #2241 №3 and limits: setItemVariant only for who sees suppliers (owner / admin / office, as the
 * server's catalog_set_variant), never a write the server refuses (app.variant_skus_ok); the last value gone keeps the property.
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
import type { CatalogItem, DB, ItemVariant } from "../src/data/types";

type Value = { db: DB; mode: string; setItemVariant: (id: string, attr: string, value: string, d: ItemVariant | null) => () => void };
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
const tick = async () => {
  await new Promise((res) => setTimeout(res, 1700)); // the outbox tick
  await settle();
};
let root: Root<P> | null = null;
const ITEM = "00000000-0000-4000-8000-0000000007b1";
function company(): DB {
  const db = makeSeed();
  const item: CatalogItem = { id: ITEM, kind: "material", name: "Gutter (test)", unit: "ft", priceCents: 800, attributes: { part: "gutter" }, variants: { color: { white: { sku: "W-1" } } } };
  return { ...db, me: "u1", catalog: [item, ...db.catalog], costsVisible: true };
}
const itemOf = (r: Root<P>) => valueOf(r).db.catalog.find((x) => x.id === ITEM)!;
async function signedIn(role = "owner"): Promise<Root<P>> {
  Object.assign(auth, { session: {}, userId: "u1", company: { companyId: "c1", role, companyName: "Co" } });
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  await settle();
  server.loads.splice(0).forEach((d) => d.resolve(company()));
  await settle();
  expect(valueOf(r).mode).toBe("cloud");
  return r;
}
beforeEach(() => {
  storage.clear();
  server.loads.length = 0;
  server.sends.length = 0;
  Object.assign(auth, { session: null, userId: null, company: null });
});
afterEach(() => {
  root?.unmount();
  root = null;
});

describe("unit:itemVariantStore — #2227", () => {
  it("owner: a new value at once, one catalog.variant; the last value gone keeps the property ({color:{}})", async () => {
    const r = await signedIn();
    valueOf(r).setItemVariant(ITEM, "color", " Brown ", { sku: " B-1 " });
    await settle();
    expect(itemOf(r).variants).toEqual({ color: { white: { sku: "W-1" }, brown: { sku: "B-1" } } });
    valueOf(r).setItemVariant(ITEM, "color", "white", null);
    valueOf(r).setItemVariant(ITEM, "color", "brown", null);
    await settle();
    expect(itemOf(r).variants).toEqual({ color: {} });
    // the queue sends one at a time: each answered, the next goes
    for (let i = 0; i < 3; i++) {
      await tick();
      server.sends[i]?.d.resolve();
    }
    expect(server.sends.map((s) => [s.op.k, s.op.value, s.op.data])).toEqual([["catalog.variant", "brown", { sku: "B-1" }], ["catalog.variant", "white", null], ["catalog.variant", "brown", null]]);
  }, 20_000);
  it("sales and tech: nothing (the server allows owner / admin / office only)", async () => {
    for (const role of ["sales", "tech"]) {
      const r = await signedIn(role);
      valueOf(r).setItemVariant(ITEM, "color", "brown", { sku: "B-1" });
      await tick();
      expect(itemOf(r).variants).toEqual({ color: { white: { sku: "W-1" } } });
      expect(server.sends).toEqual([]);
      root?.unmount();
      root = null;
    }
  }, 20_000);
  it("what the server refuses never goes into the queue: a long code, a bad pack, another property", async () => {
    const r = await signedIn();
    valueOf(r).setItemVariant(ITEM, "color", "brown", { sku: "S".repeat(61) });
    valueOf(r).setItemVariant(ITEM, "color", "brown", { packSize: "-1" });
    valueOf(r).setItemVariant(ITEM, "size", "5", { sku: "X" });
    valueOf(r).setItemVariant(ITEM, "color", "x".repeat(121), null);
    await tick();
    expect(itemOf(r).variants).toEqual({ color: { white: { sku: "W-1" } } });
    expect(server.sends).toEqual([]);
  });
});
