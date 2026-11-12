/**
 * unit:undoOwnStore — #1193 п.6: «Отменить» of one action in the store takes back only that action — another action
 * after it (a voided invoice) and the server's fresh copy stay. Red before the fix (mutate put the whole snapshot back).
 * Harness as test/suppliersStore.test.ts. Test data.
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
import type { CatalogItem, DB, EstimateDoc, Supplier } from "../src/data/types";
import { DEFAULT_SETTINGS } from "../src/features/estimateDoc";

type Value = {
  db: DB;
  mode: string;
  saveSupplier: (x: Supplier) => () => void;
  setSupplierActive: (id: string, active: boolean) => () => void;
  applySupplierTax: (id: string) => () => void;
  saveCatalogItem: (it: CatalogItem) => () => void;
  voidInvoice: (id: string, reason: string) => string | null;
  refresh: () => Promise<void>;
  saveEstimate: (e: { id: string; customerId: string; propertyId: string; title: string; doc: EstimateDoc }) => () => boolean;
  recordPayment: (invoiceId: string, amountCents: number, method: string) => () => boolean;
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

describe("unit:undoOwnStore — #1193 п.6", () => {
  it("change an item → void an invoice → «Отменить» the item: the item goes back, the invoice stays void", async () => {
    const r = await signedIn();
    const undo = valueOf(r).saveCatalogItem({ ...itemOf(r), name: "Bracket renamed (test)" });
    await settle();
    expect(valueOf(r).voidInvoice("i2", "Wrong amount (test)")).toBeNull();
    await settle();
    const voided = (x: Root<P>) => !valueOf(x).db.invoices.some((i) => i.id === "i2") && (valueOf(x).db.voidInvoices ?? []).some((i) => i.id === "i2");
    expect(voided(r)).toBe(true);
    undo();
    await settle();
    expect(itemOf(r).name).toBe("Bracket (test)");
    expect(voided(r)).toBe(true);
  });
  it("change an item → the server's fresh copy (another phone added a client) → «Отменить»: the client stays", async () => {
    const r = await signedIn();
    const undo = valueOf(r).saveCatalogItem({ ...itemOf(r), name: "Bracket renamed (test)" });
    await tick();
    server.sends.splice(0).forEach((x) => x.d.resolve());
    await settle();
    const p = valueOf(r).refresh();
    await settle();
    const fresh = company();
    server.loads.splice(0).forEach((d) => d.resolve({ ...fresh, catalog: fresh.catalog.map((x) => (x.id === ITEM ? { ...x, name: "Bracket renamed (test)" } : x)),
      customers: [...fresh.customers, { ...fresh.customers[0]!, id: "c-from-other-phone", name: "From another phone (test)" }] }));
    await p;
    await settle();
    expect(valueOf(r).db.customers.some((c) => c.id === "c-from-other-phone")).toBe(true);
    undo();
    await settle();
    expect(valueOf(r).db.customers.some((c) => c.id === "c-from-other-phone")).toBe(true);
  });
  it("a new estimate saved → the store normalizes it again on render → «Отменить»: the estimate is gone, and its op (the director's Б1)", async () => {
    const r = await signedIn();
    const c = valueOf(r).db.customers[0]!;
    const prop = valueOf(r).db.properties.find((p) => p.customerId === c.id)!;
    const doc = { options: [{ id: "o1", name: "Good", lines: [{ id: "l1", name: "Work", group: "labor", quantity: "1", unit: "ea", unitPriceCents: 10000 }] }], settings: DEFAULT_SETTINGS } as unknown as EstimateDoc;
    const undo = valueOf(r).saveEstimate({ id: "00000000-0000-4000-8000-00000000e0e1", customerId: c.id, propertyId: prop.id, title: "Undo me (test)", doc });
    await settle();
    expect(valueOf(r).db.estimates.some((e) => e.id === "00000000-0000-4000-8000-00000000e0e1")).toBe(true);
    expect(undo()).toBe(true);
    await settle();
    expect(valueOf(r).db.estimates.some((e) => e.id === "00000000-0000-4000-8000-00000000e0e1")).toBe(false);
    await tick();
    expect(server.sends.filter((x) => x.op.k === "estimate.save")).toEqual([]);
    // a second «Отменить» of the same action: nothing more
    expect(undo()).toBe(false);
  });
  it("two payments → «Отменить» the first: nothing is taken back (the paid amount was changed by the second), both go to the server (Б2)", async () => {
    const r = await signedIn();
    const before = valueOf(r).db.invoices.find((i) => i.id === "i1")!;
    const undoA = valueOf(r).recordPayment("i1", 100, "cash");
    await settle();
    valueOf(r).recordPayment("i1", before.totalCents - 100, "check");
    await settle();
    const paidBefore = valueOf(r).db.invoices.find((i) => i.id === "i1") ?? null;
    const paymentsBefore = valueOf(r).db.payments.length;
    expect(undoA()).toBe(false);
    await settle();
    expect(valueOf(r).db.invoices.find((i) => i.id === "i1") ?? null).toEqual(paidBefore);
    expect(valueOf(r).db.payments.length).toBe(paymentsBefore);
    // the queue sends one at a time: the first answered, then the second
    await tick();
    server.sends.forEach((x) => x.d.resolve());
    await settle();
    await tick();
    expect(server.sends.filter((x) => x.op.k === "payment.record").length).toBe(2);
  });
});
