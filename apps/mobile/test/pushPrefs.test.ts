/**
 * Step 18 P4b (docs/specs/27-push.md §4.11): my push switches by group. The op goes to the one server function
 * (public.set_push_kind — only for yourself), never a direct write of push_prefs; my rows are read back (a newer group or a
 * broken row is left out); the store changes the screen at once and sends through the offline queue (rule 6), «Отменить»
 * takes it back. React's hooks — test/support/miniReact.ts; the server and AsyncStorage are stand-ins, as in storeSync.test.ts.
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
    from: (t: string) => { rpcCalls.push({ kind: "from", name: t }); throw new Error("no direct table write"); },
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
import { pushPrefsFromRows } from "../src/cloud/repo";
import { madeOnQueue } from "../src/data/outboxDeps";
import type { PushGroup, PushPrefs } from "../src/data/types";

type Value = {
  db: { pushPrefs?: PushPrefs };
  queue: unknown[];
  mode: string;
  setOnline: (v: boolean) => number;
  setPushKind: (kind: PushGroup, enabled: boolean) => () => void;
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

describe("unit:pushPrefs — the op and the read (P4b)", () => {
  it("the op is set_push_kind for my company, with the group and the value; no direct write", async () => {
    const { applyOp } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    await applyOp({ k: "me.pushKind", kind: "leads", enabled: false }, "co-1", "u-1");
    await applyOp({ k: "me.pushKind", kind: "viewed", enabled: true }, "co-1", "u-1");
    expect(rpcCalls).toEqual([
      { kind: "rpc", name: "set_push_kind", args: { p_company_id: "co-1", p_kind: "leads", p_enabled: false } },
      { kind: "rpc", name: "set_push_kind", args: { p_company_id: "co-1", p_kind: "viewed", p_enabled: true } },
    ]);
  });
  it("my rows → my switches; a group the app does not know, or a broken row, is left out; no rows → the defaults (empty)", () => {
    expect(pushPrefsFromRows([{ kind: "leads", enabled: false }, { kind: "viewed", enabled: true }])).toEqual({ leads: false, viewed: true });
    expect(pushPrefsFromRows([{ kind: "quiet", enabled: false }, { kind: "signed", enabled: null }, { kind: "payment", enabled: "false" }])).toEqual({});
    expect(pushPrefsFromRows([])).toEqual({});
  });
  it("the op makes nothing the queue must wait for (outboxDeps)", () => {
    expect(madeOnQueue({ k: "me.pushKind", kind: "visits", enabled: false }, makeSeed())).toBeUndefined();
  });
});

describe("unit:pushPrefs — the store (P4b, rule 6)", () => {
  it("demo: the switch changes at once, keeps the other groups, «Отменить» takes it back; nothing is sent", async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    expect(valueOf(r).mode).toBe("demo");
    valueOf(r).setPushKind("viewed", true);
    await settle();
    const undo = valueOf(r).setPushKind("leads", false);
    await settle();
    expect(valueOf(r).db.pushPrefs).toEqual({ viewed: true, leads: false });
    undo();
    await settle();
    expect(valueOf(r).db.pushPrefs).toEqual({ viewed: true });
    expect(server.sends).toEqual([]);
  });
  it("cloud: the change is on the screen at once and goes through the queue; no network — it waits whole; back — it goes", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads.splice(0).forEach((d) => d.resolve(makeSeed()));
    await settle();
    valueOf(r).setPushKind("leads", false);
    await settle();
    expect(valueOf(r).db.pushPrefs).toEqual({ leads: false });
    expect(valueOf(r).queue).toHaveLength(1);
    valueOf(r).setOnline(true);
    await settle();
    expect(server.sends.at(-1)).toMatchObject({ op: { k: "me.pushKind", kind: "leads", enabled: false }, companyId: "c1", userId: "u1" });
    server.sends.at(-1)!.d.reject(new TypeError("Network request failed"));
    await settle();
    expect(valueOf(r).queue).toHaveLength(1); // the cellar: the switch does not jump back, the op waits
    expect(valueOf(r).db.pushPrefs).toEqual({ leads: false });
    valueOf(r).setOnline(true);
    await settle();
    server.sends.at(-1)!.d.resolve();
    await settle();
    expect(valueOf(r).queue).toEqual([]);
    expect(valueOf(r).db.pushPrefs).toEqual({ leads: false });
  });
});

import { pushGroupOn, pushGroupsFor } from "../src/features/pushPrefs";

describe("unit:pushPrefs — who sees which group, and the defaults (P4c, §4.11)", () => {
  it("director all five; office and sales without «payment»; a tech «visits» and «leads»; a subcontractor nothing", () => {
    expect(pushGroupsFor(["director"], false)).toEqual(["signed", "payment", "visits", "leads", "viewed"]);
    expect(pushGroupsFor(["dispatcher"], false)).toEqual(["signed", "visits", "leads", "viewed"]);
    expect(pushGroupsFor(["sales"], false)).toEqual(["signed", "visits", "leads", "viewed"]);
    expect(pushGroupsFor(["tech"], false)).toEqual(["visits", "leads"]);
    expect(pushGroupsFor(["tech"], true)).toEqual([]);
    expect(pushGroupsFor(["director", "dispatcher", "tech"], true)).toEqual([]);
  });
  it("several roles — the union, in the screen's order (owner / admin in the cloud: director + dispatcher + tech)", () => {
    expect(pushGroupsFor(["tech", "dispatcher"], false)).toEqual(["signed", "visits", "leads", "viewed"]);
    expect(pushGroupsFor(["director", "dispatcher", "tech"], false)).toEqual(["signed", "payment", "visits", "leads", "viewed"]);
    expect(pushGroupsFor([], false)).toEqual([]);
  });
  it("nothing saved — on, except «Клиент открыл смету» (as app.push_enabled); what is saved wins", () => {
    for (const g of ["signed", "payment", "visits", "leads"] as const) expect(pushGroupOn(undefined, g)).toBe(true);
    expect(pushGroupOn(undefined, "viewed")).toBe(false);
    expect(pushGroupOn({}, "viewed")).toBe(false);
    expect(pushGroupOn({ viewed: true, leads: false }, "viewed")).toBe(true);
    expect(pushGroupOn({ viewed: true, leads: false }, "leads")).toBe(false);
  });
});
