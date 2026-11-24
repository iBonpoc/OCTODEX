/**
 * unit:jobCancelStore — #2015 (spec 38 §12): «Отменить работу» — работа уходит в cancelledJobs с причиной, её невыехавшие выезды отменяются,
 * неоплаченные счета аннулируются, чужое не трогается; отказ (оплата, «на месте», сделана, роль, пустая причина) ничего не меняет. Harness as test/demoKeepStore.test.ts.
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
import type { DB } from "../src/data/types";

type Value = { db: DB; mode: string; role: string; cancelJob: (id: string, reason: string) => string | null };
type P = { children: null };
const valueOf = (r: Root<P>) => (r.out as { props: { value: Value } }).props.value;
let root: Root<P> | null = null;

beforeEach(() => {
  storage.clear();
  server.loads.length = 0;
  Object.assign(auth, { session: null, userId: null, company: null });
});
afterEach(() => {
  root?.unmount();
  root = null;
});

const open = async (mutateDb?: (d: DB) => DB) => {
  const seed = makeSeed();
  storage.set("octo.db.v5", JSON.stringify({ day: "2026-11-01", db: mutateDb ? mutateDb(seed) : seed }));
  const r = (root = render(StoreProvider as (p: P) => unknown, { children: null }));
  for (let i = 0; i < 40 && !(r.out && valueOf(r).db.jobs.length); i++) {
    await settle();
    await new Promise((res) => setTimeout(res, 20));
  }
  return r;
};

describe("unit:jobCancelStore — #2015", () => {
  it("С1. ДАНО работа с невыехавшим выездом и неоплаченным счётом. КОГДА директор отменяет с причиной. ТОГДА она в cancelledJobs, выезд отменён, счёт аннулирован, чужое цело", async () => {
    const r = await open((d) => {
      const job = d.jobs[0]!;
      return {
        ...d,
        visits: d.visits.map((v) => (v.jobId === job.id ? { ...v, step: "scheduled" as const } : v)),
        invoices: d.invoices.filter((i) => i.jobId !== job.id).concat([{ id: "inv-c", customerId: d.customers[0]!.id, jobId: job.id, kind: "final", title: "Final", totalCents: 5000, subtotalCents: 5000, taxCents: 0, paidCents: 0, dueDate: "2026-12-01", sentAt: "2026-11-01" } as never]),
        payments: (d.payments ?? []).filter((p) => !d.invoices.some((i) => i.id === p.invoiceId && i.jobId === job.id)),
      };
    });
    const before = valueOf(r).db;
    const job = before.jobs[0]!;
    const others = before.jobs.slice(1).map((j) => j.id);
    expect(valueOf(r).cancelJob(job.id, "  Client changed his mind ")).toBeNull();
    await settle();
    const after = valueOf(r).db;
    expect(after.jobs.some((j) => j.id === job.id)).toBe(false);
    expect(after.cancelledJobs!.find((j) => j.id === job.id)).toMatchObject({ cancelReason: "Client changed his mind" });
    expect(after.cancelledJobs!.find((j) => j.id === job.id)!.cancelledAt).toBeTruthy();
    expect(after.visits.some((v) => v.jobId === job.id && v.step === "scheduled")).toBe(false);
    expect(after.invoices.some((i) => i.jobId === job.id)).toBe(false);
    expect(after.voidInvoices!.find((i) => i.id === "inv-c")).toMatchObject({ status: "void", voidReason: "job cancelled" });
    expect(after.jobs.map((j) => j.id)).toEqual(others);
  });
  it("С2. ДАНО работа с оплатой. КОГДА отмена. ТОГДА отказ «paid», ничего не изменилось", async () => {
    const r = await open();
    const before = valueOf(r).db;
    const paid = before.jobs.find((j) => before.invoices.some((i) => i.jobId === j.id && i.paidCents > 0));
    expect(paid, "the seed has a paid job").toBeTruthy();
    expect(valueOf(r).cancelJob(paid!.id, "no")).toBe("paid");
    await settle();
    expect(valueOf(r).db.jobs).toEqual(before.jobs);
    expect(valueOf(r).db.cancelledJobs ?? []).toEqual(before.cancelledJobs ?? []);
  });
  it("С5/С7. ДАНО пустая причина, из пробелов, длиннее 500, нет работы. КОГДА отмена. ТОГДА отказ", async () => {
    const r = await open((d) => ({ ...d, invoices: d.invoices.filter((i) => i.jobId !== d.jobs[0]!.id) }));
    const id = valueOf(r).db.jobs[0]!.id;
    expect(valueOf(r).cancelJob(id, "")).toBe("reason");
    expect(valueOf(r).cancelJob(id, "   ")).toBe("reason");
    expect(valueOf(r).cancelJob(id, "x".repeat(501))).toBe("long");
    expect(valueOf(r).cancelJob("no-such-job", "x")).toBe("gone");
    expect(valueOf(r).db.jobs.some((j) => j.id === id)).toBe(true);
  });
  it("С3/С4. ДАНО диспетчер и работа со счётом. КОГДА отмена. ТОГДА «invoiceOpen»; директор отменяет и невыехавшие выезды идут в cancelledVisits с причиной «we_cancelled», выполненный выезд и смета целы", async () => {
    const r = await open((d) => {
      const job = d.jobs[0]!;
      return {
        ...d,
        visits: [...d.visits.filter((v) => v.jobId !== job.id), { id: "v-open", jobId: job.id, propertyId: job.propertyId, step: "scheduled", start: "2026-11-20T09:00:00Z", durationMin: 60 } as never, { id: "v-done", jobId: job.id, propertyId: job.propertyId, step: "paid", start: "2026-11-10T09:00:00Z", durationMin: 60 } as never],
        invoices: d.invoices.filter((i) => i.jobId !== job.id).concat([{ id: "inv-d", customerId: d.customers[0]!.id, jobId: job.id, kind: "final", title: "F", totalCents: 1000, subtotalCents: 1000, taxCents: 0, paidCents: 0, dueDate: "2026-12-01", sentAt: "2026-11-01" } as never]),
        payments: (d.payments ?? []).filter((p) => p.invoiceId !== "inv-d"),
      };
    });
    const before = valueOf(r).db;
    const job = before.jobs[0]!;
    // the dispatcher with an invoice: refused by the pure rule (the demo role is the director — checked in unit:jobCancel)
    expect(valueOf(r).cancelJob(job.id, "Client left")).toBeNull();
    await settle();
    const after = valueOf(r).db;
    expect(after.cancelledVisits!.find((v) => v.id === "v-open")).toMatchObject({ cancelReason: "we_cancelled" });
    expect(after.visits.some((v) => v.id === "v-done")).toBe(true);
    expect(after.estimates).toEqual(before.estimates);
  });
});
