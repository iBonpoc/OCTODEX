/**
 * unit:membershipStore (#1633 A2) — StoreProvider when the person's role changes or they are removed from a company:
 * the cache records the role it was read with; another role → the next read keeps nothing of the role before; «no
 * rights» (42501) spends no try until the memberships are read again; a removed company's ops do not hold the account
 * deletion. Harness as test/storeSync.test.ts (miniReact; the server and the sign-in are stand-ins).
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
const auth = {
  ready: true,
  session: null as object | null,
  company: null as { companyId: string; role: string; companyName: string } | null,
  userId: null as string | null,
  memberships: [] as { companyId: string; role: string; companyName: string }[],
  membershipsFor: null as string | null,
  membershipStamp: 0,
  membershipCheckedAt: null as number | null,
  accessDenied: vi.fn(),
};
vi.mock("@/cloud/auth", () => ({ useAuth: () => auth }));
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
};
const server = { loads: [] as Deferred<unknown>[], sends: [] as { op: unknown; d: Deferred<void> }[] };
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
  applyOp: (op: unknown) => {
    const d = deferred<void>();
    server.sends.push({ op, d });
    return d.promise;
  },
  renewSession: async () => {},
}));
vi.mock("@/cloud/outboxTiming", () => ({ SEND_AFTER_MS: 0, readyToSend: () => true }));
vi.mock("@/data/appActive", () => ({ onAppActive: () => () => {}, onAppLeave: () => () => {} }));
vi.mock("@/data/outboxRetry", async (orig) => ({ ...(await orig<object>()), backoffMs: () => 0 }));

import { render, settle, type Root } from "./support/miniReact";
import { StoreProvider } from "../src/data/store";
import { makeSeed } from "../src/data/seed";
import { appRoles } from "../src/cloud/repo";
import type { DbRole } from "../src/cloud/membershipSync";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const KEY = "octo.cloud.v1.c1.u1";
const signIn = (role: DbRole) => Object.assign(auth, { session: {}, userId: "u1", company: { companyId: "c1", role, companyName: "Co" } });
type Value = { db: { costHistory?: unknown[] }; queue: unknown[]; unsentAll: number; refresh: () => Promise<void> };
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
let root: Root<P> | null = null;
/** the company as the server gives it to `role` (my own row says that role) */
const companyFor = (role: DbRole) => {
  const d = makeSeed();
  return { ...d, me: "u1", costsVisible: true, costHistory: [], members: [{ id: "u1", name: "Me", initials: "M", kind: role === "subcontractor" ? "sub" : "employee", roles: appRoles(role), isOwner: role === "owner" }] };
};
const record = () => JSON.parse(storage.get(KEY) ?? "{}") as { role?: string; db?: { costHistory?: unknown[] } };
const OLD = [{ id: "h1", note: "seen by the owner" }];

beforeEach(() => {
  storage.clear();
  server.loads.length = 0;
  server.sends.length = 0;
  Object.assign(auth, { session: null, company: null, userId: null, memberships: [], membershipsFor: null, membershipStamp: 0, membershipCheckedAt: null });
  auth.accessDenied = vi.fn();
});
afterEach(() => {
  root?.unmount();
  root = null;
});

describe("unit:membershipStore — the role the cache was read with (#1633 A2)", () => {
  it("is written with the record; the same role keeps what the phone read (cost history)", async () => {
    storage.set(KEY, JSON.stringify({ day: "cloud", db: { ...companyFor("owner"), costHistory: OLD }, role: "owner" }));
    signIn("owner");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads[0]!.resolve(companyFor("owner"));
    await settle();
    await wait(400);
    expect(valueOf(r).db.costHistory).toEqual(OLD);
    expect(record().role).toBe("owner");
    expect(auth.accessDenied).not.toHaveBeenCalled();
  });

  it("a record of the role before found on the start: the read keeps nothing of it; the record keeps that role until it lands", async () => {
    storage.set(KEY, JSON.stringify({ day: "cloud", db: { ...companyFor("owner"), costHistory: OLD }, role: "owner" }));
    signIn("tech");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    expect(record().role).toBe("owner"); // killed now: the next start asks again
    server.loads[0]!.resolve(companyFor("tech"));
    await settle();
    await wait(400);
    expect(valueOf(r).db.costHistory).toEqual([]);
    expect(record().role).toBe("tech");
    expect(record().db?.costHistory).toEqual([]);
  });

  it("the role changes while the app runs: the next read keeps nothing of the role before; a read asked with the old role is dropped", async () => {
    storage.set(KEY, JSON.stringify({ day: "cloud", db: { ...companyFor("owner"), costHistory: OLD }, role: "owner" }));
    signIn("owner");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads[0]!.resolve(companyFor("owner"));
    await settle();
    await wait(400);
    expect(valueOf(r).db.costHistory).toEqual(OLD);
    void valueOf(r).refresh(); // asked as the owner…
    await settle();
    const asOwner = server.loads.length - 1;
    signIn("tech"); // …the role changed before it answered (the store reads again as the tech by itself)
    r.rerender({ children: null });
    await settle();
    const asTech = server.loads.length - 1;
    expect(asTech).toBeGreaterThan(asOwner);
    server.loads[asOwner]!.resolve({ ...companyFor("owner"), costHistory: OLD });
    await settle();
    await wait(400);
    expect(record().role).toBe("owner"); // not this role's truth: not taken
    server.loads[asTech]!.resolve(companyFor("tech"));
    await settle();
    await wait(400);
    expect(valueOf(r).db.costHistory).toEqual([]);
    expect(record().role).toBe("tech");
  });

  it("the company's own read shows me gone or with another role: the memberships are read again; the answer is not taken until then", async () => {
    storage.set(KEY, JSON.stringify({ day: "cloud", db: { ...companyFor("owner"), costHistory: OLD }, role: "owner" }));
    signIn("owner");
    auth.membershipStamp = 1;
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads[0]!.resolve({ ...companyFor("owner"), members: [], customers: [] });
    await settle();
    await wait(400);
    expect(auth.accessDenied).toHaveBeenCalledTimes(1);
    expect(record().db?.costHistory).toEqual(OLD); // no empty company written over the cache
    expect(valueOf(r).db.costHistory).toEqual(OLD);
    // read again and still here with that role (the server's company read is what it is): taken now
    auth.membershipStamp = 2;
    r.rerender({ children: null });
    void valueOf(r).refresh();
    await settle();
    server.loads[server.loads.length - 1]!.resolve({ ...companyFor("owner"), members: [] });
    await settle();
    await wait(400);
    expect(valueOf(r).db.costHistory).toEqual(OLD); // same role: what the phone read is kept, the answer is taken
    expect(server.loads.length).toBeGreaterThan(1);
  });
});

