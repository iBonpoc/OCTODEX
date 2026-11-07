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
const server = {
  loads: [] as Deferred<unknown>[],
  sends: [] as { op: unknown; companyId: string; userId: string; d: Deferred<void> }[],
  points: [] as Deferred<string>[],
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
  sendVisitPoint: () => {
    const d = deferred<string>();
    server.points.push(d);
    return d.promise;
  },
}));
// the «Отменить» window is not what these tests are about: an op is ready at once
vi.mock("@/cloud/outboxTiming", () => ({ SEND_AFTER_MS: 0, readyToSend: () => true }));

import { render, settle, type Root } from "./support/miniReact";
import { mineOf, StoreProvider } from "../src/data/store";
import { forgetDeviceState } from "../src/data/persist";
import { makeSeed } from "../src/data/seed";
import { isDeviceKey } from "../src/features/deleteAccount";
import { wipedOnDelete } from "../src/data/outboxOwner";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const signIn = (userId: string, companyId: string) => Object.assign(auth, { session: {}, userId, company: { companyId, role: "owner", companyName: "Co" } });
const signOut = () => Object.assign(auth, { session: null, userId: null, company: null });
type Value = {
  db: { customers: { name: string }[] };
  queue: unknown[];
  mode: string;
  refresh: () => Promise<void>;
  removeCalendarEvent: (id: string) => () => void;
  recordVisitPoint: (p: object, source: "status_change" | "foreground") => void;
  unsentAll: number;
};
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
let root: Root<P> | null = null;

