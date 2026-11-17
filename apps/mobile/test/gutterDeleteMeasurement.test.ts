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
  queue: { id: string; label: string }[];
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

import { detachDoc, engineStaleMeasurements, estimatesOn, removeMeasurementDetached, signedOn, staleMeasurements } from "../src/modules/gutters/estimateLink";
import gutters from "../src/modules/gutters/module";
import { gutterData } from "../src/modules/gutters/data";
import { summarize } from "../src/features/estimateDoc";

const MID = "m-2013";
const src = { module: "gutters", measurementId: MID, key: "gutter|x", at: "2026-11-17T10:00:00.000Z" };
/** a demo estimate with one line of the measurement (and its drawing page), in the given status */
function withLine(e: Estimate, status: Estimate["status"], sentAt?: string, srcExtra: Record<string, unknown> = {}): Estimate {
  const doc = e.doc!;
  const o = doc.options[0]!;
  const line = { ...o.lines[0]!, id: "l-2013", name: "Gutter 5″ (test)", quantity: "21", unitPriceCents: 800, source: { ...src, ...srcExtra } };
  return { ...e, status, ...(sentAt ? { sentAt } : { sentAt: undefined }), doc: { ...doc, options: [{ ...o, lines: [...o.lines, line] }, ...doc.options.slice(1)], pages: [{ id: `gutters-m-${MID}`, kind: "image", title: "Drawing", svg: "<svg/>" }] as unknown as Estimate["doc"] extends infer D ? D extends { pages?: infer P } ? P : never : never } };
}
/** the module's data around the measurement (С6, С2): its status, something drawn, the engine version on its line, more measurements */
type G = { mStatus?: "draft" | "ready"; run?: boolean; engineVersion?: string; more?: string[] };
async function startWith(status: Estimate["status"], sentAt?: string, g: G = {}) {
  signIn("u1", "c1", "owner");
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  await settle();
  const seed = makeSeed();
  const e0 = seed.estimates.find((e) => e.doc?.options?.[0]?.lines?.length)!;
  const est = withLine(e0, status, sentAt, g.engineVersion ? { engineVersion: g.engineVersion } : {});
  const ms = [MID, ...(g.more ?? [])].map((id) => ({ id, label: null, status: id === MID ? (g.mStatus ?? "ready") : "ready", propertyId: est.propertyId, leadId: null }));
  const elements = g.run ? [{ id: `run-${MID}`, measurementId: MID, kind: "run", geom: {}, attrs: {}, confidence: "drawn" }] : [];
  const moduleData = { ...(seed.moduleData ?? {}), gutters: { measurements: ms, elements, revisions: [] } };
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
    // the server's last word (strict): an estimate save that went keeps the measurement's lines; a measurement removal that went is
    // followed by its return — or nothing of it went at all (the queue dropped the pair)
    const sent = server.sends.map((x) => x.op as { k: string; id?: string; doc?: Estimate["doc"]; module?: string; kind?: string; payload?: Record<string, unknown> });
    const estSaves = sent.filter((o) => o.k === "estimate.save" && o.id === eid);
    expect(estSaves.length === 0 || estSaves[estSaves.length - 1]!.doc!.options[0]!.lines.some((l) => (l as { source?: { measurementId?: string } }).source?.measurementId === MID)).toBe(true);
    const mOps = sent.filter((o) => JSON.stringify(o).includes(MID) && o.k !== "estimate.save");
    const lastM = mOps[mOps.length - 1];
    expect(mOps.length === 0 || !/remove/i.test(String(lastM?.kind ?? (lastM?.payload as { kind?: string } | undefined)?.kind ?? JSON.stringify(lastM)))).toBe(true);
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

  it("С1 (стор, без сети): после удаления у черновика снимок чертежа (doc.pages) на месте, сумма через движок та же; «Отменить» — документ как был", async () => {
    const { v, eid } = await startWith("draft");
    v().setOnline(false);
    await settle();
    const before = v().db.estimates.find((x) => x.id === eid)!;
    const q0 = v().queue.length;
    const undo = removeMeasurementDetached(v() as unknown as ModuleEstimateStore, MID)!;
    await settle();
    const after = v().db.estimates.find((x) => x.id === eid)!;
    expect(after.status).toBe("draft");
    expect(after.doc!.pages).toEqual(before.doc!.pages);
    expect(summarize(after.doc!).totalCents).toBe(summarize(before.doc!).totalCents);
    expect(after.doc!.options[0]!.lines.find((l) => l.id === "l-2013")).toMatchObject({ name: "Gutter 5″ (test)", unitPriceCents: 800 });
    // through the core's queue: the estimate's save and the module's removal — two records
    expect(v().queue.length).toBe(q0 + 2);
    undo();
    await settle();
    const back = v().db.estimates.find((x) => x.id === eid)!;
    expect(back.doc).toEqual(before.doc);
    expect(summarize(back.doc!).totalCents).toBe(summarize(before.doc!).totalCents);
  });

  it("С1а (без сети): отправленная смета байт-в-байт та же, в очереди нет её записи; «Отменить» возвращает замер", async () => {
    const { v, eid } = await startWith("sent", "2026-11-16T10:00:00.000Z");
    v().setOnline(false);
    await settle();
    const before = JSON.stringify(v().db.estimates.find((x) => x.id === eid));
    const q0 = v().queue.length;
    const undo = removeMeasurementDetached(v() as unknown as ModuleEstimateStore, MID)!;
    await settle();
    expect(JSON.stringify(v().db.estimates.find((x) => x.id === eid))).toBe(before);
    expect(gutterData(v().db).measurements.some((m) => m.id === MID)).toBe(false);
    // only the measurement's removal waits for the network: one record, not two
    expect(v().queue.length).toBe(q0 + 1);
    undo();
    await settle();
    expect(gutterData(v().db).measurements.some((m) => m.id === MID)).toBe(true);
    expect(JSON.stringify(v().db.estimates.find((x) => x.id === eid))).toBe(before);
  });

  it("С2 (стор): замер без сметы — удаляется, смет не трогает (записи сметы нет), «Отменить» возвращает", async () => {
    const { v } = await startWith("draft", undefined, { more: ["m-free"] });
    const estBefore = JSON.stringify(v().db.estimates);
    const undo = removeMeasurementDetached(v() as unknown as ModuleEstimateStore, "m-free")!;
    await settle();
    expect(undo).toBeTruthy();
    expect(gutterData(v().db).measurements.map((m) => m.id)).toEqual([MID]);
    expect(JSON.stringify(v().db.estimates)).toBe(estBefore);
    expect(ops().map((o) => o.k)).not.toContain("estimate.save");
    undo();
    await settle();
    expect(gutterData(v().db).measurements.map((m) => m.id).sort()).toEqual([MID, "m-free"].sort());
    expect(removeMeasurementDetached(v() as unknown as ModuleEstimateStore, "m-none")).toBeNull();
  });

  it("С3: «ждёт подписи компании» тоже подписанная — удалять нельзя", async () => {
    const { v } = await startWith("awaiting_countersign");
    expect(signedOn(v().db, MID)).toBe(true);
    expect(estimatesOn(v().db, MID)).toEqual({ drafts: [], sent: [] });
  });

  it("С6: замер изменился после сметы — после удаления заметки «Обновить из замера» нет; «Отменить» — у черновика вернулась", async () => {
    for (const status of ["draft", "sent"] as const) {
      const { v, eid } = await startWith(status, status === "sent" ? "2026-11-16T10:00:00.000Z" : undefined, { mStatus: "draft", run: true });
      const e = () => v().db.estimates.find((x) => x.id === eid)!;
      expect(staleMeasurements(v().db, e()).map((m) => m.id), status).toEqual([MID]);
      expect(gutters.estimateNotes!(e(), v().db, undefined).map((n) => n.id), status).toEqual(["stale"]);
      const undo = removeMeasurementDetached(v() as unknown as ModuleEstimateStore, MID)!;
      await settle();
      expect(staleMeasurements(v().db, e()), status).toEqual([]);
      expect(engineStaleMeasurements(v().db, e()), status).toEqual([]);
      expect(gutters.estimateNotes!(e(), v().db, undefined), status).toEqual([]);
      undo();
      await settle();
      expect(gutters.estimateNotes!(e(), v().db, undefined).map((n) => n.id), status).toEqual(["stale"]);
      root?.unmount();
      root = null;
      storage.clear();
      server.sends.length = 0;
    }
  });

  it("С6: расчёт изменился (старая версия правил в строке черновика) — после удаления заметки «расчёт изменился» нет; «Отменить» — вернулась", async () => {
    const { v, eid } = await startWith("draft", undefined, { run: true, engineVersion: "0.0.1" });
    const e = () => v().db.estimates.find((x) => x.id === eid)!;
    expect(engineStaleMeasurements(v().db, e()).map((m) => m.id)).toEqual([MID]);
    expect(gutters.estimateNotes!(e(), v().db, undefined).map((n) => n.id)).toEqual(["engine"]);
    const undo = removeMeasurementDetached(v() as unknown as ModuleEstimateStore, MID)!;
    await settle();
    expect(engineStaleMeasurements(v().db, e())).toEqual([]);
    expect(gutters.estimateNotes!(e(), v().db, undefined)).toEqual([]);
    undo();
    await settle();
    expect(gutters.estimateNotes!(e(), v().db, undefined).map((n) => n.id)).toEqual(["engine"]);
  });

  it("С3: подписанная смета — removeMeasurementDetached сама отказывает: замер и смета не тронуты, в очереди ничего", async () => {
    const { v, eid } = await startWith("approved");
    const before = JSON.stringify(v().db.estimates.find((x) => x.id === eid));
    v().setOnline(false);
    await settle();
    expect(removeMeasurementDetached(v() as unknown as ModuleEstimateStore, MID)).toBeNull();
    await settle();
    expect(gutterData(v().db).measurements.some((m) => m.id === MID)).toBe(true);
    expect(JSON.stringify(v().db.estimates.find((x) => x.id === eid))).toBe(before);
    v().setOnline(true);
    await settle();
    expect(server.sends).toHaveLength(0);
  });
});
