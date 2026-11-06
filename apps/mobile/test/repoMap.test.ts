/**
 * Wave П-1 (docs/specs/13-app-structure.md §5): what loadCompanyDB reads from the database rows.
 * supabase is replaced by a fake that returns fixed rows per table, so the mapping is tested without a server.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rows: Record<string, Record<string, unknown>[]> = {};
/** columns the fake database does not have yet ("table.column"): a select naming one fails, as on a base without the migration */
const missing = new Set<string>();
function builder(table: string) {
  const b: Record<string, unknown> = {};
  let cols = "";
  b.select = (c?: string) => ((cols = c ?? "*"), b);
  for (const m of ["eq", "is", "order", "limit", "in", "not"]) b[m] = () => b;
  b.then = (ok: (r: { data: unknown; error: { message: string } | null }) => unknown) => {
    const gone = cols.split(",").map((x) => x.trim()).find((c) => missing.has(`${table}.${c}`));
    return Promise.resolve(gone ? { data: null, error: { message: `column ${table}.${gone} does not exist` } } : { data: rows[table] ?? [], error: null }).then(ok);
  };
  return b;
}
vi.mock("../src/cloud/client", () => ({ supabase: { from: (t: string) => builder(t) } }));
import { loadCompanyDB } from "../src/cloud/repo";

const CO = "co-1";
beforeEach(() => {
  missing.clear();
  for (const k of Object.keys(rows)) delete rows[k];
  rows.customers = [
    {
      id: "c1", company_id: CO, display_name: "Mary Lee", status: "active", first_name: "Mary", last_name: "Lee", company_name: null,
      billing_address_line1: "PO Box 12", billing_address_city: "Pasadena", billing_address_state: "CA", billing_address_zip: "91101",
    },
    { id: "c2", company_id: CO, display_name: "Acme LLC", status: "active", company_name: "Acme LLC", billing_address_line1: null, billing_address_city: null },
  ];
  rows.properties = [
    { id: "p1", customer_id: "c1", address_line1: "1 Main St", address_city: "Pasadena", geo_lat: "34.147800", geo_lng: "-118.144500" },
    { id: "p2", customer_id: "c2", address_line1: "2 Oak St", address_city: "Pasadena", geo_lat: null, geo_lng: null },
  ];
  rows.jobs = [
    { id: "j1", property_id: "p1", customer_id: "c1", number: "JOB-0001", title: null, status: "scheduled", description: "Two downspouts", job_type_id: "t2" },
    { id: "j2", property_id: "p1", customer_id: "c1", number: "JOB-0002", title: "Gutter cleaning", status: "completed" },
    { id: "j3", property_id: "p2", customer_id: "c2", number: "JOB-0003", title: "Cancelled roof", status: "cancelled" },
  ];
  rows.job_types = [
    { id: "t2", seed_key: "repair", name: null, position: 1, archived_at: null },
    { id: "t1", seed_key: "install", name: null, position: 0, archived_at: null },
    { id: "t9", seed_key: null, name: "Gutter guards", position: 5, archived_at: "2026-11-01T00:00:00Z" },
  ];
  rows.files = [
    { id: "f1", kind: "photo", visit_id: "v1", job_id: "j1", stage: "after", storage_key: "co-1/f1.jpg", created_at: "2026-11-05T10:00:00Z" },
    { id: "f2", kind: "document", customer_id: "c1", stage: null, storage_key: "co-1/f2.pdf", created_at: "2026-11-05T11:00:00Z" },
  ];
  rows.visits = [{ id: "v1", job_id: "j1", status: "scheduled", starts_at: "2026-11-07T16:00:00Z", ends_at: "2026-11-07T17:00:00Z" }];
  rows.activities = [{ id: "a1", subject_type: "customer", subject_id: "c1", kind: "sms", direction: "in", contact_id: "k1", at: "2026-11-05T12:00:00Z", actor_id: "u1" }];
  rows.notifications = [
    { id: "n1", kind: "invoice.paid", estimate_id: null, job_id: "j1", invoice_id: "i1", visit_id: null, payload: { customer: "Mary Lee", total: 5000 }, created_at: "2026-11-05T13:00:00Z" },
  ];
});

describe("loadCompanyDB — jobs (wave П-1)", () => {
  it("a cancelled job is not «done» and is not in the list of jobs; it stays in cancelledJobs", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.jobs.map((j) => j.id)).toEqual(["j1", "j2"]);
    expect(db.jobs.find((j) => j.id === "j3")).toBeUndefined();
    expect(db.cancelledJobs?.map((j) => j.id)).toEqual(["j3"]);
  });
  it("the number is its own field; a job without a name shows its number until wave 3", async () => {
    const db = await loadCompanyDB(CO, "u1");
    const j1 = db.jobs.find((j) => j.id === "j1")!;
    expect(j1.number).toBe("JOB-0001");
    expect(j1.title).toBe("JOB-0001");
    expect(db.jobs.find((j) => j.id === "j2")!.title).toBe("Gutter cleaning");
  });
  it("client, description and job type of a job", async () => {
    const db = await loadCompanyDB(CO, "u1");
    const j1 = db.jobs.find((j) => j.id === "j1")!;
    expect(j1).toMatchObject({ customerId: "c1", description: "Two downspouts", jobTypeId: "t2", status: "scheduled" });
    expect(db.jobs.find((j) => j.id === "j2")!.jobTypeId).toBeUndefined();
  });
  it("job types of the company, in their order, archived ones kept", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.jobTypes?.map((t) => t.id)).toEqual(["t1", "t2", "t9"]);
    expect(db.jobTypes?.find((t) => t.id === "t9")).toMatchObject({ name: "Gutter guards", archivedAt: "2026-11-01T00:00:00Z" });
    expect(db.jobTypes?.find((t) => t.id === "t1")).toMatchObject({ seedKey: "install" });
  });
});

