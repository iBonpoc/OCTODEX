/** Lead funnel helpers (docs/13 §3): statuses, lost reasons, "no movement" rules (14 / 30 days). */
import type { StatusName } from "@octo/design-tokens";
import type { Lead, LeadStatus, LostReason } from "@/data/types";
import type { DictKey } from "@/i18n";

export const leadStatusView: Record<LeadStatus, { status: StatusName; label: DictKey }> = {
  new: { status: "info", label: "st.new" },
  replied: { status: "neutral", label: "st.replied" },
  booked: { status: "info", label: "st.booked" },
  estimate_sent: { status: "info", label: "lead.st.estimate" },
  won: { status: "ok", label: "lead.st.won" },
  lost: { status: "neutral", label: "st.lost" },
};

export const LOST_REASONS: LostReason[] = [
  "no_response", "price_too_high", "chose_competitor", "not_ready_timing", "out_of_service_area", "service_not_offered", "junk_spam", "duplicate", "other",
];
export const MANUAL_WIN_REASONS = ["paper", "verbal", "paid", "other"] as const;
export type ManualWinReason = (typeof MANUAL_WIN_REASONS)[number];

export const isOpenLead = (l: Lead) => l.status !== "won" && l.status !== "lost";

/** Days since the lead last moved (contractor action) or arrived. */
export function leadIdleDays(l: Lead, now = Date.now()): number {
  const t = new Date(l.lastActivityAt ?? l.receivedAt).getTime();
  return Math.floor((now - t) / 86_400_000);
}
export const LEAD_FOLLOW_UP_DAYS = 14;
export const LEAD_CLOSE_DAYS = 30;
