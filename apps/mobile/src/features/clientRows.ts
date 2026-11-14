/**
 * The client card as rows with counters (docs/specs/13-app-structure.md §3.3, wave 4): what each row counts and lists.
 * Pure — tested in test/clientRows.test.ts.
 */
import { peopleOf } from "@/data/people";
import type { Customer, CustomerStatus, DB, ID, Job, Role } from "@/data/types";
import type { Mode } from "@/data/store";
import { canSeeEstimate } from "@/features/access";
import { isAssigned } from "@/features/schedule";
import { invoiceState } from "@/features/invoiceStatus";

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
/** `mode`: in the cloud the server already gave the tech only his own (features/access.ts) */
export function clientRecords(db: DB, c: Customer, role: Role, mode: Mode = "demo") {
  const office = role !== "tech";
  const properties = db.properties.filter((p) => p.customerId === c.id);
  const allJobs = jobsOfClient(db, c.id);
  // a tech sees only the jobs he has a visit on (same rule as visibleClients)
  const jobs = office ? allJobs : allJobs.filter((j) => db.visits.some((v) => v.jobId === j.id && isAssigned(v, db.me)));
  const leads = office ? db.leads.filter((l) => l.customerId === c.id) : [];
  // notes of the client's leads stay on the client for everyone who sees the client (as before wave 4)
  const leadIds = new Set(db.leads.filter((l) => l.customerId === c.id).map((l) => l.id));
  // the tech: only the estimates the server shows him (estimates_select; director's review of #1134)
  const estimates = db.estimates.filter((e) => e.customerId === c.id && canSeeEstimate(db, { role, mode, me: db.me }, e.id));
  const invoices = office ? db.invoices.filter((i) => i.customerId === c.id) : [];
  const receipts = office ? db.payments.filter((p) => p.customerId === c.id) : [];
  const tasks = db.tasks.filter((x) => x.subjectType === "customer" && x.subjectId === c.id);
  const notes = db.notes.filter(
    (n) => ((n.subjectType === "customer" && n.subjectId === c.id) || (n.subjectType === "lead" && leadIds.has(n.subjectId))) && (n.visibility === "team" || n.authorId === db.me),
  );
  const jobIds = new Set(jobs.map((j) => j.id));
  const photos = db.visits.filter((v) => v.jobId && jobIds.has(v.jobId)).flatMap((v) => v.photos ?? []);
  const files = (db.files ?? []).filter((f) => f.customerId === c.id || (f.jobId && jobIds.has(f.jobId)));
  return { properties, people: peopleOf(c), jobs, leads, leadIds: [...leadIds], estimates, invoices, receipts, tasks, notes, photos, files };
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

/**
 * The client card as view tabs (DS §9 А1п, #1343, prototype v6 approved by the founder 14.11): the same row for every
 * client of a role — all tabs always, even empty. The tech has no money: no «Счета».
 */
export const CLIENT_TABS = ["overview", "estimates", "invoices", "jobs", "tasks", "notes", "files", "history"] as const;
export type ClientTab = (typeof CLIENT_TABS)[number];
export const isClientTab = (v: unknown): v is ClientTab => typeof v === "string" && (CLIENT_TABS as readonly string[]).includes(v);
export function clientTabsFor(role: Role): ClientTab[] {
  return role === "tech" ? CLIENT_TABS.filter((x) => x !== "invoices") : [...CLIENT_TABS];
}

/**
 * The number on a tab — what waits for an action (founder 14.11: «открытые счета, сметы без ответа, работы в работе»;
 * paid and done do not count): estimates sent and not answered (or waiting for the countersign), invoices not paid in
 * full, jobs not done, open tasks. Nothing waits — no number (0 is left out). Notes, files and history have none.
 */
export function clientWaiting(r: ReturnType<typeof clientRecords>): Partial<Record<ClientTab, number>> {
  const n = (x: number) => (x > 0 ? x : undefined);
  return {
    estimates: n(r.estimates.filter((e) => e.status === "sent" || e.status === "awaiting_countersign").length),
    invoices: n(r.invoices.filter((i) => i.status !== "void" && invoiceState(i) !== "paid").length),
    jobs: n(r.jobs.filter((j) => j.status !== "done").length),
    tasks: n(r.tasks.filter((x) => !x.doneAt).length),
  };
}
