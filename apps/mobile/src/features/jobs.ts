import type { StatusName } from "@octo/design-tokens";
import type { JobStatus } from "@/data/types";
import type { DictKey } from "@/i18n";

export const jobStatusView: Record<JobStatus, { status: StatusName; label: DictKey }> = {
  lead: { status: "info", label: "st.new" },
  estimate: { status: "info", label: "st.inspection" },
  unscheduled: { status: "warn", label: "st.toSchedule" },
  scheduled: { status: "neutral", label: "st.scheduled" },
  in_progress: { status: "info", label: "st.working" },
  done: { status: "ok", label: "jobs.done" },
};
