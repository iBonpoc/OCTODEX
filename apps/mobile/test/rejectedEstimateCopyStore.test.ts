/**
 * unit:rejectedEstimateCopyStore — #2478 (спека 65 §3.5, С7, В3): the client signed while the phone's edits of a sent
 * estimate waited; the server refused the save (estimate_signed_meanwhile) and the card keeps the edits. «Сделать копию»
 * makes a new draft estimate from them (same client, place, lead, title; fresh ids; costs) — through the queue like any
 * save (rule 6) — and the card goes; «Вернуть» takes both back (rule 5). Harness as test/estimateSaveFromStatusStore.test.ts.
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

function company(): DB {
  const d = makeSeed();
  const c = d.customers[0]!;
  void c;
  return { ...d, me: "u1" };
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


const OWNER = { userId: "u1", companyId: "c1" };
const signedDoc = (d: DB) => d.estimates.find((e) => e.doc)!;
function refused(d: DB) {
  const e = signedDoc(d);
  const doc = { ...e.doc!, options: e.doc!.options.map((o) => ({ ...o, lines: o.lines.map((l) => ({ ...l, unitCostCents: undefined })) })) } as EstimateDoc;
  const line = doc.options[0]!.lines[0]!;
  return {
    e, line,
    rec: {
      id: "ob-9", owner: OWNER, kind: "estimate.save", what: "estimate", href: `/estimate/${e.id}`, labelKey: "est.rej.signedMeanwhile",
      reason: "estimate_signed_meanwhile", error: "refused", at: new Date().toISOString(),
      estimateEdit: { title: "Edited offline (test)", customerId: e.customerId, propertyId: e.propertyId, leadId: "lead-x", doc, costs: { [line.id]: 4321 } },
    },
  };
}

describe("unit:rejectedEstimateCopyStore — #2478", () => {
  it("«Сделать копию»: a new draft with the edits goes to the queue, the card goes, the signed one is untouched", async () => {
    const { e, line, rec } = refused(company());
    storage.set("octo.cloud.v1.rejected", JSON.stringify([rec]));
    const r = await signedIn();
    expect((valueOf(r).rejectedOps as { id: string }[]).map((x) => x.id)).toEqual(["ob-9"]);
    const before = JSON.stringify(valueOf(r).db.estimates.find((x) => x.id === e.id));
    const out = (valueOf(r).copyRejectedEstimate as (id: string) => { estimateId: string } | null)("ob-9")!;
    await settle();
    expect(out.estimateId).not.toBe(e.id);
    const copy = valueOf(r).db.estimates.find((x) => x.id === out.estimateId)!;
    expect(copy).toMatchObject({ status: "draft", customerId: e.customerId, propertyId: e.propertyId, title: "Edited offline (test)", leadId: "lead-x" });
    expect(copy.doc!.options[0]!.lines.map((l) => l.id)).not.toContain(line.id);
    expect(copy.doc!.options[0]!.lines[0]!.unitCostCents).toBe(4321);
    expect(JSON.stringify(valueOf(r).db.estimates.find((x) => x.id === e.id))).toBe(before);
    expect(valueOf(r).rejectedOps).toEqual([]);
    await tick();
    const op = server.sends.find((x) => x.op.k === "estimate.save")!.op;
    expect(op).toMatchObject({ id: out.estimateId, customerId: e.customerId, leadId: "lead-x", title: "Edited offline (test)" });
    expect(Object.values(op.costs as Record<string, number>)).toContain(4321);
    expect("fromStatus" in op).toBe(false);
  });
  it("«Вернуть» takes the copy and the card back", async () => {
    const { rec } = refused(company());
    storage.set("octo.cloud.v1.rejected", JSON.stringify([rec]));
    const r = await signedIn();
    const n = valueOf(r).db.estimates.length;
    const out = (valueOf(r).copyRejectedEstimate as (id: string) => { estimateId: string; undo: () => unknown } | null)("ob-9")!;
    await settle();
    expect(valueOf(r).db.estimates.length).toBe(n + 1);
    out.undo();
    await settle();
    expect(valueOf(r).db.estimates.length).toBe(n);
    expect((valueOf(r).rejectedOps as { id: string }[]).map((x) => x.id)).toEqual(["ob-9"]);
  });
  it("no such card, or a card without edits: nothing", async () => {
    const { rec } = refused(company());
    const { estimateEdit: _e, ...bare } = rec;
    storage.set("octo.cloud.v1.rejected", JSON.stringify([{ ...bare, id: "ob-8" }]));
    const r = await signedIn();
    const copy = valueOf(r).copyRejectedEstimate as (id: string) => unknown;
    expect(copy("nope")).toBeNull();
    expect(copy("ob-8")).toBeNull();
  });
});
