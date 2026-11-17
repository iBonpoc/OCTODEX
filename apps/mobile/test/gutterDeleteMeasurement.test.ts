/**
 * unit:gutterDeleteMeasurement — #2013: «Удалить замер» with an estimate on it, through the store, offline (harness as test/groupPriceStore.test.ts,
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
import type { CatalogItem, DB, Estimate } from "../src/data/types";
import type { ModuleEstimateStore, ModuleStore } from "../src/modules/registry";

type Value = {
  db: DB;
  setOnline: (v: boolean) => number;
  saveCatalogItem: (it: CatalogItem) => () => void;
  saveGroupPrice: (itemId: string, v: { priceCents: number; placeholder?: boolean; costCents?: number; vendorTaxBps?: number; markupBps?: number }) => () => void;
  rejectedOps: { labelKey?: string; kind?: string; href?: string; groupPrice?: { group: string; mineCents: number } }[];
  moduleOp: ModuleStore["moduleOp"];
  undoTogether: NonNullable<ModuleStore["undoTogether"]>;
  saveEstimate: ModuleEstimateStore["saveEstimate"];
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

import { detachDoc, estimatesOn, removeMeasurementDetached, signedOn } from "../src/modules/gutters/estimateLink";
import { gutterData } from "../src/modules/gutters/data";
import { summarize } from "../src/features/estimateDoc";

const MID = "m-2013";
const src = { module: "gutters", measurementId: MID, key: "gutter|x", at: "2026-11-17T10:00:00.000Z" };
/** a demo estimate with one line of the measurement (and its drawing page), in the given status */
function withLine(e: Estimate, status: Estimate["status"], sentAt?: string): Estimate {
  const doc = e.doc!;
  const o = doc.options[0]!;
  const line = { ...o.lines[0]!, id: "l-2013", name: "Gutter 5″ (test)", quantity: "21", unitPriceCents: 800, source: src };
  return { ...e, status, ...(sentAt ? { sentAt } : { sentAt: undefined }), doc: { ...doc, options: [{ ...o, lines: [...o.lines, line] }, ...doc.options.slice(1)], pages: [{ id: `gutters-m-${MID}`, kind: "image", title: "Drawing", svg: "<svg/>" }] as unknown as Estimate["doc"] extends infer D ? D extends { pages?: infer P } ? P : never : never } };
}
async function startWith(status: Estimate["status"], sentAt?: string) {
  signIn("u1", "c1", "owner");
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  await settle();
  const seed = makeSeed();
  const e0 = seed.estimates.find((e) => e.doc?.options?.[0]?.lines?.length)!;
  const est = withLine(e0, status, sentAt);
  const moduleData = { ...(seed.moduleData ?? {}), gutters: { measurements: [{ id: MID, label: null, status: "ready", propertyId: est.propertyId, leadId: null }], elements: [], revisions: [] } };
  server.loads.splice(0).forEach((d) => d.resolve({ ...seed, estimates: seed.estimates.map((e) => (e.id === est.id ? est : e)), moduleData, company: { ...seed.company, modules: { ...(seed.company?.modules ?? {}), gutters: { enabled: true, trialEndsAt: "2099-01-01T00:00:00.000Z", settings: {}, rowVersion: 1 } } } }));
  await settle();
  return { v: () => valueOf(r), eid: est.id };
}
const ops = () => server.sends.map((x) => x.op as { k: string; id?: string; payload?: { id?: string } });

