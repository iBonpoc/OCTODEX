/**
 * unit:groupPriceStore — #1913 PR2: the store routes a price group's price through catalog.groupPrice (harness as
 * test/estimateTemplateStore.test.ts).
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
const auth = { ready: true, session: null as object | null, company: null as object | null, userId: null as string | null };
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
const signOut = () => Object.assign(auth, { session: null, userId: null, company: null });
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
type GP = { k: string; itemId?: string; group?: string; priceCents?: number; expectedPriceCents?: number; costCents?: number | null; expectedCostCents?: number | null; item?: CatalogItem; fields?: string[] };
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

describe("unit:groupPriceStore — #1913 PR2 (spec 33-gutters-price-key §4.6)", () => {
  it("a price change of a group item: the whole group on the phone, one catalog.groupPrice against what the phone saw; the rest of the item goes without the price", async () => {
    const { v } = await start();
    v().setOnline(false);
    await settle();
    v().saveCatalogItem({ ...v().db.catalog.find((c) => c.id === "w")!, name: "Gutter white 2 (test)", priceCents: 1000, costCents: 500 });
    await settle();
    const byId = (id: string) => v().db.catalog.find((c) => c.id === id)!;
    expect([byId("w").priceCents, byId("b").priceCents, byId("x").priceCents]).toEqual([1000, 1000, 800]);
    expect([byId("w").costCents, byId("b").costCents]).toEqual([500, 500]);
    expect(byId("w").name).toBe("Gutter white 2 (test)");
    v().setOnline(true);
    await settle();
    const save = sentOps("catalog.save")[0];
    expect(save?.item?.priceCents).toBe(800);
    expect(save?.fields ?? []).not.toContain("unit_price_cents");
    server.sends.find((x) => (x.op as GP).k === "catalog.save")?.d.resolve();
    await settle();
    const gp = sentOps("catalog.groupPrice")[0];
    expect(gp).toMatchObject({ itemId: "w", group: G, priceCents: 1000, expectedPriceCents: 800, costCents: 500, expectedCostCents: 400 });
  });

  it("an item outside a group, or a group item's rename: catalog.save as before, no group write", async () => {
    const { v } = await start();
    v().saveCatalogItem({ ...v().db.catalog.find((c) => c.id === "x")!, priceCents: 900 });
    v().saveCatalogItem({ ...v().db.catalog.find((c) => c.id === "w")!, name: "Renamed (test)" });
    await settle();
    for (const s of server.sends) s.d.resolve();
    await settle();
    for (const s of server.sends) s.d.resolve();
    await settle();
    expect(sentOps("catalog.groupPrice")).toEqual([]);
    expect(v().db.catalog.find((c) => c.id === "b")!.priceCents).toBe(800);
  });

  it("two price writes offline are one: the last price, the first expected", async () => {
    const { v } = await start();
    v().setOnline(false);
    await settle();
    v().saveGroupPrice("w", { priceCents: 900, costCents: 450 });
    v().saveGroupPrice("b", { priceCents: 1000, costCents: 500 });
    await settle();
    v().setOnline(true);
    await settle();
    const gp = sentOps("catalog.groupPrice");
    expect(gp).toHaveLength(1);
    expect(gp[0]).toMatchObject({ priceCents: 1000, costCents: 500, expectedPriceCents: 800, expectedCostCents: 400 });
  });

  it("sales without our costs: a group counted from its cost is not theirs to price — nothing changes, nothing is sent", async () => {
    const counted = (c: CatalogItem) => ({ ...c, costCents: undefined, vendorTaxBps: undefined, markupBps: undefined, priceFromCost: true });
    const seedCat = [mat("w", "white"), mat("b", "brown")].map(counted);
    const { v } = await start({ costsVisible: false, catalog: seedCat }, "sales");
    v().saveGroupPrice("w", { priceCents: 1500 });
    await settle();
    expect(v().db.catalog.find((c) => c.id === "b")!.priceCents).toBe(800);
    expect(sentOps("catalog.groupPrice")).toEqual([]);
  });

  it("the server says «changed first»: this write and the later ones of the group go, one card with the price meant, the truth is read", async () => {
    const { v } = await start();
    v().setOnline(false);
    await settle();
    v().saveGroupPrice("w", { priceCents: 900 });
    await settle();
    v().setOnline(true);
    await settle();
    // a later write while the first is on its way: it waits behind it
    v().saveGroupPrice("b", { priceCents: 1100 });
    await settle();
    const loads = server.loads.length;
    const { PermanentError } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    server.sends.find((x) => (x.op as GP).k === "catalog.groupPrice")!.d.reject(new PermanentError("the group's price changed meanwhile", 409, "40001", "row_version_conflict"));
    await settle();
    expect(sentOps("catalog.groupPrice")).toHaveLength(1);
    const cards = v().rejectedOps.filter((c) => c.kind === "catalog.groupPrice");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ labelKey: "price.group.rejConflict", href: "/catalog/b", groupPrice: { group: G, mineCents: 1100 } });
    expect(server.loads.length).toBeGreaterThan(loads);
  });
});
