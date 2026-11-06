/**
 * The client card as rows with counters (docs/specs/13-app-structure.md §3.3, wave 4): what each row counts and lists.
 * Pure — tested in test/clientRows.test.ts.
 */
import { peopleOf } from "@/data/people";
import type { Customer, CustomerStatus, DB, ID, Job, Role } from "@/data/types";
import { isAssigned } from "@/features/schedule";

/** The rows of the client card, top to bottom (13 §3.3). */
export const CLIENT_ROWS = ["properties", "billing", "people", "jobs", "leads", "estimates", "invoices", "tasks", "notes", "files", "history"] as const;
export type ClientRow = (typeof CLIENT_ROWS)[number];
/** rows that open their own list (billing opens the edit form) */
export const CLIENT_SECTIONS = CLIENT_ROWS.filter((r) => r !== "billing");
export const isClientSection = (v: unknown): v is ClientRow => typeof v === "string" && (CLIENT_SECTIONS as readonly string[]).includes(v);

/**
 * The jobs of a client. The job's own client (`Job.customerId`, П-1) is the source of truth; a job saved before П-1 has
 * none, then it belongs to the client of its property.
 */
export function jobsOfClient(db: Pick<DB, "jobs" | "properties">, customerId: ID): Job[] {
  const props = new Set(db.properties.filter((p) => p.customerId === customerId).map((p) => p.id));
  return db.jobs.filter((j) => (j.customerId ? j.customerId === customerId : props.has(j.propertyId)));
}

/** Which rows a role sees: leads, invoices and the billing address are office rows (the tech has no money, 13 §4). */
export function clientRowsFor(role: Role): ClientRow[] {
  if (role !== "tech") return [...CLIENT_ROWS];
  return CLIENT_ROWS.filter((r) => r !== "leads" && r !== "invoices" && r !== "billing");
}

/** Everything the rows list, already cut to what the role sees. */
export function clientRecords(db: DB, c: Customer, role: Role) {
  const office = role !== "tech";
  const properties = db.properties.filter((p) => p.customerId === c.id);
  const allJobs = jobsOfClient(db, c.id);
  // a tech sees only the jobs he has a visit on (same rule as visibleClients)
  const jobs = office ? allJobs : allJobs.filter((j) => db.visits.some((v) => v.jobId === j.id && isAssigned(v, db.me)));
  const leads = office ? db.leads.filter((l) => l.customerId === c.id) : [];
  const leadIds = new Set(leads.map((l) => l.id));
  const estimates = db.estimates.filter((e) => e.customerId === c.id);
  const invoices = office ? db.invoices.filter((i) => i.customerId === c.id) : [];
  const receipts = office ? db.payments.filter((p) => p.customerId === c.id) : [];
  const tasks = db.tasks.filter((x) => x.subjectType === "customer" && x.subjectId === c.id);
  const notes = db.notes.filter(
    (n) => ((n.subjectType === "customer" && n.subjectId === c.id) || (n.subjectType === "lead" && leadIds.has(n.subjectId))) && (n.visibility === "team" || n.authorId === db.me),
  );
  const jobIds = new Set(jobs.map((j) => j.id));
  const photos = db.visits.filter((v) => v.jobId && jobIds.has(v.jobId)).flatMap((v) => v.photos ?? []);
  const files = (db.files ?? []).filter((f) => f.customerId === c.id || (f.jobId && jobIds.has(f.jobId)));
  return { properties, people: peopleOf(c), jobs, leads, estimates, invoices, receipts, tasks, notes, photos, files };
}

/** The counter on each row; billing and history have none. */
export function clientCounts(r: ReturnType<typeof clientRecords>): Partial<Record<ClientRow, number>> {
  return {
    properties: r.properties.length,
    people: r.people.length,
    jobs: r.jobs.length,
    leads: r.leads.length,
    estimates: r.estimates.length,
    invoices: r.invoices.length,
    tasks: r.tasks.filter((x) => !x.doneAt).length,
    notes: r.notes.length,
    files: r.photos.length + r.files.length,
  };
}

/**
 * A lead won by hand (S8a) makes its existing client active only from `prospect`, like the server
 * (cloud/ops.ts lead.convert: `.eq("status", "prospect")`). An archived or "do not service" client keeps its status.
 */
export function statusAfterManualWin(status: CustomerStatus | undefined): CustomerStatus {
  return status === "prospect" ? "active" : (status ?? "active");
}