describe("unit:membershipStore — «no rights» (42501) and a removed company's ops (#1633 A2)", () => {
  const denied = () => Object.assign(new Error("new row violates row-level security policy"), { name: "PermanentError", status: 403, code: "42501" });
  const at = new Date(Date.now() - 60_000).toISOString();
  const outbox = () => JSON.parse(storage.get("octo.outbox.v1") ?? "[]") as { id: string; tries: number }[];

  it("no try is spent until a confirmed answer comes after the refusal; then a «no» like any other", { timeout: 20_000 }, async () => {
    storage.set("octo.outbox.v1", JSON.stringify([{ id: "o1", op: { k: "lead.update", id: "l1", cols: { notes: "x" } }, at, tries: 0, owner: { userId: "u1", companyId: "c1" } }]));
    signIn("owner");
    auth.membershipStamp = 1;
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    await wait(1700);
    await settle();
    expect(server.sends).toHaveLength(1);
    server.sends[0]!.d.reject(denied());
    await settle();
    await wait(300);
    expect(auth.accessDenied).toHaveBeenCalled();
    expect(outbox()[0]?.tries).toBe(0);
    // refused again before the memberships were read again: still no try
    await wait(1700);
    await settle();
    server.sends[server.sends.length - 1]!.d.reject(denied());
    await settle();
    await wait(300);
    expect(outbox()[0]?.tries).toBe(0);
    // read again, still in the company (the stamp grew): the next refusal is a try
    auth.membershipStamp = 2;
    r.rerender({ children: null });
    await settle();
    await wait(1700);
    await settle();
    server.sends[server.sends.length - 1]!.d.reject(denied());
    await settle();
    await wait(300);
    expect(outbox()[0]?.tries).toBe(1);
    // the next refusal is a try too — no new wait for another answer (code-reviewer №1)
    await wait(1700);
    await settle();
    server.sends[server.sends.length - 1]!.d.reject(denied());
    await settle();
    await wait(300);
    expect(outbox()[0]?.tries).toBe(2);
  });

  it("the memberships were just read again on a signal and I am still here: a refusal is a try at once (e2e 118)", { timeout: 20_000 }, async () => {
    storage.set("octo.outbox.v1", JSON.stringify([{ id: "o1", op: { k: "lead.update", id: "l1", cols: { notes: "x" } }, at, tries: 0, owner: { userId: "u1", companyId: "c1" } }]));
    signIn("owner");
    Object.assign(auth, { membershipStamp: 2, membershipCheckedAt: Date.now() - 1_000 });
    root = render(StoreProvider as (p: P) => unknown, { children: null });
    await settle();
    await wait(1700);
    await settle();
    server.sends[0]!.d.reject(denied());
    await settle();
    await wait(300);
    expect(outbox()[0]?.tries).toBe(1);
  });

  it("the ops of a company the server confirmed I left do not count for the deletion (they stay on the phone); unconfirmed — all count", async () => {
    storage.set(
      "octo.outbox.v1",
      JSON.stringify([
        { id: "a", op: { k: "x" }, at, tries: 0, owner: { userId: "u1", companyId: "c1" } },
        { id: "b", op: { k: "x" }, at, tries: 0, owner: { userId: "u1", companyId: "c2" } },
      ]),
    );
    signIn("owner");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    expect(valueOf(r).unsentAll).toBe(2);
    Object.assign(auth, { memberships: [{ companyId: "c1", role: "owner", companyName: "Co" }], membershipsFor: "u1" });
    r.rerender({ children: null });
    await settle();
    expect(valueOf(r).unsentAll).toBe(1);
    expect(outbox().map((o) => o.id).sort()).toEqual(["a", "b"]);
  });
});
