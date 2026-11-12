/**
 * unit:catalogCardStore — РС-10 (the director's review of #1236): an item's save in the store — the phone's own price /
 * markup row (with who; only for who sees costs; kept while the save is queued), the server-owned columns never in the
 * queue, changed-at / by on the phone; loadPriceHistory — only who sees costs, only that item's rows. Harness as
 * test/suppliersStore.test.ts.
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
const priceCalls: string[] = [];
let priceRows: unknown[] = [];
vi.mock("@/cloud/repo", async (orig) => ({
  ...(await orig<object>()),
  loadPriceHistory: async (_c: string, itemId: string) => (priceCalls.push(itemId), priceRows),
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

type Value = {
  db: DB;
  mode: string;
  saveSupplier: (x: Supplier) => () => void;
  setSupplierActive: (id: string, active: boolean) => () => void;
  applySupplierTax: (id: string) => () => void;
  saveCatalogItem: (it: CatalogItem) => () => void;
  saveCatalogItems: (items: CatalogItem[], opts?: { onlyNew?: boolean }) => () => void;
  loadPriceHistory: (itemId: string) => void;
};
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
const tick = async () => {
  await wait(1700); // the outbox tick
  await settle();
};
let root: Root<P> | null = null;

const SUP = "00000000-0000-4000-8000-0000000005a1";
const ITEM = "00000000-0000-4000-8000-0000000005b1";
function company(): DB {
  const db = makeSeed();
  const item: CatalogItem = { id: ITEM, kind: "material", name: "Bracket (test)", unit: "ea", priceCents: 0, costCents: 1000, vendorTaxBps: 0, markupBps: 1000, supplierId: SUP };
  return { ...db, me: "u1", suppliers: [{ id: SUP, name: "ABC Supply (test)", active: true }], costHistory: [], catalog: [item, ...db.catalog], costsVisible: true };
}
const supOf = (r: Root<P>) => (valueOf(r).db.suppliers ?? []).find((x) => x.id === SUP)!;
const itemOf = (r: Root<P>) => valueOf(r).db.catalog.find((x) => x.id === ITEM)!;

async function signedIn(over: Partial<DB> = {}, role = "owner"): Promise<Root<P>> {
  Object.assign(auth, { session: {}, userId: "u1", company: { companyId: "c1", role, companyName: "Co" } });
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  await settle();
  server.loads.splice(0).forEach((d) => d.resolve({ ...company(), ...over }));
  await settle();
  expect(valueOf(r).mode).toBe("cloud");
  return r;
}

beforeEach(() => {
  priceCalls.length = 0;
  priceRows = [];
  storage.clear();
  server.loads.length = 0;
  server.sends.length = 0;
  Object.assign(auth, { session: null, userId: null, company: null });
});
afterEach(() => {
  root?.unmount();
  root = null;
});

describe("unit:catalogCardStore — РС-10", () => {
  it("a price change: the phone's own row at once (who, local), changed-at / by on the phone, no server-owned columns in the queue", async () => {
    const r = await signedIn();
    valueOf(r).saveCatalogItem({ ...itemOf(r), priceCents: 1213, createdAt: "2026-11-01T00:00:00Z", createdBy: "u9" });
    await settle();
    expect(valueOf(r).db.priceHistory![0]).toMatchObject({ itemId: ITEM, priceCents: 1213, prevPriceCents: 0, by: "u1", local: true });
    expect(itemOf(r)).toMatchObject({ updatedBy: "u1" });
    expect(typeof itemOf(r).updatedAt).toBe("string");
    await tick();
    const op = server.sends.find((x) => x.op.k === "catalog.save")!.op as unknown as { item: Record<string, unknown> };
    expect(["createdAt", "createdBy", "updatedAt", "updatedBy"].filter((k) => k in op.item)).toEqual([]);
  });
  it("who does not see costs gets no price row; loadPriceHistory does not ask the server for them", async () => {
    const r = await signedIn({ costsVisible: false });
    valueOf(r).saveCatalogItem({ ...itemOf(r), priceCents: 1213 });
    valueOf(r).loadPriceHistory(ITEM);
    await settle();
    expect(valueOf(r).db.priceHistory ?? []).toEqual([]);
    expect(priceCalls).toEqual([]);
  });
  it("the server's rows replace only that item's; the phone's own row stays while its save is in the queue", async () => {
    const r = await signedIn();
    // another item's card was opened: its rows
    priceRows = [{ id: "other", itemId: "i-other", priceCents: 5, source: "manual", at: "2026-11-01" }];
    valueOf(r).loadPriceHistory("i-other");
    await settle();
    priceCalls.length = 0;
    valueOf(r).saveCatalogItem({ ...itemOf(r), priceCents: 1213 });
    await settle();
    priceRows = [{ id: "s1", itemId: ITEM, priceCents: 900, prevPriceCents: 800, source: "manual", at: "2026-11-02" }];
    // the save is still in the queue (not sent yet / not answered)
    valueOf(r).loadPriceHistory(ITEM);
    await settle();
    const ids = (valueOf(r).db.priceHistory ?? []).map((h) => h.id);
    expect(priceCalls).toEqual([ITEM]);
    expect(ids).toContain("s1");
    expect(ids).toContain("other");
    expect((valueOf(r).db.priceHistory ?? []).some((h) => h.local && h.itemId === ITEM)).toBe(true);
    // the save reaches the server: the next read gives the server's rows only
    await tick();
    server.sends.forEach((x) => x.d.resolve());
    await settle();
    await tick();
    valueOf(r).loadPriceHistory(ITEM);
    await settle();
    expect((valueOf(r).db.priceHistory ?? []).some((h) => h.local && h.itemId === ITEM)).toBe(false);
  });
  it("a batch save of items already there shows their price rows too; a batch of new ones (onlyNew) — none", async () => {
    const r = await signedIn();
    valueOf(r).saveCatalogItems([{ ...itemOf(r), priceCents: 777 }]);
    await settle();
    expect(valueOf(r).db.priceHistory![0]).toMatchObject({ itemId: ITEM, priceCents: 777, local: true });
    valueOf(r).saveCatalogItems([{ ...itemOf(r), id: "00000000-0000-4000-8000-0000000005b9", priceCents: 1 }], { onlyNew: true });
    await settle();
    expect((valueOf(r).db.priceHistory ?? []).filter((h) => h.itemId === "00000000-0000-4000-8000-0000000005b9")).toEqual([]);
  });
});
