/**
 * unit:estimateClientLock — #2406 (+#2383): the client of an estimate is changed only in a draft (founder 22.11.2026:
 * «Если не черновик — так не должно работать»). The rule (canChangeEstimateClient) for every status, and the store: a save of
 * a sent / client-signed estimate with another client keeps the old client and property (no other way round the screen).
 * Harness as test/estimateSaveFromStatusStore.test.ts. Test data.
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
const loads: { resolve: (v: unknown) => void }[] = [];
const sends: { k: string; customerId?: string; propertyId?: string }[] = [];
vi.mock("@/cloud/repo", async (orig) => ({
  ...(await orig<object>()),
  loadCompanyDB: () => new Promise((resolve) => loads.push({ resolve })),
}));
vi.mock("@/cloud/ops", async (orig) => ({
  ...(await orig<object>()),
  applyOp: (op: { k: string; customerId?: string; propertyId?: string }) => {
    sends.push(op);
    return new Promise<void>(() => {});
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
import { ESTIMATE_STATUSES, type DB, type EstimateDoc, type EstimateStatus } from "../src/data/types";
import { canChangeEstimateClient } from "../src/features/estimateStatus";

type Value = {
  db: DB;
  mode: string;
  saveEstimate: (e: { id: string; customerId: string; propertyId: string; title: string; doc: EstimateDoc }) => unknown;
};
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
let root: Root<P> | null = null;

beforeEach(() => {
  storage.clear();
  loads.length = 0;
  sends.length = 0;
  Object.assign(auth, { session: null, userId: null, company: null });
});
afterEach(() => {
  root?.unmount();
  root = null;
});

describe("unit:estimateClientLock — #2406: the rule", () => {
  it.each(ESTIMATE_STATUSES.map((s) => [s, s === "draft"] as const))("%s → client changeable: %s", (s, want) => {
    expect(canChangeEstimateClient(s)).toBe(want);
  });
  it("a new estimate (no status yet) may pick its client", () => {
    expect(canChangeEstimateClient(undefined)).toBe(true);
  });
});

describe("unit:estimateClientLock — #2406: the store", () => {
  const saveWithOtherClient = async (status: EstimateStatus) => {
    const base = makeSeed();
    const e0 = base.estimates.find((e) => e.doc)!;
    const other = base.customers.find((c) => c.id !== e0.customerId)!;
    const otherProp = base.properties.find((p) => p.customerId === other.id)!;
    Object.assign(auth, { session: {}, userId: "u1", company: { companyId: "c1", role: "owner", companyName: "Co" } });
    root = render(StoreProvider as (p: P) => unknown, { children: null });
    await settle();
    loads.splice(0).forEach((d) => d.resolve({ ...base, me: "u1", estimates: base.estimates.map((e) => (e.id === e0.id ? { ...e, status } : e)) }));
    await settle();
    valueOf(root).saveEstimate({ id: e0.id, customerId: other.id, propertyId: otherProp.id, title: e0.title, doc: e0.doc! });
    await settle();
    return { was: e0, other, now: valueOf(root).db.estimates.find((e) => e.id === e0.id)! };
  };
  it("a draft: the client changes", async () => {
    const { other, now } = await saveWithOtherClient("draft");
    expect(now.customerId).toBe(other.id);
  });
  it.each(["sent", "awaiting_countersign", "approved", "declined"] as const)("%s: the save keeps the old client and property", async (s) => {
    const { was, now } = await saveWithOtherClient(s);
    expect(now.customerId).toBe(was.customerId);
    expect(now.propertyId).toBe(was.propertyId);
  });
});
