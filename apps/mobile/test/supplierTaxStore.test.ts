/**
 * unit:supplierTaxStore — #1834 (spec 54 §13): «Сохранить» ставку поставщика — его позиции с себестоимостью следуют сразу (как на
 * сервере в той же транзакции), позиции других поставщиков и без себестоимости не меняются. Harness as test/demoKeepStore.test.ts.
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
import type { DB } from "../src/data/types";

type Value = { db: DB; mode: string; setSupplierTax: (id: string, taxBps: number | undefined) => unknown };
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

const open = async () => {
  storage.set("octo.db.v5", JSON.stringify({ day: "2026-11-01", db: makeSeed() }));
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  for (let i = 0; i < 40 && !(r.out && valueOf(r).db.suppliers?.length); i++) {
    await settle();
    await new Promise((res) => setTimeout(res, 20));
  }
  return r;
};

describe("unit:supplierTaxStore — #1834", () => {
  it("С1. ДАНО поставщик и его материалы с себестоимостью. КОГДА ставка меняется. ТОГДА у них новая ставка, у чужих и без себестоимости — прежняя", async () => {
    const r = await open();
    const before = valueOf(r).db;
    const sup = before.suppliers!.find((s) => before.catalog.some((c) => c.supplierId === s.id && c.costCents !== undefined))!;
    const other = before.catalog.filter((c) => c.supplierId !== sup.id);
    const newRate = (sup.taxBps ?? 0) === 900 ? 950 : 900;
    valueOf(r).setSupplierTax(sup.id, newRate);
    await settle();
    const after = valueOf(r).db;
    expect(after.suppliers!.find((s) => s.id === sup.id)!.taxBps).toBe(newRate);
    const mine = after.catalog.filter((c) => c.supplierId === sup.id);
    expect(mine.length).toBeGreaterThan(0);
    for (const c of mine) expect(c.costCents === undefined ? c.vendorTaxBps === before.catalog.find((x) => x.id === c.id)!.vendorTaxBps : c.vendorTaxBps === newRate).toBe(true);
    for (const c of other) expect(after.catalog.find((x) => x.id === c.id)!.vendorTaxBps).toBe(c.vendorTaxBps);
  });
  it("С1. ДАНО та же ставка. КОГДА «сохранить». ТОГДА ничего не меняется", async () => {
    const r = await open();
    const before = valueOf(r).db;
    const sup = before.suppliers!.find((s) => s.taxBps !== undefined)!;
    valueOf(r).setSupplierTax(sup.id, sup.taxBps);
    await settle();
    expect(valueOf(r).db.catalog).toEqual(before.catalog);
  });
});
