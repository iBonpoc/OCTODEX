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
  for (const m of ["eq", "is", "order", "limit", "in", "not", "range"]) b[m] = () => b;
  b.then = (ok: (r: { data: unknown; error: { message: string } | null }) => unknown) => {
    const gone = cols.split(",").map((x) => x.trim()).find((c) => missing.has(`${table}.${c}`));
    return Promise.resolve(gone ? { data: null, error: { message: `column ${table}.${gone} does not exist` } } : { data: rows[table] ?? [], error: null }).then(ok);
  };
  return b;
}
vi.mock("../src/cloud/client", () => ({ supabase: { from: (t: string) => builder(t), rpc: (fn: string) => builder(fn) } }));
import { loadCompanyDB } from "../src/cloud/repo";

const CO = "co-1";
beforeEach(() => {
  missing.clear();
  for (const k of Object.keys(rows)) delete rows[k];
  rows.customers = [
    {
      id: "c1", company_id: CO, display_name: "Mary Lee", status: "active", tax_exempt: true, tax_exempt_note: "Cert 12-345", first_name: "Mary", last_name: "Lee", company_name: null,
      billing_address_line1: "PO Box 12", billing_address_city: "Pasadena", billing_address_state: "CA", billing_address_zip: "91101",
    },
    { id: "c2", company_id: CO, display_name: "Acme LLC", status: "active", company_name: "Acme LLC", billing_address_line1: null, billing_address_city: null },
  ];
  rows.properties = [
    { id: "p1", customer_id: "c1", address_line1: "1 Main St", address_city: "Pasadena", geo_lat: "34.147800", geo_lng: "-118.144500" },
    { id: "p2", customer_id: "c2", address_line1: "2 Oak St", address_city: "Pasadena", geo_lat: null, geo_lng: null },
  ];
  rows.jobs = [
    { id: "j1", property_id: "p1", customer_id: "c1", number: "JOB-0001", title: null, status: "scheduled", description: "Two downspouts", job_type_id: "t2", tax_enabled: true, tax_rate_bps: 1025 },
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
  rows.job_tags = [{ job_id: "j1", tag_id: "tag-a" }, { job_id: "j1", tag_id: "tag-b" }];
  rows.job_line_items = [
    { id: "li2", job_id: "j1", position: 1, name: "Labor", quantity: "3.0000", unit_price_cents: 4500, taxable: false, line_total_cents: 13500 },
    { id: "li1", job_id: "j1", position: 0, name: "Gutter section", description: "5 in K-style", catalog_item_id: "cat1", quantity: "2.5000", unit_price_cents: 1999, taxable: true, line_total_cents: 4998 },
  ];
  rows.tasks = [{ id: "tk1", subject_type: "job", subject_id: "j1", title: "Order gutters", due_at: null, starts_at: "2026-11-07T17:00:00Z", ends_at: "2026-11-07T18:00:00Z", all_day: false, description: "Call the supplier" }];
  rows.calendar_events = [
    { id: "ev2", kind: "time_off", user_id: "u2", title: null, starts_at: "2026-11-10T08:00:00Z", ends_at: "2026-11-11T08:00:00Z", all_day: true },
    { id: "ev1", kind: "event", user_id: null, title: "Team meeting", description: "Safety", starts_at: "2026-11-08T16:00:00Z", ends_at: "2026-11-08T17:00:00Z", all_day: false },
  ];
  rows.custom_fields = [
    { id: "cf2", entity: "job", label: "Crew size", type: "number", options: [], group_name: null, searchable: false, position: 1 },
    { id: "cf1", entity: "customer", label: "Preferred day", type: "select", options: ["Mon", "Wed"], group_name: "Visits", searchable: true, position: 0 },
  ];
  rows.custom_field_values = [{ id: "cv1", field_id: "cf1", entity_id: "c1", value: "Wed" }, { id: "cv2", field_id: "cf2", entity_id: "j1", value: 3 }];
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

describe("loadCompanyDB — money fields (wave П-2a)", () => {
  it("client without tax", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.customers.find((c) => c.id === "c1")).toMatchObject({ taxExempt: true, taxExemptNote: "Cert 12-345" });
    expect(db.customers.find((c) => c.id === "c2")!.taxExempt).toBeUndefined();
  });
  it("job: tags and tax", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.jobs.find((j) => j.id === "j1")).toMatchObject({ tagIds: ["tag-a", "tag-b"], taxEnabled: true, taxRateBps: 1025 });
    expect(db.jobs.find((j) => j.id === "j2")!.tagIds).toEqual([]);
  });
  it("job lines in their order, the line total from the server", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.jobLines).toEqual([
      { id: "li1", jobId: "j1", position: 0, name: "Gutter section", description: "5 in K-style", catalogItemId: "cat1", quantity: "2.5", unitPriceCents: 1999, taxable: true, totalCents: 4998 },
      { id: "li2", jobId: "j1", position: 1, name: "Labor", description: undefined, catalogItemId: undefined, quantity: "3", unitPriceCents: 4500, taxable: false, totalCents: 13500 },
    ]);
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

describe("loadCompanyDB — time and own fields (wave П-2b)", () => {
  it("a task with a time and a description", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.tasks[0]).toMatchObject({ startsAt: "2026-11-07T17:00:00Z", endsAt: "2026-11-07T18:00:00Z", allDay: false, description: "Call the supplier" });
  });
  it("events by time; a company event has no person", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.calendarEvents?.map((e) => e.id)).toEqual(["ev1", "ev2"]);
    expect(db.calendarEvents?.[0]).toMatchObject({ kind: "event", userId: undefined, title: "Team meeting", allDay: false });
    expect(db.calendarEvents?.[1]).toMatchObject({ kind: "time_off", userId: "u2", allDay: true });
  });
  it("own fields in order and their values", async () => {
    const db = await loadCompanyDB(CO, "u1");
    expect(db.customFields?.map((f) => f.id)).toEqual(["cf1", "cf2"]);
    expect(db.customFields?.[0]).toMatchObject({ entity: "customer", type: "select", options: ["Mon", "Wed"], group: "Visits", searchable: true });
    expect(db.customFieldValues).toEqual([{ id: "cv1", fieldId: "cf1", entityId: "c1", value: "Wed" }, { id: "cv2", fieldId: "cf2", entityId: "j1", value: 3 }]);
  });
  it("tasks on a database without the migration are read with the old columns", async () => {
    missing.add("tasks.starts_at");
    const db = await loadCompanyDB(CO, "u1");
    expect(db.tasks.map((t) => t.id)).toEqual(["tk1"]);
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

describe("loadCompanyDB — «Весь день» of a visit (3b-3, 17-job §11.1)", () => {
  it("all_day true → allDay; false or missing (an old server) → not set", async () => {
    rows.visits = [
      { id: "v1", job_id: "j1", status: "scheduled", starts_at: "2026-12-01T08:00:00Z", ends_at: "2026-12-02T08:00:00Z", all_day: true },
      { id: "v2", job_id: "j1", status: "scheduled", starts_at: "2026-12-03T17:00:00Z", ends_at: "2026-12-03T18:00:00Z", all_day: false },
      { id: "v3", job_id: "j1", status: "scheduled", starts_at: "2026-12-04T17:00:00Z", ends_at: "2026-12-04T18:00:00Z" },
    ];
    const db = await loadCompanyDB(CO, "u1");
    const by = (id: string) => db.visits.find((v) => v.id === id)!;
    expect(by("v1")).toMatchObject({ allDay: true, durationMin: 1440 });
    expect(by("v2").allDay).toBeUndefined();
    expect(by("v3").allDay).toBeUndefined();
  });
});

describe("repo: the invoices of a contract (#865 review З3, З5)", () => {
  it("an invoice's kind as it is: standalone / recurring stay outside the contract", async () => {
    rows.invoices = ["deposit", "progress", "final", "standalone", "recurring"].map((kind, i) => ({
      id: `inv-${kind}`, company_id: CO, customer_id: "c1", job_id: "j1", kind, status: "sent", total_cents: 1000 + i, paid_cents: 0, subtotal_cents: 1000 + i, tax_cents: 0, sent_at: "2026-11-05T10:00:00Z",
    }));
    const db = await loadCompanyDB(CO, "u1");
    expect(Object.fromEntries(db.invoices.map((i) => [i.id, i.kind]))).toEqual({
      "inv-deposit": "deposit", "inv-progress": "progress", "inv-final": "final", "inv-standalone": "standalone", "inv-recurring": "recurring",
    });
  });
  it("the contract's tax: the client's approval of the job's approved version (approved, customer), its tax a number", async () => {
    rows.jobs = [...rows.jobs!, { id: "j9", property_id: "p1", customer_id: "c1", number: "JOB-0009", status: "scheduled", estimate_id: "e9", approved_version_id: "v2", contract_total_cents: 109500 }];
    rows.estimate_approvals = [
      { estimate_id: "e9", version_id: "v1", decision: "approved", party: "customer", selection: { tax: 1 }, signed_at: "2026-11-06T10:00:00Z" },
      { estimate_id: "e9", version_id: "v2", decision: "approved", party: "contractor", selection: { tax: 2 }, signed_at: "2026-11-07T10:00:00Z" },
      { estimate_id: "e9", version_id: "v2", decision: "declined", party: "customer", selection: { tax: 3 }, signed_at: "2026-11-07T11:00:00Z" },
      { estimate_id: "e9", version_id: "v2", decision: "approved", party: "customer", selection: { tax: "4" }, signed_at: "2026-11-07T12:00:00Z" },
      { estimate_id: "e9", version_id: "v2", decision: "approved", party: "customer", selection: { tax: 9500 }, signed_at: "2026-11-05T12:00:00Z" },
    ];
    const db = await loadCompanyDB(CO, "u1");
    expect(db.jobs.find((j) => j.id === "j9")?.contractTaxCents).toBe(9500);
    expect(db.jobs.find((j) => j.id === "j1")?.contractTaxCents).toBeUndefined();
  });
});

describe("repo: a voided invoice (В1-5, #1107)", () => {
  it("goes apart with its reason; the live list and its sums never see it", async () => {
    rows.invoices = [
      { id: "iv-live", company_id: CO, customer_id: "c1", job_id: "j1", kind: "progress", status: "sent", total_cents: 1000, paid_cents: 0, sent_at: "2026-11-05T10:00:00Z" },
      { id: "iv-void", company_id: CO, customer_id: "c1", job_id: "j1", kind: "progress", status: "void", total_cents: 9000, paid_cents: 0, sent_at: "2026-11-05T09:00:00Z", void_reason: "Wrong amount", voided_at: "2026-11-05T09:30:00Z" },
      { id: "iv-draft", company_id: CO, customer_id: "c1", job_id: "j1", kind: "progress", status: "draft", total_cents: 500, paid_cents: 0 },
    ];
    const db = await loadCompanyDB(CO, "u1");
    expect(db.invoices.map((i) => i.id)).toEqual(["iv-live"]);
    expect(db.voidInvoices).toEqual([expect.objectContaining({ id: "iv-void", status: "void", voidReason: "Wrong amount", voidedAt: "2026-11-05T09:30:00Z", totalCents: 9000 })]);
  });
});

describe("repo: a voided deposit does not hide the paid one (В1-5)", () => {
  it("the estimate's deposit is the live one", async () => {
    rows.estimates = [{ id: "e7", company_id: CO, customer_id: "c1", property_id: "p1", title: "T", status: "approved" }];
    rows.jobs = [...rows.jobs!, { id: "j7", property_id: "p1", customer_id: "c1", number: "JOB-0007", status: "scheduled", estimate_id: "e7", contract_total_cents: 100000 }];
    rows.invoices = [
      { id: "d-void", company_id: CO, customer_id: "c1", job_id: "j7", kind: "deposit", status: "void", total_cents: 10000, paid_cents: 0, void_reason: "wrong", updated_at: "2026-11-05T09:00:00Z" },
      { id: "d-live", company_id: CO, customer_id: "c1", job_id: "j7", kind: "deposit", status: "sent", total_cents: 10000, paid_cents: 10000, updated_at: "2026-11-06T10:00:00Z" },
    ];
    const db = await loadCompanyDB(CO, "u1");
    expect(db.estimates.find((e) => e.id === "e7")?.depositPaidAt).toBe("2026-11-06T10:00:00Z"); // before: the void one was found first — not paid
  });
});
