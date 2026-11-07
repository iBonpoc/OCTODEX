/**
 * Reads inside an op (ops.ts) must not read a failed request as «nothing there» (review of #244, task 1 of «Лиды» №9).
 * A dropped connection gives `{ data: null, error }` from supabase-js, not an exception: without a check the op went on
 * as if the row did not exist — a second deposit invoice, a second primary contact, a locked estimate version edited
 * as open. Now the op stops with the error (the queue keeps it and retries) and writes nothing after the failed read.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const writes: { table: string; kind: string; row?: unknown }[] = [];
/** tables whose reads fail like a dropped connection */
const failing = new Set<string>();
/** tables whose reads get a server error answer (status, code) */
const serverErr: Record<string, { status: number; code: string }> = {};
/** what a successful read of a table returns */
const found: Record<string, unknown> = {};
/** what a successful head:true count of a table returns */
const counts: Record<string, number> = {};

const chain = (table: string): Record<string, unknown> => {
  let write: string | null = null;
  const result = () =>
    Promise.resolve(
      write
        ? { data: null, error: null }
        : serverErr[table]
          ? { data: null, count: null, status: serverErr[table]!.status, error: { message: "upstream", code: serverErr[table]!.code } }
          : failing.has(table)
          ? { data: null, count: null, error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 }
          : { data: found[table] ?? null, count: counts[table] ?? 0, error: null },
    );
  const c: Record<string, unknown> = {
    then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => result().then(r, j),
  };
  for (const k of ["insert", "upsert", "update", "delete"]) {
    c[k] = (row?: unknown) => {
      write = k;
      writes.push({ table, kind: k, row });
      return c;
    };
  }
  for (const k of ["select", "eq", "neq", "is", "in", "not", "order", "limit", "range"]) c[k] = () => c;
  c.maybeSingle = () => result();
  c.single = () => result();
  return c;
};
vi.mock("../src/cloud/client", () => ({ supabase: { from: (t: string) => chain(t), rpc: () => Promise.resolve({ data: null, error: null }) } }));

import { applyOp, type Op } from "../src/cloud/ops";
import { classify } from "../src/data/outboxRetry";

const J = "11111111-1111-4111-8111-111111111111";
const E = "22222222-2222-4222-8222-222222222222";
const V = "33333333-3333-4333-8333-333333333333";

afterEach(() => {
  writes.length = 0;
  failing.clear();
  for (const k of Object.keys(serverErr)) delete serverErr[k];
  for (const k of Object.keys(found)) delete found[k];
  for (const k of Object.keys(counts)) delete counts[k];
});

const deposit: Op = {
  k: "estimate.deposit", id: E, jobId: J, invoiceId: "inv-new", paymentId: "pay-1", method: "cash",
  customerId: "c-1", propertyId: "p-1", title: "Gutters", totalCents: 100000, depositCents: 10000, dueDate: "2026-11-07",
};

