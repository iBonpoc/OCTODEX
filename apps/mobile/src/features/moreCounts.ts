import type { Mode } from "@/data/store";
import type { DB, Role } from "@/data/types";
import { hasSection, type SectionId } from "@/nav/sections";
import type { DictKey } from "@/i18n";
import { buildAttention, type AttentionItem } from "@/features/attention";
import { taskState, taskWhen, tasksOf } from "@/features/tasks/tasks";
import { dayKeyIn, getZone } from "@/features/zone";

/**
 * Counters on the rows of «Ещё» (spec 25, founder 07.11; BOARD debt «счётчики на плитках „Ещё“»).
 * Taken from buildAttention — the same numbers as «Требует внимания» on the home screen, the role's rights already in.
 * Zero → no counter. Only «Счета · просрочено» is a status (bad, icon + word); the rest are quiet text.
 */
export interface MoreCount {
  n: number;
  label: DictKey;
  /** a status chip (bad) instead of quiet text */
  bad?: boolean;
}

const LEAD_KINDS = new Set<AttentionItem["kind"]>(["lead", "leadBack", "leadNoStep", "leadIdle", "leadOrphan"]);
/** «Работы»: what is to schedule, and what is done and waits for the office (#2060) */
const JOB_PLAN_KINDS = new Set<AttentionItem["kind"]>(["schedule"]);
const JOB_CHECK_KINDS = new Set<AttentionItem["kind"]>(["jobDone"]);

/**
 * The word of the «Работы» counter says what is counted (#2060): only jobs to schedule → «К плану: N»,
 * only done jobs that wait for the office → «Проверить: N», both → «Требуют внимания: N».
 */
export function jobsCountLabel(plan: number, check: number): DictKey {
  if (plan > 0 && check > 0) return "fix.more.jobsAll";
  return check > 0 ? "fix.more.jobsCheck" : "fix.more.jobs";
}

export function moreCounts(db: DB, role: Role, now: number = Date.now(), tz: string = getZone(), mode?: Mode): Partial<Record<SectionId, MoreCount>> {
  const att = buildAttention(db, role, now, { mode });
  const kinds = (pass: (k: AttentionItem["kind"]) => boolean) => att.filter((a) => pass(a.kind)).length;
  const plan = kinds((k) => JOB_PLAN_KINDS.has(k));
  const check = kinds((k) => JOB_CHECK_KINDS.has(k));
  const today = dayKeyIn(now, tz);
  // my tasks for today: overdue or due / starting today (not done)
  const tasks = tasksOf(db, "mine").filter((x) => {
    const st = taskState(x, now);
    if (st === "done") return false;
    if (st === "overdue") return true;
    const w = taskWhen(x);
    return !!w && dayKeyIn(w, tz) <= today;
  }).length;
  const out: Partial<Record<SectionId, MoreCount>> = {
    leads: { n: kinds((k) => LEAD_KINDS.has(k)), label: "fix.more.leads" },
    tasks: { n: tasks, label: "fix.more.tasks" },
    jobs: { n: plan + check, label: jobsCountLabel(plan, check) },
    estimates: { n: kinds((k) => k === "estimateSign"), label: "fix.more.estimates" },
    invoices: { n: kinds((k) => k === "overdue"), label: "fix.more.invoices", bad: true },
  };
  // zero → no counter; a section the role does not have → no counter either (buildAttention lists every invoice)
  for (const k of Object.keys(out) as SectionId[]) if (!out[k]!.n || !hasSection(role, k)) delete out[k];
  return out;
}
