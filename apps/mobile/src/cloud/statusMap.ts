/**
 * Database status → app status (docs/15-story-map.md §5). The database keeps the fuller list from docs/04-domain-model.md;
 * the app shows a shorter one. Pure data — test/storyMap.test.ts checks that every status allowed by the migrations
 * has a translation here, so a new status in the database can't silently fall back to a default.
 */
import type { CustomerStatus, EstimateStatus, JobStatus, LeadStatus, MembershipStatus } from "@/data/types";

/** app lead status → public.leads.status (what the app writes) */
export const leadStatusToDb: Record<LeadStatus, string> = {
  new: "new",
  replied: "contacted",
  booked: "inspection_scheduled",
  estimate_sent: "estimate_sent",
  won: "won",
  lost: "lost",
  declined: "declined",
};

/** a job waiting for a date is draft in the database; an inspection is a visit, not a job (docs/specs/03 §4.4).
 *  A cancelled job is not "done" (wave П-1, 13 §5): it has no app status and leaves the list of jobs (jobDbCancelled). */
export const jobStatus: Record<string, JobStatus> = {
  draft: "unscheduled",
  scheduled: "scheduled",
  in_progress: "in_progress",
  on_hold: "scheduled",
  completed: "done",
  closed: "done",
};
/** database job statuses that take the job out of the list (cloud/repo.ts → DB.cancelledJobs), like cancelled visits */
export const jobDbCancelled: readonly string[] = ["cancelled"];
/** a visit in the database → the app's status (the step comes from the visit's own fields, cloud/repo.ts) */
export const visitDbStatus: Record<string, "open" | "done" | "cancelled"> = {
  scheduled: "open",
  en_route: "open",
  on_site: "open",
  completed: "done",
  cancelled: "cancelled",
  no_show: "cancelled",
};
export const leadStatus: Record<string, LeadStatus> = {
  new: "new",
  contacted: "replied",
  qualified: "replied",
  inspection_scheduled: "booked",
  estimate_sent: "estimate_sent",
  won: "won",
  lost: "lost",
  declined: "declined",
  archived: "lost",
};
export const estimateStatus: Record<string, EstimateStatus> = {
  draft: "draft",
  sent: "sent",
  viewed: "sent",
  awaiting_countersign: "awaiting_countersign",
  expired: "sent",
  approved: "approved",
  declined: "declined",
  cancelled_by_customer: "declined",
};

/** customers.status: the app keeps the same four (docs/specs/04 §4); unknown → active */
export const customerStatus: Record<string, CustomerStatus> = {
  prospect: "prospect",
  active: "active",
  archived: "archived",
  do_not_service: "do_not_service",
};

/** memberships.status (wave 7а-2b, S22). `invited` is never loaded as a person: an invitation is public.invitations
 *  (cloud/repo.ts), so it leaves the list like a cancelled job. */
export const membershipStatus: Record<string, MembershipStatus> = {
  active: "active",
  disabled: "disabled",
  deleted: "deleted",
};
export const membershipDbOutOfList: readonly string[] = ["invited"];
