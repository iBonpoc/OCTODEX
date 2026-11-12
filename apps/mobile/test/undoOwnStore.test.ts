/**
 * unit:undoOwnStore — #1193 п.6: «Отменить» of one action in the store takes back only that action — another action
 * after it (a voided invoice) and the server's fresh copy stay. Red before the fix (mutate put the whole snapshot back).
 * Harness as test/suppliersStore.test.ts. Test data.
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
import type { CatalogItem, DB, EstimateDoc, EstimateTemplate, Supplier } from "../src/data/types";
import { DEFAULT_SETTINGS } from "../src/features/estimateDoc";

type Value = {
  db: DB;
  mode: string;
  saveSupplier: (x: Supplier) => () => void;
  setSupplierActive: (id: string, active: boolean) => () => void;
  applySupplierTax: (id: string) => () => void;
  saveCatalogItem: (it: CatalogItem) => () => void;
  voidInvoice: (id: string, reason: string) => string | null;
  refresh: () => Promise<void>;
  saveEstimate: (e: { id: string; customerId: string; propertyId: string; title: string; doc: EstimateDoc }) => () => boolean;
  recordPayment: (invoiceId: string, amountCents: number, method: string) => () => boolean;
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

const SUP = "00000000-0000-4000-8000-0000000005a1";
const ITEM = "00000000-0000-4000-8000-0000000005b1";
function company(): DB {
  const db = makeSeed();
  const item: CatalogItem = { id: ITEM, kind: "material", name: "Bracket (test)", unit: "ea", priceCents: 0, costCents: 1000, vendorTaxBps: 0, markupBps: 1000, supplierId: SUP };
  return { ...db, me: "u1", suppliers: [{ id: SUP, name: "ABC Supply (test)", active: true }], costHistory: [], catalog: [item, ...db.catalog], costsVisible: true };
}
const supOf = (r: Root<P>) => (valueOf(r).db.suppliers ?? []).find((x) => x.id === SUP)!;
const itemOf = (r: Root<P>) => valueOf(r).db.catalog.find((x) => x.id === ITEM)!;

async function signedIn(over: Partial<DB> = {}, role = "owner"): Promise<Root<P>> {
  Object.assign(auth, { session: {}, userId: "u1", company: { companyId: "c1", role, companyName: "Co" } });
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  await settle();
  server.loads.splice(0).forEach((d) => d.resolve({ ...company(), ...over }));
  await settle();
  expect(valueOf(r).mode).toBe("cloud");
  return r;
}

/** the demo: no session — the seed company on the phone */
async function demo(): Promise<Root<P>> {
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  await settle();
  expect(valueOf(r).mode).toBe("demo");
  return r;
}
type Fn = (...a: unknown[]) => unknown;
const call = (r: Root<P>, name: string, ...a: unknown[]) => (valueOf(r)[name] as Fn)(...a);
/** what an action returns → its «Отменить» */
const undoOf = (x: unknown): (() => unknown) => (typeof x === "function" ? (x as () => unknown) : (x as { undo: () => unknown }).undo);

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

