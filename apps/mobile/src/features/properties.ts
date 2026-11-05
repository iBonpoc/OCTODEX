/**
 * Properties inside a client (wave C2, docs/specs/04 §3, §7.3). Pure — tested in test/properties.test.ts.
 */
import type { DB, Estimate, Job, Person, Property, Role, Visit } from "@/data/types";
import { peopleOf } from "@/data/people";
import { visitPropertyId } from "@/data/selectors";

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
  const nextVisit = db.visits
    .filter((v) => visitPropertyId(db, v) === propertyId && v.step !== "paid" && new Date(v.start).getTime() >= now - (v.durationMin || 0) * 60_000)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  return { estimates, jobs, nextVisit };
}

/** Calendar day number of a moment in a time zone (the company's: the server decides by it too). */
export function dayIn(t: number, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(t));
  } catch {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(t));
  }
  const n = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  return Math.floor(Date.UTC(n("year"), n("month") - 1, n("day")) / 86_400_000);
}
/**
 * May this person see the gate code? The office always; a tech only on the day of a visit of theirs at the property
 * or the day before, by the company's time zone, and not for a visit that is over (paid, completed, no-show).
 * The same rule as app.can_see_gate_code on the server, which decides in the cloud.
 */
export function canSeeGateCode(db: DB, role: Role, propertyId: string, now = Date.now()): boolean {
  if (role !== "tech") return true;
  const tz = db.company?.timezone || "America/Los_Angeles";
  // a visit of a live job, or an inspection (no job) at this property
  const doneJobs = new Set(db.jobs.filter((j) => j.status === "done").map((j) => j.id));
  const today = dayIn(now, tz);
  return db.visits.some(
    (v) => visitPropertyId(db, v) === propertyId && !(v.jobId && doneJobs.has(v.jobId)) && v.techId === db.me && v.step !== "paid" && !v.closed && [today, today + 1].includes(dayIn(new Date(v.start).getTime(), tz)),
  );
}

/** Gate codes stay in memory in the cloud (never in the cache on the phone): the db without them, and the codes apart. */
export function splitGateCodes(db: DB): { db: DB; codes: Record<string, string> } {
  const codes: Record<string, string> = {};
  for (const p of db.properties) if (p.gateCode) codes[p.id] = p.gateCode;
  if (!Object.keys(codes).length) return { db, codes };
  return { db: { ...db, properties: db.properties.map(({ gateCode: _g, ...p }) => p) }, codes };
}
export function withGateCodes(db: DB, codes: Record<string, string>): DB {
  if (!Object.keys(codes).length) return db;
  return { ...db, properties: db.properties.map((p) => (codes[p.id] ? { ...p, gateCode: codes[p.id] } : p)) };
}

/** People of a property: the client's people it links to (a removed person drops out). */
export function propertyPeople(db: DB, p: Property): Person[] {
  const c = db.customers.find((x) => x.id === p.customerId);
  const people = c ? peopleOf(c) : [];
  return (p.contactIds ?? []).map((id) => people.find((x) => x.id === id)).filter((x): x is Person => !!x);
}

/** A new property of a client: the street is required, the place may be empty. */
export const canSaveProperty = (p: { address: string }) => p.address.trim().length >= 3;

export type PropertyEntry =
  | { kind: "visit"; at: string; visit: Visit }
  | { kind: "estimate"; at: string; estimate: Estimate }
  | { kind: "note"; at: string; note: DB["notes"][number] };
/** History of a property, newest first: visits, estimates sent or signed, notes on the property. */
export function propertyTimeline(db: DB, propertyId: string): PropertyEntry[] {
  const out: PropertyEntry[] = [
    ...db.visits.filter((v) => visitPropertyId(db, v) === propertyId).map((v) => ({ kind: "visit" as const, at: v.start, visit: v })),
    ...db.estimates
      .filter((e) => e.propertyId === propertyId && (e.approvedAt || e.sentAt))
      .map((e) => ({ kind: "estimate" as const, at: (e.approvedAt ?? e.sentAt)!, estimate: e })),
    ...db.notes.filter((n) => n.subjectType === "property" && n.subjectId === propertyId).map((n) => ({ kind: "note" as const, at: n.at, note: n })),
  ];
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** Documents of a property: its estimates and the invoices of its jobs. */
export function propertyDocs(db: DB, propertyId: string): { estimates: Estimate[]; invoices: DB["invoices"] } {
  const jobIds = new Set(db.jobs.filter((j) => j.propertyId === propertyId).map((j) => j.id));
  return { estimates: db.estimates.filter((e) => e.propertyId === propertyId), invoices: db.invoices.filter((i) => jobIds.has(i.jobId)) };
}

/** Photos taken on the visits of a property (before / after), newest visit first. */
export function propertyPhotos(db: DB, propertyId: string): { visit: Visit; photo: Visit["photos"][number] }[] {
  return db.visits
    .filter((v) => visitPropertyId(db, v) === propertyId)
    .sort((a, b) => b.start.localeCompare(a.start))
    .flatMap((v) => v.photos.map((photo) => ({ visit: v, photo })));
}
