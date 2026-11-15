/**
 * Spec 33 П15 C2c: a module's own change (Op "module.op") — sent by the module's handler (ModuleDef.ops), merged in the
 * queue by coalesceKey (a drawn element: one write, not one per move), never saved when the module is not active (О2).
 * Also: a row_version conflict (module_save_settings) is the server's «no», not «try later». Store harness — as in
 * test/modules.test.ts.
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
import { madeOnQueue } from "../src/data/outboxDeps";
import type { Company } from "../src/data/types";
import { registerModule, type ModuleOpIn } from "../src/modules/registry";
import { MAX_TRIES } from "../src/data/outboxRetry";
import gutters from "../src/modules/gutters/module";
import { coalesceAt, coalesced } from "../src/data/outboxCoalesce";
import type { OwnedItem } from "../src/data/outboxOwner";
import type { Op } from "../src/cloud/ops";

type Value = {
  queue: { id: string; label: string }[];
  mode: string;
  setOnline: (v: boolean) => number;
  db: { company: Company | null; notes: { id: string; body: string }[] };
  enableModule: (key: string) => () => void;
  moduleOp: (module: string, change: { kind: string; payload: Record<string, unknown>; apply: (d: never) => never; coalesceKey?: string; made?: string[] }) => (() => void) | null;
};
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
const signIn = (userId: string, companyId: string) => Object.assign(auth, { session: {}, userId, company: { companyId, role: "owner", companyName: "Co" } });
const signOut = () => Object.assign(auth, { session: null, userId: null, company: null });
let root: Root<P> | null = null;
beforeEach(() => {
  storage.clear();
  rpcError.next = null;
  handled.length = 0;
  server.loads.length = 0;
  server.sends.length = 0;
  rpcCalls.length = 0;
  signOut();
});
afterEach(() => {
  root?.unmount();
  root = null;
});



const handled: { op: ModuleOpIn; companyId: string; userId: string }[] = [];
registerModule({
  ...gutters,
  key: "op_demo",
  ops: async (op, ctx) => {
    handled.push({ op, companyId: ctx.companyId, userId: ctx.userId });
    await ctx.run(Promise.resolve({ error: null }));
  },
});
const DAY = 86_400_000;
const ME = { userId: "u1", companyId: "c1" };
const mop = (key: string | undefined, payload: Record<string, unknown>, module = "op_demo", made?: string[], kind = "element.save"): Op =>
  ({ k: "module.op", module, kind, payload, ...(key ? { coalesceKey: key } : {}), ...(made ? { made } : {}) }) as Op;
const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";
const item = (id: string, op: Op, owner: typeof ME | null = ME, extra: Partial<OwnedItem> = {}): OwnedItem =>
  ({ id, op, at: "2026-11-07T20:00:00Z", tries: 0, ...(owner ? { owner } : {}), ...extra }) as OwnedItem;

describe("unit:moduleOp — merging in the queue (outboxCoalesce)", () => {
  it("the same module and key: the waiting op's place; the latest of several", () => {
    const q = [item("a", mop("el-1", { x: 1 })), item("b", { k: "note.add" } as unknown as Op), item("c", mop("el-1", { x: 2 }))];
    expect(coalesceAt(q, mop("el-1", { x: 3 }), ME, null)).toBe(2);
    expect(coalesceAt(q.slice(0, 2), mop("el-1", { x: 3 }), ME, null)).toBe(0);
  });
  it("never: another key, another module, no key, another kind of op, the op in flight, another person's, an owner-less one", () => {
    const q = [item("a", mop("el-1", { x: 1 }))];
    expect(coalesceAt(q, mop("el-2", {}), ME, null)).toBe(-1);
    expect(coalesceAt(q, mop("el-1", {}, "other"), ME, null)).toBe(-1);
    expect(coalesceAt(q, mop(undefined, {}), ME, null)).toBe(-1);
    expect(coalesceAt(q, { k: "module.enable", module: "op_demo" }, ME, null)).toBe(-1);
    expect(coalesceAt(q, mop("el-1", {}), ME, "a")).toBe(-1);
    expect(coalesceAt(q, mop("el-1", {}), { userId: "u2", companyId: "c1" }, null)).toBe(-1);
    expect(coalesceAt([item("a", mop("el-1", {}), null)], mop("el-1", {}), ME, null)).toBe(-1);
    expect(coalesceAt(q, mop("el-1", {}), null, null)).toBe(-1);
  });
  it("another kind of the same element never merges (a save never swallows another kind, review #354 Б4)", () => {
    const q = [item("a", mop("el-1", { id: L1 }))];
    expect(coalesceAt(q, mop("el-1", { id: L1 }, "op_demo", undefined, "element.style"), ME, null)).toBe(-1);
  });
  it("Б3: a later op makes what the newer one refers to → the newer goes to the end, never ahead of what it needs", () => {
    // A: save L1 (makes L1); X: makes L2 (no key); B: save L1 referring to L2 — merged into A's place it would go before X
    const q = [item("a", mop("el-L1", { id: L1 }, "op_demo", [L1])), item("x", mop(undefined, { id: L2 }, "op_demo", [L2], "element.add"))];
    expect(coalesceAt(q, mop("el-L1", { id: L1, joinsId: L2 }), ME, null)).toBe(-1);
    // nothing tied after it: merged in place
    expect(coalesceAt(q, mop("el-L1", { id: L1 }), ME, null)).toBe(0);
  });
  it("Б4: an op after the older one that refers to what it makes keeps it — the newer goes to the end ([create, X(ref), save])", () => {
    const q = [item("a", mop("el-L1", { id: L1 }, "op_demo", [L1])), item("x", mop(undefined, { downspoutOn: L1 }, "op_demo", undefined, "ds.add"))];
    expect(coalesceAt(q, mop("el-L1", { id: L1, lengthIn: 120 }), ME, null)).toBe(-1);
    // an unrelated op after it: merged in place
    const free = [item("a", mop("el-L1", { id: L1 }, "op_demo", [L1])), item("y", mop(undefined, { id: L2 }, "op_demo", [L2], "element.add"))];
    expect(coalesceAt(free, mop("el-L1", { id: L1, lengthIn: 120 }), ME, null)).toBe(0);
  });
  it("merged: the newer change, tries from zero, what either makes stays made (lower case)", () => {
    const id = "6F9619FF-8B86-4011-B42D-00C04FC964FF";
    const older = item("a", mop("el-1", { x: 1 }, "op_demo", [id]), ME, { tries: 3, error: "x" } as Partial<OwnedItem>);
    const newer = item("b", mop("el-1", { x: 2 }));
    const m = coalesced(older, newer);
    expect(m.id).toBe("b");
    expect(m.tries).toBe(0);
    expect((m as { error?: string }).error).toBeUndefined();
    expect(m.op).toMatchObject({ payload: { x: 2 }, made: [id.toLowerCase()] });
    expect(m.made).toEqual([id.toLowerCase()]);
    expect(coalesced(item("a", mop("k", {})), newer)).toEqual(newer);
  });
});

describe("unit:moduleOp — a row_version conflict is a refusal (review #354 Б1)", () => {
  it("classify reads the hint before the code: the conflict is «no»; a plain 40001 stays «later»", async () => {
    const { classify } = await import("../src/data/outboxRetry");
    const { PermanentError, ServerError } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    expect(classify(new PermanentError("changed by someone else", 409, "40001", "row_version_conflict"))).toBe("refusal");
    expect(classify(Object.assign(new Error("x"), { code: "40001", hint: "row_version_conflict" }))).toBe("refusal");
    expect(classify(new ServerError("could not serialize access", 409, "40001"))).toBe("transient");
  });
});

describe("unit:moduleOp — the op (cloud/ops)", () => {
  it("module.op goes to the module's own handler with my company and me", async () => {
    const { applyOp } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    await applyOp(mop("el-1", { x: 1 }), "co-1", "u-1");
    expect(handled).toEqual([{ op: { kind: "element.save", payload: { x: 1 } }, companyId: "co-1", userId: "u-1" }]);
    expect(rpcCalls).toEqual([]);
  });
  it("a module this app does not have: the server's «no» (a try), never «later» for ever", async () => {
    const { applyOp } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    await expect(applyOp(mop("el-1", {}, "nope_mod"), "co-1", "u-1")).rejects.toMatchObject({ name: "PermanentError" });
  });
  it("settings changed by someone else first (40001 row_version_conflict): «no», not «later»; a plain 40001 — later", async () => {
    const { applyOp } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    const save: Op = { k: "module.saveSettings", module: "gutters", settings: {}, baseRowVersion: 1 };
    rpcError.next = { message: "module settings changed by someone else", code: "40001", hint: "row_version_conflict" };
    await expect(applyOp(save, "co-1", "u-1")).rejects.toMatchObject({ name: "PermanentError" });
    rpcError.next = { message: "could not serialize access", code: "40001" };
    await expect(applyOp(save, "co-1", "u-1")).rejects.toMatchObject({ name: "ServerError" });
    rpcError.next = { message: "module gutters is not active", code: "P0001", hint: "module_inactive" };
    await expect(applyOp(save, "co-1", "u-1")).rejects.toMatchObject({ name: "PermanentError" });
  });
  it("what a module.op makes: its own list (later ops that refer to it wait)", () => {
    expect(madeOnQueue(mop("k", {}, "op_demo", ["x"]), makeSeed())).toBeUndefined();
  });
});

describe("unit:moduleOp — the store (C2c, rule 5, rule 6, О2)", () => {
  const addNote = (body: string) => (d: never) => {
    const db = d as unknown as { notes: { id: string; body: string }[] };
    return { ...db, notes: [...db.notes.filter((n) => n.id !== "mod-n"), { id: "mod-n", body }] } as never;
  };
  it("not active → nothing saved, nothing queued (founder О2)", async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    expect(valueOf(r).moduleOp("op_demo", { kind: "element.save", payload: {}, apply: addNote("x") })).toBeNull();
    await settle();
    expect(valueOf(r).db.notes.some((n) => n.id === "mod-n")).toBe(false);
  });
  it("cloud, offline: moves of one element are one waiting write — the latest; another element its own; «Отменить» gives the one before back", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads.splice(0).forEach((d) => d.resolve(makeSeed()));
    await settle();
    valueOf(r).enableModule("op_demo");
    await settle();
    valueOf(r).moduleOp("op_demo", { kind: "element.save", payload: { x: 1 }, apply: addNote("1"), coalesceKey: "el-1" });
    await settle();
    valueOf(r).moduleOp("op_demo", { kind: "element.save", payload: { x: 2 }, apply: addNote("2"), coalesceKey: "el-1" });
    await settle();
    const undo = valueOf(r).moduleOp("op_demo", { kind: "element.save", payload: { x: 3 }, apply: addNote("3"), coalesceKey: "el-1" })!;
    await settle();
    valueOf(r).moduleOp("op_demo", { kind: "element.save", payload: { y: 1 }, apply: (d) => d, coalesceKey: "el-2" });
    await settle();
    expect(valueOf(r).db.notes.find((n) => n.id === "mod-n")?.body).toBe("3");
    expect(valueOf(r).queue).toHaveLength(3); // module.enable, el-1, el-2
    const mods = () => valueOf(r).queue.filter((x) => x.label === "module.op");
    expect(mods()).toHaveLength(2);
    undo();
    await settle();
    expect(valueOf(r).db.notes.find((n) => n.id === "mod-n")?.body).toBe("2");
    expect(valueOf(r).queue).toHaveLength(3);
    // back online: one write per element, the latest of each
    valueOf(r).setOnline(true);
    await settle();
    for (let i = 0; i < 4 && server.sends.length < 3; i++) {
      server.sends.at(-1)?.d.resolve();
      await settle();
      appActive.cb?.();
      await settle();
    }
    expect(server.sends.map((x) => x.op)).toEqual([
      { k: "module.enable", module: "op_demo" },
      { k: "module.op", module: "op_demo", kind: "element.save", payload: { x: 2 }, coalesceKey: "el-1" },
      { k: "module.op", module: "op_demo", kind: "element.save", payload: { y: 1 }, coalesceKey: "el-2" },
    ]);
  });
  it("cloud: a settings conflict drops this write and the later ones built on it at once, with one card; the module is read again, then the next save has the server's base (review #372 №1, #374)", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads.splice(0).forEach((d) => d.resolve(makeSeed()));
    await settle();
    valueOf(r).enableModule("op_demo");
    await settle();
    valueOf(r).setOnline(true);
    await settle();
    server.sends.at(-1)!.d.resolve();
    await settle();
    const mod = (rowVersion: number, settings: object = {}) => ({ enabled: true, trialEndsAt: new Date(Date.now() + DAY).toISOString(), settings, rowVersion });
    // the phone read version 3; meanwhile someone else saved (the server is at 4)
    server.loads.splice(0).forEach((d) => d.resolve({ ...makeSeed(), company: { ...makeSeed().company!, modules: { op_demo: mod(3) } } }));
    await settle();
    valueOf(r).setOnline(false);
    await settle();
    type S = { saveModuleSettings: (k: string, s: object) => (() => void) | null; rejectedOps: { labelKey?: string; count?: number; kind?: string }[] };
    const v = () => valueOf(r) as unknown as S & ReturnType<typeof valueOf>;
    v().saveModuleSettings("op_demo", { a: 1 }); // E1: base 3
    await settle();
    const undoE2 = v().saveModuleSettings("op_demo", { a: 1, b: 2 })!; // E2: base 4 — built on E1
    await settle();
    // a live change of the core waits behind them: it holds the company's full reload (review #374 №1)
    (valueOf(r) as unknown as { saveCompany: (p: object) => unknown }).saveCompany({ name: "Busy Co" });
    await settle();
    const before = server.sends.length;
    valueOf(r).setOnline(true);
    await settle();
    const { PermanentError } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    // E1 refused as a conflict
    server.sends.at(-1)!.d.reject(new PermanentError("module settings changed by someone else", 409, "40001", "row_version_conflict"));
    await settle();
    const sentSettings = () => server.sends.slice(before).map((x) => x.op as { k: string; baseRowVersion?: number }).filter((x) => x.k === "module.saveSettings");
    expect(sentSettings().map((x) => x.baseRowVersion)).toEqual([3]); // E2 never goes
    expect(v().queue.some((x) => x.label === "module.saveSettings")).toBe(false);
    expect(v().rejectedOps.some((c) => c.labelKey === "mod.settingsConflict" && c.count === 2 && c.kind === "module.saveSettings")).toBe(true);
    // «Отменить» of a dropped write does nothing: no settings or version the server does not have (review #374 №2)
    const was = v().db.company!.modules!.op_demo;
    undoE2();
    await settle();
    expect(v().db.company!.modules!.op_demo).toBe(was);
    // the module is read again at once, not after the queue; before it answers, no new settings write
    expect(server.moduleReads.map((x) => x.key)).toEqual(["op_demo"]);
    expect(v().saveModuleSettings("op_demo", { c: 3 })).toBeNull();
    server.moduleReads[0]!.d.resolve(mod(4, { other: "B" }));
    await settle();
    expect(v().db.company!.modules!.op_demo).toMatchObject({ rowVersion: 4, settings: { other: "B" } });
    // the next save has the server's base
    expect(v().saveModuleSettings("op_demo", { other: "B", c: 3 })).not.toBeNull();
    await settle();
    for (let i = 0; i < 6 && sentSettings().length < 2; i++) {
      const last = server.sends.at(-1)!;
      if ((last.op as { k: string }).k !== "module.saveSettings") last.d.resolve();
      await settle();
      appActive.cb?.();
      await settle();
    }
    expect(sentSettings().map((x) => x.baseRowVersion)).toEqual([3, 4]);
  });
  it("cloud: the op on its way to the server is never changed — the next move waits behind it", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads.splice(0).forEach((d) => d.resolve(makeSeed()));
    await settle();
    valueOf(r).enableModule("op_demo");
    await settle();
    valueOf(r).setOnline(true);
    await settle();
    server.sends.at(-1)!.d.resolve();
    await settle();
    valueOf(r).moduleOp("op_demo", { kind: "element.save", payload: { x: 1 }, apply: (d) => d, coalesceKey: "el-1" });
    await settle();
    appActive.cb?.();
    await settle();
    expect(server.sends.at(-1)!.op).toMatchObject({ payload: { x: 1 } }); // in flight
    valueOf(r).moduleOp("op_demo", { kind: "element.save", payload: { x: 2 }, apply: (d) => d, coalesceKey: "el-1" });
    await settle();
    expect(valueOf(r).queue).toHaveLength(2);
    server.sends.at(-1)!.d.resolve();
    await settle();
    appActive.cb?.();
    await settle();
    expect(server.sends.at(-1)!.op).toMatchObject({ payload: { x: 2 } });
  });
  it("cloud: the module is not active on the server (module_inactive) — all its waiting changes go at once with one card; the core's change is sent (spec 33 П21.1)", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads.splice(0).forEach((d) => d.resolve(makeSeed()));
    await settle();
    valueOf(r).enableModule("op_demo");
    await settle();
    // offline: three module changes and a core note in between
    for (const k of ["el-1", "el-2"]) valueOf(r).moduleOp("op_demo", { kind: "element.save", payload: { k }, apply: (d) => d, coalesceKey: k });
    (valueOf(r) as unknown as { addNote: (n: object) => unknown }).addNote({ subjectType: "lead", subjectId: "l1", body: "core", visibility: "team" });
    const undoRemove = valueOf(r).moduleOp("op_demo", { kind: "element.remove", payload: { id: "el-1" }, apply: (d) => d });
    await settle();
    expect(valueOf(r).queue.map((x) => x.label)).toEqual(["module.enable", "module.op", "module.op", "note.add", "module.op"]);
    valueOf(r).setOnline(true);
    await settle();
    server.sends.at(-1)!.d.resolve(); // module.enable
    await settle();
    appActive.cb?.();
    await settle();
    const { PermanentError } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    expect(server.sends.at(-1)!.op).toMatchObject({ k: "module.op", payload: { k: "el-1" } });
    server.sends.at(-1)!.d.reject(new PermanentError("module op_demo is not active", 403, "42501", "module_inactive"));
    await settle();
    // one refusal: every module change left the queue, the note did not; it is the next to go
    expect(valueOf(r).queue.map((x) => x.label)).toEqual(["note.add"]);
    expect(server.sends.at(-1)!.op).toMatchObject({ k: "note.add" });
    const v = valueOf(r) as unknown as { rejectedOps: { what: string; module: string; count: number; href: string }[] };
    expect(v.rejectedOps).toEqual([expect.objectContaining({ what: "module", module: "op_demo", count: 3, href: "/company/modules" })]);
    // #1266: their «Отменить» has nothing to take back — undefined (the toast closes), not false («Уже не отменить»)
    expect((undoRemove as () => unknown)()).toBeUndefined();
  });
  it("cloud: a plain refusal of a module change (no module_inactive) stays a try — the other module changes wait", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads.splice(0).forEach((d) => d.resolve(makeSeed()));
    await settle();
    valueOf(r).enableModule("op_demo");
    await settle();
    for (const k of ["el-1", "el-2"]) valueOf(r).moduleOp("op_demo", { kind: "element.save", payload: { k }, apply: (d) => d, coalesceKey: k });
    valueOf(r).setOnline(true);
    await settle();
    server.sends.at(-1)!.d.resolve();
    await settle();
    appActive.cb?.();
    await settle();
    server.sends.at(-1)!.d.reject(refusal());
    await settle();
    expect(valueOf(r).queue.filter((x) => x.label === "module.op")).toHaveLength(2);
    expect((valueOf(r) as unknown as { rejectedOps: unknown[] }).rejectedOps).toEqual([]);
  });
});
