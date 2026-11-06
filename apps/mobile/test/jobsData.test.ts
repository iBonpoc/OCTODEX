/** Wave П-1: job numbers, cancelled jobs that must still be found, and the local client change (src/data). */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { findJob, jobOfEstimate, nextJobNumber } from "../src/data/jobs";
import { applyCustomerPatch } from "../src/data/customerPatch";
import { clientSigned, companySigned } from "../src/features/estimateSign";
import type { DB, Job } from "../src/data/types";

const J = (p: Partial<Job>): Job => ({ id: "j", propertyId: "p1", title: "x", status: "scheduled", amountCents: 0, ...p });

describe("nextJobNumber", () => {
  it("after the highest number; a cancelled job's number is never reused", () => {
    expect(nextJobNumber({ jobs: [J({ number: "JOB-0002" })], cancelledJobs: [J({ id: "c", number: "JOB-0007" })] })).toBe("JOB-0008");
    expect(nextJobNumber({ jobs: [], cancelledJobs: [] })).toBe("JOB-0001");
    expect(nextJobNumber({ jobs: [J({ number: undefined }), J({ number: "weird" })] })).toBe("JOB-0001");
  });
});

describe("findJob / jobOfEstimate: a cancelled job is still found", () => {
  const d = { jobs: [J({ id: "a", estimateId: "e1" })], cancelledJobs: [J({ id: "b", estimateId: "e2", status: "done" })] };
  it("by id", () => {
    expect(findJob(d, "a")?.id).toBe("a");
    expect(findJob(d, "b")?.id).toBe("b");
    expect(findJob(d, "zzz")).toBeUndefined();
    expect(findJob(d, undefined)).toBeUndefined();
    expect(findJob({ jobs: d.jobs }, "b")).toBeUndefined();
  });
  it("by estimate", () => {
    expect(jobOfEstimate(d, "e1")?.id).toBe("a");
    expect(jobOfEstimate(d, "e2")?.id).toBe("b");
  });
});

describe("company signature and jobs (wave П-1)", () => {
  const NOW = "2026-11-06T18:00:00.000Z";
  const IDS = { jobId: "job-new", invoiceId: "inv-new" };
  function signedByClient(): { d: DB; id: string } {
    const d = makeSeed();
    const e = d.estimates.find((x) => x.doc && x.status !== "approved")!;
    d.estimates = d.estimates.map((x) => (x.id === e.id ? { ...x, status: "sent", token: "tok" } : x));
    d.jobs = d.jobs.filter((j) => j.estimateId !== e.id);
    const s = clientSigned(d, e.id, { optionId: e.doc!.options[0]!.id, addonIds: [], signerName: "Linda", signature: "M0 0", channel: "portal" }, IDS, NOW, "tok");
    return { d: s, id: e.id };
  }
  it("a new job gets its client and, in the demo, its number", () => {
    const { d, id } = signedByClient();
    const s = companySigned(d, id, { userId: d.me, signature: "M1 1", method: "drawn" }, IDS, NOW, () => "INV-0999", () => "JOB-0042");
    const e = s.estimates.find((x) => x.id === id)!;
    expect(s.jobs.find((j) => j.estimateId === id)).toMatchObject({ id: "job-new", number: "JOB-0042", customerId: e.customerId });
  });
  it("in the cloud the job has no number until the sync", () => {
    const { d, id } = signedByClient();
    const s = companySigned(d, id, { userId: d.me, signature: "M1 1", method: "drawn" }, IDS, NOW);
    expect(s.jobs.find((j) => j.estimateId === id)!.number).toBeUndefined();
  });
  it("a cancelled job of the estimate: no second job and no second deposit invoice", () => {
    const { d, id } = signedByClient();
    const cancelled = J({ id: "job-old", estimateId: id, status: "done" });
    const withCancelled: DB = { ...d, cancelledJobs: [cancelled], invoices: [...d.invoices, { id: "inv-old", customerId: "c1", jobId: "job-old", kind: "deposit", totalCents: 100, paidCents: 0, dueDate: NOW }] };
    const s = companySigned(withCancelled, id, { userId: d.me, signature: "M1 1", method: "drawn" }, IDS, NOW, () => "INV-0999", () => "JOB-0042");
    expect(s.jobs.filter((j) => j.estimateId === id)).toEqual([]);
    expect(s.invoices.filter((i) => i.kind === "deposit" && (i.jobId === "job-old" || i.jobId === "job-new")).map((i) => i.id)).toEqual(["inv-old"]);
  });
});

describe("applyCustomerPatch: the phone keeps what the server keeps", () => {
  const c = { id: "c1", name: "Mary", phone: "", sourceId: "s", balanceCents: 0 };
  it("name parts trimmed; an empty one is no value", () => {
    expect(applyCustomerPatch(c, { firstName: " Mary ", lastName: "", companyName: "  " })).toMatchObject({ firstName: "Mary", lastName: undefined, companyName: undefined });
  });
  it("billing trimmed; null or an empty first line = same as the property", () => {
    expect(applyCustomerPatch(c, { billing: { line1: " PO Box 12 ", city: " Pasadena ", state: "", zip: " 91101 " } }).billing).toEqual({
      line1: "PO Box 12", line2: undefined, unit: undefined, city: "Pasadena", state: undefined, zip: "91101",
    });
    const withBilling = { ...c, billing: { line1: "PO Box 12", city: "Pasadena" } };
    expect(applyCustomerPatch(withBilling, { billing: null }).billing).toBeUndefined();
    expect(applyCustomerPatch(withBilling, { billing: { line1: " ", city: "x" } }).billing).toBeUndefined();
    expect(applyCustomerPatch(withBilling, { name: "M" }).billing).toEqual(withBilling.billing);
  });
});
