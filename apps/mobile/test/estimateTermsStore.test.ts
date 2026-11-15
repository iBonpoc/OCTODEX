/**
 * unit:estimateTermsStore — #1304 (docs/specs/40 §6, §7): a new estimate saved without Terms takes the company's default in
 * the client's language (a module, a template, an editor that did not set them); the op carries them to the server; an
 * existing estimate without the key never gets it on a save; a sent one keeps its own Terms in the new version.
 * Harness as test/undoOwnStore.test.ts. Test data.
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
import { DEFAULT_SETTINGS } from "../src/features/estimateDoc";

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
const doc = (x: Partial<EstimateDoc> = {}) =>
  ({ options: [{ id: "o1", name: "Good", lines: [{ id: "l1", name: "Work", group: "labor", quantity: "1", unit: "ea", unitPriceCents: 10000 }] }], settings: DEFAULT_SETTINGS, ...x }) as unknown as EstimateDoc;
const E1 = "00000000-0000-4000-8000-00000000e301";

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

describe("unit:estimateTermsStore — #1304", () => {
  it("estimateTerms: the default in the client's language; the client changed — the untouched text follows", async () => {
    const r = await signedIn();
    const [es, en] = valueOf(r).db.customers;
    expect(valueOf(r).estimateTerms({ customerId: es!.id })).toEqual({ text: ES, lang: "es" });
    expect(valueOf(r).estimateTermsOnClientChange(ES, { from: { customerId: es!.id }, to: { customerId: en!.id } })).toBe(EN);
    expect(valueOf(r).estimateTermsOnClientChange("Mine (test)", { from: { customerId: es!.id }, to: { customerId: en!.id } })).toBe("Mine (test)");
  });
  it("a new estimate saved without Terms (a module, a template): the Spanish default, and the op carries it", async () => {
    const r = await signedIn();
    const c = valueOf(r).db.customers[0]!;
    const prop = valueOf(r).db.properties.find((p) => p.customerId === c.id)!;
    valueOf(r).saveEstimate({ id: E1, customerId: c.id, propertyId: prop.id, title: "No terms (test)", doc: doc() });
    await settle();
    expect(valueOf(r).db.estimates.find((e) => e.id === E1)!.doc!.terms).toBe(ES);
    await tick();
    const op = server.sends.find((x) => x.op.k === "estimate.save")!.op as unknown as { doc: EstimateDoc };
    expect(op.doc.terms).toBe(ES);
  });
  it("the editor's own text (\"\" too) is kept, not replaced by the default", async () => {
    const r = await signedIn();
    const c = valueOf(r).db.customers[0]!;
    const prop = valueOf(r).db.properties.find((p) => p.customerId === c.id)!;
    valueOf(r).saveEstimate({ id: E1, customerId: c.id, propertyId: prop.id, title: "Cleared (test)", doc: doc({ terms: "" }) });
    await settle();
    expect(valueOf(r).db.estimates.find((e) => e.id === E1)!.doc!.terms).toBe("");
  });
  it("an existing estimate without the key (made before #1304): a save does not add it — the client keeps seeing the default", async () => {
    const base = company();
    const old = { ...base.estimates[0]!, status: "draft" as const, doc: doc() };
    expect(old.doc.terms).toBeUndefined();
    const r = await signedIn({ estimates: [old, ...base.estimates.slice(1)] });
    valueOf(r).saveEstimate({ id: old.id, customerId: old.customerId, propertyId: old.propertyId, title: old.title, doc: old.doc! });
    await settle();
    expect("terms" in valueOf(r).db.estimates.find((e) => e.id === old.id)!.doc!).toBe(false);
  });
  it("an old draft (no key) sent: sending freezes the Spanish default into it — on the phone as on the server (t06)", async () => {
    const base = company();
    const es = base.customers[0]!;
    const prop = base.properties.find((p) => p.customerId === es.id)!;
    const old = { ...base.estimates[0]!, customerId: es.id, propertyId: prop.id, leadId: undefined, status: "draft" as const, doc: doc() };
    const r = await signedIn({ estimates: [old, ...base.estimates.slice(1)] });
    (valueOf(r) as unknown as { sendEstimate: (id: string) => unknown }).sendEstimate(old.id);
    await settle();
    expect(valueOf(r).db.estimates.find((e) => e.id === old.id)!.doc!.terms).toBe(ES);
  });
  it("a sent estimate saved again (a new version): its own Terms go on, the company's new default does not", async () => {
    const base = company();
    const sent = base.estimates.find((e) => e.status === "sent" && e.doc)!;
    const r = await signedIn({ estimates: base.estimates.map((e) => (e.id === sent.id ? { ...e, doc: { ...e.doc!, terms: "Sent with these (test)" } } : e)) });
    const e = valueOf(r).db.estimates.find((x) => x.id === sent.id)!;
    valueOf(r).saveEstimate({ id: e.id, customerId: e.customerId, propertyId: e.propertyId, title: e.title, doc: e.doc! });
    await settle();
    expect(valueOf(r).db.estimates.find((x) => x.id === sent.id)!.doc!.terms).toBe("Sent with these (test)");
  });
});
