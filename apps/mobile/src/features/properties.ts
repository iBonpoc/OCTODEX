/**
 * Properties inside a client (wave C2, docs/specs/04 §3, §7.3). Pure — tested in test/properties.test.ts.
 */
import type { DB, Estimate, Job, Person, Property, Role, Visit } from "@/data/types";
import { peopleOf } from "@/data/people";

/** "City, ST zip" */
export function cityLine(place: { city: string; state?: string; zip?: string }): string {
  return [place.city.trim(), [place.state?.trim(), place.zip?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/** "1420 Oak Grove Ave, #2B" */
export const propertyTitle = (p: Property) => [p.address || p.city, p.unit ? `#${p.unit.replace(/^#/, "")}` : ""].filter(Boolean).join(", ");

/** what a map app gets */
export const propertyMapQuery = (p: Property) => [p.address, p.unit ? `#${p.unit.replace(/^#/, "")}` : "", p.city].filter(Boolean).join(", ");

/** The place of an old property (only the shown line "City, ST zip" is known). */
export function placeOf(p: Property): { city: string; state?: string; zip?: string } {
  if (p.place) return p.place;
  const [city = "", rest = ""] = p.city.split(",").map((x) => x.trim());
  const [state, zip] = rest.split(/\s+/).filter(Boolean);
  return { city, state, zip };
}

export interface PropertyNow {
  estimates: Estimate[];
  jobs: Job[];
  nextVisit?: Visit;
}
/** "Now at this property": open estimates (draft / sent), open jobs, the next visit to come. */
export function propertyNow(db: DB, propertyId: string, now = Date.now()): PropertyNow {
  const jobs = db.jobs.filter((j) => j.propertyId === propertyId && j.status !== "done");
  const estimates = db.estimates.filter((e) => e.propertyId === propertyId && (e.status === "draft" || e.status === "sent"));
  const jobIds = new Set(db.jobs.filter((j) => j.propertyId === propertyId).map((j) => j.id));
  const nextVisit = db.visits
    .filter((v) => jobIds.has(v.jobId) && v.step !== "paid" && new Date(v.start).getTime() >= now - (v.durationMin || 0) * 60_000)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  return { estimates, jobs, nextVisit };
}

/** Local calendar day number of a moment (the device's time zone, which is the company's for the field crew). */
const dayNo = (t: number) => {
  const d = new Date(t);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
};
/**
 * May this person see the gate code? The office always; a tech only on the day of a visit of theirs at the property
 * or the day before (the same rule as app.can_see_gate_code on the server, which decides in the cloud).
 */
export function canSeeGateCode(db: DB, role: Role, propertyId: string, now = Date.now()): boolean {
  if (role !== "tech") return true;
  const jobIds = new Set(db.jobs.filter((j) => j.propertyId === propertyId).map((j) => j.id));
  const today = dayNo(now);
  return db.visits.some((v) => jobIds.has(v.jobId) && v.techId === db.me && v.step !== "paid" && [today, today + 1].includes(dayNo(new Date(v.start).getTime())));
}

/** People of a property: the client's people it links to (a removed person drops out). */
export function propertyPeople(db: DB, p: Property): Person[] {
  const c = db.customers.find((x) => x.id === p.customerId);
  const people = c ? peopleOf(c) : [];
  return (p.contactIds ?? []).map((id) => people.find((x) => x.id === id)).filter((x): x is Person => !!x);
}

/** A new property of a client: the street is required, the place may be empty. */
export const canSaveProperty = (p: { address: string }) => p.address.trim().length >= 3;
