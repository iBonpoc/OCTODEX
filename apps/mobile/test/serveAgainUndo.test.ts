/**
 * #2098: «Снова обслуживать» → «Отменить» is the store's own undo. While the lift waits in the queue it goes back with the
 * mark and its reason (nothing is sent); once the op is sent — «too late»: the phone does not put the mark back on its
 * own (the server has the client active; a local mark would disagree with it). Harness as test/undoOwnStore.test.ts.
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
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
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
import type { CatalogItem, DB, EstimateDoc, EstimateTemplate, Supplier } from "../src/data/types";
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
  [k: string]: unknown;
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

/** the demo: no session — the seed company on the phone */
async function demo(): Promise<Root<P>> {
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  await settle();
  expect(valueOf(r).mode).toBe("demo");
  return r;
}
type Fn = (...a: unknown[]) => unknown;
const call = (r: Root<P>, name: string, ...a: unknown[]) => (valueOf(r)[name] as Fn)(...a);
/** what an action returns → its «Отменить» */
const undoOf = (x: unknown): (() => unknown) => (typeof x === "function" ? (x as () => unknown) : (x as { undo: () => unknown }).undo);

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

const marked = (): Partial<DB> => {
  const db = company();
  return { customers: db.customers.map((c) => (c.id === "c3" ? { ...c, status: "do_not_service" as const, statusReason: "Did not pay (test)" } : c)) };
};
const c3 = (r: Root<P>) => valueOf(r).db.customers.find((c) => c.id === "c3")!;

describe("unit:serveAgainUndo — #2098", () => {
  it("lifted, the op still waits → «Отменить»: the mark and its reason are back, nothing is sent", async () => {
    const r = await signedIn(marked());
    const undo = undoOf(call(r, "setCustomerStatus", "c3", "active"));
    await settle();
    expect(c3(r).status).toBe("active");
    expect(undo()).toBe(true);
    await settle();
    expect(c3(r).status).toBe("do_not_service");
    expect(c3(r).statusReason).toBe("Did not pay (test)");
    await tick();
    expect(server.sends.filter((x) => x.op.k === "customer.status")).toHaveLength(0);
  });
  it("lifted, the op already sent → «Отменить» is too late: false, the client stays active on the phone (as on the server)", async () => {
    const r = await signedIn(marked());
    const undo = undoOf(call(r, "setCustomerStatus", "c3", "active"));
    await tick();
    const sent = server.sends.filter((x) => x.op.k === "customer.status");
    expect(sent).toHaveLength(1);
    expect(undo()).toBe(false);
    await settle();
    expect(c3(r).status).toBe("active");
    sent[0]!.d.resolve();
    await tick();
    expect(undo()).toBe(false);
    expect(c3(r).status).toBe("active");
    expect(server.sends.filter((x) => x.op.k === "customer.status")).toHaveLength(1);
  });
});
