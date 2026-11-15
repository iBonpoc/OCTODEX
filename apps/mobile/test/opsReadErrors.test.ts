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
/** tables whose writes get an error answer (status 0 = dropped connection) */
const writeErr: Record<string, { status: number; code: string; message?: string }> = {};
/** filters asked of each table: `is` calls ([column, value]) */
const isCalls: { table: string; col: string; val: unknown }[] = [];
/** the photo upload: its answer */
const upload: { error: unknown } = { error: null };
/** what a successful head:true count of a table returns */
const counts: Record<string, number> = {};

const chain = (table: string): Record<string, unknown> => {
  let write: string | null = null;
  const result = () =>
    Promise.resolve(
      write
        ? writeErr[table]
          ? { data: null, status: writeErr[table]!.status, error: { message: writeErr[table]!.message ?? "denied", code: writeErr[table]!.code } }
          : { data: null, error: null }
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
  for (const k of ["select", "eq", "neq", "in", "not", "order", "limit", "range"]) c[k] = () => c;
  c.is = (col: string, val: unknown) => {
    isCalls.push({ table, col, val });
    return c;
  };
  c.maybeSingle = () => result();
  c.single = () => result();
  return c;
};
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (t: string) => chain(t),
    rpc: (fn: string) => Promise.resolve(fn === "save_estimate_version" ? { data: null, error: { code: "PGRST202", message: "no function" }, status: 404 } : { data: null, error: null }),
    storage: { from: () => ({ upload: () => Promise.resolve({ data: null, error: upload.error }) }) },
  },
}));

import { applyOp, type Op } from "../src/cloud/ops";
import { classify } from "../src/data/outboxRetry";
import { companyFromDb } from "../src/cloud/companyMap";

const J = "11111111-1111-4111-8111-111111111111";
const E = "22222222-2222-4222-8222-222222222222";
const V = "33333333-3333-4333-8333-333333333333";

afterEach(() => {
  writes.length = 0;
  failing.clear();
  for (const k of Object.keys(serverErr)) delete serverErr[k];
  for (const k of Object.keys(found)) delete found[k];
  for (const k of Object.keys(counts)) delete counts[k];
  for (const k of Object.keys(writeErr)) delete writeErr[k];
  isCalls.length = 0;
  upload.error = null;
  vi.unstubAllGlobals();
});

const deposit: Op = {
  k: "estimate.deposit", id: E, jobId: J, invoiceId: "inv-new", paymentId: "pay-1", method: "cash",
  customerId: "c-1", propertyId: "p-1", title: "Gutters", totalCents: 100000, depositCents: 10000, dueDate: "2026-11-07",
};

describe("unit:opsReadErrors — a failed read inside an op stops the op", () => {
  // estimate.deposit is one server function since 17-job §12.1 (#247): no reads in the op, nothing written by the app;
  // the rpc's own failure keeps its status and code for the queue
  it("deposit: the rpc gets no answer (dropped connection) → a network failure, nothing written", async () => {
    const { supabase } = await import("../src/cloud/client");
    const spy = vi.spyOn(supabase, "rpc").mockResolvedValueOnce({ data: null, error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 } as never);
    const e = await applyOp(deposit, "co-1", "u-1").then(() => null, (x: unknown) => x);
    expect(classify(e)).toBe("network");
    expect(writes).toEqual([]);
    spy.mockRestore();
  });
  it("deposit, control: one rpc, no job, invoice or payment written by the app", async () => {
    await applyOp(deposit, "co-1", "u-1");
    expect(writes).toEqual([]);
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

  it("a server error keeps its status and code, so the queue knows it is temporary (classify, #244)", async () => {
    serverErr.contacts = { status: 503, code: "PGRST002" };
    const e = await applyOp({ k: "customer.update", id: "c-1", phone: "+15551234567" }, "co-1", "u-1").then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ status: 503, code: "PGRST002" });
    expect(classify(e)).toBe("transient");
    expect(writes.filter((w) => w.table === "contacts")).toEqual([]);
  });
  it("deposit: a server error of the rpc keeps its status and code (transient)", async () => {
    const { supabase } = await import("../src/cloud/client");
    const spy = vi.spyOn(supabase, "rpc").mockResolvedValueOnce({ data: null, error: { message: "upstream", code: "PGRST002" }, status: 503 } as never);
    const e = await applyOp(deposit, "co-1", "u-1").then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ status: 503, code: "PGRST002" });
    expect(classify(e)).toBe("transient");
    spy.mockRestore();
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

  it("deposit resent after a lost answer: the same payment id goes to the server again (it answers «repeat»), nothing written here", async () => {
    const { supabase } = await import("../src/cloud/client");
    const spy = vi.spyOn(supabase, "rpc");
    await applyOp(deposit, "co-1", "u-1");
    await applyOp(deposit, "co-1", "u-1");
    expect(spy.mock.calls.map((c) => (c[1] as { p_payment_id: string }).p_payment_id)).toEqual(["pay-1", "pay-1"]);
    expect(writes).toEqual([]);
    spy.mockRestore();
  });

});