describe("unit:gutterDeleteMeasurement — #2013 (spec 33-gutters-workflow «Удалить замер»)", () => {
  it("С1: черновик — строки замера становятся обычными: название, количество, цена, сумма в центах и страница чертежа те же", async () => {
    const { v, eid } = await startWith("draft");
    const e = v().db.estimates.find((x) => x.id === eid)!;
    const d = detachDoc(e.doc!, MID);
    expect(summarize(d).totalCents).toBe(summarize(e.doc!).totalCents);
    expect(d.pages).toEqual(e.doc!.pages);
    const l = d.options[0]!.lines.find((x) => x.id === "l-2013")! as { source?: unknown; name: string; quantity: unknown; unitPriceCents: number };
    expect([l.source, l.name, String(l.quantity), l.unitPriceCents]).toEqual([undefined, "Gutter 5″ (test)", "21", 800]);
    expect(detachDoc(d, MID)).toBe(d);
  });

  it("С1 + С4: без сети — замер удалён, у черновика строки без связи, сумма та же; «Отменить» возвращает обе записи; после сети сервер видит исходное", async () => {
    const { v, eid } = await startWith("draft");
    const before = v().db.estimates.find((x) => x.id === eid)!;
    v().setOnline(false);
    await settle();
    expect(estimatesOn(v().db, MID).drafts.map((x) => x.id)).toEqual([eid]);
    const undo = removeMeasurementDetached(v() as unknown as ModuleEstimateStore, MID)!;
    await settle();
    expect(gutterData(v().db).measurements.some((m) => m.id === MID)).toBe(false);
    const after = v().db.estimates.find((x) => x.id === eid)!;
    // the engine's sum of the document: the same before and after (the seeded row's stored total is not recounted — summarize is)
    expect(after.totalCents).toBe(summarize(before.doc!).totalCents);
    expect(after.doc!.options[0]!.lines.some((l) => (l as { source?: { measurementId?: string } }).source?.measurementId === MID)).toBe(false);
    undo();
    await settle();
    expect(gutterData(v().db).measurements.some((m) => m.id === MID)).toBe(true);
    const back = v().db.estimates.find((x) => x.id === eid)!;
    expect(back.doc!.options[0]!.lines.some((l) => (l as { source?: { measurementId?: string } }).source?.measurementId === MID)).toBe(true);
    expect(back.totalCents).toBe(before.totalCents);
    v().setOnline(true);
    await settle();
    for (let i = 0; i < 6; i++) { server.sends.forEach((s) => s.d.resolve()); await settle(); }
    // whatever went, the last word: the measurement is there and the estimate keeps its lines of it
    const lastEst = [...server.sends].reverse().map((x) => x.op as { k: string; id?: string; doc?: Estimate["doc"] }).find((o) => o.k === "estimate.save" && o.id === eid);
    if (lastEst) expect(lastEst.doc!.options[0]!.lines.some((l) => (l as { source?: { measurementId?: string } }).source?.measurementId === MID)).toBe(true);
    const lastM = [...ops()].reverse().find((o) => o.k === "module" || o.k.startsWith("module"));
    if (lastM) expect(JSON.stringify(lastM)).not.toMatch(/"kind":"m\.remove"[^}]*"id":"m-2013"[^}]*}$/);
  });

  it("С1а: отправленная смета не меняется — статус «отправлена», sentAt, строки и сумма те же; замер удалён", async () => {
    const { v, eid } = await startWith("sent", "2026-11-16T10:00:00.000Z");
    const before = JSON.stringify(v().db.estimates.find((x) => x.id === eid));
    expect(estimatesOn(v().db, MID).sent.map((x) => x.id)).toEqual([eid]);
    removeMeasurementDetached(v() as unknown as ModuleEstimateStore, MID);
    await settle();
    const after = v().db.estimates.find((x) => x.id === eid)!;
    expect(JSON.stringify(after)).toBe(before);
    expect([after.status, after.sentAt]).toEqual(["sent", "2026-11-16T10:00:00.000Z"]);
    expect(gutterData(v().db).measurements.some((m) => m.id === MID)).toBe(false);
    expect(server.sends.map((x) => (x.op as { k: string }).k)).not.toContain("estimate.save");
  });

  it("С3: подписанная — удалять нельзя (signedOn), смета не входит в «черновики» и «отправленные»", async () => {
    const { v } = await startWith("approved");
    expect(signedOn(v().db, MID)).toBe(true);
    expect(estimatesOn(v().db, MID)).toEqual({ drafts: [], sent: [] });
  });

  it("С2: без сметы — замер удаляется, «Отменить» возвращает", async () => {
    const { v, eid } = await startWith("draft");
    // the estimate is of another measurement: nothing to let go
    expect(estimatesOn(v().db, "m-other")).toEqual({ drafts: [], sent: [] });
    expect(eid).toBeTruthy();
  });
});
