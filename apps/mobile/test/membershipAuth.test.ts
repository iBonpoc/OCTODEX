/**
 * unit:membershipAuth (#1633 A2) — AuthProvider's read of the memberships: only a confirmed answer for the person signed in
 * now changes them (an error or a late answer changes nothing — it set [] before and the phone fell back to the demo);
 * the company worked in stays first; a confirmed answer wipes the caches of every company the person is no longer in.
 * miniReact runs the provider; the server is a stand-in answered by hand.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => import("./support/miniReact"));
vi.mock("react/jsx-runtime", () => import("./support/miniReact"));
vi.mock("react/jsx-dev-runtime", () => import("./support/miniReact"));
vi.mock("react-native", () => ({ Platform: { OS: "ios" }, AppState: { addEventListener: () => ({ remove: () => {} }) } }));
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
type Answer = { data: unknown; error: unknown };
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  return { promise: new Promise<T>((a) => (resolve = a)), resolve };
};
const srv = { uid: "u1" as string | null, reads: [] as Deferred<Answer>[], filters: [] as string[] };
const query = () => {
  const q = {
    select: () => q,
    eq: (c: string, v: string) => (srv.filters.push(`${c}=${v}`), q),
    is: (c: string, v: unknown) => (srv.filters.push(`${c} is ${v}`), q),
    then: (ok: (a: Answer) => unknown, bad: (e: unknown) => unknown) => {
      const d = deferred<Answer>();
      srv.reads.push(d);
      return d.promise.then(ok, bad);
    },
  };
  return q;
};
vi.mock("@/cloud/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: srv.uid ? { user: { id: srv.uid, email: "a@b.c" } } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => query(),
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}));
vi.mock("@/cloud/legal", () => ({ acceptLegal: async () => ({}), legalStatus: async () => ({ ok: true }) }));
vi.mock("@/cloud/account", () => ({ finishDeletion: async () => {}, profileDeleted: async () => false, wipeIfPending: async () => {} }));
vi.mock("@/features/pushNative", () => ({ forgetThisPhone: async () => {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://x" }));

import { render, settle, type Root } from "./support/miniReact";
import { AuthProvider } from "../src/cloud/auth";
import { lastCompanyKey } from "../src/cloud/membershipSync";

type V = { accessDenied: () => void; memberships: { companyId: string }[]; company: { companyId: string } | null; membershipsFor: string | null; membershipStamp: number; reloadMemberships: () => Promise<unknown> };
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: V } }).props.value;
const row = (c: string, role = "tech") => ({ company_id: c, role, status: "active", companies: { name: c } });
const cache = (who: string) => JSON.stringify({ day: "cloud", db: { me: who, visits: [], expenses: [] } });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** the provider started and its first read answered */
async function start(first: Answer): Promise<Root<P>> {
  const r = render(AuthProvider as (p: P) => unknown, { children: null });
  await settle();
  srv.reads[0]!.resolve(first);
  await settle();
  return r;
}

beforeEach(() => {
  storage.clear();
  srv.uid = "u1";
  srv.reads.length = 0;
  srv.filters.length = 0;
});

describe("unit:membershipAuth — «read again» on a refusal (#1633 A2)", () => {
  it("inside the 5-minute window: one wait to its end (not dropped, not more often); after it — one read", async () => {
    const r = await start({ data: [row("c1")], error: null });
    const spy = vi.spyOn(globalThis, "setTimeout");
    const reads = srv.reads.length;
    valueOf(r).accessDenied();
    valueOf(r).accessDenied();
    valueOf(r).accessDenied();
    const waits = spy.mock.calls.filter(([, ms]) => (ms ?? 0) > 1000);
    spy.mockRestore();
    expect(waits).toHaveLength(1);
    expect(waits[0]![1]).toBeGreaterThan(4 * 60_000);
    expect(waits[0]![1]).toBeLessThanOrEqual(5 * 60_000);
    await settle();
    expect(srv.reads.length).toBe(reads);
    (waits[0]![0] as () => void)(); // the window is over
    await settle();
    expect(srv.reads.length).toBe(reads + 1);
    srv.reads[srv.reads.length - 1]!.resolve({ data: [row("c1")], error: null });
    await settle();
    expect(srv.reads.length).toBe(reads + 1); // no loop
  });
});