describe("unit:undoOwnStore — #1193 п.6", () => {
  it("change an item → void an invoice → «Отменить» the item: the item goes back, the invoice stays void", async () => {
    const r = await signedIn();
    const undo = valueOf(r).saveCatalogItem({ ...itemOf(r), name: "Bracket renamed (test)" });
    await settle();
    expect(valueOf(r).voidInvoice("i2", "Wrong amount (test)")).toBeNull();
    await settle();
    const voided = (x: Root<P>) => !valueOf(x).db.invoices.some((i) => i.id === "i2") && (valueOf(x).db.voidInvoices ?? []).some((i) => i.id === "i2");
    expect(voided(r)).toBe(true);
    undo();
    await settle();
    expect(itemOf(r).name).toBe("Bracket (test)");
    expect(voided(r)).toBe(true);
  });
  it("change an item → the server's fresh copy (another phone added a client) → «Отменить»: the client stays", async () => {
    const r = await signedIn();
    const undo = valueOf(r).saveCatalogItem({ ...itemOf(r), name: "Bracket renamed (test)" });
    await tick();
    server.sends.splice(0).forEach((x) => x.d.resolve());
    await settle();
    const p = valueOf(r).refresh();
    await settle();
    const fresh = company();
    server.loads.splice(0).forEach((d) => d.resolve({ ...fresh, catalog: fresh.catalog.map((x) => (x.id === ITEM ? { ...x, name: "Bracket renamed (test)" } : x)),
      customers: [...fresh.customers, { ...fresh.customers[0]!, id: "c-from-other-phone", name: "From another phone (test)" }] }));
    await p;
    await settle();
    expect(valueOf(r).db.customers.some((c) => c.id === "c-from-other-phone")).toBe(true);
    undo();
    await settle();
    expect(valueOf(r).db.customers.some((c) => c.id === "c-from-other-phone")).toBe(true);
  });
  it("a new estimate saved → the store normalizes it again on render → «Отменить»: the estimate is gone, and its op (the director's Б1)", async () => {
    const r = await signedIn();
    const c = valueOf(r).db.customers[0]!;
    const prop = valueOf(r).db.properties.find((p) => p.customerId === c.id)!;
    const doc = { options: [{ id: "o1", name: "Good", lines: [{ id: "l1", name: "Work", group: "labor", quantity: "1", unit: "ea", unitPriceCents: 10000 }] }], settings: DEFAULT_SETTINGS } as unknown as EstimateDoc;
    const undo = valueOf(r).saveEstimate({ id: "00000000-0000-4000-8000-00000000e0e1", customerId: c.id, propertyId: prop.id, title: "Undo me (test)", doc });
    await settle();
    expect(valueOf(r).db.estimates.some((e) => e.id === "00000000-0000-4000-8000-00000000e0e1")).toBe(true);
    expect(undo()).toBe(true);
    await settle();
    expect(valueOf(r).db.estimates.some((e) => e.id === "00000000-0000-4000-8000-00000000e0e1")).toBe(false);
    await tick();
    expect(server.sends.filter((x) => x.op.k === "estimate.save")).toEqual([]);
    // a second «Отменить» of the same action: nothing more
    expect(undo()).toBe(false);
  });
  it("two payments → «Отменить» the first: nothing is taken back (the paid amount was changed by the second), both go to the server (Б2)", async () => {
    const r = await signedIn();
    const before = valueOf(r).db.invoices.find((i) => i.id === "i1")!;
    const undoA = valueOf(r).recordPayment("i1", 100, "cash");
    await settle();
    valueOf(r).recordPayment("i1", before.totalCents - 100, "check");
    await settle();
    const paidBefore = valueOf(r).db.invoices.find((i) => i.id === "i1") ?? null;
    const paymentsBefore = valueOf(r).db.payments.length;
    expect(undoA()).toBe(false);
    await settle();
    expect(valueOf(r).db.invoices.find((i) => i.id === "i1") ?? null).toEqual(paidBefore);
    expect(valueOf(r).db.payments.length).toBe(paymentsBefore);
    // the queue sends one at a time: the first answered, then the second
    await tick();
    server.sends.forEach((x) => x.d.resolve());
    await settle();
    await tick();
    expect(server.sends.filter((x) => x.op.k === "payment.record").length).toBe(2);
  });
  it("an action the server dropped (a template changed on another phone first) → «Отменить»: nothing to take back, the toast just closes — not «too late» (remark 2)", async () => {
    const settings = { discount: null, tax: { enabled: false, rateBps: 0, groups: { service: false, labor: false, material: false } }, deposit: { kind: "none" as const } };
    const tpl = { id: "tpl-1", name: "Visit (test)", rowVersion: 3, doc: { options: [{ id: "o", name: "A", lines: [{ id: "l", name: "Call (test)", group: "service", quantity: "1", unit: "ea", unitPriceCents: 100 }] }], settings } } as unknown as EstimateTemplate;
    const r = await signedIn({ estimateTemplates: [tpl] });
    const undo = call(r, "saveEstimateTemplate", { ...tpl, name: "E1 (test)" }) as () => boolean | undefined;
    await tick();
    const { PermanentError } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    server.sends.find((x) => x.op.k === "est.template.save")!.d.reject(new PermanentError("the template was changed on another phone", 409, "40001", "row_version_conflict"));
    await settle();
    expect(undo()).toBeUndefined();
  });
});

