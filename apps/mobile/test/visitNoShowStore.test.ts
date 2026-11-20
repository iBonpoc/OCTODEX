/**
 * #2066 «Клиента нет дома»: the store's mutation (markNoShow). React's hooks: test/support/miniReact.ts; the server (repo,
 * ops), the sign-in and AsyncStorage are stand-ins (as test/checklistStore.test.ts).
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
import type { DB, Job, Visit } from "../src/data/types";

type Value = { db: DB; mode: string; markNoShow: (id: string, note?: string) => () => void };
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
const tick = async () => {
  await wait(1700); // the outbox tick
  await settle();
};
let root: Root<P> | null = null;

const JOB = "00000000-0000-4000-8000-0000000020e1";
const DOOR = "00000000-0000-4000-8000-0000000020f1";
const OTHER = "00000000-0000-4000-8000-0000000020f2";
const INSP = "00000000-0000-4000-8000-0000000020f3";
function company(): DB {
  const db = makeSeed();
  const v0 = db.visits[0]!;
  const p = db.properties[0]!;
  const lead = db.leads[0]!;
  const base = { ...v0, jobId: JOB, leadId: undefined, kind: "install" as const, photos: [], checklist: [], closed: undefined, payment: undefined, signature: undefined };
  const visits: Visit[] = [
    { ...base, id: DOOR, step: "on_site", techId: "u1", assigneeIds: ["u1"] },
    { ...base, id: OTHER, jobId: "other-job", step: "on_site", techId: "u2", assigneeIds: ["u2"] },
    { ...base, id: INSP, jobId: undefined, leadId: lead.id, propertyId: p.id, kind: "inspection", step: "scheduled", techId: "u1", assigneeIds: ["u1"] },
  ];
  return {
    ...db, me: "u1",
    jobs: [...db.jobs, { id: JOB, title: "T2066", propertyId: p.id, status: "scheduled", amountCents: 1000 } as Job],
    leads: db.leads.map((l) => (l.id === lead.id ? { ...l, status: "booked" } : l)),
    visits: [...visits, ...db.visits.filter((v) => v.leadId !== lead.id)],
    cancelledVisits: [],
  };
}

async function signedIn(role: string): Promise<Root<P>> {
  Object.assign(auth, { session: {}, userId: "u1", company: { companyId: "c1", role, companyName: "Co" } });
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  await settle();
  server.loads.splice(0).forEach((d) => d.resolve(company()));
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

/** #2066 the store's «Клиента нет дома»: at once on the phone, one op to the server (visit_no_show) */
describe("unit:visitNoShowStore", () => {
  it("the tech on site: the visit is kept with the reason, the note and who; the job waits for a date; one op", async () => {
    const r = await signedIn("tech");
    valueOf(r).markNoShow(DOOR, "  left a card ");
    await settle();
    const d = valueOf(r).db;
    expect(d.visits.some((v) => v.id === DOOR)).toBe(false);
    expect(d.cancelledVisits?.find((v) => v.id === DOOR)).toMatchObject({ cancelReason: "no_show", cancelText: "left a card", cancelledBy: "u1" });
    expect(d.jobs.find((j) => j.id === JOB)?.status).toBe("unscheduled");
    await tick();
    expect(server.sends.map((s) => s.op.k)).toEqual(["visit.noShow"]);
    expect(server.sends[0]!.op).toMatchObject({ visitId: DOOR, note: "left a card", jobBack: JOB });
  });
  it("the lead's inspection: the lead goes back to «in contact», the op names it", async () => {
    const r = await signedIn("tech");
    const leadId = valueOf(r).db.visits.find((v) => v.id === INSP)!.leadId!;
    valueOf(r).markNoShow(INSP);
    await settle();
    expect(valueOf(r).db.leads.find((l) => l.id === leadId)?.status).toBe("replied");
    await tick();
    expect(server.sends[0]!.op).toMatchObject({ k: "visit.noShow", visitId: INSP, leadBack: leadId });
  });
  it("another tech's visit, or a repeat: nothing changes, nothing is sent", async () => {
    const r = await signedIn("tech");
    valueOf(r).markNoShow(OTHER);
    valueOf(r).markNoShow(DOOR);
    valueOf(r).markNoShow(DOOR);
    await settle();
    expect(valueOf(r).db.visits.some((v) => v.id === OTHER)).toBe(true);
    await tick();
    expect(server.sends.map((s) => s.op.k)).toEqual(["visit.noShow"]);
  });
});
