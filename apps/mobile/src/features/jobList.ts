/**
 * «Работы» on list cards (docs/specs/06-list-cards.md, PR8): what a job card shows besides the job itself.
 * Pure functions, unit-tested in test/jobList.test.ts.
 */
import type { DB, ID, Job, Member, Visit } from "@/data/types";

/** the visit the job waits for: the earliest one not finished yet; else the latest (a done job shows its last visit) */
export function nextVisitOf(db: Pick<DB, "visits">, jobId: ID): Visit | undefined {
  const vs = db.visits.filter((v) => v.jobId === jobId).sort((a, b) => a.start.localeCompare(b.start));
  return vs.find((v) => v.step !== "paid" && v.step !== "done") ?? vs[vs.length - 1];
}

/** who is assigned to a visit. TODO(10а PR8): switch to the assignees function of «Лиды и клиенты» after #105 (assigneeIds). */
export function visitPeople(db: Pick<DB, "members">, v: Visit | undefined): Member[] {
  const m = v?.techId ? db.members.find((x) => x.id === v.techId) : undefined;
  return m ? [m] : [];
}

/** the job's estimate number, if the job was made from an estimate */
export function jobEstimateNumber(db: Pick<DB, "estimates">, j: Job): string | undefined {
  return j.estimateId ? db.estimates.find((e) => e.id === j.estimateId)?.number : undefined;
}
