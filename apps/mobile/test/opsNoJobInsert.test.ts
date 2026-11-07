/**
 * 17-job §12.1 (migration 20261107040000, rule 16 step 1): the app inserts no job. Old queued ops lead.book / lead.visit make
 * an inspection without a job; estimate.deposit goes through record_estimate_deposit (the job is the signature's).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const writes: { table: string; how: string; row: Record<string, unknown> }[] = [];
const rpcs: { name: string; args: Record<string, unknown> }[] = [];
// a chain that answers every supabase call with «no error, no data»; writes are recorded
const chain = (table: string): Record<string, unknown> => {
  const done = Promise.resolve({ data: null, error: null });
  const c: Record<string, unknown> = {
    upsert: (row: Record<string, unknown>) => { writes.push({ table, how: "upsert", row }); return done; },
    insert: (row: Record<string, unknown>) => { writes.push({ table, how: "insert", row }); return done; },
    update: (row: Record<string, unknown>) => { writes.push({ table, how: "update", row }); return c; },
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => done.then(r, j),
  };
  for (const k of ["select", "eq", "neq", "is", "in", "order", "limit"]) c[k] = () => c;
  c.maybeSingle = () => done;
  c.single = () => done;
  return c;
};
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (t: string) => chain(t),
    rpc: (name: string, args: Record<string, unknown>) => { rpcs.push({ name, args }); return Promise.resolve({ data: null, error: null }); },
  },
}));

import { applyOp, type Op } from "../src/cloud/ops";

const ids = {
  leadId: "10000000-0000-4000-8000-000000000001", customerId: "20000000-0000-4000-8000-000000000001", contactId: "30000000-0000-4000-8000-000000000001",
  propertyId: "40000000-0000-4000-8000-000000000001", jobId: "50000000-0000-4000-8000-000000000001", visitId: "60000000-0000-4000-8000-000000000001",
};
const jobWrites = () => writes.filter((w) => w.table === "jobs" && w.how !== "update");
const visit = () => writes.find((w) => w.table === "visits")?.row;

afterEach(() => {
  writes.length = 0;
  rpcs.length = 0;
});

describe("the app inserts no job (17-job §12.1)", () => {
  it("lead.book of an old queue: an inspection of the lead at the property, no job", async () => {
    const op: Op = { k: "lead.book", ...ids, name: "Ann", phone: "(818) 555-0100", sourceId: "", address: "1 Elm St", city: "Pasadena", message: "Leak", start: "2026-11-08T17:00:00.000Z" };
    await applyOp(op, "co-1", "u-1");
    expect(jobWrites()).toEqual([]);
    expect(visit()).toMatchObject({ id: ids.visitId, lead_id: ids.leadId, property_id: ids.propertyId, kind: "inspection" });
    expect(visit()).not.toHaveProperty("job_id");
  });
  it("lead.visit of an old queue: the same", async () => {
    const op: Op = { k: "lead.visit", leadId: ids.leadId, customerId: ids.customerId, propertyId: ids.propertyId, jobId: ids.jobId, visitId: ids.visitId, start: "2026-11-08T17:00:00.000Z", durationMin: 45, techId: null, scope: [] };
    await applyOp(op, "co-1", "u-1");
    expect(jobWrites()).toEqual([]);
    expect(visit()).toMatchObject({ lead_id: ids.leadId, property_id: ids.propertyId, kind: "inspection" });
    expect(visit()).not.toHaveProperty("job_id");
  });
  it("estimate.deposit: one server call, no job, invoice or payment written by the app", async () => {
    const op: Op = {
      k: "estimate.deposit", id: "70000000-0000-4000-8000-000000000001", jobId: ids.jobId, invoiceId: "80000000-0000-4000-8000-000000000001",
      paymentId: "90000000-0000-4000-8000-000000000001", method: "cash", customerId: ids.customerId, propertyId: ids.propertyId,
      title: "Gutters", totalCents: 100000, depositCents: 30000, dueDate: "2026-11-07",
    };
    await applyOp(op, "co-1", "u-1");
    expect(writes).toEqual([]);
    expect(rpcs).toEqual([{ name: "record_estimate_deposit", args: { p_estimate_id: op.id, p_payment_id: op.paymentId, p_method: "cash" } }]);
  });
});

describe("estimate.deposit refused by the server (review of #247)", () => {
  it("«not signed on the server» is a refusal (P0001): the op is dropped, not tried again five times", async () => {
    const { PermanentError } = await import("../src/cloud/ops");
    const { supabase } = await import("../src/cloud/client");
    const spy = vi.spyOn(supabase, "rpc").mockResolvedValueOnce({ data: null, error: { message: "the deposit was not recorded: the estimate is not signed on the server", code: "P0001" } } as never);
    const op: Op = {
      k: "estimate.deposit", id: "70000000-0000-4000-8000-000000000002", jobId: ids.jobId, invoiceId: "80000000-0000-4000-8000-000000000002",
      paymentId: "90000000-0000-4000-8000-000000000002", method: "cash", customerId: ids.customerId, propertyId: ids.propertyId,
      title: "Gutters", totalCents: 100000, depositCents: 30000,
    };
    await expect(applyOp(op, "co-1", "u-1")).rejects.toBeInstanceOf(PermanentError);
    spy.mockRestore();
  });
});
