/** Properties inside a client (wave C2, docs/specs/04 §3, §7.3). */
import { describe, expect, it } from "vitest";
import { canSaveProperty, canSeeGateCode, cityLine, placeOf, propertyMapQuery, propertyNow, propertyPeople, propertyTitle } from "../src/features/properties";
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

describe("gate code: office always, a tech only on the visit day and the day before", () => {
  const at = (days: number, h = 10) => {
    const d = new Date(2026, 10, 5, h, 0);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };
  const NOW = new Date(2026, 10, 5, 8, 0).getTime();
  const withVisit = (offset: number, step: Visit["step"] = "scheduled", techId = "m-ivan"): DB => {
    const d = base();
    d.me = "m-ivan";
    d.properties = [...d.properties, prop()];
    d.jobs = [...d.jobs, { id: "jX", propertyId: "pX", title: "Gate job", status: "scheduled", amountCents: 0 }];
    d.visits = [...d.visits.filter((v) => !d.jobs.some((j) => j.id === v.jobId && j.propertyId === "pX")), { id: "vX", jobId: "jX", techId, start: at(offset), durationMin: 60, step, scope: [], checklist: [], photos: [], amountDueCents: 0 }];
    return d;
  };
  it("office roles see it any day", () => {
    expect(canSeeGateCode(withVisit(5), "director", "pX", NOW)).toBe(true);
    expect(canSeeGateCode(withVisit(5), "dispatcher", "pX", NOW)).toBe(true);
  });
  it("tech: today and tomorrow yes; in 2 days, yesterday, finished, someone else's — no", () => {
    expect(canSeeGateCode(withVisit(0), "tech", "pX", NOW)).toBe(true);
    expect(canSeeGateCode(withVisit(1), "tech", "pX", NOW)).toBe(true);
    expect(canSeeGateCode(withVisit(2), "tech", "pX", NOW)).toBe(false);
    expect(canSeeGateCode(withVisit(-1), "tech", "pX", NOW)).toBe(false);
    expect(canSeeGateCode(withVisit(0, "paid"), "tech", "pX", NOW)).toBe(false);
    expect(canSeeGateCode(withVisit(0, "scheduled", "m-other"), "tech", "pX", NOW)).toBe(false);
  });
  it("a visit late tomorrow evening still counts as tomorrow", () => {
    const d = withVisit(1);
    d.visits = d.visits.map((v) => (v.id === "vX" ? { ...v, start: at(1, 23) } : v));
    expect(canSeeGateCode(d, "tech", "pX", NOW)).toBe(true);
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
