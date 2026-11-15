/**
 * #1606: my own name, the store side (the op itself — test/myName.test.ts). The name is tidied like the server does it (cleanName),
 * the team list and the initials change at once, «Отменить» takes it back, an empty name changes nothing; in the cloud the change goes
 * through the offline queue (rule 6): no network — it waits whole, nothing jumps back. React's hooks — test/support/miniReact.ts.
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

type Value = {
  db: { me: string; members: { id: string; name: string; initials: string }[] };
  queue: unknown[];
  mode: string;
  setOnline: (v: boolean) => number;
  setMyName: (name: string) => () => boolean | undefined;
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


const me = (r: Root<P>) => valueOf(r).db.members.find((m) => m.id === valueOf(r).db.me)!;

describe("unit:myName — the store (#1606, rule 6)", () => {
  it("demo: the name and the initials change at once, tidied; «Отменить» brings the old ones back; nothing is sent", async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    expect(valueOf(r).mode).toBe("demo");
    const was = { ...me(r) };
    const undo = valueOf(r).setMyName("  dana \n  whitfield\t ");
    await settle();
    expect(me(r).name).toBe("dana whitfield");
    expect(me(r).initials).toBe("DW");
    expect(undo()).toBe(true);
    await settle();
    expect(me(r)).toEqual(was);
    expect(server.sends).toEqual([]);
  });
  it("a name of control characters only (or nothing) changes nothing: the old name stays", async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    const was = me(r).name;
    valueOf(r).setMyName("\u0007\u0008 \n");
    valueOf(r).setMyName("");
    await settle();
    expect(me(r).name).toBe(was);
  });
  it("cloud: it is on the screen at once and goes through the queue tidied; no network — it waits whole; back — it goes", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads.splice(0).forEach((d) => d.resolve(makeSeed()));
    await settle();
    valueOf(r).setMyName("Dana   Whitfield");
    await settle();
    expect(me(r).name).toBe("Dana Whitfield");
    expect(valueOf(r).queue).toHaveLength(1);
    valueOf(r).setOnline(true);
    await settle();
    expect(server.sends.at(-1)).toMatchObject({ op: { k: "me.name", name: "Dana Whitfield" }, companyId: "c1", userId: "u1" });
    server.sends.at(-1)!.d.reject(new TypeError("Network request failed"));
    await settle();
    expect(valueOf(r).queue).toHaveLength(1);
    expect(me(r).name).toBe("Dana Whitfield");
    valueOf(r).setOnline(true);
    await settle();
    server.sends.at(-1)!.d.resolve();
    await settle();
    expect(valueOf(r).queue).toEqual([]);
    expect(me(r).name).toBe("Dana Whitfield");
  });
});

import { cleanName, needsName, nameDue, parseAsked } from "../src/features/nameAsk";
describe("unit:myName — when the name is asked", () => {
  it("cleanName: control characters out, spaces into one, cut", () => {
    expect(cleanName("  Dana \n\t Whitfield ")).toBe("Dana Whitfield");
    expect(cleanName("\u0007")).toBe("");
    expect(cleanName("x".repeat(200))).toHaveLength(120);
  });
  it("no name = empty or the e-mail; once asked (saved or «Позже») never again on this device", () => {
    expect(needsName("")).toBe(true);
    expect(needsName("dana@example.com")).toBe(true);
    expect(needsName("Dana Whitfield")).toBe(false);
    expect(nameDue({ userId: "u1", name: "dana@example.com", asked: [] })).toBe(true);
    expect(nameDue({ userId: "u1", name: "dana@example.com", asked: ["u1"] })).toBe(false);
    expect(nameDue({ userId: "u1", name: "dana@example.com", asked: null })).toBe(false); // the device list is not read yet
    expect(nameDue({ userId: null, name: "", asked: [] })).toBe(false);
    expect(nameDue({ userId: "u1", name: "Dana", asked: [] })).toBe(false);
    // the team list is empty (a fresh cache, the company not loaded yet): I am not in it — not known, never «no name»
    expect(nameDue({ userId: "u1", name: undefined, asked: [] })).toBe(false);
    // in the list with an empty name — asked
    expect(nameDue({ userId: "u1", name: "", asked: [] })).toBe(true);
    expect(parseAsked('["u1","u2"]')).toEqual(["u1", "u2"]);
    expect(parseAsked("not json")).toEqual([]);
    expect(parseAsked(null)).toEqual([]);
  });
});
