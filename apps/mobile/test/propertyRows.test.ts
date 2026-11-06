/** The property card as rows with counters (docs/specs/13-app-structure.md §3.3 «Объект», wave 4a-2). */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { DB } from "../src/data/types";
import { isPropertyRow, propertyCounts, propertyRecords, propertyRowsFor, PROPERTY_ROWS } from "../src/features/propertyRows";

const db = makeSeed();
const p1 = db.properties.find((p) => p.id === "p1")!;
const p3 = db.properties.find((p) => p.id === "p3")!;

describe("rows", () => {
  it("the office sees every row of 13 §3.3 in order", () => {
    expect(propertyRowsFor("director")).toEqual([...PROPERTY_ROWS]);
    expect(PROPERTY_ROWS).toEqual(["people", "leads", "jobs", "estimates", "invoices", "visits", "tasks", "notes", "files", "history"]);
  });
  it("the tech has no leads or invoices rows", () => {
    const rows = propertyRowsFor("tech");
    expect(rows).not.toContain("leads");
    expect(rows).not.toContain("invoices");
    expect(rows).toContain("visits");
  });
  it("only known rows open a list", () => {
    expect(isPropertyRow("visits")).toBe(true);
    expect(isPropertyRow("billing")).toBe(false);
  });
});

describe("what the rows count", () => {
  it("1420 Oak Grove: its jobs, visits and estimates only — not those of Sarah's second property", () => {
    const r = propertyRecords(db, p1, "director");
    expect(r.jobs.map((j) => j.id)).toEqual(db.jobs.filter((j) => j.propertyId === "p1").map((j) => j.id));
    expect(r.jobs.map((j) => j.id)).not.toContain("j8");
    for (const v of r.visits) expect(v.propertyId ?? db.jobs.find((j) => j.id === v.jobId)?.propertyId).toBe("p1");
    expect(r.estimates.every((e) => e.propertyId === "p1")).toBe(true);
  });
  it("leads of the property (Linda's lead is at 2207 Ocean Park)", () => {
    const n = propertyCounts(propertyRecords(db, p3, "director"));
    expect(n.leads).toBe(db.leads.filter((l) => l.propertyId === "p3").length);
    expect(n.leads).toBeGreaterThan(0);
  });
  it("visits newest first", () => {
    const r = propertyRecords(db, p1, "director");
    const starts = r.visits.map((v) => v.start);
    expect([...starts].sort().reverse()).toEqual(starts);
  });
  it("the tech: no leads or invoices; only his visits and the jobs he has a visit on", () => {
    const tech: DB = { ...db, me: "m-alex" };
    const r = propertyRecords(tech, p1, "tech");
    expect(r.leads).toEqual([]);
    expect(r.invoices).toEqual([]);
    expect(r.visits.length).toBeGreaterThan(0);
    const nobody = propertyRecords({ ...db, me: "m-nobody" }, p1, "tech");
    expect(nobody.visits).toEqual([]);
    expect(nobody.jobs).toEqual([]);
  });
  it("open tasks only; someone else's private note is not counted", () => {
    const x: DB = {
      ...db,
      tasks: [
        { id: "t1", subjectType: "property", subjectId: "p1", title: "a" },
        { id: "t2", subjectType: "property", subjectId: "p1", title: "b", doneAt: "2026-11-01T10:00:00Z" },
      ],
      notes: [
        { id: "n1", subjectType: "property", subjectId: "p1", body: "team", visibility: "team", pinned: false, authorId: "u-x", at: "2026-11-01T10:00:00Z" },
        { id: "n2", subjectType: "property", subjectId: "p1", body: "mine?", visibility: "private", pinned: false, authorId: "u-x", at: "2026-11-01T10:00:00Z" },
      ],
    };
    const n = propertyCounts(propertyRecords(x, p1, "director"));
    expect(n.tasks).toBe(1);
    expect(n.notes).toBe(1);
  });
});
