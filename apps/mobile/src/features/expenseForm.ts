/**
 * The expense form (#2008, docs/specs/18 §expenses): which jobs a person may put an expense on, the vendors to choose from,
 * and the day of an expense. Pure; tested in test/expenseForm.test.ts.
 */
import type { DB, Expense, ID, Role } from "@/data/types";
import { isAssigned } from "@/features/schedule";
import { dayKeyIn, type DayKey } from "@/features/zone";
import { suppliersOf, sortedSuppliers } from "@/features/suppliers";

/** the usual vendors after the company's own suppliers (spec 36 §7) */
export const USUAL_VENDORS = ["Home Depot", "Lowe's", "ABC Supply", "Chevron"] as const;

export interface ExpenseJobChoice {
  key: ID;
  label: string;
  subtitle?: string;
}

/**
 * The jobs an expense may go on — as the server allows (expenses insert policy, trigger t12_expense_job_guard):
 * the office, the owner and sales — any job of the company; a technician — a job he is on by any visit (not only today's).
 * Named by number and title, the client under it; newest number first.
 */
export function expenseJobsFor(db: Pick<DB, "jobs" | "visits" | "properties" | "customers" | "me">, role: Role): ExpenseJobChoice[] {
  const mine = role === "tech" ? new Set(db.visits.filter((v) => isAssigned(v, db.me) && v.jobId).map((v) => v.jobId!)) : null;
  return db.jobs
    .filter((j) => !mine || mine.has(j.id))
    .slice()
    .sort((a, b) => (b.number ?? "").localeCompare(a.number ?? "", undefined, { numeric: true }))
    .map((j) => {
      const client = db.customers.find((c) => c.id === db.properties.find((p) => p.id === j.propertyId)?.customerId);
      return { key: j.id, label: [j.number, j.title].filter(Boolean).join(" · ") || (client?.name ?? j.id), subtitle: client?.name };
    });
}

/**
 * The job a new expense starts on: the one it was opened from (the job's or a visit's screen) when the person may use it;
 * else the job of the person's visit today, if there is exactly one; else none — the person picks (never a guess between two).
 */
export function startJob(choices: ExpenseJobChoice[], opened: ID | undefined, todaysJobs: ID[]): ID | null {
  const allowed = new Set(choices.map((c) => c.key));
  if (opened && allowed.has(opened)) return opened;
  const today = [...new Set(todaysJobs)].filter((j) => allowed.has(j));
  return today.length === 1 ? today[0]! : null;
}

/**
 * Where it was bought: the company's active suppliers, then the vendors of the person's own recent expenses, then the
 * usual ones — each once (case aside). A vendor typed by hand is free text: it creates no supplier (#2008).
 */
export function vendorChoices(db: Pick<DB, "suppliers" | "expenses" | "me">, current?: string): string[] {
  const out: string[] = [];
  const add = (n: string | undefined) => {
    const v = (n ?? "").trim();
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  };
  for (const s of sortedSuppliers(suppliersOf(db as DB).filter((x) => x.active))) add(s.name);
  for (const x of (db.expenses ?? []).filter((e) => e.memberId === db.me).slice().sort((a, b) => b.at.localeCompare(a.at))) add(x.vendor);
  for (const u of USUAL_VENDORS) add(u);
  add(current);
  return out;
}

/** the day of an expense: the receipt's day it was given, else (an older expense) the company's day of when it was made */
export function expenseDay(x: Pick<Expense, "date" | "at">, zone?: string): DayKey {
  return x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : zone ? dayKeyIn(x.at, zone) : dayKeyIn(x.at);
}
