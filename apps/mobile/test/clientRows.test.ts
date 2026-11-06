/** The client card as rows with counters (docs/specs/13-app-structure.md §3.3, wave 4). */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { CUSTOMER_STATUSES, type DB } from "../src/data/types";
import { clientCounts, clientRecords, clientRowsFor, CLIENT_ROWS, isClientSection, jobsOfClient, statusAfterManualWin } from "../src/features/clientRows";

const db = makeSeed();
const c1 = db.customers.find((c) => c.id === "c1")!;

describe("jobs of a client", () => {
  it("Job.customerId is the source of truth: Sarah has the jobs of both her properties", () => {
    expect(jobsOfClient(db, "c1").map((j) => j.id).sort()).toEqual(["j1", "j8"]);
  });
  it("a property handed to another client does not take the jobs of the first client with it", () => {
    const moved: DB = { ...db, properties: db.properties.map((p) => (p.id === "p1b" ? { ...p, customerId: "c2" } : p)) };
    expect(jobsOfClient(moved, "c1").map((j) => j.id)).toContain("j8");
    expect(jobsOfClient(moved, "c2").map((j) => j.id)).not.toContain("j8");
  });
  it("an old job without customerId belongs to the client of its property", () => {
    const old: DB = { ...db, jobs: db.jobs.map((j) => (j.id === "j8" ? { ...j, customerId: undefined } : j)) };
    expect(jobsOfClient(old, "c1").map((j) => j.id).sort()).toEqual(["j1", "j8"]);
  });
});

describe("rows and who sees them", () => {
  it("the office sees every row in the order of 13 §3.3, with Jobs and Leads", () => {
    expect(clientRowsFor("director")).toEqual([...CLIENT_ROWS]);
    expect(CLIENT_ROWS).toContain("jobs");
    expect(CLIENT_ROWS).toContain("leads");
  });
  it("the tech has no leads, invoices or billing address rows", () => {
    const rows = clientRowsFor("tech");
    expect(rows).not.toContain("leads");
    expect(rows).not.toContain("invoices");
    expect(rows).not.toContain("billing");
    expect(rows).toContain("jobs");
  });
  it("only rows with a list are sections; billing opens the form", () => {
    expect(isClientSection("jobs")).toBe(true);
    expect(isClientSection("billing")).toBe(false);
    expect(isClientSection("nope")).toBe(false);
  });
});

describe("counters", () => {
  it("Sarah (office): 2 properties, 2 jobs, her leads, estimates and invoices", () => {
    const r = clientRecords(db, c1, "director");
    const n = clientCounts(r);
    expect(n.properties).toBe(2);
    expect(n.jobs).toBe(2);
    expect(n.leads).toBe(db.leads.filter((l) => l.customerId === "c1").length);
    expect(n.estimates).toBe(db.estimates.filter((e) => e.customerId === "c1").length);
    expect(n.invoices).toBe(db.invoices.filter((i) => i.customerId === "c1").length);
    expect(n.people).toBe(r.people.length);
  });
  it("the tech's lists carry no leads, invoices or receipts, only jobs he has a visit on", () => {
    const tech: DB = { ...db, me: "m-alex" };
    const r = clientRecords(tech, c1, "tech");
    expect(r.leads).toEqual([]);
    expect(r.invoices).toEqual([]);
    expect(r.receipts).toEqual([]);
    expect(r.jobs.map((j) => j.id)).toContain("j1");
    expect(clientRecords({ ...db, me: "m-nobody" }, c1, "tech").jobs).toEqual([]);
  });
  it("open tasks only; a done task is not counted", () => {
    const withTasks: DB = {
      ...db,
      tasks: [
        { id: "t-a", subjectType: "customer", subjectId: "c1", title: "a" },
        { id: "t-b", subjectType: "customer", subjectId: "c1", title: "b", doneAt: "2026-11-01T10:00:00Z" },
      ],
    };
    expect(clientCounts(clientRecords(withTasks, c1, "director")).tasks).toBe(1);
  });
  it("someone else's private note is not counted", () => {
    const withNotes: DB = {
      ...db,
      notes: [
        { id: "n-a", subjectType: "customer", subjectId: "c1", body: "team", visibility: "team", pinned: false, authorId: "u-other", at: "2026-11-01T10:00:00Z" },
        { id: "n-b", subjectType: "customer", subjectId: "c1", body: "private", visibility: "private", pinned: false, authorId: "u-other", at: "2026-11-01T10:00:00Z" },
      ],
    };
    expect(clientCounts(clientRecords(withNotes, c1, "director")).notes).toBe(1);
  });
});

describe("S8a: a lead won by hand and the status of its existing client", () => {
  it("prospect becomes active, as on the server", () => {
    expect(statusAfterManualWin("prospect")).toBe("active");
    expect(statusAfterManualWin(undefined)).toBe("active");
  });
  it("archived and do_not_service keep their status (the phone used to make them active)", () => {
    expect(statusAfterManualWin("archived")).toBe("archived");
    expect(statusAfterManualWin("do_not_service")).toBe("do_not_service");
    for (const s of CUSTOMER_STATUSES) expect(CUSTOMER_STATUSES).toContain(statusAfterManualWin(s));
  });
});
