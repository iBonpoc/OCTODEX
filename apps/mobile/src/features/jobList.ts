/**
 * «Работы» on list cards (docs/specs/06-list-cards.md, PR8): what a job card shows besides the job itself.
 * Pure functions, unit-tested in test/jobList.test.ts.
 */
import type { DB, ID, Job, Member, Visit } from "@/data/types";
import { assigneesOf } from "@/features/schedule";

/** the visit the job waits for: the earliest one not finished yet; else the latest (a done job shows its last visit) */
export function nextVisitOf(db: Pick<DB, "visits">, jobId: ID): Visit | undefined {
  const vs = db.visits.filter((v) => v.jobId === jobId).sort((a, b) => a.start.localeCompare(b.start));
  return vs.find((v) => v.step !== "paid" && v.step !== "done") ?? vs[vs.length - 1];
}

/** everyone assigned to a visit, in the visit's order (assigneesOf of «Лиды и клиенты»: assigneeIds, else techId) */
export function visitPeople(db: Pick<DB, "members">, v: Visit | undefined): Member[] {
  return v ? assigneesOf(v).flatMap((id) => db.members.filter((m) => m.id === id)) : [];
}

/** the job's estimate number, if the job was made from an estimate */
export function jobEstimateNumber(db: Pick<DB, "estimates">, j: Job): string | undefined {
  return j.estimateId ? db.estimates.find((e) => e.id === j.estimateId)?.number : undefined;
}

/**
 * «Мастер работы» for the filter (spec 31 §13, the director's decision 07.11): the people of the job's nearest open visit,
 * else of its last one — the same people as the card's «кто». No visit, or nobody on it — nobody (the «Не назначен» row).
 */
export function jobPeople(db: Pick<DB, "visits" | "members">, j: Job): Member[] {
  return visitPeople(db, nextVisitOf(db, j.id));
}

/** the search of «Работы»: the client's name, the address, the job's title, its number and its estimate's number */
export function matchJob(db: Pick<DB, "customers" | "properties" | "estimates">, j: Job, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const prop = db.properties.find((p) => p.id === j.propertyId);
  const client = db.customers.find((c) => c.id === (j.customerId ?? prop?.customerId));
  return [client?.name, prop?.address, prop?.city, j.title, j.number, jobEstimateNumber(db, j)].some((x) => (x ?? "").toLowerCase().includes(needle));
}
