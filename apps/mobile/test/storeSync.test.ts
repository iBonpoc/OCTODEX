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
vi.mock("@/data/appActive", () => ({ onAppActive: (cb: () => void) => ((appActive.cb = cb), () => (appActive.cb = null)) }));
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
  online: boolean;
  link: "ok" | "offline" | "server";
  setOnline: (v: boolean) => number;
};
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
let root: Root<P> | null = null;

beforeEach(() => {
  storage.clear();
  server.loads.length = 0;
  server.sends.length = 0;
  server.points.length = 0;
  server.renewed = 0;
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
    server.sends[0]!.d.reject(refusal()); // u1's send fails after u2 signed in
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
    server.sends[0]!.d.reject(refusal());
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

describe("unit:storeSync — no network in the cloud: the op is never dropped (rule 6, cloud e2e 104)", () => {
  it("20 network failures in a row: the op stays whole, its tries untouched; the server answers — it leaves", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    answerLoads();
    await settle();
    valueOf(r).removeCalendarEvent("saved-offline");
    for (let i = 0; i < 20; i++) {
      valueOf(r).setOnline(true); // a flush now (the tick does the same every 1.5 s)
      await settle();
      const s = server.sends.at(-1)!;
      expect((s.op as { id: string }).id).toBe("saved-offline");
      s.d.reject(new TypeError(i % 2 ? "Failed to fetch" : "Network request failed"));
      await settle();
    }
    expect(server.sends).toHaveLength(20);
    expect(valueOf(r).queue).toHaveLength(1);
    expect(valueOf(r).online).toBe(false); // the server is not answering: shown as «без сети»
    expect(valueOf(r).link).toBe("offline"); // no answer at all — not «server unavailable»
    await wait(300);
    expect(stored().map((x) => [x.id, x.tries])).toEqual([[stored()[0]!.id, 0]]);
    valueOf(r).setOnline(true);
    await settle();
    server.sends.at(-1)!.d.resolve();
    await settle();
    expect(valueOf(r).queue).toEqual([]);
    expect(valueOf(r).online).toBe(true);
  });
  it("after a network failure the next try waits for its pause; the browser's «online» ends it", async () => {
    const net = new EventTarget(); // the browser's window events (node has none)
    const g = globalThis as unknown as Record<string, unknown>;
    g.addEventListener = net.addEventListener.bind(net);
    g.removeEventListener = net.removeEventListener.bind(net);
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    answerLoads();
    await settle();
    valueOf(r).removeCalendarEvent("waits");
    valueOf(r).setOnline(true);
    await settle();
    retry.pause = 60_000;
    server.sends.at(-1)!.d.reject(new TypeError("Failed to fetch"));
    await settle();
    valueOf(r).setOnline(true); // asked again at once: still in the pause
    await settle();
    expect(server.sends).toHaveLength(1);
    expect(valueOf(r).queue).toHaveLength(1);
    // the network is back (the browser's «online»): the pause is over, the op goes now
    net.dispatchEvent(new Event("online"));
    await settle();
    expect(server.sends).toHaveLength(2);
    retry.pause = 0;
    root?.unmount();
    root = null;
    delete g.addEventListener;
    delete g.removeEventListener;
  });
  it("503 ten times in a row (a Supabase hiccup): the op stays whole, its tries untouched; the server answers — it leaves", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    answerLoads();
    await settle();
    valueOf(r).removeCalendarEvent("during-503");
    for (let i = 0; i < 10; i++) {
      valueOf(r).setOnline(true);
      await settle();
      server.sends.at(-1)!.d.reject(i % 3 === 2 ? notNow(429) : i % 3 === 1 ? notNow(400, "40001") : notNow(503));
      await settle();
    }
    expect(server.sends).toHaveLength(10);
    expect(valueOf(r).queue).toHaveLength(1);
    // the network is there, the server says «not now»: «server unavailable», not «no network» (docs/specs/23 §3)
    expect(valueOf(r).link).toBe("server");
    expect(valueOf(r).online).toBe(false);
    await wait(300);
    expect(stored()[0]!.tries).toBe(0);
    valueOf(r).setOnline(true);
    await settle();
    server.sends.at(-1)!.d.resolve();
    await settle();
    expect(valueOf(r).queue).toEqual([]);
    expect(valueOf(r).link).toBe("ok");
  });
  it("an expired sign-in (401 / PGRST301): not a try — the session is renewed, then the op goes", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    answerLoads();
    await settle();
    valueOf(r).removeCalendarEvent("jwt");
    valueOf(r).setOnline(true);
    await settle();
    server.sends.at(-1)!.d.reject(notNow(401, "PGRST301"));
    await settle();
    expect(server.renewed).toBe(1);
    expect(valueOf(r).queue).toHaveLength(1);
    // back in the app (the phone has no «online»): the pause is over, the op goes
    retry.pause = 60_000;
    valueOf(r).setOnline(true);
    await settle();
    server.sends.at(-1)!.d.reject(new TypeError("Network request failed"));
    await settle();
    const before = server.sends.length;
    appActive.cb?.();
    await settle();
    retry.pause = 0;
    expect(server.sends.length).toBe(before + 1);
    server.sends.at(-1)!.d.resolve();
    await settle();
    expect(valueOf(r).queue).toEqual([]);
  });
  it("a reload without the network: shown as «без сети» (online false)", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads.splice(0).forEach((d) => d.reject(new TypeError("Failed to fetch")));
    await settle();
    expect(valueOf(r).online).toBe(false);
    expect(valueOf(r).link).toBe("offline");
    void valueOf(r).refresh();
    await settle();
    answerLoads();
    await settle();
    expect(valueOf(r).online).toBe(true);
    expect(valueOf(r).link).toBe("ok");
  });
  it("a reload the server answers with 503 / PGRST002: «server unavailable»; a refusal (42501) is neither", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    server.loads.splice(0).forEach((d) => d.reject(notNow(503, "PGRST002")));
    await settle();
    expect(valueOf(r).link).toBe("server");
    expect(valueOf(r).online).toBe(false);
    void valueOf(r).refresh();
    await settle();
    server.loads.splice(0).forEach((d) => d.reject(refusal()));
    await settle();
    expect(valueOf(r).link).toBe("server"); // a «no» says nothing about the link: unchanged
    void valueOf(r).refresh();
    await settle();
    answerLoads();
    await settle();
    expect(valueOf(r).link).toBe("ok");
  });
  it("the demo switch «без сети»: link offline", async () => {
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    expect(valueOf(r).link).toBe("ok");
    valueOf(r).setOnline(false);
    await settle();
    expect(valueOf(r).link).toBe("offline");
  });
  it("a real refusal (42501) five times drops the op — and only then", async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    answerLoads();
    await settle();
    valueOf(r).removeCalendarEvent("refused");
    await settle();
    for (let i = 0; i < 5; i++) {
      expect(valueOf(r).queue).toHaveLength(1); // still there before the 5th «no»
      valueOf(r).setOnline(true);
      await settle();
      server.sends.at(-1)!.d.reject(refusal());
      await settle();
    }
    expect(valueOf(r).queue).toEqual([]);
    expect(server.sends).toHaveLength(5);
  });
});

