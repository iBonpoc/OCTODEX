/**
 * The property card as rows with counters (docs/specs/13-app-structure.md §3.3 «Объект», wave 4a-2), like the client:
 * people of the property · leads · jobs · estimates · invoices (office) · visits · tasks · notes · files · history.
 * Pure — tested in test/propertyRows.test.ts.
 */
import type { DB, Property, Role } from "@/data/types";
import { visitPropertyId } from "@/data/selectors";
import { isAssigned } from "@/features/schedule";
import { propertyDocs, propertyPeople, propertyPhotos, propertyTimeline } from "@/features/properties";

export const PROPERTY_ROWS = ["people", "leads", "jobs", "estimates", "invoices", "visits", "tasks", "notes", "files", "history"] as const;
export type PropertyRow = (typeof PROPERTY_ROWS)[number];
export const isPropertyRow = (v: unknown): v is PropertyRow => typeof v === "string" && (PROPERTY_ROWS as readonly string[]).includes(v);

/** The tech has no leads or invoices rows (13 §4); the rest he sees cut to his own visits. */
export function propertyRowsFor(role: Role): PropertyRow[] {
  return role === "tech" ? PROPERTY_ROWS.filter((r) => r !== "leads" && r !== "invoices") : [...PROPERTY_ROWS];
}

export function propertyRecords(db: DB, p: Property, role: Role) {
  const office = role !== "tech";
  const allVisits = db.visits.filter((v) => visitPropertyId(db, v) === p.id).sort((a, b) => b.start.localeCompare(a.start));
  const visits = office ? allVisits : allVisits.filter((v) => isAssigned(v, db.me));
  const mineJobs = new Set(visits.map((v) => v.jobId).filter(Boolean));
  const jobs = db.jobs.filter((j) => j.propertyId === p.id && (office || mineJobs.has(j.id)));
  const docs = propertyDocs(db, p.id);
  const tasks = db.tasks.filter((x) => x.subjectType === "property" && x.subjectId === p.id);
  const notes = db.notes.filter((n) => n.subjectType === "property" && n.subjectId === p.id && (n.visibility === "team" || n.authorId === db.me));
  return {
    people: propertyPeople(db, p),
    leads: office ? db.leads.filter((l) => l.propertyId === p.id) : [],
    jobs,
    estimates: docs.estimates,
    invoices: office ? docs.invoices : [],
    visits,
    tasks,
    notes,
    photos: propertyPhotos(db, p.id),
    history: propertyTimeline(db, p.id),
  };
}

export function propertyCounts(r: ReturnType<typeof propertyRecords>): Partial<Record<PropertyRow, number>> {
  return {
    people: r.people.length,
    leads: r.leads.length,
    jobs: r.jobs.length,
    estimates: r.estimates.length,
    invoices: r.invoices.length,
    visits: r.visits.length,
    tasks: r.tasks.filter((x) => !x.doneAt).length,
    notes: r.notes.length,
    files: r.photos.length,
  };
}
