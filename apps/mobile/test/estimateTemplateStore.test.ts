/**
 * Spec 07 §12.7: the store's side of an estimate template's edit over row_version — the version the phone keeps (+1 per
 * own save of a known one; a new one unknown until read: a cost in it makes the server's own extra update), every save of
 * a known one goes over it, and a «someone changed it first» refusal drops this save and the later ones of the same
 * template at once, with one card «не сохранено» (never retried, never sent over the other change). Store harness — as in
 * test/moduleOp.test.ts.
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
import type { EstimateTemplate } from "../src/data/types";

type Value = {
  queue: { id: string; label: string }[];
  setOnline: (v: boolean) => number;
  db: { estimateTemplates?: EstimateTemplate[] };
  saveEstimateTemplate: (t: EstimateTemplate, o?: { ifNew?: boolean; baseRowVersion?: number; clearCosts?: string[] }) => () => void;
  rejectedOps: { labelKey?: string; kind?: string; href?: string }[];
};
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
const signIn = (userId: string, companyId: string) => Object.assign(auth, { session: {}, userId, company: { companyId, role: "owner", companyName: "Co" } });
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

const settings = { discount: null, tax: { enabled: false, rateBps: 0, groups: { service: false, labor: false, material: false } }, deposit: { kind: "none" as const } };
const T = (over: Partial<EstimateTemplate> = {}): EstimateTemplate => ({
  id: "tpl-1", name: "Visit (test)", rowVersion: 3,
  doc: { options: [{ id: "o", name: "A", lines: [{ id: "l", name: "Call (test)", group: "service", quantity: "1", unit: "ea", unitPriceCents: 100 }] }], settings },
  ...over,
});
type Sent = { k: string; template?: { id: string; name: string }; baseRowVersion?: number };

describe("unit:estimateTemplateStore (spec 07 §12.7)", () => {
  it("cloud: the phone's version and the base of every save; a conflict drops the later saves of the template at once, one card", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    // the phone read the template at version 3
    server.loads.splice(0).forEach((d) => d.resolve({ ...makeSeed(), estimateTemplates: [T()] }));
    await settle();
    valueOf(r).setOnline(false);
    await settle();
    const v = () => valueOf(r);
    // a new one: no version known (insert, and the server's own extra update when it has a cost)
    v().saveEstimateTemplate(T({ id: "tpl-new", rowVersion: undefined }));
    await settle();
    expect(v().db.estimateTemplates!.find((x) => x.id === "tpl-new")!.rowVersion).toBeUndefined();
    // E1: the builder's edit over 3 → the phone at 4; E2 (a rename, offline): over 4 — built on E1
    v().saveEstimateTemplate(T({ name: "E1" }), { baseRowVersion: 3 });
    await settle();
    expect(v().db.estimateTemplates!.find((x) => x.id === "tpl-1")!.rowVersion).toBe(4);
    v().saveEstimateTemplate({ ...v().db.estimateTemplates!.find((x) => x.id === "tpl-1")!, name: "E2" });
    await settle();
    const before = server.sends.length;
    v().setOnline(true);
    await settle();
    const sent = () => server.sends.slice(before).map((x) => x.op as Sent).filter((x) => x.k === "est.template.save");
    // the new one goes first, plain (no base)
    expect(sent()[0]).toMatchObject({ template: { id: "tpl-new" } });
    expect(sent()[0]!.baseRowVersion).toBeUndefined();
    server.sends.at(-1)!.d.resolve();
    await settle();
    expect(sent().at(-1)).toMatchObject({ template: { id: "tpl-1", name: "E1" }, baseRowVersion: 3 });
    // someone else saved first: E1 refused as a conflict — E2 never goes, no retry, one card
    const { PermanentError } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    server.sends.at(-1)!.d.reject(new PermanentError("the template was changed on another phone", 409, "40001", "row_version_conflict"));
    await settle();
    expect(sent().filter((x) => x.template?.id === "tpl-1").map((x) => x.template!.name)).toEqual(["E1"]);
    expect(v().rejectedOps.filter((c) => c.labelKey === "est.tpl.rejConflict")).toHaveLength(1);
    expect(v().rejectedOps.find((c) => c.labelKey === "est.tpl.rejConflict")).toMatchObject({ kind: "est.template.save", href: "/estimate/templates" });
  });
});