describe("loadCompanyDB — other fields (wave П-1)", () => {
  it("client: name parts and the address for invoices", async () => {
    const db = await loadCompanyDB(CO, "u1");
    const c1 = db.customers.find((c) => c.id === "c1")!;
    expect(c1).toMatchObject({ firstName: "Mary", lastName: "Lee", billing: { line1: "PO Box 12", city: "Pasadena", state: "CA", zip: "91101" } });
    expect(c1.companyName).toBeUndefined();
    const c2 = db.customers.find((c) => c.id === "c2")!;
    expect(c2.companyName).toBe("Acme LLC");
    expect(c2.billing).toBeUndefined();
  });
  it("property: geo from geo_lat / geo_lng, absent when unknown", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.properties.find((p) => p.id === "p1")!.geo).toEqual({ lat: 34.1478, lng: -118.1445 });
    expect(db.properties.find((p) => p.id === "p2")!.geo).toBeUndefined();
  });
  it("files: one list; the photos of a visit are a view on the same rows", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.files).toEqual([
      { id: "f1", kind: "photo", jobId: "j1", visitId: "v1", customerId: undefined, stage: "after", storageKey: "co-1/f1.jpg", at: "2026-11-05T10:00:00Z" },
      { id: "f2", kind: "document", jobId: undefined, visitId: undefined, customerId: "c1", stage: undefined, storageKey: "co-1/f2.pdf", at: "2026-11-05T11:00:00Z" },
    ]);
    expect(db.visits[0]!.photos).toEqual([{ id: "f1", kind: "after", uri: undefined }]);
  });
  it("activity: the person and the direction", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.activities[0]).toMatchObject({ contactId: "k1", direction: "in" });
  });
  it("notice: leads to the invoice", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.notices[0]).toMatchObject({ kind: "invoice.paid", invoiceId: "i1", jobId: "j1" });
  });
});
describe("loadCompanyDB on a database without the wave П-1 migration (PR preview)", () => {
  it("files and the feed are read with the old columns, nothing is dropped", async () => {
    missing.add("files.customer_id");
    missing.add("activities.contact_id");
    const db = await loadCompanyDB(CO, "u1");
    expect(db.files?.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(db.visits[0]!.photos).toHaveLength(1);
    expect(db.activities.map((a) => a.id)).toEqual(["a1"]);
  });
});

describe("loadCompanyDB — invoices and payments (wave 8, docs/specs/18-money-reports.md §3)", () => {
  const inv = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
    id, company_id: CO, customer_id: "c1", job_id: "j1", kind: "final", status, number: `INV-${id}`,
    subtotal_cents: 10000, total_cents: 10825, paid_cents: 0, due_date: "2026-11-10", sent_at: "2026-11-01T17:00:00Z", created_at: "2026-10-20T17:00:00Z", ...extra,
  });
  const pay = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
    id, company_id: CO, invoice_id: "i-sent", customer_id: "c1", method: "zelle", amount_cents: 5000, refunded_cents: 0, status,
    received_by: "u7", received_at: "2026-11-02T18:00:00Z", ...extra,
  });
  beforeEach(() => {
    rows.invoices = [
      inv("i-sent", "sent"),
      // a draft has no due date: before wave 8 it got created_at and looked overdue
      inv("i-draft", "draft", { due_date: null, sent_at: null }),
      inv("i-void", "void"),
      inv("i-receipt", "sent", { due_date: null }),
    ];
    rows.payments = [
      pay("p-ok", "succeeded"),
      pay("p-part", "partially_refunded", { refunded_cents: 2000 }),
      pay("p-back", "refunded", { refunded_cents: 5000 }),
      pay("p-fail", "failed"),
    ];
  });
  it("a draft is not a debt: only sent invoices are in the list", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.invoices.map((i) => i.id).sort()).toEqual(["i-receipt", "i-sent"]);
  });
  it("no due date = due on the day it was sent, not the day it was made", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.invoices.find((i) => i.id === "i-receipt")!.dueDate).toBe("2026-11-01T17:00:00Z");
  });
  it("subtotal before tax is read (revenue in reports)", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.invoices.find((i) => i.id === "i-sent")).toMatchObject({ subtotalCents: 10000, totalCents: 10825 });
  });
  it("payments: who took it; partial refund is net with refundedCents; full refund and failed are not listed", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.payments.map((p) => p.id).sort()).toEqual(["p-ok", "p-part"]);
    expect(db.payments.find((p) => p.id === "p-ok")).toMatchObject({ amountCents: 5000, receivedBy: "u7", refundedCents: undefined });
    expect(db.payments.find((p) => p.id === "p-part")).toMatchObject({ amountCents: 3000, refundedCents: 2000 });
  });
});
