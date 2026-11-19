/**
 * unit:gutterPriceGroupEstimateStore — #1913 PR3, С16 (spec 33-gutters-price-key §6а, §7; story-map §4 S5g): the transition «Одна цена на все
 * цвета» through the store writes only the catalog — a saved estimate of an old measurement is the same, line for line, until «Обновить смету».
 * Harness as test/gutterPriceGroupStore.test.ts (offline: nothing is sent).
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
vi.mock("@/cloud/client", () => ({
  supabase: {
    from: () => { throw new Error("no direct table write"); },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));
const auth = { ready: true, session: null as object | null, company: null as object | null, userId: null as string | null, accessDenied: undefined, membershipStamp: undefined };
vi.mock("@/cloud/auth", () => ({ useAuth: () => auth }));
const loads: ((v: unknown) => void)[] = [];
const sends: unknown[] = [];
vi.mock("@/cloud/repo", async (orig) => ({
  ...(await orig<object>()),
  loadCompanyDB: () => new Promise((r) => loads.push(r)),
  loadCompanyModule: () => new Promise(() => {}),
}));
vi.mock("@/cloud/ops", async (orig) => ({
  ...(await orig<object>()),
  applyOp: (op: unknown) => (sends.push(op), new Promise<void>(() => {})),
  renewSession: async () => {},
  sendVisitPoint: () => new Promise<string>(() => {}),
}));
vi.mock("@/cloud/outboxTiming", () => ({ SEND_AFTER_MS: 0, readyToSend: () => true }));
vi.mock("@/data/appActive", () => ({ onAppActive: () => () => {}, onAppLeave: () => () => {} }));

import { render, settle, type Root } from "./support/miniReact";
import { StoreProvider } from "../src/data/store";
import { makeSeed } from "../src/data/seed";
import type { CatalogItem, DB, Estimate } from "../src/data/types";
import type { PartQty } from "@octo/estimating-engine";
import { transitionGroups, transitionWrites } from "../src/modules/gutters/prices/groups";
import { linesFromParts } from "../src/modules/gutters/estimate";

type Value = { db: DB; setOnline: (v: boolean) => number; saveCatalogItem: (it: CatalogItem) => () => void };
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
let root: Root<P> | null = null;
beforeEach(() => {
  storage.clear();
  loads.length = 0;
  sends.length = 0;
  Object.assign(auth, { session: {}, userId: "u1", company: { companyId: "c1", role: "owner", companyName: "Co" } });
});
afterEach(() => {
  root?.unmount();
  root = null;
});

const coloured = (id: string, color: string, o: Partial<CatalogItem> = {}): CatalogItem => ({
  id, kind: "material", name: `Gutter ${color} (test)`, unit: "ft", priceCents: 800, costCents: 400, vendorTaxBps: 0, markupBps: 10000, supplierSku: `SKU-${id}`,
  attributes: { part: "gutter", profile: "k", size: "5", material: "aluminum", gauge: ".027", color }, ...o,
});
const part = (color: string): PartQty =>
  ({ key: "gutter", section: "gutter", qty: "100", unit: "ft", use: "estimate", kind: "material", attrs: { profile: "k", size: "5", material: "aluminum", gauge: ".027", color } }) as unknown as PartQty;

describe("unit:gutterPriceGroupEstimateStore — the transition writes only the catalog (#1913 PR3)", () => {
  it("С16: сохранённая смета старого замера в сторе — те же строки, цены и сумма после «Сделать одну цену», пока нет «Обновить смету»", async () => {
    const cat = [coloured("w", "white", { updatedAt: "2026-11-12T00:00:00Z" }), coloured("b", "brown", { priceCents: 900, costCents: 450 })];
    let n = 0;
    const lines = linesFromParts([part("white"), part("brown")], cat, (p) => `Gutter ${p.attrs.color}`, () => `ln${++n}`, "rev1", "m1");
    const seed = makeSeed();
    const est = { ...(seed.estimates[0] as Estimate), id: "e-470", status: "sent", doc: { ...((seed.estimates[0] as Estimate).doc ?? {}), options: [{ id: "o1", name: "A", lines }] } } as Estimate;
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    loads.splice(0).forEach((d) => d({ ...seed, catalog: [...cat, ...seed.catalog], estimates: [est, ...seed.estimates], costsVisible: true }));
    await settle();
    const v = () => valueOf(r);
    const before = JSON.stringify(v().db.estimates.find((e) => e.id === "e-470"));
    expect(before).toBeTruthy();
    const optLines = () => v().db.estimates.find((e) => e.id === "e-470")!.doc!.options[0]!.lines;
    expect(optLines().map((l) => l.unitPriceCents).sort()).toEqual([800, 900]);

    v().setOnline(false);
    await settle();
    const g = transitionGroups(v().db.catalog.filter((c) => c.id === "w" || c.id === "b"))[0]!;
    transitionWrites(g, g.options.findIndex((o) => o.priceCents === 800), true).forEach((it) => v().saveCatalogItem(it));
    await settle();

    // the catalog moved: both colours $8, one group
    const byId = (id: string) => v().db.catalog.find((c) => c.id === id)!;
    expect([byId("w").priceCents, byId("b").priceCents]).toEqual([800, 800]);
    expect(byId("w").attributes?.priceGroup).toBe(g.key);
    // the saved estimate did not: the same object, line for line ($1,700.00)
    expect(JSON.stringify(v().db.estimates.find((e) => e.id === "e-470"))).toBe(before);
    expect(optLines().reduce((s, l) => s + Number(l.quantity) * l.unitPriceCents, 0)).toBe(170000);
    expect(optLines()).toHaveLength(2);
    // and nothing in the outbox touches an estimate
    expect(sends).toHaveLength(0);
  });
});
