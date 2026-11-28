/**
 * #3085: a photo of the client (no visit) — the store's addClientFile. Locally at once (offline, rule 6): the file is in db.files
 * before anything is sent; then one op «file.add» with the client; «Вернуть» before it is sent takes the file back and sends
 * nothing (rule 5). The harness is the one of checklistStore.test.ts (miniReact; the server, the sign-in, AsyncStorage stand-ins).
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
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((a) => (resolve = a));
  return { promise, resolve };
};
const server = { loads: [] as Deferred<unknown>[], sends: [] as { op: { k: string } & Record<string, unknown>; d: Deferred<void> }[] };
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
  applyOp: (op: { k: string }) => {
    const d = deferred<void>();
    server.sends.push({ op: op as { k: string } & Record<string, unknown>, d });
    return d.promise;
  },
  renewSession: async () => {},
  sendVisitPoint: () => new Promise(() => {}),
}));
vi.mock("@/cloud/outboxTiming", () => ({ SEND_AFTER_MS: 0, readyToSend: () => true }));
vi.mock("@/data/appActive", () => ({ onAppActive: () => () => {}, onAppLeave: () => () => {} }));
vi.mock("@/data/outboxRetry", async (orig) => ({ ...(await orig<object>()), backoffMs: () => 0 }));

import { render, settle, type Root } from "./support/miniReact";
import { StoreProvider } from "../src/data/store";
import { makeSeed } from "../src/data/seed";
import type { DB } from "../src/data/types";

type Value = { db: DB; mode: string; queue: unknown[]; addClientFile: (customerId: string, uri: string) => () => void };
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
const tick = async () => {
  await wait(1700); // the outbox tick
  await settle();
};
let root: Root<P> | null = null;

async function signedIn(): Promise<Root<P>> {
  Object.assign(auth, { session: {}, userId: "u1", company: { companyId: "c1", role: "owner", companyName: "Co" } });
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  await settle();
  server.loads.splice(0).forEach((d) => d.resolve({ ...makeSeed(), me: "u1" }));
  await settle();
  expect(valueOf(r).mode).toBe("cloud");
  return r;
}
const filesOf = (r: Root<P>) => (valueOf(r).db.files ?? []).filter((f) => f.customerId === "c1");

beforeEach(() => {
  storage.clear();
  server.loads.length = 0;
  server.sends.length = 0;
  Object.assign(auth, { session: null, userId: null, company: null });
});
afterEach(() => {
  root?.unmount();
  root = null;
});

describe("unit:clientFileStore — addClientFile", () => {
  it("on the phone at once (before any send), then one «file.add» with the client and the file", { timeout: 15_000 }, async () => {
    const r = await signedIn();
    valueOf(r).addClientFile("c1", "file:///c.jpg");
    await settle();
    const f = filesOf(r);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: "photo", customerId: "c1", uri: "file:///c.jpg" });
    expect(f[0]!.visitId).toBeUndefined();
    expect(server.sends).toEqual([]);
    expect(valueOf(r).queue.length).toBeGreaterThan(0);
    await tick();
    expect(server.sends.map((s) => s.op)).toEqual([{ k: "file.add", id: f[0]!.id, customerId: "c1", uri: "file:///c.jpg" }]);
  });
  it("«Вернуть» before it is sent: the file is gone and nothing is sent", { timeout: 15_000 }, async () => {
    const r = await signedIn();
    const undo = valueOf(r).addClientFile("c1", "file:///c.jpg");
    await settle();
    expect(filesOf(r)).toHaveLength(1);
    undo();
    await settle();
    expect(filesOf(r)).toEqual([]);
    await tick();
    expect(server.sends).toEqual([]);
  });
});
