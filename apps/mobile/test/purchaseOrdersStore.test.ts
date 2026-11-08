/**
 * unit:purchaseOrdersStore — spec 37 SUP2: the purchase order mutations of the store. Locally at once (offline), one
 * po.save per change, po.receive per marking with «Отменить» as a reverse call; only the office makes orders, the
 * tech receives; a server without the table gets nothing. Harness as test/checklistStore.test.ts.
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
import type { CatalogItem, DB, Estimate, Job, PurchaseOrder } from "../src/data/types";

type Value = {
  db: DB;
  mode: string;
  makeJobOrders: (jobId: string) => { ids: string[]; undo: () => void };
  savePurchaseOrder: (o: PurchaseOrder) => () => void;
  sendPurchaseOrder: (id: string) => boolean;
  cancelPurchaseOrder: (id: string) => void;
  receivePurchaseOrder: (id: string, lines: { id: string; received: string }[]) => () => void;
};
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
const tick = async () => {
  await wait(1700); // the outbox tick
  await settle();
};
const drain = async () => {
  for (let i = 0; i < 4; i++) {
    await tick();
    server.sends.forEach((x) => x.d.resolve());
  }
  await tick();
};
let root: Root<P> | null = null;

const S1 = "00000000-0000-4000-8000-0000000007a1";
const JOB = "00000000-0000-4000-8000-0000000007b1";
function company(): DB {
  const db = makeSeed();
  const item: CatalogItem = { id: "00000000-0000-4000-8000-0000000007c1", kind: "material", name: "Hanger (test)", unit: "ea", priceCents: 0, costCents: 37, supplierId: S1, packSize: "50", purchaseUnit: "box" };
  const est = {
    ...db.estimates[0]!, id: "00000000-0000-4000-8000-0000000007d1", status: "approved",
    doc: { settings: {} as never, options: [{ id: "o", name: "O", lines: [{ id: "l", name: "Hanger", group: "material", quantity: "65", unit: "ea", unitPriceCents: 0, catalogItemId: item.id }] }] },
    approval: { optionId: "o", addonIds: [], signerName: "C", signature: "", at: "", channel: "on_site", totalCents: 0, depositCents: 0 },
  } as unknown as Estimate;
  const job = { ...db.jobs[0]!, id: JOB, estimateId: est.id } as Job;
  return {
    ...db, me: "u1", catalog: [item, ...db.catalog], estimates: [est, ...db.estimates], jobs: [job, ...db.jobs],
    suppliers: [{ id: S1, name: "ABC Supply (test)", phone: "555", active: true }], purchaseOrders: [], costsVisible: true,
  };
}
const orders = (r: Root<P>) => valueOf(r).db.purchaseOrders ?? [];

async function signedIn(over: Partial<DB> = {}, role = "owner"): Promise<Root<P>> {
  Object.assign(auth, { session: {}, userId: "u1", company: { companyId: "c1", role, companyName: "Co" } });
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

describe("unit:purchaseOrdersStore — spec 37 SUP2", () => {
  it("«Заказ поставщику» of a job: a draft per supplier with packs and the expected cost; a second tap opens the same", async () => {
    const r = await signedIn();
    const { ids } = valueOf(r).makeJobOrders(JOB);
    await settle();
    expect(ids).toHaveLength(1);
    expect(orders(r)[0]).toMatchObject({ jobId: JOB, supplierId: S1, status: "draft", lines: [{ qty: "2", unit: "box", bomQty: "65", costCents: 1850 }] });
    expect(valueOf(r).makeJobOrders(JOB).ids).toEqual(ids);
    await settle();
    expect(orders(r)).toHaveLength(1);
    await tick();
    expect(server.sends.map((s) => s.op.k)).toEqual(["po.save"]);
  });
  it("send: the supplier's snapshot, revision 1, sent; a closed or empty order is not sent", async () => {
    const r = await signedIn();
    const [id] = valueOf(r).makeJobOrders(JOB).ids;
    expect(valueOf(r).sendPurchaseOrder(id!)).toBe(true);
    await settle();
    expect(orders(r)[0]).toMatchObject({ status: "sent", revision: 1, supplierName: "ABC Supply (test)", supplierPhone: "555" });
    valueOf(r).cancelPurchaseOrder(id!);
    await settle();
    expect(orders(r)[0]!.status).toBe("cancelled");
    expect(valueOf(r).sendPurchaseOrder(id!)).toBe(false);
  });
  it("the tech marks what came: partially → received, one po.receive each; «Отменить» sends what was before", async () => {
    const o: PurchaseOrder = {
      id: "00000000-0000-4000-8000-0000000007e1", jobId: JOB, supplierId: S1, status: "sent", revision: 1, fulfillment: "pickup", printPrices: false, createdAt: "t", rowVersion: 3,
      lines: [
        { id: "00000000-0000-4000-8000-0000000007f1", position: 0, name: "A", qty: "2", unit: "box", receivedQty: "0", checkPack: false },
        { id: "00000000-0000-4000-8000-0000000007f2", position: 1, name: "B", qty: "1", unit: "ea", receivedQty: "0", checkPack: false },
      ],
    };
    const r = await signedIn({ purchaseOrders: [o] }, "tech");
    valueOf(r).receivePurchaseOrder(o.id, [{ id: o.lines[0]!.id, received: "2" }]);
    await settle();
    expect(orders(r)[0]!.status).toBe("partially_received");
    const undo = valueOf(r).receivePurchaseOrder(o.id, [{ id: o.lines[1]!.id, received: "1" }]);
    await settle();
    expect(orders(r)[0]!.status).toBe("received");
    await drain();
    undo();
    await settle();
    expect(orders(r)[0]!.status).toBe("partially_received");
    await drain();
    const rec = server.sends.filter((s) => s.op.k === "po.receive").map((s) => s.op.lines);
    expect(rec[rec.length - 1]).toEqual([{ id: o.lines[1]!.id, received: "0" }]);
    // each marking carries the row_version the phone knows (3, 4, 5): the server refuses a stale one (#461 №3)
    expect(server.sends.filter((s) => s.op.k === "po.receive").map((s) => s.op.rowVersion)).toEqual([3, 4, 5]);
  }, 30000);
  it("the tech does not take a received order back (the office does)", async () => {
    const o = { id: "00000000-0000-4000-8000-0000000007e2", jobId: JOB, supplierId: S1, status: "received", revision: 1, fulfillment: "pickup", printPrices: false, createdAt: "t",
      lines: [{ id: "00000000-0000-4000-8000-0000000007f3", position: 0, name: "A", qty: "1", unit: "ea", receivedQty: "1", checkPack: false }] } as PurchaseOrder;
    const r = await signedIn({ purchaseOrders: [o] }, "tech");
    valueOf(r).receivePurchaseOrder(o.id, [{ id: o.lines[0]!.id, received: "0" }]);
    await settle();
    expect(orders(r)[0]!.status).toBe("received");
  });
  it("the tech and sales make no orders; a server without the table — nothing is written", async () => {
    for (const role of ["tech", "sales"]) {
      const r = await signedIn({}, role);
      expect(valueOf(r).makeJobOrders(JOB).ids, role).toEqual([]);
      root?.unmount();
      root = null;
    }
    const r = await signedIn({ purchaseOrdersLegacy: true });
    expect(valueOf(r).makeJobOrders(JOB).ids).toEqual([]);
    await tick();
    expect(server.sends).toEqual([]);
  });
});
