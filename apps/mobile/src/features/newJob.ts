/**
 * «Новая работа» — a job without an estimate (S17; docs/specs/17-job.md §4, §7.3; 13 §3.5, §5). Pure rules the store
 * and the form share; the server does the same in public.create_job (migration 20261106040000, db test T43).
 * - the job waits for a date (`unscheduled`) until the form also gives a visit (S9, the same scheduleJob);
 * - `Job.customerId` at once; a «prospect» client becomes «active» (a client with a job is active); a new client from
 *   the form is made «active» by addCustomer already;
 * - direction: chosen → the client's last → the company's only one → none (S16, inheritCategory);
 * - number: the demo numbers at once; in the cloud the server does, until then «Новая работа» (offline).
 */
import type { Customer, DB, ID, Job, Role } from "@/data/types";
import { nextJobNumber } from "@/data/jobs";
import { inheritCategory } from "@/features/serviceCategories";

export interface NewJobInput {
  customerId: ID;
  propertyId: ID;
  title: string;
  description?: string;
  jobTypeId?: ID;
  serviceCategoryId?: ID;
}

/** who may create a job (server: owner, admin, office, sales) */
export const canCreateJob = (role: Role) => role !== "tech";
/** who may give the new job a date and people (sales only «Назначить позже», 13 §5 S17) */
export const canDateNewJob = (role: Role) => role === "director" || role === "dispatcher";

/** a client a new job may be made for: not «Не обслуживать» — the same one rule as public.create_job (until canServe
 *  of features/clients.ts, PR 4b «Лиды и клиенты», replaces it) */
export const servable = (c: Pick<Customer, "status">) => c.status !== "do_not_service";

export type NewJobProblem = "noClient" | "noAddress" | "noTitle" | "titleLong" | "notServed";
export function newJobProblems(d: Pick<DB, "customers" | "properties">, x: Partial<NewJobInput>): NewJobProblem[] {
  const out: NewJobProblem[] = [];
  const c = d.customers.find((y) => y.id === x.customerId);
  if (!c) out.push("noClient");
  else if (!servable(c)) out.push("notServed");
  if (!x.propertyId || !d.properties.some((p) => p.id === x.propertyId && p.customerId === x.customerId)) out.push("noAddress");
  const title = (x.title ?? "").trim();
  if (!title) out.push("noTitle");
  else if (title.length > 200) out.push("titleLong");
  return out;
}

/** the local side of create_job: the new job and the client made active */
export function withNewJob(d: DB, id: ID, x: NewJobInput, demo: boolean): DB {
  const job: Job = {
    id,
    number: demo ? nextJobNumber(d) : undefined,
    customerId: x.customerId,
    propertyId: x.propertyId,
    title: x.title.trim(),
    description: x.description?.trim() || undefined,
    jobTypeId: x.jobTypeId,
    serviceCategoryId: inheritCategory(d, { kind: "job", customerId: x.customerId }, x.serviceCategoryId),
    status: "unscheduled",
    amountCents: 0,
  };
  return {
    ...d,
    jobs: [...d.jobs, job],
    customers: d.customers.map((c) => (c.id === x.customerId && c.status === "prospect" ? { ...c, status: "active" } : c)),
  };
}