describe("unit:undoOwnStore — «Отменить» of several actions together: all or none (remark 1, DS §15.2)", () => {
  it("a client's edit (name + address) → the server changed the address → «Отменить»: nothing goes back, the name stays new", async () => {
    const r = await signedIn();
    const c = valueOf(r).db.customers[0]!;
    const prop = valueOf(r).db.properties.find((p) => p.customerId === c.id)!;
    const undos = [call(r, "updateCustomer", c.id, { name: "Renamed (test)" }), call(r, "updateProperty", prop.id, { address: "2 New St (test)", city: prop.city })];
    const undo = call(r, "undoTogether", undos) as () => boolean | undefined;
    // the queue sends one at a time: both answered
    for (let k = 0; k < 2; k++) {
      await tick();
      server.sends.splice(0).forEach((x) => x.d.resolve());
      await settle();
    }
    // the server's fresh copy: someone else changed the address again
    const p = valueOf(r).refresh();
    await settle();
    const fresh = company();
    server.loads.splice(0).forEach((d) =>
      d.resolve({ ...fresh, customers: fresh.customers.map((x) => (x.id === c.id ? { ...x, name: "Renamed (test)" } : x)), properties: fresh.properties.map((x) => (x.id === prop.id ? { ...x, address: "3 Their St (test)" } : x)) }),
    );
    await p;
    await settle();
    expect(undo()).toBe(false);
    await settle();
    expect(valueOf(r).db.customers.find((x) => x.id === c.id)!.name).toBe("Renamed (test)");
    expect(valueOf(r).db.properties.find((x) => x.id === prop.id)!.address).toBe("3 Their St (test)");
  });
  it("the same edit, nothing changed since → «Отменить»: both go back, neither op is sent", async () => {
    const r = await signedIn();
    const c = valueOf(r).db.customers[0]!;
    const prop = valueOf(r).db.properties.find((p) => p.customerId === c.id)!;
    const undos = [call(r, "updateCustomer", c.id, { name: "Renamed (test)" }), call(r, "updateProperty", prop.id, { address: "2 New St (test)", city: prop.city })];
    await settle();
    expect((call(r, "undoTogether", undos) as () => unknown)()).toBe(true);
    await settle();
    expect(valueOf(r).db.customers.find((x) => x.id === c.id)!.name).toBe(c.name);
    expect(valueOf(r).db.properties.find((x) => x.id === prop.id)!.address).toBe(prop.address);
    await tick();
    expect(server.sends.filter((x) => x.op.k === "customer.update" || x.op.k === "property.update")).toEqual([]);
  });
  it("one part already taken back on its own → «Отменить» of all: nothing more (false), the other part stays", async () => {
    const r = await signedIn();
    const c = valueOf(r).db.customers[0]!;
    const prop = valueOf(r).db.properties.find((p) => p.customerId === c.id)!;
    const a = call(r, "updateCustomer", c.id, { name: "Renamed (test)" }) as () => boolean;
    const b = call(r, "updateProperty", prop.id, { address: "2 New St (test)", city: prop.city }) as () => boolean;
    await settle();
    expect(b()).toBe(true);
    await settle();
    expect((call(r, "undoTogether", [a, b]) as () => unknown)()).toBe(false);
    await settle();
    expect(valueOf(r).db.customers.find((x) => x.id === c.id)!.name).toBe("Renamed (test)");
  });
});

