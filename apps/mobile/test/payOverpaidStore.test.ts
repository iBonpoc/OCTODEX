/**
 * unit:payOverpaidStore — #1995 (rule 8): what «Принять оплату» and the deposit book. The behaviour did not change (acceptPayment already
 * clamped the amount), so these two fix the RESULT; the refactor itself — no `total − paid` by hand in the store — is held by
 * test/invoiceOwesGuard.test.ts (red before). Harness as test/demoKeepStore.test.ts.
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
import type { DB, ID, PaymentMethod } from "../src/data/types";

type Value = { db: DB; mode: string; payInvoice: (id: ID, method: PaymentMethod) => unknown; payDeposit: (id: ID, method: PaymentMethod, fromClient?: boolean) => unknown };
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

const open = async (mutate: (db: DB) => DB) => {
  const db = mutate(makeSeed());
  storage.set("octo.db.v5", JSON.stringify({ day: "2026-11-01", db }));
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  for (let i = 0; i < 40 && !(r.out && valueOf(r).db.invoices.length); i++) {
    await settle();
    await new Promise((res) => setTimeout(res, 20));
  }
  return r;
};

describe("unit:payOverpaidStore — #1995", () => {
  it("С1. ДАНО счёт с переплатой (оплачено больше итога). КОГДА «Принять оплату». ТОГДА платёж не пишется, оплачено не меняется", async () => {
    const r = await open((d) => ({ ...d, invoices: d.invoices.map((i) => (i.id === "i1" ? { ...i, paidCents: i.totalCents + 5000 } : i)) }));
    const before = valueOf(r).db;
    valueOf(r).payInvoice("i1", "cash");
    await settle();
    const after = valueOf(r).db;
    expect(after.payments.length).toBe(before.payments.length);
    expect(after.invoices.find((i) => i.id === "i1")!.paidCents).toBe(before.invoices.find((i) => i.id === "i1")!.paidCents);
  });
  it("С2. ДАНО счёт 1 840, оплачено 600. КОГДА «Принять оплату». ТОГДА записан платёж ровно на остаток 1 240, счёт оплачен", async () => {
    const r = await open((d) => ({ ...d, invoices: d.invoices.map((i) => (i.id === "i1" ? { ...i, paidCents: 60000 } : i)) }));
    const before = valueOf(r).db;
    const n = before.payments.length;
    valueOf(r).payInvoice("i1", "cash");
    await settle();
    const after = valueOf(r).db;
    expect(after.payments.length).toBe(n + 1);
    expect(after.payments.find((x) => x.invoiceId === "i1" && !before.payments.some((y) => y.id === x.id))!.amountCents).toBe(124000);
    expect(after.invoices.find((i) => i.id === "i1")!.paidCents).toBe(184000);
  });
  it("С3. ДАНО депозитный счёт 342, оплачено 100 (смета e5, работа j1). КОГДА «Принять депозит». ТОГДА платёж ровно на остаток 242", async () => {
    const r = await open((d) => ({ ...d, invoices: d.invoices.map((i) => (i.id === "i5" ? { ...i, paidCents: 10000 } : i)) }));
    const before = valueOf(r).db;
    valueOf(r).payDeposit("e5", "cash");
    await settle();
    const after = valueOf(r).db;
    const paid = after.payments.filter((x) => x.invoiceId === "i5" && !before.payments.some((y) => y.id === x.id));
    expect(paid.map((x) => x.amountCents)).toEqual([24200]);
    expect(after.invoices.find((i) => i.id === "i5")!.paidCents).toBe(34200);
  });
});
