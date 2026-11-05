import type { DB, Visit } from "./types";

/* ---------- selectors ---------- */
export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/** The property of a visit: its own (an inspection has no job, docs/specs/03 §3.1), else its job's. */
export function visitPropertyId(db: Pick<DB, "jobs">, v: Pick<Visit, "propertyId" | "jobId">): string | undefined {
  return v.propertyId ?? (v.jobId ? db.jobs.find((j) => j.id === v.jobId)?.propertyId : undefined);
}

export function visitContext(db: DB, v: Visit) {
  const job = v.jobId ? db.jobs.find((j) => j.id === v.jobId) : undefined;
  const pid = visitPropertyId(db, v);
  const property = db.properties.find((p) => p.id === pid);
  const customer = db.customers.find((c) => c.id === property?.customerId);
  const tech = db.members.find((m) => m.id === v.techId) ?? null;
  return { job, property, customer, tech };
}

export function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}
export function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

/** What the customer owes now = unpaid part of their invoices (balance is derived, never stored). */
export function customerBalance(db: DB, customerId: string): number {
  return db.invoices.filter((i) => i.customerId === customerId).reduce((s, i) => s + Math.max(0, i.totalCents - i.paidCents), 0);
}

/** Job profit = revenue (job amount) − expenses linked to the job. Labor cost arrives with time tracking. */
export function jobProfit(db: DB, jobId: string) {
  const job = db.jobs.find((j) => j.id === jobId);
  const expenses = (db.expenses ?? []).filter((e) => e.jobId === jobId).reduce((s, e) => s + e.amountCents, 0);
  const revenue = job?.amountCents ?? 0;
  return { revenue, expenses, profit: revenue - expenses, marginPct: revenue ? Math.round(((revenue - expenses) / revenue) * 1000) / 10 : null };
}

/** An invoice is overdue only after its due day has ended (due "today" is not overdue yet). */
export function isOverdue(dueDate: string, now = Date.now()): boolean {
  const end = new Date(dueDate);
  end.setHours(23, 59, 59, 999);
  return end.getTime() < now;
}