describe("unit:storeSync — the wipe and the outbox's own timing (review #244)", () => {
  it("a wipe while the outbox is still loading (the start repeat) is applied to what the load brings", async () => {
    seedOutbox(owned(u1c1, 1), owned({ userId: "u9", companyId: "c1" }, 1));
    root = render(StoreProvider as (p: P) => unknown, { children: null }); // the read of the outbox is on its way
    forgetDeviceState(wipedOnDelete, { userId: "u1" });
    await settle();
    await wait(300);
    expect(stored().map((x) => x.id)).toEqual(["o-u9@c1#1"]);
  });
  it("«whose is not known» (null) never means the person signed in now: their ops stay", async () => {
    seedOutbox(owned({ userId: "u2", companyId: "c1" }, 1), owned(null, 1));
    signIn("u2", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    // the adoption gave the ownerless op to u2 first; then an old "1" wipe repeat (whose: not known)
    forgetDeviceState(wipedOnDelete, { userId: null });
    await settle();
    await wait(300);
    expect(stored().map((x) => x.id)).toEqual(["o-u2@c1#1", "o-nobody#1"]);
    expect(valueOf(r).queue).toHaveLength(2);
  });
  it("the wipe of u1 lands on top of u2's adoption that is not applied yet: what u2 adopted stays (onDeviceForgotten is functional)", async () => {
    seedOutbox(owned(null, 1), owned(u1c1, 1));
    signIn("u2", "c1");
    // the wipe comes in the middle of the adoption: the outbox in the ref is still the one before it
    midAdopt.fire = () => forgetDeviceState(wipedOnDelete, { userId: "u1" });
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    await wait(300);
    expect(midAdopt.fire).toBeNull(); // it did fire
    expect(stored().map((x) => [x.id, x.owner?.userId])).toEqual([["o-nobody#1", "u2"]]);
    expect(valueOf(r).queue).toHaveLength(1);
  });
  // task 4 of «Лиды» №9: the adoption of old ops and a wipe that came before the outbox loaded
  it("race: the deleted person is still signed in when the outbox loads — their old ownerless ops are not adopted back", async () => {
    seedOutbox(owned(null, 1), owned(u1c1, 1), owned({ userId: "u9", companyId: "c1" }, 1));
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null })); // the read of the outbox is on its way
    forgetDeviceState(wipedOnDelete, { userId: "u1" });
    await settle();
    await wait(300);
    // the wipe first (the deleted person's and the ownerless), then the adoption — which finds nothing old to take
    expect(stored().map((x) => x.id)).toEqual(["o-u9@c1#1"]);
    expect(valueOf(r).queue).toEqual([]);
  });
  it("race: another person signed in when the outbox loads after a wipe of u1 — the ownerless ops (u1's) are gone, u2 adopts nothing", async () => {
    seedOutbox(owned(null, 1), owned(u1c1, 1), owned({ userId: "u2", companyId: "c1" }, 1));
    signIn("u2", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    forgetDeviceState(wipedOnDelete, { userId: "u1" });
    await settle();
    await wait(300);
    expect(stored().map((x) => x.id)).toEqual(["o-u2@c1#1"]);
    expect(stored()[0]!.owner).toEqual({ userId: "u2", companyId: "c1" });
    expect(valueOf(r).queue).toHaveLength(1);
  });
  it("race: the adoption came first, then the wipe of another person — what u2 adopted stays u2's", async () => {
    seedOutbox(owned(null, 1), owned(u1c1, 1));
    signIn("u2", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    await wait(300);
    expect(stored().find((x) => x.id === "o-nobody#1")?.owner).toEqual({ userId: "u2", companyId: "c1" });
    forgetDeviceState(wipedOnDelete, { userId: "u1" });
    await settle();
    await wait(300);
    expect(stored().map((x) => x.id)).toEqual(["o-nobody#1"]);
    expect(valueOf(r).queue).toHaveLength(1);
  });
});


