/**
 * unit:seeCostsStore — #1837: the store asks one rule (features/access.ts seeCosts). An owner whose phone does not know
 * yet whether they see our costs (an old cache, before the first load in the cloud) is treated as «no»: a price counted
 * from a cost is not written on a guess; after the load says «yes» — seen and written as always. (Harness as
 * test/groupPriceStore.test.ts.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcCalls: { kind: "rpc" | "from"; name: string; args?: unknown }[] = [];
const rpcError = { next: null as null | { message: string; code?: string; hint?: string } };
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
vi.mock("@/cloud/client", () => ({
  supabase: {
    from: (t: string) => { rpcCalls.push({ kind: "from", name: t }); throw new Error("no direct table write"); },
    rpc: (name: string, args: unknown) => { rpcCalls.push({ kind: "rpc", name, args }); return Promise.resolve({ data: null, error: rpcError.next }); },
  },
}));
const auth = { ready: true, session: null as object | null, company: null as object | null, userId: null as string | null, accessDenied: undefined as undefined | (() => void), membershipStamp: undefined as number | undefined };
vi.mock("@/cloud/auth", () => ({ useAuth: () => auth }));
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
};
const server = {
  loads: [] as Deferred<unknown>[],
  sends: [] as { op: unknown; companyId: string; userId: string; d: Deferred<void> }[],
  points: [] as Deferred<string>[],
  renewed: 0,
  /** one module's row read again after a settings conflict (review #374 №1) */
  moduleReads: [] as { key: string; d: Deferred<unknown> }[],
};
vi.mock("@/cloud/repo", async (orig) => ({
  ...(await orig<object>()),
  loadCompanyDB: () => {
    const d = deferred<unknown>();
    server.loads.push(d);
    return d.promise;
  },
  loadCompanyModule: (_c: string, key: string) => {
    const d = deferred<unknown>();
    server.moduleReads.push({ key, d });
    return d.promise;
  },
}));
vi.mock("@/cloud/ops", async (orig) => ({
  ...(await orig<object>()),
  applyOp: (op: unknown, companyId: string, userId: string) => {
    const d = deferred<void>();
    server.sends.push({ op, companyId, userId, d });
    return d.promise;
  },
  renewSession: async () => void (server.renewed += 1),
  sendVisitPoint: () => {
    const d = deferred<string>();
    server.points.push(d);
    return d.promise;
  },
}));
// the «Отменить» window is not what these tests are about: an op is ready at once
vi.mock("@/cloud/outboxTiming", () => ({ SEND_AFTER_MS: 0, readyToSend: () => true }));
// the pause after a network failure is tested in test/outboxRetry.test.ts: here the next try may go at once
const retry = { pause: 0 };
/** the server's «no»: a permission code (a try) */
const refusal = () => Object.assign(new Error("new row violates row-level security policy"), { name: "PermanentError", status: 403, code: "42501" });
/** the server's «not now» */
const notNow = (status: number, code = "") => Object.assign(new Error(`status ${status}`), { name: "ServerError", status, code });
// the phone's «back in the app» (react-native's AppState does not load in node)
const appActive = { cb: null as null | (() => void) };
vi.mock("@/data/appActive", () => ({ onAppActive: (cb: () => void) => ((appActive.cb = cb), () => (appActive.cb = null)), onAppLeave: () => () => {} }));
vi.mock("@/data/outboxRetry", async (orig) => ({ ...(await orig<object>()), backoffMs: () => retry.pause }));
// a wipe that comes while an update of the outbox is still queued (not applied yet): fired from inside adoptLegacy
const midAdopt = { fire: null as null | (() => void) };
vi.mock("@/data/outboxOwner", async (orig) => {
  const real = await orig<typeof import("../src/data/outboxOwner")>();
  return {
    ...real,
    adoptLegacy: (items: Parameters<typeof real.adoptLegacy>[0], who: Parameters<typeof real.adoptLegacy>[1]) => {
      const out = real.adoptLegacy(items, who);
      const f = midAdopt.fire;
      midAdopt.fire = null;
      f?.();
      return out;
    },
  };
});

import { render, settle, type Root } from "./support/miniReact";
import { StoreProvider } from "../src/data/store";
import { makeSeed } from "../src/data/seed";
import type { CatalogItem, DB } from "../src/data/types";

