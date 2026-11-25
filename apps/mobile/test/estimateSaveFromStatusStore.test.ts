/**
 * unit:estimateSaveFromStatusStore — #2474: the op of a save says «the phone edited the client-signed estimate on purpose»
 * (fromStatus: awaiting_countersign) only when the store had it signed (#2381 «Сохранить и снять подпись»); a save of a
 * sent estimate never says so — the cloud save then refuses instead of taking a signature made meanwhile off.
 * Harness as test/estimateTermsStore.test.ts. Test data.
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
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
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
import type { DB, EstimateDoc } from "../src/data/types";

type Value = {
  db: DB;
  mode: string;
  saveEstimate: (e: { id: string; customerId: string; propertyId: string; title: string; doc: EstimateDoc; leadId?: string }) => () => boolean;
  estimateTerms: (at: { customerId?: string; leadId?: string }) => { text: string; lang: string };
  estimateTermsOnClientChange: (cur: string | undefined, at: { from: { customerId?: string }; to: { customerId?: string } }) => string;
  [k: string]: unknown;
};
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
const tick = async () => {
  await wait(1700); // the outbox tick
  await settle();
};
let root: Root<P> | null = null;
const EN = "Warranty: 1 year on labor (test).";
const ES = "Garantía: 1 año de mano de obra (prueba).";

function company(): DB {
  const d = makeSeed();
  const c = d.customers[0]!;
  return {
    ...d, me: "u1",
    company: { ...d.company!, docLanguage: "en", estimate: { ...d.company!.estimate, termsByLang: { en: EN, es: ES } } },
    customers: d.customers.map((x) => (x.id === c.id ? { ...x, people: [{ id: "pp1", name: x.name, role: "main", phones: [], emails: [], language: "es" }] } : x)),
  };
}
async function signedIn(over: Partial<DB> = {}): Promise<Root<P>> {
  Object.assign(auth, { session: {}, userId: "u1", company: { companyId: "c1", role: "owner", companyName: "Co" } });
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  await settle();
  server.loads.splice(0).forEach((d) => d.resolve({ ...company(), ...over }));
  await settle();
  expect(valueOf(r).mode).toBe("cloud");
  return r;
}

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

describe("unit:estimateSaveFromStatusStore — #2474", () => {
  const saved = async (status: "sent" | "awaiting_countersign") => {
    const base = company();
    const e0 = base.estimates.find((e) => e.doc)!;
    const r = await signedIn({ estimates: base.estimates.map((e) => (e.id === e0.id ? { ...e, status } : e)) });
    const e = valueOf(r).db.estimates.find((x) => x.id === e0.id)!;
    valueOf(r).saveEstimate({ id: e.id, customerId: e.customerId, propertyId: e.propertyId, title: e.title, doc: e.doc! });
    await settle();
    await tick();
    return server.sends.find((x) => x.op.k === "estimate.save")!.op as Record<string, unknown>;
  };
  it("a sent estimate edited: the op has no fromStatus", async () => {
    expect("fromStatus" in (await saved("sent"))).toBe(false);
  });
  it("the client-signed estimate saved on purpose: fromStatus awaiting_countersign", async () => {
    expect((await saved("awaiting_countersign")).fromStatus).toBe("awaiting_countersign");
  });
});
