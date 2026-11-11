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
  describe("estimates — the server's rule: a visit of his that counts at the property (estimates_select, director's review of #1134 Б1)", () => {
    const visit = (over: Partial<(typeof db.visits)[number]>) => ({ ...mine, id: "v-x", jobId: undefined, propertyId: "p-x", start: new Date().toISOString(), closed: false, step: "scheduled", ...over }) as (typeof db.visits)[number];
    const est = { ...db.estimates[0]!, id: "e-x", propertyId: "p-x", leadId: "l-x" };
    const lead = { ...db.leads[0]!, id: "l-x", assigneeId: "m-ivan" };
    const at = (visits: (typeof db.visits)[number][], extra: Partial<typeof db> = {}) => ({ ...db, visits: [...db.visits, ...visits], estimates: [...db.estimates, est], leads: [...db.leads, lead], ...extra });
    it("an inspection of mine (no job), the lead assigned to another: I see the estimate I make there (before: «нет доступа»)", () => {
      expect(canSeeEstimate(at([visit({ kind: "inspection" as never, leadId: "l-x" })]), tech, "e-x")).toBe(true);
    });
    it("a lead assigned to me but no visit of mine at the property: not seen (the server does not show it)", () => {
      expect(canSeeEstimate(at([], { leads: [...db.leads, { ...lead, assigneeId: db.me }] }), tech, "e-x")).toBe(false);
    });
    it("my visit there older than 14 days: not seen (tech_visit_counts)", () => {
      expect(canSeeEstimate(at([visit({ start: new Date(Date.now() - 20 * 86400000).toISOString() })]), tech, "e-x")).toBe(false);
    });
    it("a visit there of another tech: not seen", () => {
      expect(canSeeEstimate(at([visit({ techId: "m-ivan", assigneeIds: ["m-ivan"] })]), tech, "e-x")).toBe(false);
    });
    it("my visit of a done job there: not seen", () => {
      const jobs = [...db.jobs, { ...db.jobs[0]!, id: "j-x", propertyId: "p-x", status: "done" as const }];
      expect(canSeeEstimate(at([visit({ jobId: "j-x", propertyId: undefined })], { jobs }), tech, "e-x")).toBe(false);
    });
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
