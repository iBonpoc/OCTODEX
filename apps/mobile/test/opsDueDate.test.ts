/**
 * П4b-3: the due day of a new invoice is the company's day when the invoice was made on the phone, not the day the
 * queued op reaches the server (docs/specs/03 «П4b-1 сделано», gap «офлайн в 23:50 → следующий день»).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const rows: { table: string; row: Record<string, unknown> }[] = [];
// a chain that answers every supabase call with «no error, no data»; upserts are recorded
const chain = (table: string): Record<string, unknown> => {
  const done = Promise.resolve({ data: null, error: null });
  const c: Record<string, unknown> = {
    upsert: (row: Record<string, unknown>) => { rows.push({ table, row }); return done; },
    insert: (row: Record<string, unknown>) => { rows.push({ table, row }); return done; },
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => done.then(r, j),
  };
  for (const k of ["select", "update", "eq", "neq", "is", "in", "order", "limit"]) c[k] = () => c;
  c.maybeSingle = () => done;
  c.single = () => done;
  return c;
};
vi.mock("../src/cloud/client", () => ({ supabase: { from: (t: string) => chain(t), rpc: () => Promise.resolve({ data: null, error: null }) } }));

import { applyOp, type Op } from "../src/cloud/ops";
import { companyToday, setZone } from "../src/features/zone";

const J = "11111111-1111-4111-8111-111111111111";
const dueOf = () => rows.find((r) => r.table === "invoices")?.row.due_date;

afterEach(() => {
  rows.length = 0;
  vi.useRealTimers();
  setZone("America/Los_Angeles");
});

describe("due_date of an invoice made offline", () => {
  it("made at 11:50 PM in LA, sent after midnight: due the day it was made", async () => {
    setZone("America/Los_Angeles");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T23:50:00-08:00"));
    // the store queues the op with the company's day of that moment
    const op: Op = { k: "invoice.issue", id: "i-1", jobId: J, customerId: "c-1", kind: "final", title: "Final", totalCents: 1000, dueDate: companyToday() };
    vi.setSystemTime(new Date("2026-11-06T00:10:00-08:00")); // back online 20 minutes later
    await applyOp(op, "co-1", "u-1");
    expect(dueOf()).toBe("2026-11-05");
  });
  it("the same for the final invoice of a paid visit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T00:10:00-08:00"));
    await applyOp({ k: "visit.pay", visitId: "v-1", jobId: "j-demo", customerId: "c-1", invoiceId: "i-2", paymentId: "p-2", amountCents: 500, method: "cash", dueDate: "2026-11-05" }, "co-1", "u-1");
    expect(dueOf()).toBe("2026-11-05");
  });
  it("an op queued by an older build (no dueDate): the company's today when sent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T07:30:00.000Z")); // 11:30 PM on Nov 5 in LA, Nov 6 in UTC
    await applyOp({ k: "invoice.issue", id: "i-3", jobId: J, customerId: "c-1", kind: "progress", title: "P", totalCents: 1000 }, "co-1", "u-1");
    expect(dueOf()).toBe("2026-11-05");
  });
});
