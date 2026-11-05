/**
 * Estimate status moves in the app (docs/specs/07-estimates.md §4; docs/15-story-map.md §5, handoff S8b).
 * Mirrors app.status_transitions in the database — test/estimateStatus.test.ts checks both ways.
 *
 * draft → sent → awaiting_countersign (client signed remotely) → approved (an employee signed for the company).
 * On site both sign on one screen: sent → approved. Editing a sent estimate makes a new version: → draft.
 */
import type { StatusName } from "@octo/design-tokens";
import type { EstimateStatus } from "@/data/types";
import type { DictKey } from "@/i18n";

export const ESTIMATE_MOVES: readonly (readonly [EstimateStatus, EstimateStatus])[] = [
  ["draft", "sent"],
  ["sent", "awaiting_countersign"],
  ["sent", "approved"],
  ["sent", "declined"],
  ["sent", "draft"],
  ["awaiting_countersign", "approved"],
  ["awaiting_countersign", "draft"],
  ["awaiting_countersign", "declined"], // E2b: the company declines after the client signed
  ["approved", "declined"],
];

export function canMoveEstimate(from: EstimateStatus, to: EstimateStatus): boolean {
  return ESTIMATE_MOVES.some(([a, b]) => a === from && b === to);
}

/** "Edit" is offered: a draft directly; a sent or client-signed estimate through a new version. Signed by both — never. */
export function isEstimateEditable(s: EstimateStatus): boolean {
  return s === "draft" || canMoveEstimate(s, "draft");
}

const VIEW: Record<EstimateStatus, { s: StatusName; l: DictKey }> = {
  draft: { s: "neutral", l: "st.draft" },
  sent: { s: "info", l: "st.sent" },
  awaiting_countersign: { s: "warn", l: "est.awaitingCountersign" },
  approved: { s: "ok", l: "st.approved" },
  declined: { s: "bad", l: "st.declined" },
};

/** Status chip for an estimate: colour only from the status, always with a word. */
export function estimateStatusView(s: EstimateStatus): { s: StatusName; l: DictKey } {
  return VIEW[s];
}
