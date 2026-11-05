/**
 * Database status → app status (docs/15-story-map.md §5). The database keeps the fuller list from docs/04-domain-model.md;
 * the app shows a shorter one. Pure data — test/storyMap.test.ts checks that every status allowed by the migrations
 * has a translation here, so a new status in the database can't silently fall back to a default.
 */
import type { EstimateStatus, JobStatus, LeadStatus } from "@/data/types";

export const jobStatus: Record<string, JobStatus> = {
  draft: "estimate",
  scheduled: "scheduled",
  in_progress: "in_progress",
  on_hold: "scheduled",
  completed: "done",
  closed: "done",
  cancelled: "done",
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
  awaiting_countersign: "sent",
  expired: "sent",
  approved: "approved",
  declined: "declined",
  cancelled_by_customer: "declined",
};