// ---------------------------------------------------------------- docs/specs/23 §3: an op the server keeps answering with an error
describe("unit:storeSync — the server's error for one op does not hold the others (docs/specs/23 §3)", () => {
  const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const AGO = new Date(Date.now() - 60_000).toISOString();
  const q = (id: string, op: object, extra: object = {}) => ({ id, op, at: AGO, tries: 0, owner: u1c1, ...extra });
  const ev = (id: string, n: number, extra: object = {}) => q(id, { k: "calendarEvent.remove", id: U(n) }, extra);
  type S = { id: string; tries: number; fails?: number; failSince?: string; stuck?: true; error?: string };
  const st = () => stored() as unknown as S[];
  const sentIds = () => server.sends.map((s) => (s.op as { id: string }).id);
  const timeout = (code = "57014") => notNow(500, code);
  type V = Value & { link: string; stuckOps: { id: string; kind: string; waiting: number }[]; retryOp: (id: string) => void; discardOp: (id: string) => void };
  const start = async () => {
    signIn("u1", "c1");
    const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
    await settle();
    answerLoads();
    await settle();
    return r;
  };
  const v = (r: Root<P>) => valueOf(r) as unknown as V;
  const pass = async (r: Root<P>) => {
    v(r).setOnline(true);
    await settle();
  };

  it("X gets a timeout (57014): an op that does not need it goes in the same pass; X stays, not a try; the link is fine", async () => {
    seedOutbox(ev("X", 1), ev("Y", 2));
    const r = await start();
    await pass(r);
    expect(sentIds()).toEqual([U(1)]);
    server.sends[0]!.d.reject(timeout());
    await settle();
    expect(sentIds()).toEqual([U(1), U(2)]); // Y without waiting for X
    server.sends[1]!.d.resolve();
    await settle();
    await wait(300);
    expect(st().map((x) => [x.id, x.tries, x.fails])).toEqual([["X", 0, 1]]);
    expect(v(r).link).toBe("ok");
  });
  it("an op that shares an id with X waits; one after it that does not, goes", async () => {
    seedOutbox(ev("X", 1), q("Y", { k: "customer.tags", id: U(1), tagIds: [] }), ev("Z", 3));
    const r = await start();
    await pass(r);
    server.sends[0]!.d.reject(timeout("XX000"));
    await settle();
    expect(sentIds()).toEqual([U(1), U(3)]);
  });
  it("a barrier (company settings) behind X does not go, nor anything after it", async () => {
    seedOutbox(ev("X", 1), q("B", { k: "company.save", company: {} }), ev("Z", 3));
    const r = await start();
    await pass(r);
    server.sends[0]!.d.reject(timeout());
    await settle();
    expect(sentIds()).toEqual([U(1)]);
  });
  it("Y gets a 500 too: the server as a whole — «server unavailable», the queue pauses, both stay, no tries", async () => {
    seedOutbox(ev("X", 1), ev("Y", 2), ev("Z", 3));
    const r = await start();
    await pass(r);
    server.sends[0]!.d.reject(notNow(500));
    await settle();
    server.sends[1]!.d.reject(notNow(500));
    await settle();
    expect(sentIds()).toEqual([U(1), U(2)]); // Z not tried in this pass
    expect(v(r).link).toBe("server");
    await wait(300);
    expect(st().map((x) => [x.id, x.tries])).toEqual([["X", 0], ["Y", 0], ["Z", 0]]);
  });
  it("PGRST002 (the database is not reachable): the whole server at once — Y is not tried", async () => {
    seedOutbox(ev("X", 1), ev("Y", 2));
    const r = await start();
    await pass(r);
    server.sends[0]!.d.reject(notNow(503, "PGRST002"));
    await settle();
    expect(sentIds()).toEqual([U(1)]);
    expect(v(r).link).toBe("server");
    await wait(300);
    expect(st()[0]!.fails).toBeUndefined(); // the server's outage is not this op's: it never becomes «stuck» for it
  });
  it("no network: «offline», nothing is skipped", async () => {
    seedOutbox(ev("X", 1), ev("Y", 2));
    const r = await start();
    await pass(r);
    server.sends[0]!.d.reject(new TypeError("Failed to fetch"));
    await settle();
    expect(sentIds()).toEqual([U(1)]);
    expect(v(r).link).toBe("offline");
  });
  it("a refusal of Y (after X was skipped) is Y's try only", async () => {
    seedOutbox(ev("X", 1), ev("Y", 2));
    const r = await start();
    await pass(r);
    server.sends[0]!.d.reject(timeout());
    await settle();
    server.sends[1]!.d.reject(refusal());
    await settle();
    await wait(300);
    expect(st().map((x) => [x.id, x.tries])).toEqual([["X", 0], ["Y", 1]]);
  });

  it("10 minutes and the third error: «stuck» — shown with what waits for it, tried again only later", async () => {
    const since = new Date(Date.now() - 11 * 60_000).toISOString();
    seedOutbox(ev("X", 1, { fails: 2, failSince: since }), q("W", { k: "customer.tags", id: U(1), tagIds: [] }), ev("Z", 3));
    const r = await start();
    await pass(r);
    server.sends[0]!.d.reject(timeout());
    await settle();
    server.sends[1]!.d.resolve(); // Z
    await settle();
    await wait(300);
    expect(st().find((x) => x.id === "X")).toMatchObject({ fails: 3, failSince: since, stuck: true, tries: 0 });
    expect(v(r).stuckOps).toEqual([expect.objectContaining({ id: "X", kind: "calendarEvent.remove", waiting: 1 })]);
    const before = server.sends.length;
    await pass(r);
    expect(server.sends.length).toBe(before); // its 5-minute pause: not tried at once
  });
  it("only stuck ops (and what waits for them) left: the reload is not held — the phone sees the server again", async () => {
    seedOutbox(ev("X", 1, { fails: 3, failSince: new Date(Date.now() - 20 * 60_000).toISOString(), stuck: true }), q("W", { k: "customer.tags", id: U(1), tagIds: [] }));
    const r = await start();
    // the start reload (stuck X tried once: a timeout again)
    await pass(r);
    server.sends.at(-1)?.d.reject(timeout());
    await settle();
    const loads = server.loads.length;
    void v(r).refresh();
    await settle();
    expect(server.loads.length).toBe(loads + 1);
    await wait(300);
    expect(st().map((x) => x.id)).toEqual(["X", "W"]); // the ops stay (rule 6)
  });
  it("an op that can still go holds the reload, as before", async () => {
    seedOutbox(ev("X", 1, { stuck: true, fails: 3, failSince: AGO }), ev("Y", 2));
    const r = await start();
    const loads = server.loads.length;
    void v(r).refresh();
    await settle();
    expect(server.loads.length).toBe(loads);
  });
  it("«Повторить сейчас»: sent at once, and gone when the server takes it", async () => {
    seedOutbox(ev("X", 1, { stuck: true, fails: 3, failSince: AGO }));
    const r = await start();
    await pass(r);
    server.sends.at(-1)!.d.reject(timeout());
    await settle();
    const before = server.sends.length;
    v(r).retryOp("X");
    await settle();
    expect(server.sends.length).toBe(before + 1);
    server.sends.at(-1)!.d.resolve();
    await settle();
    await wait(300);
    expect(st()).toEqual([]);
    expect(v(r).stuckOps).toEqual([]);
  });
  it("«Отменить изменение…»: the op and what waits for it leave; another person's ops stay; then a reload", async () => {
    seedOutbox(
      ev("X", 1, { stuck: true, fails: 3, failSince: AGO }),
      q("W", { k: "customer.tags", id: U(1), tagIds: [] }),
      q("T", { k: "calendarEvent.remove", id: U(1) }, { owner: { userId: "u2", companyId: "c1" } }),
    );
    const r = await start();
    const loads = server.loads.length;
    v(r).discardOp("X");
    await settle();
    await wait(300);
    expect(st().map((x) => x.id)).toEqual(["T"]);
    expect(server.loads.length).toBeGreaterThan(loads);
  });
  it("after a restart two stuck ops fail again: not «server unavailable», and the next op still goes", async () => {
    const st2 = { stuck: true, fails: 3, failSince: AGO };
    seedOutbox(ev("X", 1, st2), ev("Y", 2, st2), ev("Z", 3));
    const r = await start();
    await pass(r);
    server.sends[0]!.d.reject(timeout());
    await settle();
    server.sends[1]!.d.reject(timeout());
    await settle();
    expect(sentIds()).toEqual([U(1), U(2), U(3)]);
    expect(v(r).link).toBe("ok");
  });
  it("an older version's item (no failSince / fails) loads and goes as before", async () => {
    seedOutbox({ id: "old", op: { k: "calendarEvent.remove", id: U(9) }, at: AGO, tries: 0 });
    const r = await start();
    await pass(r);
    server.sends.at(-1)!.d.resolve();
    await settle();
    await wait(300);
    expect(st()).toEqual([]);
  });
});
