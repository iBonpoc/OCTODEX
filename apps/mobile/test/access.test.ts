/**
 * unit:access — whose work a technician may open (#868, Q-40/Q-41). The mirror of the database's row rules:
 * visits_select / jobs_select (T22, T35), invoices_select (T22), estimates_select (T33), catalog_items_update (T99).
 * The demo seed: me = m-alex; v4 (job j5) is m-ivan's, v5 (job j6) is m-sub's.
 */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { canEditCatalog, canSeeEstimate, canSeeInvoice, canSeeJob, canSeeVisit } from "../src/features/access";
import { isAssigned } from "../src/features/schedule";

const db = makeSeed();
const tech = { role: "tech" as const, mode: "demo" as const, me: db.me };
const mine = db.visits.find((v) => isAssigned(v, db.me) && v.jobId)!;
const theirs = db.visits.find((v) => v.id === "v4")!;

describe("unit:access — the demo tech sees only his own work (#868)", () => {
  it("the fixtures: one visit of mine, v4 another tech's", () => {
    expect(mine).toBeTruthy();
    expect(isAssigned(theirs, db.me)).toBe(false);
  });
  it("visits: mine yes, another tech's no (T22)", () => {
    expect(canSeeVisit(db, tech, mine.id)).toBe(true);
    expect(canSeeVisit(db, tech, theirs.id)).toBe(false);
    expect(canSeeVisit(db, tech, "nope")).toBe(false);
  });
  it("jobs: with a visit of mine yes, another tech's no (T22, T35)", () => {
    expect(canSeeJob(db, tech, mine.jobId)).toBe(true);
    expect(canSeeJob(db, tech, theirs.jobId)).toBe(false);
    expect(canSeeJob(db, tech, undefined)).toBe(false);
  });
  it("invoices: of my job yes, of another tech's job no (T22)", () => {
    const ofTheirs = db.invoices.filter((i) => i.jobId === theirs.jobId);
    const ofMine = db.invoices.filter((i) => i.jobId === mine.jobId);
    for (const i of ofTheirs) expect(canSeeInvoice(db, tech, i.id)).toBe(false);
    for (const i of ofMine) expect(canSeeInvoice(db, tech, i.id)).toBe(true);
    // an invoice with no job (standalone) is the office's
    const standalone = { ...db, invoices: [...db.invoices, { id: "i-x", customerId: "c1", totalCents: 1, paidCents: 0, dueDate: "2026-11-01" } as (typeof db.invoices)[number]] };
    expect(canSeeInvoice(standalone, tech, "i-x")).toBe(false);
  });
  it("estimates: of my job or of a property I work at yes; of nothing of mine no (T33)", () => {
    const job = db.jobs.find((j) => j.id === mine.jobId)!;
    const atMine = db.estimates.filter((e) => e.propertyId === job.propertyId);
    for (const e of atMine) expect(canSeeEstimate(db, tech, e.id)).toBe(true);
    const mineProps = new Set(db.jobs.filter((j) => canSeeJob(db, tech, j.id)).map((j) => j.propertyId));
    const other = db.estimates.find((e) => !mineProps.has(e.propertyId) && !e.leadId && !db.jobs.some((j) => j.estimateId === e.id && canSeeJob(db, tech, j.id)));
    expect(other).toBeTruthy();
    expect(canSeeEstimate(db, tech, other!.id)).toBe(false);
  });
  it("the price list: the tech does not change it (T99); the office does", () => {
    expect(canEditCatalog("tech")).toBe(false);
    for (const r of ["director", "dispatcher", "sales"] as const) expect(canEditCatalog(r)).toBe(true);
  });
});

describe("unit:access — everyone else, and the cloud", () => {
  it("the office roles see every record", () => {
    for (const role of ["director", "dispatcher", "sales"] as const) {
      const w = { role, mode: "demo" as const, me: db.me };
      expect(canSeeVisit(db, w, theirs.id) && canSeeJob(db, w, theirs.jobId)).toBe(true);
    }
  });
  it("in the cloud the server already gave only what the tech may see: nothing he has is hidden (his offline draft too)", () => {
    const w = { role: "tech" as const, mode: "cloud" as const, me: db.me };
    expect(canSeeVisit(db, w, theirs.id)).toBe(true);
    expect(canSeeJob(db, w, theirs.jobId)).toBe(true);
    expect(db.estimates.every((e) => canSeeEstimate(db, w, e.id))).toBe(true);
  });
});
