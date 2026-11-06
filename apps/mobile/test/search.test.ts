/** unit:search — «Искать везде» (docs/specs/15-flows.md §3.2, 13 v2 §2.2). */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { DB } from "../src/data/types";
import { hitCount, numberMatches, searchAll } from "../src/features/search";

const db = makeSeed() as DB;
const ids = (q: string, role: "director" | "tech" = "director", d: DB = db) => {
  const r = searchAll(d, q, role);
  return Object.fromEntries(Object.entries(r).map(([g, hs]) => [g, hs.map((h) => h.id)]));
};

describe("unit:search — numbers", () => {
  it("a prefix: the exact start, with or without the dash and the zeros", () => {
    expect(numberMatches("EST-0012", "EST-12")).toBe(true);
    expect(numberMatches("EST-0012", "est-0012")).toBe(true);
    expect(numberMatches("EST-0012", "EST0012")).toBe(true);
    expect(numberMatches("EST-0012", "EST-")).toBe(true);
    expect(numberMatches("EST-0012", "INV-12")).toBe(false);
    expect(numberMatches("EST-0012", "EST-13")).toBe(false);
  });
  it("bare digits: any prefix", () => {
    expect(numberMatches("INV-0101", "101")).toBe(true);
    expect(numberMatches("RCT-0103", "10")).toBe(true);
    expect(numberMatches("CLT-0001", "2")).toBe(false);
  });
  it("each prefix finds its own document", () => {
    expect(ids("CLT-0002").clients).toEqual(["c2"]);
    expect(ids("LEA-0003").leads).toEqual(["l3"]);
    expect(ids("EST-0006").estimates.length).toBe(1);
    expect(ids("INV-0102").invoices.length).toBe(1);
    expect(ids("RCT-0104").payments.length).toBe(1);
  });
  it("JOB-0001 → the job (failed before: jobs were searched by text only)", () => {
    const r = searchAll(db, "JOB-0001", "director");
    expect(r.jobs.map((h) => h.id)).toEqual(["j1"]);
    expect(r.jobs[0]).toMatchObject({ number: "JOB-0001", why: { kind: "number" }, href: "/job/j1" });
    expect(ids("job-2").jobs).toEqual(["j2"]);
    expect(searchAll(db, "0003", "director").jobs.some((h) => h.number === "JOB-0003")).toBe(true);
  });
  it("the technician finds by number only the jobs of his visits", () => {
    const mine = new Set(db.visits.filter((v) => (v.assigneeIds ?? []).includes(db.me) || v.techId === db.me).map((v) => v.jobId));
    for (const j of db.jobs.filter((x) => x.number)) expect(searchAll(db, j.number!, "tech").jobs.length, j.number).toBe(mine.has(j.id) ? 1 : 0);
  });
  it("bare digits search every prefix at once", () => {
    const r = searchAll(db, "0103", "director");
    expect(r.invoices.some((h) => h.number === "INV-0103")).toBe(true);
    expect(r.payments.some((h) => h.number === "RCT-0103")).toBe(true);
  });
});

describe("unit:search — phones, emails, people, addresses", () => {
  it("a phone by digits from 3, any punctuation", () => {
    expect(ids("555 0187").clients).toContain("c2");
    expect(ids("(818) 555-0187").clients).toContain("c2");
    expect(hitCount(searchAll(db, "555 0187", "director"))).toBeGreaterThan(0);
    // 2 digits are not a phone search
    expect(searchAll(db, "55", "director").clients.every((h) => h.why.kind !== "phone")).toBe(true);
  });
  it("another person's phone: «найдено: телефон Tom»", () => {
    const [h] = searchAll(db, "555-0144", "director").clients;
    expect(h).toMatchObject({ id: "c1", why: { kind: "phone", who: "Tom Mitchell" } });
  });
  it("another person's name", () => {
    const h = searchAll(db, "tom mitch", "director").clients.find((x) => x.id === "c1");
    expect(h?.why).toEqual({ kind: "person", who: "Tom Mitchell" });
  });
  it("an email, any case", () => {
    expect(ids("SARAH.M@EXAMPLE").clients).toEqual(["c1"]);
    expect(ids("lalvarez@").leads).toContain("l5");
  });
  it("an address finds the property (and its job)", () => {
    const r = searchAll(db, "oak grove", "director");
    expect(r.properties.map((h) => h.id)).toEqual(["p1"]);
    expect(r.properties[0]!.href).toBe("/property/p1");
  });
  it("a lead's phone and city", () => {
    expect(ids("555-0170").leads).toEqual(["l1"]);
    expect(ids("encino").leads).toContain("l1");
  });
  it("empty — nothing", () => {
    expect(hitCount(searchAll(db, "   ", "director"))).toBe(0);
  });
});

describe("unit:search — closed below, rights", () => {
  it("an archived client and a lost lead are found, below the open ones, marked", () => {
    const d = { ...db, customers: db.customers.map((c) => (c.id === "c1" ? { ...c, name: "Mitchell Archive", status: "archived" as const } : c)), leads: db.leads.map((l) => (l.id === "l1" ? { ...l, name: "Mitchell Lead", status: "lost" as const } : l)) } as DB;
    const r = searchAll(d, "mitchell", "director");
    expect(r.clients.at(-1)).toMatchObject({ id: "c1", closed: true });
    expect(r.leads.find((h) => h.id === "l1")?.closed).toBe(true);
  });
  it("the technician: no invoices or payments, only the leads he made, only his visits' clients", () => {
    const d = { ...db, leads: [...db.leads, { ...db.leads[0]!, id: "l-mine", name: "Neighbor Lead", createdBy: db.me }] } as DB;
    const r = searchAll(d, "lead", "tech");
    expect(r.leads.map((h) => h.id)).toEqual(["l-mine"]);
    const money = searchAll(d, "0103", "tech");
    expect(money.invoices).toEqual([]);
    expect(money.payments).toEqual([]);
    const office = searchAll(d, "a", "director").clients.length;
    expect(searchAll(d, "a", "tech").clients.length).toBeLessThanOrEqual(office);
    expect(searchAll(d, "kevin", "tech").leads).toEqual([]);
  });
});