describe("unit:opsReadErrors — review #248: deleted primary contact, costs, photo upload", () => {
  it("the primary contact is looked up among the live ones (a deleted primary is not updated, no PGRST116 with two)", async () => {
    await applyOp({ k: "customer.update", id: "c-1", email: "a@b.co" }, "co-1", "u-1");
    expect(isCalls).toContainEqual({ table: "contacts", col: "deleted_at", val: null });
  });

  const save = (costs: Record<string, number>) =>
    ({
      k: "estimate.save", id: E, versionId: V, customerId: "c-1", propertyId: "p-1", title: "T", costs, totalCents: 1000, depositCents: 0, marginPct: null,
      doc: {
        settings: { tax: { enabled: false, groups: {}, rateBps: 0 }, deposit: { kind: "pct", value: "0" } },
        options: [{ id: "o-1", name: "Good", lines: [{ id: "l-1", name: "Gutter (тестовые цены)", quantity: "1", unit: "ea", unitPriceCents: 1000, group: "material" }] }],
      },
    }) as unknown as Op;
  it("costs: a dropped connection on the cost write stops the op (it is resent, the costs are not lost)", async () => {
    found.estimates = { status: "draft", current_version_id: null };
    writeErr.estimate_line_costs = { status: 0, code: "", message: "TypeError: Failed to fetch" };
    await expect(applyOp(save({ "l-1": 400 }), "co-1", "u-1")).rejects.toThrow(/Failed to fetch/);
  });
  it("costs: the server's «not now» (503) stops the op too", async () => {
    found.estimates = { status: "draft", current_version_id: null };
    writeErr.estimate_line_costs = { status: 503, code: "PGRST002" };
    const e = await applyOp(save({ "l-1": 400 }), "co-1", "u-1").then(() => null, (x: unknown) => x);
    expect(classify(e)).toBe("transient");
  });
  it("costs: a tech without the right to costs (42501) — the estimate is still saved, the op does not fail", async () => {
    found.estimates = { status: "draft", current_version_id: null };
    writeErr.estimate_line_costs = { status: 403, code: "42501" };
    await applyOp(save({ "l-1": 400 }), "co-1", "u-1");
    expect(writes.some((w) => w.table === "estimate_line_items" && w.kind === "insert")).toBe(true);
  });

  const photo = { k: "photo.add", id: "f-1", visitId: "v-1", jobId: J, stage: "before", uri: "file:///p.jpg" } as unknown as Op;
  const blobOk = () => vi.stubGlobal("fetch", () => Promise.resolve({ blob: () => Promise.resolve({ type: "image/jpeg", size: 10 }) }));
  it("photo: the upload drops (no network) → the op is retried, the photo is not marked failed", async () => {
    blobOk();
    upload.error = Object.assign(new Error("TypeError: Failed to fetch"), { name: "StorageUnknownError" });
    await expect(applyOp(photo, "co-1", "u-1")).rejects.toThrow(/Failed to fetch/);
    expect(writes.filter((w) => w.table === "files" && w.kind === "update")).toEqual([]);
  });
  it("photo: the record of the uploaded file drops → the op is retried (not «uploaded» lost silently)", async () => {
    blobOk();
    writeErr.files = { status: 0, code: "", message: "TypeError: Failed to fetch" };
    await expect(applyOp(photo, "co-1", "u-1")).rejects.toThrow(/Failed to fetch/);
  });
  it("photo: the storage refuses (403) → marked failed, the op is done", async () => {
    blobOk();
    upload.error = Object.assign(new Error("new row violates row-level security policy"), { status: 403 });
    await applyOp(photo, "co-1", "u-1");
    expect(writes.filter((w) => w.table === "files" && w.kind === "update").map((w) => (w.row as { upload_status: string }).upload_status)).toEqual(["failed"]);
  });
  it("photo: uploaded → recorded as uploaded", async () => {
    blobOk();
    await applyOp(photo, "co-1", "u-1");
    expect(writes.filter((w) => w.table === "files" && w.kind === "update").map((w) => (w.row as { upload_status: string }).upload_status)).toEqual(["uploaded"]);
  });
});

describe("unit:opsReadErrors — company.save: the «zone chosen» flag reaches the write (docs/specs/22 §1.3)", () => {
  const company = { ...companyFromDb({ id: "co-1", name: "Co", timezone: "America/Chicago" }, undefined, [], []), timezone: "America/Chicago" };
  const sent = () => writes.find((w) => w.table === "companies" && w.kind === "update")?.row as Record<string, unknown>;
  it("not chosen (tzChanged: false): another admin's zone on the server is not overwritten", async () => {
    found.companies = { timezone: "America/New_York" };
    await applyOp({ k: "company.save", company, einChanged: false, tzChanged: false }, "co-1", "u-1");
    expect(sent()).toBeDefined();
    expect("timezone" in sent()).toBe(false);
  });
  it("chosen (tzChanged: true): sent, even when the server already has it", async () => {
    found.companies = { timezone: "America/Chicago" };
    await applyOp({ k: "company.save", company, einChanged: false, tzChanged: true }, "co-1", "u-1");
    expect(sent().timezone).toBe("America/Chicago");
  });
  it("an op of an older build (no flag): as before — sent when it differs from the server", async () => {
    found.companies = { timezone: "America/New_York" };
    await applyOp({ k: "company.save", company, einChanged: false }, "co-1", "u-1");
    expect(sent().timezone).toBe("America/Chicago");
  });
});
