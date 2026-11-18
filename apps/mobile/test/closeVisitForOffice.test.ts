/**
 * #2018 С2: sales (no right to take the payment) close a signed visit with money due — no payment, no invoice is written
 * on the phone or sent; the op is the visit's step «done», as a visit with nothing to pay. Harness as undoOwnStore.
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
import { visitStatus } from "../src/features/visitStatus";
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

describe("unit:closeVisitForOffice — #2018 С2", () => {
  const setup = (): Partial<DB> => {
    const db = company();
    const v = db.visits.find((x) => x.jobId)!;
    const visits = db.visits.map((x) => (x.id === v.id ? { ...x, step: "signed" as const } : x));
    const jobs = db.jobs.map((j) => (j.id === v.jobId ? { ...j, amountCents: 50000 } : j));
    const invoices = db.invoices.filter((i) => i.jobId !== v.jobId);
    return { visits, jobs, invoices };
  };
  it("closes the visit: step done, no payment and no invoice on the phone; the op sent is visit.step done", async () => {
    const r = await signedIn(setup(), "sales");
    const v0 = valueOf(r).db.visits.find((x) => x.step === "signed")!;
    const pays = valueOf(r).db.payments.length;
    const invs = valueOf(r).db.invoices.length;
    call(r, "closeVisitForOffice", v0.id);
    await settle();
    const v1 = valueOf(r).db.visits.find((x) => x.id === v0.id)!;
    expect(v1.step).toBe("paid"); // as the server's «completed» with no payment loads
    expect(visitStatus(v1, valueOf(r).db.members).label).toBe("st.done"); // «Готово», not «Оплачено»
    expect(v1.payment).toBeUndefined();
    expect(valueOf(r).db.payments.length).toBe(pays);
    expect(valueOf(r).db.invoices.length).toBe(invs);
    await tick();
    const sent = server.sends.map((x) => x.op);
    expect(sent.some((o) => o.k === "visit.step" && o.visitId === v0.id && o.to === "done")).toBe(true);
    expect(sent.some((o) => o.k === "visit.pay" || o.k === "payment.record" || o.k === "invoice.issue")).toBe(false);
  });
  it("only a signed visit: another step is left as it is", async () => {
    const r = await signedIn(setup(), "sales");
    const other = valueOf(r).db.visits.find((x) => x.step !== "signed" && x.step !== "done" && x.step !== "paid")!;
    call(r, "closeVisitForOffice", other.id);
    await settle();
    expect(valueOf(r).db.visits.find((x) => x.id === other.id)!.step).toBe(other.step);
  });
});