beforeEach(() => {
  storage.clear();
  server.loads.length = 0;
  server.sends.length = 0;
  server.points.length = 0;
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
  it("the deleted person's op is not put back and never reaches the next person's company", { timeout: 15_000 }, async () => {
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
    forgetDeviceState(wipedOnDelete);
    for (const k of [...storage.keys()]) if (isDeviceKey(k)) storage.delete(k);
    server.sends[0]!.d.reject(new Error("JWT expired")); // the account is gone: the send fails
    await settle();
    await wait(300);
    await settle();
    expect(valueOf(r).queue).toEqual([]);
    expect(storage.get("octo.outbox.v1") ?? "").not.toContain("of the deleted person");
    // no reload of the wiped company's cache before the sign-out either (review #231 №6)
    const loadsBefore = server.loads.length;
    void valueOf(r).refresh();
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

/** sign in / out and let the store settle (the outbox tick is 1.5 s) */
async function as(r: Root<P>, userId: string | null, companyId?: string) {
  if (userId) signIn(userId, companyId!);
  else signOut();
  r.rerender({ children: null });
  await settle();
}
const answerLoads = () => server.loads.splice(0).forEach((d) => d.resolve(makeSeed()));

describe("unit:storeSync — after the wipe, the next person of the SAME company (review #231, №1 of the next PR)", () => {
  it("their change is sent: the block of the wiped key ends with the sign-out", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    answerLoads();
    forgetDeviceState(wipedOnDelete);
    await as(r, null);
    await as(r, "u2", "c1");
    answerLoads();
    await settle();
    valueOf(r).removeCalendarEvent("ev-1");
    await wait(1700);
    await settle();
    expect(server.sends.map((x) => [x.userId, x.companyId, (x.op as { k: string }).k])).toEqual([["u2", "c1", "calendarEvent.remove"]]);
  });
});

describe("unit:storeSync — a point answered «off» after the wipe (review #231, №2)", () => {
  it("does not write the wiped company's cache back", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    answerLoads();
    await settle();
    await wait(300);
    valueOf(r).recordVisitPoint({ visitId: "v1", userId: "u1", lat: 34.1, lng: -118.1, at: new Date().toISOString() }, "foreground");
    expect(server.points).toHaveLength(1);
    forgetDeviceState(wipedOnDelete);
    for (const k of [...storage.keys()]) if (isDeviceKey(k)) storage.delete(k);
    server.points[0]!.resolve("off"); // the server no longer takes points: the account is gone
    await settle();
    await wait(300);
    await settle();
    expect(storage.has("octo.cloud.v1.c1")).toBe(false);
    expect(server.loads).toHaveLength(0); // and no reload of the wiped company either
  });
});

describe("unit:storeSync — a plain sign-out leaves the outbox: whose op is it (review #231, №3)", () => {
  it("the next person never sends it in their company; it waits and goes when its owner is back", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    answerLoads();
    valueOf(r).removeCalendarEvent("ev-of-u1");
    await wait(1700);
    await settle();
    expect(server.sends).toHaveLength(1);
    server.sends[0]!.d.reject(new Error("Failed to fetch")); // no network: it stays in the outbox
    await settle();
    await as(r, null); // a plain sign-out: the outbox stays on the phone
    await as(r, "u2", "c2");
    answerLoads();
    expect(valueOf(r).queue).toEqual([]); // not shown as theirs
    // their own change and «Отменить»: the count and the undo are theirs only; the other person's op stays
    const undo = valueOf(r).removeCalendarEvent("ev-of-u2");
    await settle();
    expect(valueOf(r).queue).toHaveLength(1);
    undo();
    await settle();
    expect(valueOf(r).queue).toEqual([]);
    await wait(1700);
    await settle();
    expect(server.sends.filter((x) => x.userId === "u2")).toEqual([]);
    expect(storage.get("octo.outbox.v1") ?? "").toContain("ev-of-u1"); // not lost
    await as(r, null);
    await as(r, "u1", "c1");
    await wait(1700);
    await settle();
    const back = server.sends.filter((x) => x.userId === "u1");
    expect(back.map((x) => [x.companyId, (x.op as { id: string }).id])).toEqual([["c1", "ev-of-u1"], ["c1", "ev-of-u1"]]);
  }, 15_000);
  it("mineOf: the owner's ops in this company, in order; ops of older versions (no owner) go as before", () => {
    const at = new Date().toISOString();
    const items = [
      { id: "a", op: { k: "x" }, at, tries: 0, owner: { userId: "u1", companyId: "c1" } },
      { id: "b", op: { k: "x" }, at, tries: 0, owner: { userId: "u2", companyId: "c1" } },
      { id: "c", op: { k: "x" }, at, tries: 0 },
      { id: "d", op: { k: "x" }, at, tries: 0, owner: { userId: "u1", companyId: "c2" } },
      { id: "e", op: { k: "x" }, at, tries: 0, owner: { userId: "u1", companyId: "c1" } },
    ] as unknown as Parameters<typeof mineOf>[0];
    expect(mineOf(items, { userId: "u1", companyId: "c1" }).map((x) => x.id)).toEqual(["a", "c", "e"]);
    expect(mineOf(items, { userId: "u2", companyId: "c1" }).map((x) => x.id)).toEqual(["b", "c"]);
    expect(mineOf(items, null)).toEqual([]);
  });
});

describe("unit:storeSync — someone deletes their account on a shared phone (review #240)", () => {
  it("the other person's unsent op stays in memory and on the phone, and goes when they are back", { timeout: 15_000 }, async () => {
    const at = new Date().toISOString();
    storage.set("octo.outbox.v1", JSON.stringify([{ id: "o9", op: { k: "calendarEvent.remove", id: "ev-of-u9" }, at, tries: 0, owner: { userId: "u9", companyId: "c1" } }]));
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    answerLoads();
    valueOf(r).removeCalendarEvent("ev-of-u1");
    await settle();
    expect(valueOf(r).queue).toHaveLength(1); // u1 sees only theirs
    forgetDeviceState(wipedOnDelete); // u1 deletes their account
    await settle();
    expect(valueOf(r).queue).toEqual([]);
    await wait(300);
    const kept = storage.get("octo.outbox.v1") ?? "";
    expect(kept).toContain("ev-of-u9");
    expect(kept).not.toContain("ev-of-u1");
    await as(r, null);
    await as(r, "u9", "c1");
    await wait(1700);
    await settle();
    expect(server.sends.filter((x) => x.userId === "u9").map((x) => (x.op as { id: string }).id)).toContain("ev-of-u9");
  });
});

/* ---------- review #240: the send is for its owner, whoever signs in meanwhile ---------- */
type Who = { userId: string; companyId: string };
/** an op whose id tells its owner ("u1@c2#1"): every send must go to that person and company */
const owned = (who: Who | null, n: number, extra: object = {}) => {
  const id = `${who ? `${who.userId}@${who.companyId}` : "nobody"}#${n}`;
  return { id: `o-${id}`, op: { k: "calendarEvent.remove", id }, at: new Date(Date.now() - 60_000).toISOString(), tries: 0, ...(who ? { owner: who } : {}), ...extra };
};
const seedOutbox = (...items: object[]) => storage.set("octo.outbox.v1", JSON.stringify(items));
const stored = () => JSON.parse(storage.get("octo.outbox.v1") ?? "[]") as { id: string; tries: number; owner?: Who }[];
/** every send went to the owner its op names */
const sentRight = () =>
  server.sends.every((x) => !(x.op as { id: string }).id.includes("@") || (x.op as { id: string }).id.startsWith(`${x.userId}@${x.companyId}#`));
const u1c1 = { userId: "u1", companyId: "c1" };
const u1c2 = { userId: "u1", companyId: "c2" };

describe("unit:storeSync — the company or the person changes while a send waits (review #240 №1)", () => {
  it("another company: its op goes to its own company, never to the one the send began in", { timeout: 15_000 }, async () => {
    seedOutbox(owned(u1c1, 1), owned(u1c2, 1));
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    await wait(1700);
    await settle();
    expect(server.sends.map((x) => (x.op as { id: string }).id)).toEqual(["u1@c1#1"]);
    await as(r, "u1", "c2"); // switched company while c1's op is on the way
    server.sends[0]!.d.resolve(); // c1 answers: done
    await settle();
    await wait(1700);
    await settle();
    expect(server.sends.map((x) => (x.op as { id: string }).id)).toEqual(["u1@c1#1", "u1@c2#1"]);
    expect(sentRight()).toBe(true);
    expect(stored().map((x) => x.id)).toEqual(["o-u1@c2#1"]); // c1's left the outbox, c2's is on the way
  });
  it("another person: their op is never sent under the first one's name (and never dropped as refused)", { timeout: 15_000 }, async () => {
    seedOutbox(owned(u1c1, 1));
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    await wait(1700);
    await settle();
    expect(server.sends).toHaveLength(1);
    await as(r, null);
    await as(r, "u2", "c1");
    answerLoads();
    valueOf(r).removeCalendarEvent("ev-of-u2");
    server.sends[0]!.d.reject(new Error("Failed to fetch")); // u1's send fails after u2 signed in
    await settle();
    await wait(1700);
    await settle();
    expect(server.sends.filter((x) => (x.op as { id: string }).id === "ev-of-u2").every((x) => x.userId === "u2")).toBe(true);
    expect(server.sends.filter((x) => (x.op as { id: string }).id === "ev-of-u2")).toHaveLength(1); // u2's own goes, as u2
    const kept = stored();
    expect(kept.find((x) => x.id === "o-u1@c1#1")?.tries).toBe(1); // u1's op stays with its try counted
  });
});

describe("unit:storeSync — another person's op at the head of the outbox (review #240, tests)", () => {
  it("my op is sent and removed by its id; theirs stays untouched", { timeout: 15_000 }, async () => {
    seedOutbox(owned({ userId: "u9", companyId: "c1" }, 1), owned(u1c1, 1));
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    await wait(1700);
    await settle();
    expect(server.sends.map((x) => (x.op as { id: string }).id)).toEqual(["u1@c1#1"]);
    server.sends[0]!.d.resolve();
    await settle();
    await wait(300);
    expect(stored().map((x) => [x.id, x.tries])).toEqual([["o-u9@c1#1", 0]]);
    void r;
  });
  it("my op fails: its try is counted, theirs keeps its own", { timeout: 15_000 }, async () => {
    seedOutbox(owned({ userId: "u9", companyId: "c1" }, 1), owned(u1c1, 1));
    signIn("u1", "c1");
    root = render(StoreProvider as (p: P) => unknown, { children: null });
    await settle();
    await wait(1700);
    await settle();
    server.sends[0]!.d.reject(new Error("Failed to fetch"));
    await settle();
    await wait(300);
    expect(stored().map((x) => [x.id, x.tries])).toEqual([["o-u9@c1#1", 0], ["o-u1@c1#1", 1]]);
  });
  it("their pending visit step does not hold my point for that visit", async () => {
    seedOutbox(owned({ userId: "u9", companyId: "c1" }, 1, { op: { k: "visit.step", visitId: "v1", id: "u9@c1#step" } }));
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    valueOf(r).recordVisitPoint({ visitId: "v1", userId: "u1", lat: 34.1, lng: -118.1, at: new Date().toISOString() }, "foreground");
    expect(server.points).toHaveLength(1);
  });
});

describe("unit:storeSync — ops of older versions get an owner once (review #240 №3)", () => {
  it("the first person signed in owns them; switching company does not take them along", { timeout: 15_000 }, async () => {
    seedOutbox(owned(null, 1));
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    await wait(300);
    expect(stored()[0]!.owner).toEqual(u1c1);
    server.sends.splice(0).forEach((x) => x.d.reject(new Error("Failed to fetch")));
    await settle();
    await as(r, "u1", "c2");
    await wait(1700);
    await settle();
    expect(server.sends.filter((x) => x.companyId === "c2")).toEqual([]);
  });
});

describe("unit:storeSync — the account deletion counts and removes the person's ops in every company (review #240 №2, №4)", () => {
  it("«не отправлено» for the deletion counts all companies of the person", async () => {
    seedOutbox(owned(u1c1, 1), owned(u1c2, 1), owned({ userId: "u9", companyId: "c1" }, 1));
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    expect(valueOf(r).queue).toHaveLength(1);
    expect(valueOf(r).unsentAll).toBe(2);
  });
  it("the sign-in is already gone from the store (the start check): the wipe still drops the deleted person's ops", async () => {
    seedOutbox(owned(u1c1, 1), owned({ userId: "u9", companyId: "c1" }, 1));
    root = render(StoreProvider as (p: P) => unknown, { children: null }); // demo: nobody signed in
    await settle();
    forgetDeviceState(wipedOnDelete, { userId: "u1" });
    await settle();
    await wait(300);
    expect(stored().map((x) => x.id)).toEqual(["o-u9@c1#1"]);
  });
});