describe("unit:membershipAuth — only a confirmed answer counts (#1633 A2)", () => {
  it("asks for active, not deleted memberships; the company worked in last stays first", async () => {
    storage.set(lastCompanyKey("u1"), "c2");
    const r = await start({ data: [row("c1"), row("c2")], error: null });
    expect(srv.filters).toEqual(expect.arrayContaining(["user_id=u1", "status=active", "deleted_at is null"]));
    expect(valueOf(r).memberships.map((m) => m.companyId)).toEqual(["c2", "c1"]);
    expect(valueOf(r).company?.companyId).toBe("c2");
    expect(valueOf(r).membershipsFor).toBe("u1");
  });

  it("an error or a broken answer changes nothing (no fall back to the demo); the same answer keeps the same array", async () => {
    const r = await start({ data: [row("c1")], error: null });
    const was = valueOf(r).memberships;
    const stamp = valueOf(r).membershipStamp;
    for (const a of [{ data: null, error: { message: "Failed to fetch" } }, { data: { nope: 1 }, error: null }]) {
      const p = valueOf(r).reloadMemberships();
      await settle();
      srv.reads[srv.reads.length - 1]!.resolve(a);
      expect(await p).toBeNull();
      await settle();
      expect(valueOf(r).memberships).toBe(was);
      expect(valueOf(r).membershipStamp).toBe(stamp);
    }
    const p = valueOf(r).reloadMemberships();
    await settle();
    srv.reads[srv.reads.length - 1]!.resolve({ data: [row("c1")], error: null });
    await p;
    await settle();
    expect(valueOf(r).memberships).toBe(was);
    expect(valueOf(r).membershipStamp).toBe(stamp + 1);
  });

  it("a late answer (a newer ask, or another person signed in meanwhile) changes nothing", async () => {
    const r = await start({ data: [row("c1")], error: null });
    const older = valueOf(r).reloadMemberships();
    await settle();
    const newer = valueOf(r).reloadMemberships();
    await settle();
    const [o, n] = srv.reads.slice(-2);
    n!.resolve({ data: [row("c1"), row("c2")], error: null });
    await newer;
    o!.resolve({ data: [], error: null }); // the older answer comes last
    expect(await older).toBeNull();
    await settle();
    expect(valueOf(r).memberships.map((m) => m.companyId)).toEqual(["c1", "c2"]);
    const late = valueOf(r).reloadMemberships();
    await settle();
    srv.uid = "u2"; // another person on this phone now
    srv.reads[srv.reads.length - 1]!.resolve({ data: [], error: null });
    expect(await late).toBeNull();
    await settle();
    expect(valueOf(r).memberships.map((m) => m.companyId)).toEqual(["c1", "c2"]);
  });

  it("removed while the app was closed: the first confirmed answer wipes that company's cache; an error wipes nothing", async () => {
    // another person than the tests above: their wipes (a pass a second) may still run
    srv.uid = "u9";
    storage.set("octo.cloud.v1.c1.u9", cache("u9"));
    storage.set("octo.cloud.v1.c2.u9", cache("u9"));
    const r = render(AuthProvider as (p: P) => unknown, { children: null });
    await settle();
    srv.reads[0]!.resolve({ data: null, error: { message: "Failed to fetch" } });
    await settle();
    await wait(1100);
    expect(storage.has("octo.cloud.v1.c2.u9")).toBe(true);
    const p = valueOf(r).reloadMemberships();
    await settle();
    srv.reads[srv.reads.length - 1]!.resolve({ data: [row("c1")], error: null });
    await p;
    await settle();
    await wait(1100);
    await settle();
    expect(storage.has("octo.cloud.v1.c2.u9")).toBe(false);
    expect(storage.has("octo.cloud.v1.c1.u9")).toBe(true);
  });
});
