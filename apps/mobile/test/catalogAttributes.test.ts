/**
 * C3 (docs/specs/33-gutters-module.md П16; core K1): properties of a price-list item, its purchase unit and pack size —
 * read from catalog_items, written by catalog.save only when set (an old server or an item without them is never written
 * to), several items at once with one «Отменить», and the core's matching by properties (a hint for a module).
 * Store harness — as in test/pushPrefs.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcCalls: { kind: "rpc" | "from"; name: string; args?: unknown }[] = [];
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
    from: (t: string) => ({ upsert: (row: unknown, opts: unknown) => { rpcCalls.push({ kind: "from", name: t, args: { row, opts } }); return Promise.resolve({ error: null }); } }),
    rpc: (name: string, args: unknown) => { rpcCalls.push({ kind: "rpc", name, args }); return Promise.resolve({ data: null, error: null }); },
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
};
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
import { catalogExtrasFromRow } from "../src/cloud/repo";
import { attributesLine, catalogMatch } from "../src/features/catalogMatch";
import { madeOnQueue } from "../src/data/outboxDeps";
import type { CatalogItem } from "../src/data/types";

type Value = {
  db: { catalog: CatalogItem[] };
  queue: unknown[];
  mode: string;
  setOnline: (v: boolean) => number;
  saveCatalogItems: (items: CatalogItem[], opts?: { onlyNew?: boolean }) => () => void;
  saveCatalogItem: (it: CatalogItem) => () => void;
};
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
const signIn = (userId: string, companyId: string) => Object.assign(auth, { session: {}, userId, company: { companyId, role: "owner", companyName: "Co" } });
const signOut = () => Object.assign(auth, { session: null, userId: null, company: null });
let root: Root<P> | null = null;
beforeEach(() => {
  storage.clear();
  server.loads.length = 0;
  server.sends.length = 0;
  rpcCalls.length = 0;
  signOut();
});
afterEach(() => {
  root?.unmount();
  root = null;
});


const it0 = (p: Partial<CatalogItem>): CatalogItem => ({ id: "i0", kind: "material", name: "Item", unit: "ft", priceCents: 100, placeholder: true, ...p });

describe("unit:catalogAttributes — read", () => {
  it("properties, a purchase unit and a pack size come from the row; empty or broken ones are left out", () => {
    expect(catalogExtrasFromRow({ attributes: { profile: "k", gutterSize: "6", bad: 6, empty: "" }, purchase_unit: "coil", pack_size: "1.500" })).toEqual({
      attributes: { profile: "k", gutterSize: "6" },
      purchaseUnit: "coil",
      packSize: "1.5",
    });
    expect(catalogExtrasFromRow({ attributes: {}, purchase_unit: null, pack_size: null })).toEqual({});
    expect(catalogExtrasFromRow({})).toEqual({}); // before the migration
    expect(catalogExtrasFromRow({ attributes: ["k"], purchase_unit: "  ", pack_size: 0 })).toEqual({});
  });
});

describe("unit:catalogAttributes — write (catalog.save)", () => {
  it("an item without them never writes the new columns (works before the migration, rule 16)", async () => {
    const { applyOp } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    await applyOp({ k: "catalog.save", item: it0({}) }, "co-1", "u-1");
    const row = (rpcCalls.at(-1)!.args as { row: Record<string, unknown> }).row;
    expect(row).not.toHaveProperty("attributes");
    expect(row).not.toHaveProperty("purchase_unit");
    expect(row).not.toHaveProperty("pack_size");
  });
  it("set ones are written; a blank purchase unit or pack size is cleared (null)", async () => {
    const { applyOp } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    await applyOp({ k: "catalog.save", item: it0({ attributes: { profile: "k" }, purchaseUnit: " coil ", packSize: "1.5" }) }, "co-1", "u-1");
    expect((rpcCalls.at(-1)!.args as { row: object }).row).toMatchObject({ attributes: { profile: "k" }, purchase_unit: "coil", pack_size: "1.5" });
    await applyOp({ k: "catalog.save", item: it0({ attributes: {}, purchaseUnit: " ", packSize: "" }) }, "co-1", "u-1");
    expect((rpcCalls.at(-1)!.args as { row: object }).row).toMatchObject({ attributes: {}, purchase_unit: null, pack_size: null });
  });
});

describe("unit:catalogAttributes — onlyNew: a module's items with a fixed id, never twice (spec 33 П22.10, T96)", () => {
  it("the op inserts or does nothing (ON CONFLICT DO NOTHING); a plain save stays an upsert that overwrites", async () => {
    const { applyOp } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    await applyOp({ k: "catalog.save", item: it0({}), onlyNew: true }, "co-1", "u-1");
    expect((rpcCalls.at(-1)!.args as { opts: object }).opts).toEqual({ onConflict: "id", ignoreDuplicates: true });
    await applyOp({ k: "catalog.save", item: it0({}) }, "co-1", "u-1");
    expect((rpcCalls.at(-1)!.args as { opts: object }).opts).toEqual({ onConflict: "id" });
  });
  it("cloud: an id on the phone already is left as it is — no op, its price stays; the new ones go with onlyNew; «Отменить» takes them out", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads.splice(0).forEach((d) => d.resolve({ ...makeSeed(), catalog: [it0({ id: "m1", priceCents: 777, placeholder: false, name: "Mine" })] }));
    await settle();
    const before = valueOf(r).db.catalog;
    valueOf(r).setOnline(false);
    await settle();
    const undo = valueOf(r).saveCatalogItems([it0({ id: "m1", priceCents: 100 }), it0({ id: "m2" })], { onlyNew: true });
    await settle();
    expect(valueOf(r).db.catalog.find((x) => x.id === "m1")).toMatchObject({ priceCents: 777, placeholder: false, name: "Mine" });
    expect(valueOf(r).db.catalog.filter((x) => x.id === "m2")).toHaveLength(1);
    expect(valueOf(r).queue).toHaveLength(1); // m2 only
    undo();
    await settle();
    expect(valueOf(r).queue).toHaveLength(0);
    expect(valueOf(r).db.catalog.map((x) => x.id).sort()).toEqual(before.map((x) => x.id).sort());
    // made again and sent: the op says onlyNew
    valueOf(r).saveCatalogItems([it0({ id: "m3" })], { onlyNew: true });
    await settle();
    valueOf(r).setOnline(true);
    await settle();
    const sent = server.sends.map((x) => x.op as { k: string; item: { id: string }; onlyNew?: boolean }).filter((o) => o.k === "catalog.save");
    expect(sent.map((o) => [o.item.id, o.onlyNew])).toEqual([["m3", true]]);
  });
  it("cloud: pressed twice before sync — the second press makes nothing", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads.splice(0).forEach((d) => d.resolve(makeSeed()));
    await settle();
    valueOf(r).setOnline(false);
    await settle();
    valueOf(r).saveCatalogItems([it0({ id: "s1" }), it0({ id: "s2" })], { onlyNew: true });
    await settle();
    valueOf(r).saveCatalogItems([it0({ id: "s1" }), it0({ id: "s2" })], { onlyNew: true });
    await settle();
    expect(valueOf(r).queue).toHaveLength(2);
    expect(valueOf(r).db.catalog.filter((x) => x.id === "s1" || x.id === "s2")).toHaveLength(2);
  });
});

describe("unit:catalogAttributes — several items with one «Отменить» (K1)", () => {
  it("demo: all appear at once; «Отменить» takes them all back, the catalog is as before", async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    const before = valueOf(r).db.catalog;
    const items = [it0({ id: "n1", name: "Test A", attributes: { part: "a" } }), it0({ id: "n2", name: "Test B", attributes: { part: "b" } })];
    expect(items.every((x) => x.placeholder)).toBe(true); // prices from code are test prices (rule 9)
    const undo = valueOf(r).saveCatalogItems(items);
    await settle();
    expect(valueOf(r).db.catalog.filter((x) => x.id === "n1" || x.id === "n2").map((x) => x.attributes)).toEqual([{ part: "a" }, { part: "b" }]);
    undo();
    await settle();
    expect(valueOf(r).db.catalog).toEqual(before);
  });
  it("cloud: each item is its own catalog.save in the queue; «Отменить» takes all of them out", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads.splice(0).forEach((d) => d.resolve(makeSeed()));
    await settle();
    const undo = valueOf(r).saveCatalogItems([it0({ id: "n1" }), it0({ id: "n2" }), it0({ id: "n3" })]);
    await settle();
    expect(valueOf(r).queue).toHaveLength(3);
    undo();
    await settle();
    expect(valueOf(r).queue).toHaveLength(0);
  });
});

describe("unit:catalogAttributes — matching by properties (a hint, П14.2 e3)", () => {
  const cat = [
    it0({ id: "a", name: "B 6in white", attributes: { profile: "k", size: "6", color: "White", gauge: ".032" } }),
    it0({ id: "b", name: "A 6in white", attributes: { profile: "k", size: "6", color: "white" } }),
    it0({ id: "c", name: "5in white", attributes: { profile: "k", size: "5", color: "white" } }),
    it0({ id: "d", name: "no properties" }),
  ];
  it("every wanted property, case and spaces ignored; the closest first, then by name", () => {
    expect(catalogMatch(cat, { profile: "k", size: "6", color: " WHITE " }).map((x) => x.id)).toEqual(["b", "a"]);
    expect(catalogMatch(cat, { size: "6", gauge: ".032" }).map((x) => x.id)).toEqual(["a"]);
    expect(catalogMatch(cat, { size: "7" })).toEqual([]);
  });
  it("nothing wanted → nothing (never «any item»)", () => {
    expect(catalogMatch(cat, {})).toEqual([]);
  });
  it("the screen shows the values only, in a stable order (the names are the module's codes)", () => {
    expect(attributesLine({ size: "6", color: "white", profile: "k" })).toBe("white · k · 6");
    expect(attributesLine(undefined)).toBe("");
  });
});

import { cleanAttributes, cleanCatalogItem, cleanPackSize, cleanPurchaseUnit } from "../src/features/catalogExtras";

describe("unit:catalogAttributes — the server's rules in the app (security check C3 №3, №5)", () => {
  it("a bad property is left out, the good ones stay (never the whole save refused)", () => {
    expect(
      cleanAttributes({
        size: "6", gutterSize: "6", "gutter-size": "6", "1st": "x", empty: "", blank: "  ", nl: "\n", long: "a".repeat(121), ok120: "é".repeat(120),
        ctl: "red\u001b[31m", bidi: "abc‮def", num: 6 as unknown as string,
      }),
    ).toEqual({ size: "6", gutterSize: "6", ok120: "é".repeat(120) });
  });
  it("the whole map at most 4000 bytes: the last ones are dropped until it fits", () => {
    const big = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`k${i}`, "v".repeat(100)]));
    const out = cleanAttributes(big);
    expect(new TextEncoder().encode(JSON.stringify(out)).length).toBeLessThanOrEqual(4000);
    expect(Object.keys(out).length).toBeGreaterThan(30);
    expect(out.k0).toBe("v".repeat(100));
  });
  it("purchase unit: trimmed, 1..20, no control characters; \"\" clears; a bad one is not sent", () => {
    expect(cleanPurchaseUnit("  box\t")).toBe("box");
    expect(cleanPurchaseUnit("")).toBe("");
    expect(cleanPurchaseUnit("   ")).toBe("");
    expect(cleanPurchaseUnit("u".repeat(21))).toBeUndefined();
    expect(cleanPurchaseUnit("b\nox")).toBeUndefined();
  });
  it("pack size: a positive number, 3 decimals; \"1,5\", 0 and what rounds to 0 are not sent", () => {
    expect(cleanPackSize("2.6")).toBe("2.6");
    expect(cleanPackSize(" 10 ")).toBe("10");
    expect(cleanPackSize("1.23456")).toBe("1.235");
    expect(cleanPackSize("")).toBe("");
    expect(cleanPackSize("1,5")).toBeUndefined();
    expect(cleanPackSize("0")).toBeUndefined();
    expect(cleanPackSize("0.0001")).toBeUndefined();
    expect(cleanPackSize("-2")).toBeUndefined();
  });
  it("the item: what is not valid is not sent, the rest (name, price) is", () => {
    const out = cleanCatalogItem(it0({ name: "Kept", attributes: { size: "6", "bad key": "x" }, purchaseUnit: "u".repeat(30), packSize: "1,5" }));
    expect(out).toMatchObject({ name: "Kept", priceCents: 100, attributes: { size: "6" } });
    expect(out).not.toHaveProperty("purchaseUnit");
    expect(out).not.toHaveProperty("packSize");
    expect(cleanCatalogItem(it0({}))).toEqual(it0({}));
  });
  it("the store saves the cleaned item (the queue never carries what the server refuses)", async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    valueOf(r).saveCatalogItems([it0({ id: "n9", attributes: { size: "6", "bad key": "x" }, packSize: "0" })]);
    await settle();
    const saved = valueOf(r).db.catalog.find((x) => x.id === "n9")!;
    expect(saved.attributes).toEqual({ size: "6" });
    expect(saved).not.toHaveProperty("packSize");
  });
  it("matching never finds a property on the object's prototype (constructor, toString)", () => {
    expect(catalogMatch([it0({ id: "a", attributes: { size: "6" } })], { constructor: "x" })).toEqual([]);
    expect(catalogMatch([it0({ id: "a", attributes: { size: "6" } })], { toString: "x", size: "6" })).toEqual([]);
  });
});
