/**
 * unit:suppliersStore — spec 36 SUP1: the supplier mutations of the store. Locally at once (offline); in the cloud one
 * supplier.save per change; archive with «Отменить» (rule 5); only owner/admin/office; «Применить налог к N позициям»;
 * an item's save carries its supplier link and the phone's own history row. Harness as test/checklistStore.test.ts.
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

type Value = {
  db: DB;
  mode: string;
  saveSupplier: (x: Supplier) => () => void;
  setSupplierActive: (id: string, active: boolean) => () => void;
  applySupplierTax: (id: string) => () => void;
  saveCatalogItem: (it: CatalogItem) => () => void;
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
  storage.clear();
  server.loads.length = 0;
  server.sends.length = 0;
  Object.assign(auth, { session: null, userId: null, company: null });
});
afterEach(() => {
  root?.unmount();
  root = null;
});

describe("unit:suppliersStore — spec 36 SUP1", () => {
  it("a new supplier: on the phone at once, one supplier.save to the server", async () => {
    const r = await signedIn();
    valueOf(r).saveSupplier({ id: "00000000-0000-4000-8000-0000000005a2", name: "  Zed Lumber  ", phone: "555", active: true });
    await settle();
    expect(valueOf(r).db.suppliers!.find((x) => x.name === "Zed Lumber")).toBeTruthy();
    await tick();
    expect(server.sends.map((s) => s.op.k)).toEqual(["supplier.save"]);
    expect(server.sends[0]!.op).toMatchObject({ supplier: { name: "Zed Lumber", phone: "555" } });
  });
  it("no name — nothing; a server without the table — nothing", async () => {
    const r = await signedIn();
    valueOf(r).saveSupplier({ id: "x", name: " ", active: true });
    await tick();
    expect(server.sends).toEqual([]);
    root?.unmount();
    const r2 = await signedIn({ suppliersLegacy: true });
    valueOf(r2).saveSupplier({ id: "y", name: "Y", active: true });
    await tick();
    expect(server.sends).toEqual([]);
  });
  it("sales and the tech do not write suppliers", async () => {
    for (const role of ["sales", "tech"]) {
      const r = await signedIn({}, role);
      valueOf(r).saveSupplier({ id: SUP, name: "Changed", active: true });
      valueOf(r).setSupplierActive(SUP, false);
      await tick();
      expect(supOf(r).name, role).toBe("ABC Supply (test)");
      expect(server.sends, role).toEqual([]);
      root?.unmount();
      root = null;
    }
  });
  it("archive and «Отменить»: the reverse op follows, the supplier is active again", async () => {
    const r = await signedIn();
    const undo = valueOf(r).setSupplierActive(SUP, false);
    await settle();
    expect(supOf(r).active).toBe(false);
    undo();
    await settle();
    expect(supOf(r).active).toBe(true);
    await tick();
    server.sends.forEach((x) => x.d.resolve());
    await tick();
    const sent = server.sends.map((s) => (s.op as unknown as { supplier: Supplier }).supplier.active);
    expect(sent[sent.length - 1]).toBe(true);
  }, 15000);
  it("«Применить налог к N позициям»: the items count with the supplier's tax, a history row each; «Отменить» puts them back", async () => {
    const r = await signedIn();
    valueOf(r).saveSupplier({ id: SUP, name: "ABC Supply (test)", taxBps: 1025, active: true });
    await settle();
    const undo = valueOf(r).applySupplierTax(SUP);
    await settle();
    expect(itemOf(r).vendorTaxBps).toBe(1025);
    expect(valueOf(r).db.costHistory![0]).toMatchObject({ itemId: ITEM, vendorTaxBps: 1025, supplierId: SUP });
    undo();
    await settle();
    expect(itemOf(r).vendorTaxBps).toBe(0);
  });
  it("an item's save: the link goes with it, the phone keeps a history row of the new cost", async () => {
    const r = await signedIn();
    valueOf(r).saveCatalogItem({ ...itemOf(r), costCents: 1100, supplierSku: " A-1 " });
    await settle();
    expect(itemOf(r).supplierSku).toBe("A-1");
    expect(valueOf(r).db.costHistory![0]).toMatchObject({ itemId: ITEM, costCents: 1100, supplierId: SUP });
    await tick();
    expect(server.sends[0]!.op).toMatchObject({ k: "catalog.save", item: { supplierId: SUP, supplierSku: "A-1" }, costs: { costCents: 1100 } });
  });
  it("who does not see costs gets no history row", async () => {
    const r = await signedIn({ costsVisible: false }, "sales");
    valueOf(r).saveCatalogItem({ ...itemOf(r), name: "Renamed (test)" });
    await settle();
    expect(valueOf(r).db.costHistory).toEqual([]);
  });
});