describe("unit:undoOwnStore — undoTogether, the director's 3rd review of #1244", () => {
  const TPL = { id: "tpl-four", name: "Four (test)", items: [0, 1, 2, 3].map((i) => ({ id: `tpl-four-i${i}`, label: `Step ${i} (test)`, kind: "check", required: true })), appliesTo: { everyVisit: false, visitKinds: [], catalogItemIds: [] } };
  const openVisit = (r: Root<P>) => valueOf(r).db.visits.find((v) => v.step === "scheduled" && !v.closed && !v.signature)!;
  it("a template's 4 items added → the 2nd ticked → «Отменить» the template: nothing goes, all its ops reach the server (the blocker, :1522)", async () => {
    const r = await signedIn({ checklistTemplates: [...company().checklistTemplates!, TPL] } as Partial<DB>);
    const v = openVisit(r);
    const before = v.checklist.length;
    const undo = call(r, "addVisitTemplate", v.id, TPL.id) as () => boolean | undefined;
    await settle();
    const added = valueOf(r).db.visits.find((x) => x.id === v.id)!.checklist.slice(before);
    expect(added).toHaveLength(4);
    call(r, "checkItem", v.id, added[1]!.id, true);
    await settle();
    expect(undo()).toBe(false);
    await settle();
    expect(valueOf(r).db.visits.find((x) => x.id === v.id)!.checklist).toHaveLength(before + 4);
    // the queue sends one at a time: every add and the tick go
    for (let k = 0; k < 6; k++) {
      await tick();
      server.sends.filter((x) => !(x as { done?: boolean }).done).forEach((x) => ((x as { done?: boolean }).done = true, x.d.resolve()));
      await settle();
    }
    expect(server.sends.filter((x) => x.op.k === "chk.item.add").length).toBe(4);
    expect(server.sends.filter((x) => x.op.k === "chk.item.set").length).toBe(1);
  }, 30_000);
  it("nested: a new job, then its visit (scheduleJob — itself together with its checklist) → «Отменить» all: the job and the visit are gone", async () => {
    const r = await demo();
    const c = valueOf(r).db.customers[0]!;
    const prop = valueOf(r).db.properties.find((p) => p.customerId === c.id)!;
    const job = call(r, "addJob", { customerId: c.id, propertyId: prop.id, title: "Nested (test)" }) as { id: string; undo: () => unknown };
    await settle();
    const sched = call(r, "scheduleJob", job.id, { start: new Date().toISOString(), durationMin: 60, techId: null });
    await settle();
    expect(valueOf(r).db.visits.some((v) => v.jobId === job.id)).toBe(true);
    expect((call(r, "undoTogether", [job.undo, sched]) as () => unknown)()).toBe(true);
    await settle();
    expect(valueOf(r).db.jobs.some((j) => j.id === job.id)).toBe(false);
    expect(valueOf(r).db.visits.some((v) => v.jobId === job.id)).toBe(false);
  });
  it("the same, the visit changed since (an item added to it) → false (the job form's «Уже не отменить»): the job and the visit stay", async () => {
    const r = await demo();
    const c = valueOf(r).db.customers[0]!;
    const prop = valueOf(r).db.properties.find((p) => p.customerId === c.id)!;
    const job = call(r, "addJob", { customerId: c.id, propertyId: prop.id, title: "Nested (test)" }) as { id: string; undo: () => unknown };
    await settle();
    const sched = call(r, "scheduleJob", job.id, { start: new Date().toISOString(), durationMin: 60, techId: null });
    await settle();
    const visit = valueOf(r).db.visits.find((v) => v.jobId === job.id)!;
    call(r, "addVisitItem", visit.id, "Later (test)", false);
    await settle();
    expect((call(r, "undoTogether", [job.undo, sched]) as () => unknown)()).toBe(false);
    await settle();
    expect(valueOf(r).db.jobs.some((j) => j.id === job.id)).toBe(true);
    expect(valueOf(r).db.visits.some((v) => v.id === visit.id)).toBe(true);
  });
  it("two parts of one record (a new client, then its name parts — client/edit): both go back", async () => {
    const r = await demo();
    const src = valueOf(r).db.sources[0]!.id;
    const made = call(r, "addCustomer", { name: "Two Parts", phone: "(818) 555-0199", sourceId: src, address: "9 Test St", city: "Encino" }) as { id: string; undo: () => unknown };
    await settle();
    const parts = call(r, "updateCustomer", made.id, { firstName: "Two", lastName: "Parts" });
    await settle();
    expect((call(r, "undoTogether", [made.undo, parts]) as () => unknown)()).toBe(true);
    await settle();
    expect(valueOf(r).db.customers.some((x) => x.id === made.id)).toBe(false);
  });
  it("a part not made by the store throws: the store's parts are back all the same, and the result is true (the toast closes)", async () => {
    const r = await demo();
    const c = valueOf(r).db.customers[0]!;
    const undo = call(r, "updateCustomer", c.id, { name: "Renamed (test)" });
    await settle();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let after = false;
    const all = call(r, "undoTogether", [undo, () => { throw new Error("a screen's reset (test)"); }, () => (after = true)]) as () => unknown;
    expect(all()).toBe(true);
    warn.mockRestore();
    await settle();
    expect(valueOf(r).db.customers.find((x) => x.id === c.id)!.name).toBe(c.name);
    expect(after).toBe(true);
  });
  it("nothing of the store's to take back — only empty functions, or a dropped part with them: undefined, nothing runs", async () => {
    const r = await demo();
    let ran = false;
    expect((call(r, "undoTogether", [() => {}]) as () => unknown)()).toBeUndefined();
    expect((call(r, "undoTogether", [() => (ran = true)]) as () => unknown)()).toBeUndefined();
    expect(ran).toBe(false);
    expect((call(r, "undoTogether", []) as () => unknown)()).toBeUndefined();
  });
  it("a dropped part among live ones (the server dropped a template save): the live ones go back — true", async () => {
    const settings = { discount: null, tax: { enabled: false, rateBps: 0, groups: { service: false, labor: false, material: false } }, deposit: { kind: "none" as const } };
    const tpl = { id: "tpl-1", name: "Visit (test)", rowVersion: 3, doc: { options: [{ id: "o", name: "A", lines: [{ id: "l", name: "Call (test)", group: "service", quantity: "1", unit: "ea", unitPriceCents: 100 }] }], settings } } as unknown as EstimateTemplate;
    const r = await signedIn({ estimateTemplates: [tpl] });
    const dead = call(r, "saveEstimateTemplate", { ...tpl, name: "E1 (test)" });
    await tick();
    const { PermanentError } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    server.sends.find((x) => x.op.k === "est.template.save")!.d.reject(new PermanentError("changed on another phone", 409, "40001", "row_version_conflict"));
    await settle();
    const c = valueOf(r).db.customers[0]!;
    const live = call(r, "updateCustomer", c.id, { name: "Renamed (test)" });
    await settle();
    expect((call(r, "undoTogether", [dead, live]) as () => unknown)()).toBe(true);
    await settle();
    expect(valueOf(r).db.customers.find((x) => x.id === c.id)!.name).toBe(c.name);
  });
});