describe("unit:opsReadErrors — a failed read inside an op stops the op", () => {
  it("deposit: the existing deposit invoice could not be read → no second deposit invoice, no payment", async () => {
    failing.add("invoices");
    await expect(applyOp(deposit, "co-1", "u-1")).rejects.toThrow(/Failed to fetch/);
    expect(writes.filter((w) => w.table === "invoices" || w.table === "payments")).toEqual([]);
  });
  it("deposit: the job of the estimate could not be read → no second job", async () => {
    failing.add("jobs");
    await expect(applyOp(deposit, "co-1", "u-1")).rejects.toThrow(/Failed to fetch/);
    expect(writes.filter((w) => w.table === "jobs")).toEqual([]);
  });
  it("deposit: the approved version could not be read → the job is not made without it", async () => {
    failing.add("estimates");
    await expect(applyOp(deposit, "co-1", "u-1")).rejects.toThrow(/Failed to fetch/);
    expect(writes).toEqual([]);
  });
  it("deposit, control: reads succeed → the job, the invoice and the payment are written", async () => {
    await applyOp(deposit, "co-1", "u-1");
    expect(writes.some((w) => w.table === "invoices")).toBe(true);
  });

  it("phone of a customer: the primary contact could not be read → no second primary contact", async () => {
    failing.add("contacts");
    await expect(applyOp({ k: "customer.update", id: "c-1", phone: "+15551234567" }, "co-1", "u-1")).rejects.toThrow(/Failed to fetch/);
    expect(writes.filter((w) => w.table === "contacts")).toEqual([]);
  });

  it("estimate save: the version could not be read → a locked version is not edited as open", async () => {
    found.estimates = { status: "draft", current_version_id: V };
    failing.add("estimate_versions");
    const op = { k: "estimate.save", id: E, versionId: "v-new", customerId: "c-1", propertyId: "p-1", title: "T", doc: {}, costs: {}, totalCents: 0, depositCents: 0, marginPct: null } as unknown as Op;
    await expect(applyOp(op, "co-1", "u-1")).rejects.toThrow(/Failed to fetch/);
    expect(writes.filter((w) => w.table === "estimate_versions" && w.kind === "update")).toEqual([]);
  });
  it("estimate save: the estimate could not be read → stops with the error, not «estimate is not visible» (a refusal)", async () => {
    failing.add("estimates");
    const op = { k: "estimate.save", id: E, versionId: "v-new", customerId: "c-1", propertyId: "p-1", title: "T", doc: {}, costs: {}, totalCents: 0, depositCents: 0, marginPct: null } as unknown as Op;
    await expect(applyOp(op, "co-1", "u-1")).rejects.toThrow(/Failed to fetch/);
  });

  it("company save: the stored columns could not be read → the company is not overwritten with blanks", async () => {
    failing.add("companies");
    await expect(applyOp({ k: "company.save", company: { name: "Acme" } } as unknown as Op, "co-1", "u-1")).rejects.toThrow(/Failed to fetch/);
    expect(writes.filter((w) => w.table === "companies")).toEqual([]);
  });

  it("job schedule: the current status could not be read → the job is not walked from «draft» again", async () => {
    failing.add("jobs");
    await expect(applyOp({ k: "job.schedule", jobId: J, visitId: "v-1", start: "2026-11-08T16:00:00Z", end: "2026-11-08T18:00:00Z", techId: null, scope: [] }, "co-1", "u-1")).rejects.toThrow(/Failed to fetch/);
    expect(writes.filter((w) => w.table === "jobs")).toEqual([]);
  });

  it("lead booked: the lead sources could not be read → the client is not saved without its source", async () => {
    failing.add("lead_sources");
    const op = { k: "lead.book", customerId: "c-1", contactId: "k-1", propertyId: "p-1", jobId: J, visitId: "v-1", name: "Ann", phone: "+15551234567", address: "1 Main", city: "LA", start: "2026-11-08T16:00:00Z", source: "Website" } as unknown as Op;
    await expect(applyOp(op, "co-1", "u-1")).rejects.toThrow(/Failed to fetch/);
    expect(writes).toEqual([]);
  });

  it("a server error on a read keeps its status and code, so the queue knows it is temporary (classify, #244)", async () => {
    serverErr.invoices = { status: 503, code: "PGRST002" };
    const e = await applyOp(deposit, "co-1", "u-1").then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ status: 503, code: "PGRST002" });
    expect(classify(e)).toBe("transient");
    expect(writes.filter((w) => w.table === "invoices")).toEqual([]);
  });

  it("lead booked, control: the server refuses the sources read → the client is still saved (without a source)", async () => {
    serverErr.lead_sources = { status: 403, code: "42501" };
    const op = { k: "lead.book", customerId: "c-1", contactId: "k-1", propertyId: "p-1", jobId: J, visitId: "v-1", name: "Ann", phone: "+15551234567", address: "1 Main", city: "LA", start: "2026-11-08T16:00:00Z", source: "Website" } as unknown as Op;
    await applyOp(op, "co-1", "u-1");
    expect(writes.find((w) => w.table === "customers")?.row).toMatchObject({ lead_source_id: null });
  });

});

const add: Op = {
  k: "estimate.add", id: E, versionId: V, optionId: "o-1", customerId: "c-1", propertyId: "p-1", title: "Gutters: 120 ft",
  totalCents: 120000, lines: [{ name: "Gutter 5in (тестовые цены)", qty: "120", totalCents: 120000 }],
};

describe("unit:opsReadErrors — what is not an error, and a resend after a lost answer", () => {
  it("count (head: true): a failed count stops the op — the lines are not inserted on a guess", async () => {
    failing.add("estimate_line_items");
    await expect(applyOp(add, "co-1", "u-1")).rejects.toThrow(/Failed to fetch/);
    expect(writes.filter((w) => w.table === "estimate_line_items")).toEqual([]);
  });
  it("count, resend: the lines are already there (count 1) → not inserted a second time", async () => {
    counts.estimate_line_items = 1;
    await applyOp(add, "co-1", "u-1");
    expect(writes.filter((w) => w.table === "estimate_line_items" && w.kind === "insert")).toEqual([]);
  });
  it("count, first send: no lines yet → inserted once", async () => {
    await applyOp(add, "co-1", "u-1");
    expect(writes.filter((w) => w.table === "estimate_line_items" && w.kind === "insert")).toHaveLength(1);
  });

  it("maybeSingle «no row» without error is a real answer, not a refusal: no primary contact → one is made", async () => {
    await applyOp({ k: "customer.update", id: "c-1", phone: "+15551234567" }, "co-1", "u-1");
    expect(writes.filter((w) => w.table === "contacts").map((w) => w.kind)).toEqual(["insert"]);
  });
  it("maybeSingle: the primary contact exists → it is updated, no second one", async () => {
    found.contacts = { id: "k-1" };
    await applyOp({ k: "customer.update", id: "c-1", phone: "+15551234567" }, "co-1", "u-1");
    expect(writes.filter((w) => w.table === "contacts").map((w) => w.kind)).toEqual(["update"]);
  });

  it("deposit resent after a lost answer: the job and the deposit invoice exist → no second invoice, the job is not duplicated", async () => {
    found.estimates = { current_version_id: V };
    found.jobs = { id: J };
    found.invoices = { id: "inv-old" };
    await applyOp({ ...deposit, jobId: "job-new-id" } as Op, "co-1", "u-1");
    expect(writes.filter((w) => w.table === "invoices" && w.kind !== "update")).toEqual([]);
    // the job insert reuses the existing id (ON CONFLICT DO NOTHING), not the new one from the phone
    expect(writes.filter((w) => w.table === "jobs").map((w) => (w.row as { id: string }).id)).toEqual([J]);
  });
});
