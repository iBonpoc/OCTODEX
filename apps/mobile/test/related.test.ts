/**
 * «Связано» (features/related.ts, 13 §2.7, 15-flows §2 rows «Работа», «Выезд», and the parents of estimate, invoice,
 * receipt for waves С and 8) + the history of a job (features/jobHistory.ts, 17-job §7.1).
 */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { relatedOf, type RelatedKind } from "../src/features/related";
import { enRouteSms, filterJobHistory, jobHistory, nextOpenVisit } from "../src/features/jobHistory";
import type { DB, Role } from "../src/data/types";

const kinds = (d: DB, of: Parameters<typeof relatedOf>[1], role: Role = "director") => relatedOf(d, of, role).map((l) => l.kind);
const ROLES: Role[] = ["director", "dispatcher", "sales", "tech"];

function withLeadEstimate(): DB {
  const d = makeSeed();
  // job j1 comes from estimate e5; give e5 a lead so the chain lead → estimate → job is complete
  d.estimates = d.estimates.map((e) => (e.id === "e5" ? { ...e, leadId: "l1", number: "EST-0005" } : e));
  return d;
}

describe("relatedOf: job", () => {
  it("job from an estimate: lead (through the estimate), client, property, estimate", () => {
    const d = withLeadEstimate();
    const links = relatedOf(d, { type: "job", id: "j1" }, "director");
    expect(links.map((l) => l.kind)).toEqual(["lead", "customer", "property", "estimate"]);
    expect(links.find((l) => l.kind === "lead")).toMatchObject({ href: "/lead/l1", text: "LEA-0001" });
    expect(links.find((l) => l.kind === "customer")?.href).toBe("/client/c1");
    expect(links.find((l) => l.kind === "property")?.href).toBe("/property/p1");
    expect(links.find((l) => l.kind === "estimate")).toMatchObject({ href: "/estimate/e5", text: "EST-0005" });
  });
  it("job without an estimate: client and property only", () => {
    expect(kinds(makeSeed(), { type: "job", id: "j2" })).toEqual(["customer", "property"]);
  });
  it("the technician: no estimate (company money) and no lead behind the job (its estimates)", () => {
    expect(kinds(withLeadEstimate(), { type: "job", id: "j1" }, "tech")).toEqual(["customer", "property"]);
  });
  it("sales and the dispatcher see every parent", () => {
    for (const role of ["sales", "dispatcher"] as Role[]) expect(kinds(withLeadEstimate(), { type: "job", id: "j1" }, role), role).toEqual(["lead", "customer", "property", "estimate"]);
  });
  it("a cancelled job is still found (findJob)", () => {
    const d = makeSeed();
    const j = d.jobs.find((x) => x.id === "j2")!;
    const c = { ...d, jobs: d.jobs.filter((x) => x.id !== "j2"), cancelledJobs: [j] };
    expect(kinds(c, { type: "job", id: "j2" })).toEqual(["customer", "property"]);
  });
  it("no client in the data the role has → no dead link", () => {
    const d = makeSeed();
    const c = { ...d, customers: d.customers.filter((x) => x.id !== "c2") };
    expect(kinds(c, { type: "job", id: "j2" })).toEqual(["property"]);
  });
  it("unknown job → nothing", () => expect(kinds(makeSeed(), { type: "job", id: "nope" })).toEqual([]));
});

describe("relatedOf: visit", () => {
  it("a job visit: job (its number), client, property — for every role, the technician too", () => {
    const d = makeSeed();
    const v = d.visits.find((x) => x.jobId === "j2") ?? { ...d.visits.find((x) => x.jobId)!, id: "vx", jobId: "j2", propertyId: "p2" };
    if (!d.visits.includes(v)) d.visits = [...d.visits, v];
    for (const role of ROLES) {
      const links = relatedOf(d, { type: "visit", id: v.id }, role);
      expect(links.map((l) => l.kind), role).toEqual(["job", "customer", "property"]);
      expect(links[0]).toMatchObject({ href: "/job/j2", text: "JOB-0002" });
    }
  });
  it("an inspection: lead, client (once the lead has one), property — no job", () => {
    const d = makeSeed();
    d.visits = d.visits.map((v) => (v.id === "v6" ? { ...v, leadId: "l1" } : v));
    expect(kinds(d, { type: "visit", id: "v6" })).toEqual(["lead", "customer", "property"]);
    expect(relatedOf(d, { type: "visit", id: "v6" }, "director")[0]).toMatchObject({ href: "/lead/l1", text: "LEA-0001" });
    // the technician on the inspection keeps the lead link (15-flows §2 «Выезд → Лид у осмотра»)
    expect(kinds(d, { type: "visit", id: "v6" }, "tech")).toEqual(["lead", "customer", "property"]);
  });
});

