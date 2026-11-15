import type { StatusName } from "@octo/design-tokens";
import type { DB, Job, JobStatus, Visit } from "@/data/types";
import { canServe } from "@/features/clients";
import type { DictKey } from "@/i18n";

export const jobStatusView: Record<JobStatus, { status: StatusName; label: DictKey }> = {
  unscheduled: { status: "warn", label: "st.toSchedule" },
  // a job (работа) is feminine in Russian — its own key; a visit (выезд) keeps «Запланирован» (#1417 review)
  scheduled: { status: "neutral", label: "st.jobScheduled" },
  in_progress: { status: "info", label: "st.working" },
  done: { status: "ok", label: "jobs.done" },
};

/** the client of a job: its own customerId, else through the property (old saved data) */
export function jobCustomerId(db: Pick<DB, "properties">, j: Pick<Job, "customerId" | "propertyId">): string | undefined {
  return j.customerId ?? db.properties.find((p) => p.id === j.propertyId)?.customerId;
}

/**
 * «Не обслуживаем» (04 §12, 17-job §11.1): a job of such a client takes no new visit and no estimate — the buttons
 * «Запланировать», «Ещё выезд», ＋Выезд, ＋Смета are hidden. A visit already set keeps its steps and «Перенести»
 * (the server lets the work be finished: t44_no_service_guard fires only on job/lead/property/deleted_at).
 */
export function jobServable(db: Pick<DB, "customers" | "properties">, j: Pick<Job, "customerId" | "propertyId">): boolean {
  return canServe(db, jobCustomerId(db, j));
}

/** the same for a visit: its job's client, else the client of its property (an inspection) */
export function visitServable(db: Pick<DB, "customers" | "properties" | "jobs">, v: Pick<Visit, "jobId" | "propertyId">): boolean {
  const j = v.jobId ? db.jobs.find((x) => x.id === v.jobId) : undefined;
  if (j) return jobServable(db, j);
  return canServe(db, db.properties.find((p) => p.id === v.propertyId)?.customerId);
}