describe("unit:undoOwnStore — the director's 4th review of #1244 Б2: each screen's two parts, the later one changed since → false, nothing back, the ops stay", () => {
  /** every op the outbox sends, one at a time, answered */
  const sendAll = async (rounds: number) => {
    for (let k = 0; k < rounds; k++) {
      await tick();
      server.sends.filter((x) => !(x as { done?: boolean }).done).forEach((x) => ((x as { done?: boolean }).done = true, x.d.resolve()));
      await settle();
    }
  };
  const kinds = () => server.sends.map((x) => x.op.k);
  it("VisitForm «Перенести» (a new time + new people): the visit moved again since → false", async () => {
    const r = await signedIn();
    const v = valueOf(r).db.visits.find((x) => x.step === "scheduled")!;
    const t1 = new Date(Date.parse(v.start) + 86_400_000).toISOString();
    const undoMove = call(r, "rescheduleVisit", v.id, t1, v.durationMin);
    const undoTech = call(r, "assignVisit", v.id, ["m-alex"]);
    await settle();
    call(r, "rescheduleVisit", v.id, new Date(Date.parse(v.start) + 2 * 86_400_000).toISOString(), v.durationMin);
    await settle();
    expect((call(r, "undoTogether", [undoMove, undoTech]) as () => unknown)()).toBe(false);
    await settle();
    expect(valueOf(r).db.visits.find((x) => x.id === v.id)!.assigneeIds).toEqual(["m-alex"]);
    await sendAll(4);
    expect(kinds().filter((k) => k.startsWith("visit.")).length).toBeGreaterThanOrEqual(2);
  }, 30_000);
  it("lead/new and the gutters LinkSheet (a lead + the module's link to it): the lead changed since → false, the module's change stays", async () => {
    const co = company();
    const r = await signedIn({ company: { ...co.company!, modules: { gutters: { enabled: true, trialEndsAt: new Date(Date.now() + 86_400_000).toISOString(), settings: {}, rowVersion: 1 } } } } as Partial<DB>);
    const src = valueOf(r).db.sources[0]!.id;
    const lead = call(r, "addLead", { name: "Linked (test)", phone: "(818) 555-0111", city: "Encino", sourceId: src }) as { id: string; undo: () => unknown };
    const linked = call(r, "moduleOp", "gutters", { kind: "m.save", payload: { m: { id: "m-link" } }, apply: (d: DB) => ({ ...d, moduleData: { ...(d.moduleData ?? {}), gutters: { linked: lead.id } } }) });
    expect(typeof linked).toBe("function");
    await settle();
    call(r, "updateLead", lead.id, { name: "Renamed (test)" });
    await settle();
    expect((call(r, "undoTogether", [lead.undo, linked]) as () => unknown)()).toBe(false);
    await settle();
    expect(valueOf(r).db.leads.some((l) => l.id === lead.id)).toBe(true);
    expect((valueOf(r).db.moduleData as { gutters?: { linked?: string } }).gutters?.linked).toBe(lead.id);
  });
  it("estimate/new «Сохранить» with new price-list items: the estimate changed since → false — the estimate and its items stay, their ops too", async () => {
    const r = await signedIn();
    const c = valueOf(r).db.customers[0]!;
    const prop = valueOf(r).db.properties.find((p) => p.customerId === c.id)!;
    const item = { id: "00000000-0000-4000-8000-0000000005d1", kind: "material", name: "From the row (test)", unit: "ea", priceCents: 700 } as CatalogItem;
    const undoItem = call(r, "saveCatalogItem", item);
    const doc = { options: [{ id: "o1", name: "Good", lines: [{ id: "l1", name: "From the row (test)", group: "material", quantity: "1", unit: "ea", unitPriceCents: 700, catalogItemId: item.id }] }], settings: DEFAULT_SETTINGS } as unknown as EstimateDoc;
    const id = "00000000-0000-4000-8000-00000000e0e3";
    const undoEst = valueOf(r).saveEstimate({ id, customerId: c.id, propertyId: prop.id, title: "With items (test)", doc });
    await settle();
    valueOf(r).saveEstimate({ id, customerId: c.id, propertyId: prop.id, title: "Renamed (test)", doc });
    await settle();
    expect((call(r, "undoTogether", [undoItem, undoEst]) as () => unknown)()).toBe(false);
    await settle();
    expect(valueOf(r).db.catalog.some((x) => x.id === item.id)).toBe(true);
    expect(valueOf(r).db.estimates.some((e) => e.id === id)).toBe(true);
    await sendAll(4);
    expect(kinds()).toContain("catalog.save");
    expect(kinds()).toContain("estimate.save");
  }, 30_000);
  it("client/import (demo) — a card and its name parts: the card renamed since → false, both stay", async () => {
    const r = await demo();
    const src = valueOf(r).db.sources[0]!.id;
    const x = call(r, "addCustomer", { name: "Imported (test)", phone: "(818) 555-0122", sourceId: src, address: "5 Test St", city: "Encino" }) as { id: string; undo: () => unknown };
    const u2 = call(r, "updateCustomer", x.id, { firstName: "Imported", lastName: "Test" });
    await settle();
    call(r, "updateCustomer", x.id, { lastName: "Changed" });
    await settle();
    expect((call(r, "undoTogether", [x.undo, u2]) as () => unknown)()).toBe(false);
    await settle();
    expect(valueOf(r).db.customers.find((c) => c.id === x.id)?.lastName).toBe("Changed");
  });
});