describe("relatedOf: estimate, invoice, receipt (for waves С and 8)", () => {
  it("estimate: lead, client, property, its job after approval", () => {
    expect(kinds(withLeadEstimate(), { type: "estimate", id: "e5" })).toEqual(["lead", "customer", "property", "job"]);
  });
  it("invoice: job, estimate, client; the technician without the estimate", () => {
    expect(kinds(makeSeed(), { type: "invoice", id: "i5" })).toEqual(["job", "estimate", "customer"]);
    expect(kinds(makeSeed(), { type: "invoice", id: "i1" })).toEqual(["job", "customer"]);
    expect(kinds(makeSeed(), { type: "invoice", id: "i5" }, "tech")).toEqual(["job", "customer"]);
  });
  it("receipt: invoice, job, client", () => {
    const want: RelatedKind[] = ["invoice", "job", "customer"];
    expect(kinds(makeSeed(), { type: "receipt", id: "pay5" })).toEqual(want);
  });
});

describe("jobHistory", () => {
  it("newest first; a cancelled visit with its reason; filters", () => {
    const d = makeSeed();
    const v = d.visits.find((x) => x.jobId)!;
    d.cancelledVisits = [{ ...v, id: "cv1", jobId: "j2", cancelReason: "no_show", cancelledAt: "2026-11-01T15:00:00.000Z" }];
    d.notes = [...d.notes, { id: "n-e2e", subjectType: "job", subjectId: "j2", body: "Ladder in the garage", visibility: "team", pinned: false, authorId: d.me, at: "2026-11-02T15:00:00.000Z" }];
    const all = jobHistory(d, "j2", "director");
    expect(all.map((x) => x.at)).toEqual([...all.map((x) => x.at)].sort().reverse());
    expect(all.find((x) => x.id === "vcan-cv1")).toMatchObject({ title: "job3.h.visitCancelled", reason: "vc.r.no_show", kind: "action" });
    expect(filterJobHistory(all, "note").map((x) => x.id)).toEqual(["note-n-e2e"]);
    expect(filterJobHistory(all, "action").every((x) => x.kind === "action")).toBe(true);
    expect(filterJobHistory(all, "all")).toEqual(all);
  });
  it("money: sums for the office, none for the technician", () => {
    const d = makeSeed();
    const office = jobHistory(d, "j1", "director").filter((x) => x.title === "job3.h.payment" || x.title === "job3.h.invoice");
    const tech = jobHistory(d, "j1", "tech").filter((x) => x.title === "job3.h.payment" || x.title === "job3.h.invoice");
    expect(office.length).toBeGreaterThan(0);
    expect(office.some((x) => typeof x.cents === "number")).toBe(true);
    expect(tech.length).toBe(office.length);
    expect(tech.every((x) => x.cents === undefined)).toBe(true);
  });
  it("someone else's private note is not shown", () => {
    const d = makeSeed();
    d.notes = [{ id: "np", subjectType: "job", subjectId: "j2", body: "secret", visibility: "private", pinned: false, authorId: "someone-else", at: "2026-11-02T15:00:00.000Z" }];
    expect(jobHistory(d, "j2", "director").some((x) => x.id === "note-np")).toBe(false);
  });
});

describe("nextOpenVisit", () => {
  it("the earliest visit that is not paid or done", () => {
    const base = makeSeed().visits.find((x) => x.jobId)!;
    const d = {
      visits: [
        { ...base, id: "a", jobId: "J", start: "2026-11-01T15:00:00.000Z", step: "paid" as const },
        { ...base, id: "b", jobId: "J", start: "2026-11-05T15:00:00.000Z", step: "scheduled" as const },
        { ...base, id: "c", jobId: "J", start: "2026-11-03T15:00:00.000Z", step: "en_route" as const },
      ],
    };
    expect(nextOpenVisit(d, "J")?.id).toBe("c");
    expect(nextOpenVisit({ visits: [d.visits[0]!] }, "J")).toBeUndefined();
  });
});

describe("enRouteSms: «В пути» in the client's language, not the app's (rule 7)", () => {
  it("es client → Spanish, en client → English, whatever the app language", () => {
    const d = makeSeed();
    const main = (name: string, language: "es" | "en") => [{ id: `m-${name}`, name, role: "main" as const, phones: [], emails: [], language }];
    d.customers = d.customers.map((c) => (c.id === "c2" ? { ...c, people: main(c.name, "es") } : c.id === "c3" ? { ...c, people: main(c.name, "en") } : c));
    const es = enRouteSms(d, "c2", "3:30 PM");
    expect(es).toMatch(/^¡Hola, /);
    expect(es).toContain("3:30 PM");
    expect(enRouteSms(d, "c3", "9:00 AM")).toMatch(/^Hi .*on the way.*9:00 AM/);
  });
});
