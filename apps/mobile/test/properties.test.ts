/** Properties inside a client (wave C2, docs/specs/04 §3, §7.3). */
import { describe, expect, it } from "vitest";
import { canSaveProperty, canSeeGateCode, cityLine, placeOf, propertyMapQuery, propertyNow, propertyPeople, propertyTitle, splitGateCodes, withGateCodes, propertyDocs, propertyPhotos, propertyTimeline } from "../src/features/properties";
import { navContext } from "../src/nav/hierarchy";
import { makeSeed } from "../src/data/seed";
import type { DB, Property, Visit } from "../src/data/types";

const base = (): DB => makeSeed();
const prop = (p: Partial<Property> = {}): Property => ({ id: "pX", customerId: "c1", address: "12 Elm St", city: "Pasadena, CA 91103", stories: 1, ...p });

describe("address lines", () => {
  it("title has the unit; the city line is built from city / state / zip", () => {
    expect(propertyTitle(prop({ unit: "2B" }))).toBe("12 Elm St, #2B");
    expect(propertyTitle(prop({ unit: "#2B" }))).toBe("12 Elm St, #2B");
    expect(cityLine({ city: "Pasadena", state: "CA", zip: "91103" })).toBe("Pasadena, CA 91103");
    expect(cityLine({ city: "Pasadena" })).toBe("Pasadena");
    expect(propertyMapQuery(prop({ unit: "2B" }))).toBe("12 Elm St, #2B, Pasadena, CA 91103");
  });
  it("an old property (one shown line) is split back into city / state / zip for editing", () => {
    expect(placeOf(prop())).toEqual({ city: "Pasadena", state: "CA", zip: "91103" });
    expect(placeOf(prop({ city: "Glendale" }))).toEqual({ city: "Glendale", state: undefined, zip: undefined });
  });
  it("a property needs a street", () => {
    expect(canSaveProperty({ address: " " })).toBe(false);
    expect(canSaveProperty({ address: "12 Elm St" })).toBe(true);
  });
});

describe("gate code: office always, a tech or sales while assigned to the work (#2263)", () => {
  const withVisit = (startIso: string, extra: Partial<Visit> = {}): DB => {
    const d = base();
    d.me = "m-ivan";
    d.properties = [...d.properties, prop()];
    d.jobs = [...d.jobs, { id: "jX", propertyId: "pX", title: "Gate job", status: "scheduled", amountCents: 0 }];
    d.visits = [...d.visits, { id: "vX", jobId: "jX", techId: "m-ivan", start: startIso, durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0, ...extra }];
    return d;
  };
  it("office roles see it any day", () => {
    expect(canSeeGateCode(withVisit("2026-11-20T17:00:00Z"), "director", "pX")).toBe(true);
    expect(canSeeGateCode(withVisit("2026-11-20T17:00:00Z"), "dispatcher", "pX")).toBe(true);
  });
  it("С1 tech: assigned — any day, past or far ahead (no day window)", () => {
    expect(canSeeGateCode(withVisit("2026-11-05T22:00:00Z"), "tech", "pX")).toBe(true);
    expect(canSeeGateCode(withVisit("2027-03-01T17:00:00Z"), "tech", "pX")).toBe(true);
    expect(canSeeGateCode(withVisit("2026-10-01T17:00:00Z"), "tech", "pX")).toBe(true);
  });
  it("С1 tech: a finished visit of a job that goes on still counts", () => {
    expect(canSeeGateCode(withVisit("2026-11-05T22:00:00Z", { step: "paid" }), "tech", "pX")).toBe(true);
    expect(canSeeGateCode(withVisit("2026-11-05T22:00:00Z", { closed: true }), "tech", "pX")).toBe(true);
  });
  it("С2 taken off the visit, someone else's visit — no", () => {
    expect(canSeeGateCode(withVisit("2026-11-05T22:00:00Z", { techId: "m-other" }), "tech", "pX")).toBe(false);
    expect(canSeeGateCode(withVisit("2026-11-05T22:00:00Z", { techId: null, assigneeIds: [] }), "tech", "pX")).toBe(false);
  });
  it("С3 the job is done or cancelled (not loaded) — no", () => {
    const done = withVisit("2026-11-05T22:00:00Z");
    done.jobs = done.jobs.map((j) => (j.id === "jX" ? { ...j, status: "done" } : j));
    expect(canSeeGateCode(done, "tech", "pX")).toBe(false);
    const cancelled = withVisit("2026-11-05T22:00:00Z");
    cancelled.jobs = cancelled.jobs.filter((j) => j.id !== "jX");
    expect(canSeeGateCode(cancelled, "tech", "pX")).toBe(false);
  });
  it("С4 another property — no", () => {
    expect(canSeeGateCode(withVisit("2026-11-05T22:00:00Z"), "tech", "pOther")).toBe(false);
  });
  it("sales: as a tech — an inspection while it is open; a finished inspection — no", () => {
    const insp = (extra: Partial<Visit> = {}) => withVisit("2026-11-20T17:00:00Z", { jobId: undefined, propertyId: "pX", ...extra } as Partial<Visit>);
    expect(canSeeGateCode(insp(), "sales", "pX")).toBe(true);
    expect(canSeeGateCode(insp({ step: "done" }), "sales", "pX")).toBe(false);
    expect(canSeeGateCode(insp({ closed: true }), "sales", "pX")).toBe(false);
    expect(canSeeGateCode(insp({ techId: "m-other" }), "sales", "pX")).toBe(false);
  });
});