describe("unit:undoOwnStore — the demo: what an action adds is what the store shows (the director's Б3)", () => {
  it("a lead won → «Отменить»: the lead is not won, its client and address are gone (red before: the client had no number)", async () => {
    const r = await demo();
    const lead = valueOf(r).db.leads.find((l) => !l.customerId && l.status !== "won")!;
    const before = { customers: valueOf(r).db.customers.length, properties: valueOf(r).db.properties.length };
    const undo = call(r, "convertLead", lead.id, "Signed (test)") as () => boolean;
    await settle();
    const won = valueOf(r).db.leads.find((l) => l.id === lead.id)!;
    expect(won.status).toBe("won");
    expect(valueOf(r).db.customers.find((c) => c.id === won.customerId)?.number).toMatch(/^CLT-\d{4}$/);
    expect(undo()).toBe(true);
    await settle();
    expect(valueOf(r).db.leads.find((l) => l.id === lead.id)!.status).toBe(lead.status);
    expect(valueOf(r).db.customers.length).toBe(before.customers);
    expect(valueOf(r).db.properties.length).toBe(before.properties);
  });
  it("an estimate for a lead without a client (lead.prospect) → «Отменить»: the prospect client is gone", async () => {
    const r = await demo();
    const lead = valueOf(r).db.leads.find((l) => !l.customerId && l.status !== "won")!;
    const n = valueOf(r).db.customers.length;
    const t = call(r, "leadEstimateTarget", lead.id) as { undo: () => boolean };
    await settle();
    expect(valueOf(r).db.customers.length).toBe(n + 1);
    expect(t.undo()).toBe(true);
    await settle();
    expect(valueOf(r).db.customers.length).toBe(n);
  });
  it("every action that adds a record: «Отменить» right after it works — mutate's check (normalizeDB changes nothing) passes", async () => {
    const r = await demo();
    const d = () => valueOf(r).db;
    const c = d().customers[0]!;
    const prop = d().properties.find((p) => p.customerId === c.id)!;
    const job = d().jobs[0]!;
    const visit = d().visits[0]!;
    const inv = d().invoices.find((i) => i.totalCents > i.paidCents)!;
    const src = d().sources[0]!.id;
    const doc = { options: [{ id: "o1", name: "Good", lines: [{ id: "l1", name: "Work", group: "labor", quantity: "1", unit: "ea", unitPriceCents: 10000 }] }], settings: DEFAULT_SETTINGS } as unknown as EstimateDoc;
    const actions: [string, () => unknown][] = [
      ["addLead", () => call(r, "addLead", { name: "New lead (test)", phone: "(818) 555-0101", city: "Encino", sourceId: src })],
      ["addCustomer", () => call(r, "addCustomer", { name: "New client (test)", phone: "(818) 555-0102", sourceId: src, address: "1 Test St", city: "Encino" })],
      ["addJob", () => call(r, "addJob", { customerId: c.id, propertyId: prop.id, title: "New job (test)" })],
      ["saveEstimate", () => call(r, "saveEstimate", { id: "00000000-0000-4000-8000-00000000e0e2", customerId: c.id, propertyId: prop.id, title: "New estimate (test)", doc })],
      ["addExpense", () => call(r, "addExpense", { jobId: job.id, amountCents: 1234, category: "materials", note: "Test" })],
      ["addNote", () => call(r, "addNote", { subjectType: "customer", subjectId: c.id, body: "Note (test)", visibility: "team" })],
      ["saveTask", () => call(r, "saveTask", { title: "Task (test)", subjectType: "customer", subjectId: c.id, done: false })],
      ["saveTag", () => call(r, "saveTag", { name: "Tag (test)", color: "neutral" })],
      ["saveSource", () => call(r, "saveSource", { name: "Source (test)", active: true })],
      ["addInspection", () => call(r, "addInspection", prop.id, { start: new Date().toISOString(), durationMin: 60, techId: null })],
      ["addCheckItem", () => call(r, "addCheckItem", visit.id, "Check (test)")],
      ["logCall", () => call(r, "logCall", { subjectType: "customer", subjectId: c.id, outcome: "reached" })],
      ["recordPayment", () => call(r, "recordPayment", inv.id, 100, "cash")],
      ["saveCatalogItem", () => call(r, "saveCatalogItem", { id: "00000000-0000-4000-8000-0000000005c1", kind: "material", name: "New item (test)", unit: "ea", priceCents: 500 })],
    ];
    const dead: string[] = [];
    for (const [name, act] of actions) {
      const undo = undoOf(act());
      await settle();
      if (undo() === false) dead.push(name);
      await settle();
    }
    expect(dead).toEqual([]);
  });
});
