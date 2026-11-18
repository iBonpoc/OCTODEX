/**
 * unit:jobCancel — #2015 (spec 38 §12): who cancels a job and when not — the same refusals as the server (public.cancel_job,
 * app.job_cancel_reason, db T383–T390): the phone tells at once, the server judges.
 */
import { describe, expect, it } from "vitest";
import { jobCancelRefusal, jobRestoreRefusal } from "../src/features/jobCancel";
import type { DB, Invoice, Job, Visit } from "../src/data/types";

const job = (p: Partial<Job> = {}): Job => ({ id: "j1", propertyId: "p1", title: "Roof", status: "scheduled", amountCents: 1000, ...p });
const visit = (p: Partial<Visit> = {}): Visit => ({ id: "v1", jobId: "j1", propertyId: "p1", step: "scheduled", ...p }) as Visit;
const invoice = (p: Partial<Invoice> = {}): Invoice => ({ id: "i1", jobId: "j1", customerId: "c1", paidCents: 0, totalCents: 1000, ...p } as Invoice);
const db = (p: Partial<Pick<DB, "jobs" | "visits" | "invoices" | "payments" | "pendingPayments">> = {}) => ({ jobs: [job()], visits: [], invoices: [], payments: [], pendingPayments: [], ...p });

describe("unit:jobCancel — #2015", () => {
  it("С1. a plain job: the director and the dispatcher may", () => {
    expect(jobCancelRefusal(db(), "j1", "Changed mind", "director")).toBeNull();
    expect(jobCancelRefusal(db(), "j1", "Changed mind", "dispatcher")).toBeNull();
  });
  it("С3. sales and tech never; the dispatcher not with an invoice", () => {
    expect(jobCancelRefusal(db(), "j1", "x", "sales")).toBe("role");
    expect(jobCancelRefusal(db(), "j1", "x", "tech")).toBe("role");
    expect(jobCancelRefusal(db({ invoices: [invoice()] }), "j1", "x", "dispatcher")).toBe("invoiceOpen");
    expect(jobCancelRefusal(db({ invoices: [invoice()] }), "j1", "x", "director")).toBeNull();
  });
  it("С2. a payment (paid, partly, in transit): refund first", () => {
    expect(jobCancelRefusal(db({ invoices: [invoice({ paidCents: 100 })] }), "j1", "x", "director")).toBe("paid");
    expect(jobCancelRefusal(db({ invoices: [invoice()], pendingPayments: [{ id: "pp", invoiceId: "i1", amountCents: 100, method: "ach", at: "2026-11-01" }] }), "j1", "x", "director")).toBe("paid");
  });
  it("С5. a visit on site or working; a done job", () => {
    for (const step of ["on_site", "working", "signed"] as const) expect(jobCancelRefusal(db({ visits: [visit({ step })] }), "j1", "x", "director")).toBe("onSite");
    expect(jobCancelRefusal(db({ visits: [visit({ step: "en_route" })] }), "j1", "x", "director")).toBeNull();
    // «paid» is a visit the server has completed (repo.ts visitStep): it does not hold the cancel
    expect(jobCancelRefusal(db({ visits: [visit({ step: "paid" })] }), "j1", "x", "director")).toBeNull();
    expect(jobCancelRefusal(db({ jobs: [job({ status: "done" })] }), "j1", "x", "director")).toBe("done");
  });
  it("С7. the reason: required, at most 500; a job that is gone", () => {
    expect(jobCancelRefusal(db(), "j1", "  ", "director")).toBe("reason");
    expect(jobCancelRefusal(db(), "j1", "x".repeat(500), "director")).toBeNull();
    expect(jobCancelRefusal(db(), "j1", "x".repeat(501), "director")).toBe("long");
    expect(jobCancelRefusal(db(), "nope", "x", "director")).toBe("gone");
  });
});

describe("unit:jobRestore — #2050 (spec 38 §12.1)", () => {
  const cdb = (status?: string) => ({
    cancelledJobs: [job({ cancelReason: "x" })],
    customers: [{ id: "c1", status: status ?? "active" }] as never,
    properties: [{ id: "p1", customerId: "c1" }] as never,
  });
  it("С2. the director and the dispatcher may; sales and tech never", () => {
    expect(jobRestoreRefusal(cdb(), "j1", "director")).toBeNull();
    expect(jobRestoreRefusal(cdb(), "j1", "dispatcher")).toBeNull();
    expect(jobRestoreRefusal(cdb(), "j1", "sales")).toBe("role");
    expect(jobRestoreRefusal(cdb(), "j1", "tech")).toBe("role");
  });
  it("С2. a job that is not among the cancelled is «gone» (a live one: nothing to bring back)", () => {
    expect(jobRestoreRefusal(cdb(), "nope", "director")).toBe("gone");
  });
  it("С4. a client «do not service»: refused, as the server (job_restore_no_service)", () => {
    expect(jobRestoreRefusal(cdb("do_not_service"), "j1", "director")).toBe("noService");
  });
});