type Value = {
  db: DB;
  setOnline: (v: boolean) => number;
  saveCatalogItem: (it: CatalogItem) => () => void;
  saveGroupPrice: (itemId: string, v: { priceCents: number; placeholder?: boolean; costCents?: number; vendorTaxBps?: number; markupBps?: number }) => () => void;
  rejectedOps: { labelKey?: string; kind?: string; href?: string; groupPrice?: { group: string; mineCents: number } }[];
};
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
const signIn = (userId: string, companyId: string, role = "owner") => Object.assign(auth, { session: {}, userId, company: { companyId, role, companyName: "Co" } });
const signOut = () => Object.assign(auth, { session: null, userId: null, company: null, accessDenied: undefined, membershipStamp: undefined });
let root: Root<P> | null = null;
beforeEach(() => {
  storage.clear();
  rpcError.next = null;
  server.loads.length = 0;
  server.sends.length = 0;
  rpcCalls.length = 0;
  signOut();
});
afterEach(() => {
  root?.unmount();
  root = null;
});

const G = "gutters:v1:0123456789abcdef";
const mat = (id: string, color: string, o: Partial<CatalogItem> = {}): CatalogItem => ({
  id, kind: "material", name: `Gutter ${color} (test)`, unit: "ft", priceCents: 800, costCents: 400, vendorTaxBps: 0, markupBps: 10000,
  attributes: { part: "gutter", color, priceGroup: G }, ...o,
});
type GP = { k: string; costs?: Record<string, unknown>; itemId?: string; group?: string; priceCents?: number; expectedPriceCents?: number; costCents?: number | null; expectedCostCents?: number | null; item?: CatalogItem; fields?: string[] };
async function start(over: Partial<DB> = {}, role = "owner"): Promise<{ v: () => Value }> {
  signIn("u1", "c1", role);
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  await settle();
  const seed = makeSeed();
  server.loads.splice(0).forEach((d) => d.resolve({ ...seed, catalog: [mat("w", "white"), mat("b", "brown"), mat("x", "black", { attributes: { part: "gutter", color: "black" } }), ...seed.catalog], costsVisible: true, ...over }));
  await settle();
  return { v: () => valueOf(r) };
}
const sentOps = (k: string) => server.sends.map((x) => x.op as GP).filter((x) => x.k === k);

describe("unit:seeCostsStore — #1837", () => {
  it("before the load says who sees costs: a counted price is kept, not sent; after «yes» it is the owner's again", async () => {
    signIn("u1", "c1", "owner");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    const seed = makeSeed();
    const counted = mat("m", "white", { priceFromCost: true, attributes: { part: "gutter" } });
    // a load that does not say it (as an old cache does): the field is not there
    const { costsVisible: _cv, ...noFlag } = { ...seed, catalog: [counted, ...seed.catalog] } as DB;
    server.loads.splice(0).forEach((d) => d.resolve(noFlag));
    await settle();
    const v = () => valueOf(r);
    expect(v().db.costsVisible).toBeUndefined();
    v().saveCatalogItem({ ...v().db.catalog.find((c) => c.id === "m")!, priceCents: 999, name: "Renamed (test)" });
    await settle();
    const it1 = v().db.catalog.find((c) => c.id === "m")!;
    expect(it1.priceCents).toBe(800);
    expect(it1.name).toBe("Renamed (test)");
    // the server's «yes»: the next save is the owner's, as always
    v().setOnline(false);
    await settle();
    v().setOnline(true);
    await settle();
    // the rename went without the price (the server keeps the counted one)
    const sent = server.sends.map((x) => x.op as { k: string; item?: CatalogItem }).find((x) => x.k === "catalog.save");
    expect(sent?.item?.priceCents).toBe(800);
    for (const s of server.sends) s.d.resolve();
    await settle();
    void (v() as unknown as { refresh: () => Promise<void> }).refresh();
    await settle();
    server.loads.splice(0).forEach((d) => d.resolve({ ...noFlag, costsVisible: true }));
    await settle();
    expect(v().db.costsVisible).toBe(true);
    v().saveCatalogItem({ ...v().db.catalog.find((c) => c.id === "m")!, priceCents: 999 });
    await settle();
    expect(v().db.catalog.find((c) => c.id === "m")!.priceCents).toBe(999);
  });
});