describe("gate codes never reach the cache on the phone", () => {
  it("split keeps them apart and join puts them back", () => {
    const d = base();
    d.properties = d.properties.map((p) => (p.id === "p1" ? { ...p, gateCode: "#1234" } : p));
    const { db, codes } = splitGateCodes(d);
    expect(codes).toEqual({ p1: "#1234" });
    expect(JSON.stringify(db)).not.toContain("#1234");
    expect(withGateCodes(db, codes).properties.find((p) => p.id === "p1")?.gateCode).toBe("#1234");
  });
});

describe("now at the property and its people", () => {
  it("open jobs and estimates only; the next visit to come", () => {
    const d = base();
    const n = propertyNow(d, "p1");
    expect(n.jobs.every((j) => j.propertyId === "p1" && j.status !== "done")).toBe(true);
    expect(n.estimates.every((e) => e.propertyId === "p1" && (e.status === "draft" || e.status === "sent"))).toBe(true);
    if (n.nextVisit) expect(d.jobs.find((j) => j.id === n.nextVisit!.jobId)?.propertyId).toBe("p1");
  });
  it("people of a property are the client's people it links to; a removed one drops out", () => {
    const d = base();
    const c = d.customers.find((x) => x.id === "c1")!;
    const tom = c.people![1]!;
    expect(propertyPeople(d, prop({ contactIds: [tom.id, "gone"] })).map((x) => x.name)).toEqual([tom.name]);
  });
  it("the property card goes up to its client", () => {
    const d = base();
    expect(navContext("/property/p1", {}, d, "director").up?.href).toBe("/client/c1");
  });
});

describe("property tabs (C2b): history, documents, files", () => {
  it("history: visits, sent / signed estimates and notes of this property, newest first; drafts and other properties stay out", () => {
    const d = base();
    d.notes = [...d.notes, { id: "nP", subjectType: "property", subjectId: "p1", body: "Side gate sticks", visibility: "team", pinned: false, authorId: d.me, at: "2030-01-01T00:00:00Z" }];
    const h = propertyTimeline(d, "p1");
    expect(h[0]).toMatchObject({ kind: "note", at: "2030-01-01T00:00:00Z" });
    for (let i = 1; i < h.length; i++) expect(h[i - 1]!.at >= h[i]!.at).toBe(true);
    const jobIds = new Set(d.jobs.filter((j) => j.propertyId === "p1").map((j) => j.id));
    for (const x of h) {
      if (x.kind === "visit") expect(jobIds.has(x.visit.jobId ?? "") || x.visit.propertyId === "p1").toBe(true);
      if (x.kind === "estimate") expect(x.estimate.propertyId === "p1" && !!(x.estimate.sentAt || x.estimate.approvedAt)).toBe(true);
    }
  });
  it("documents: the property's estimates and the invoices of its jobs only", () => {
    const d = base();
    const { estimates, invoices } = propertyDocs(d, "p1");
    expect(estimates.every((e) => e.propertyId === "p1")).toBe(true);
    const jobIds = new Set(d.jobs.filter((j) => j.propertyId === "p1").map((j) => j.id));
    expect(invoices.every((i) => jobIds.has(i.jobId))).toBe(true);
  });
  it("files: photos of the property's visits, newest visit first", () => {
    const d = base();
    d.jobs = [...d.jobs, { id: "jP", propertyId: "pP", title: "x", status: "scheduled", amountCents: 0 }];
    d.properties = [...d.properties, prop({ id: "pP" })];
    const v = (id: string, start: string, kind: "before" | "after") => ({ id, jobId: "jP", techId: null, start, durationMin: 60, step: "scheduled" as const, scope: [], checklist: [], photos: [{ id: `ph-${id}`, kind }], amountDueCents: 0 });
    d.visits = [...d.visits, v("v1", "2026-11-01T10:00:00Z", "before"), v("v2", "2026-11-03T10:00:00Z", "after")];
    expect(propertyPhotos(d, "pP").map((x) => x.photo.id)).toEqual(["ph-v2", "ph-v1"]);
  });
});
