/**
 * Estimate status moves in the app (docs/specs/07-estimates.md §4; docs/15-story-map.md §5, handoff S8b).
 * Mirrors app.status_transitions in the database — test/estimateStatus.test.ts checks both ways.
 *
 * draft → sent → awaiting_countersign (client signed remotely) → approved (an employee signed for the company).
 * On site both sign on one screen: sent → approved. Editing a sent estimate makes a new version: → draft.
 */
import type { StatusName } from "@octo/design-tokens";
import type { EstimateStatus, Role } from "@/data/types";
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

const VIEW: Record<EstimateStatus, { s: StatusName; l: DictKey; d?: true }> = {
  draft: { s: "neutral", l: "st.draft", d: true },
  sent: { s: "info", l: "st.sent" },
  awaiting_countersign: { s: "warn", l: "est.awaitingCountersign" },
  approved: { s: "ok", l: "st.approved" },
  declined: { s: "bad", l: "st.declined" },
};

/** the later of two ISO moments (either may be missing) */
export const laterIso = (a?: string, b?: string): string | undefined => (a && b ? (a > b ? a : b) : a ?? b);

/** #3058: when it last went to the client — the sent version's moment, or this version's own (an estimate never sent: none) */
export const sentOnceAt = (e: { sentAt?: string; lastSentAt?: string }): string | undefined => laterIso(e.lastSentAt, e.sentAt);

/**
 * #3058 (founder: «изменена после отправки»; map S6): the client has an older version than this one — a draft that went out before and
 * was saved since, or a sent one saved after it went (the editor, before «Готово»)
 */
export function changedAfterSend(e: { status: EstimateStatus; sentAt?: string; lastSentAt?: string; savedAt?: string; doc?: { savedAt?: string } }): boolean {
  const sent = e.status === "draft" ? sentOnceAt(e) : e.status === "sent" ? e.sentAt : undefined;
  const saved = e.doc?.savedAt ?? e.savedAt;
  return !!sent && !!saved && saved > sent;
}

/** the status chip of THIS estimate: a draft that went out before reads «Изменена после отправки» (warn), else the status's own */
export function estimateView(e: { status: EstimateStatus; sentAt?: string; lastSentAt?: string; savedAt?: string; doc?: { savedAt?: string } }): { s: StatusName; l: DictKey; d?: true } {
  return e.status === "draft" && changedAfterSend(e) ? { s: "warn", l: "oc.est.changedAfterSend" } : VIEW[e.status];
}

/** Status chip for an estimate: colour only from the status, always with a word. */
export function estimateStatusView(s: EstimateStatus): { s: StatusName; l: DictKey; d?: true } {
  return VIEW[s];
}

/**
 * T2 (docs/specs/11-trade.md §1, handoff S16): the direction of an estimate changes until the client signs.
 * After a signature (awaiting_countersign, approved) or a decline it is read-only: the job keeps its own and a change
 * never goes forward. A tech changes it only in a draft (in the database: their own draft); the office in any unsigned one.
 */
export function canChangeEstimateCategory(s: EstimateStatus, role: Role): boolean {
  if (role === "tech") return s === "draft";
  return s === "draft" || s === "sent";
}

/**
 * Who the estimate is for: picked while it is a draft (or not yet saved) — once it has gone to the client (sent, signed, declined)
 * it stays with that client; to give it to another, make a new estimate (#2406, founder 22.11.2026). The screen, the store and
 * the cloud op all follow this one rule.
 */
export function canChangeEstimateClient(s: EstimateStatus | undefined): boolean {
  return s === undefined || s === "draft";
}
