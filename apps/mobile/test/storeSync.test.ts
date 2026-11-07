/**
 * StoreProvider itself (review #231 №1, №2, №6; 19 §6.12): what a send or a reload that is still running does when the
 * person signs out or the device is wiped. React's hooks are run by test/support/miniReact.ts; the server (repo, ops),
 * the sign-in and AsyncStorage are stand-ins the test answers by hand.
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
vi.mock("@/cloud/client", () => ({ supabase: {} }));
const auth = { ready: true, session: null as object | null, company: null as object | null, userId: null as string | null };
vi.mock("@/cloud/auth", () => ({ useAuth: () => auth }));
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
};
const server = { loads: [] as Deferred<unknown>[], sends: [] as { op: unknown; userId: string; d: Deferred<void> }[] };
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
  applyOp: (op: unknown, _c: string, userId: string) => {
    const d = deferred<void>();
    server.sends.push({ op, userId, d });
    return d.promise;
  },
  sendVisitPoint: async () => "ok",
}));

import { render, settle, type Root } from "./support/miniReact";
import { StoreProvider } from "../src/data/store";
import { forgetDeviceState } from "../src/data/persist";
import { makeSeed } from "../src/data/seed";
import { isDeviceKey } from "../src/features/deleteAccount";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const signIn = (userId: string, companyId: string) => Object.assign(auth, { session: {}, userId, company: { companyId, role: "owner", companyName: "Co" } });
const signOut = () => Object.assign(auth, { session: null, userId: null, company: null });
type Value = { db: { customers: { name: string }[] }; queue: unknown[]; mode: string };
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
let root: Root<P> | null = null;

beforeEach(() => {
  storage.clear();
  server.loads.length = 0;
  server.sends.length = 0;
  signOut();
});
afterEach(() => {
  root?.unmount();
  root = null;
});

describe("unit:storeSync — a reload that answers after sign-out (19 §6.12)", () => {
  it("the company's data never lands in the demo (memory or octo.db.v5)", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    expect(valueOf(r).mode).toBe("cloud");
    expect(server.loads).toHaveLength(1); // the reload on start
    signOut();
    r.rerender({ children: null });
    await settle();
    expect(valueOf(r).mode).toBe("demo");
    const company = makeSeed();
    company.customers = company.customers.map((c) => ({ ...c, name: `SECRET ${c.name}` }));
    server.loads[0]!.resolve(company); // the late answer
    await settle();
    await wait(300);
    await settle();
    expect(valueOf(r).db.customers.some((c) => c.name.startsWith("SECRET"))).toBe(false);
    expect(storage.get("octo.db.v5") ?? "").not.toContain("SECRET");
  });
});

describe("unit:storeSync — a send that is running when the device is wiped (review #231 №1)", () => {
  it("the deleted person's op is not put back and never reaches the next person's company", async () => {
    const op = { k: "lead.update", id: "l1", cols: { notes: "of the deleted person" } };
    storage.set("octo.outbox.v1", JSON.stringify([{ id: "o1", op, at: new Date(Date.now() - 60_000).toISOString(), tries: 0 }]));
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    expect(valueOf(r).queue).toHaveLength(1);
    await wait(1700); // the outbox tick
    await settle();
    expect(server.sends).toHaveLength(1);
    // «Удалить навсегда» succeeded: the device is forgotten and wiped while the send still waits
    forgetDeviceState(isDeviceKey);
    for (const k of [...storage.keys()]) if (isDeviceKey(k)) storage.delete(k);
    server.sends[0]!.d.reject(new Error("JWT expired")); // the account is gone: the send fails
    await settle();
    await wait(300);
    await settle();
    expect(valueOf(r).queue).toEqual([]);
    expect(storage.get("octo.outbox.v1") ?? "").not.toContain("of the deleted person");
    // no reload of the wiped company's cache before the sign-out either (review #231 №6)
    const loadsBefore = server.loads.length;
    void (valueOf(r) as unknown as { refresh: () => Promise<void> }).refresh();
    await settle();
    expect(server.loads.length).toBe(loadsBefore);
    // the next person signs in on this phone: nothing of the deleted one is sent in their company
    signOut();
    r.rerender({ children: null });
    await settle();
    signIn("u2", "c2");
    r.rerender({ children: null });
    await settle();
    await wait(1700);
    await settle();
    expect(server.sends.filter((s) => s.userId === "u2")).toEqual([]);
  });
});
