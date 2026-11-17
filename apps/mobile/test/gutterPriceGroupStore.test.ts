/**
 * unit:gutterPriceGroupStore — #1913 PR3: the transition «Одна цена на все цвета» through the store, offline (harness as test/groupPriceStore.test.ts,
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

import { transitionGroups, transitionWrites } from "../src/modules/gutters/prices/groups";

const coloured = (id: string, color: string, o: Partial<CatalogItem> = {}): CatalogItem => ({
  id, kind: "material", name: `Gutter ${color} (test)`, unit: "ft", priceCents: 800, costCents: 400, vendorTaxBps: 0, markupBps: 10000, supplierSku: `SKU-${id}`,
  attributes: { part: "gutter", profile: "k", size: "5", color }, ...o,
});
type Sent = { k: string; item?: CatalogItem; fields?: string[] };
async function start(cat: CatalogItem[]): Promise<{ v: () => Value }> {
  signIn("u1", "c1", "owner");
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  await settle();
  const seed = makeSeed();
  server.loads.splice(0).forEach((d) => d.resolve({ ...seed, catalog: [...cat, ...seed.catalog], costsVisible: true }));
  await settle();
  return { v: () => valueOf(r) };
}
/** what the price screen does on «Сделать одну цену»: the source first, then the others; one undo for all (the screen's toast) */
const transition = (v: () => Value, choice?: number) => {
  const g = transitionGroups(v().db.catalog.filter((c) => c.id === "w" || c.id === "b"))[0]!;
  const undos = transitionWrites(g, choice ?? g.suggested, true).map((it) => v().saveCatalogItem(it));
  return { g, undo: () => [...undos].reverse().forEach((u) => u()) };
};
const ops = () => server.sends.map((x) => x.op as Sent);
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    server.sends.forEach((s) => s.d.resolve());
    await settle();
  }
};

describe("unit:gutterPriceGroupStore — the transition offline (#1913 PR3, director 17.11)", () => {
  it("offline: all of it on the phone at once, nothing sent; back online — item saves by fields, no group write (no 40001 loop)", async () => {
    const { v } = await start([coloured("w", "white", { updatedAt: "2026-11-12T00:00:00Z" }), coloured("b", "brown", { priceCents: 900, costCents: 450 })]);
    v().setOnline(false);
    await settle();
    const { g } = transition(v);
    await settle();
    const byId = (id: string) => v().db.catalog.find((c) => c.id === id)!;
    expect([byId("w").priceCents, byId("b").priceCents]).toEqual([800, 800]);
    expect([byId("w").attributes?.priceGroup, byId("b").attributes?.priceGroup]).toEqual([g.key, g.key]);
    expect(byId("b").supplierSku).toBe("SKU-b");
    expect(server.sends).toHaveLength(0);
    v().setOnline(true);
    await settle();
    await flush();
    expect(ops().filter((o) => o.k === "catalog.groupPrice")).toEqual([]);
    const saves = ops().filter((o) => o.k === "catalog.save");
    expect(saves.map((o) => o.item?.id)).toEqual(["w", "b"]);
    // by fields: the group key and the price — never the supplier's code or the pack (a fresher server row keeps them)
    for (const o of saves) expect(o.fields ?? []).not.toContain("supplier_sku");
  });

  it("offline, «Отменить»: every item back as it was (price, no group); back online nothing of the group stays", async () => {
    const { v } = await start([coloured("w", "white", { updatedAt: "2026-11-12T00:00:00Z" }), coloured("b", "brown", { priceCents: 900, costCents: 450 })]);
    v().setOnline(false);
    await settle();
    const { undo } = transition(v);
    await settle();
    undo();
    await settle();
    const byId = (id: string) => v().db.catalog.find((c) => c.id === id)!;
    expect([byId("w").priceCents, byId("b").priceCents]).toEqual([800, 900]);
    expect([byId("w").attributes?.priceGroup, byId("b").attributes?.priceGroup]).toEqual([undefined, undefined]);
    expect(byId("b").costCents).toBe(450);
    v().setOnline(true);
    await settle();
    await flush();
    expect(ops().filter((o) => o.k === "catalog.groupPrice")).toEqual([]);
    // whatever went, the last word of each item is the item as it was
    const last = (id: string) => [...ops()].reverse().find((o) => o.k === "catalog.save" && o.item?.id === id)?.item;
    for (const id of ["w", "b"]) {
      const l = last(id);
      if (l) expect([l.priceCents, l.attributes?.priceGroup]).toEqual([byId(id).priceCents, undefined]);
    }
  });
});
