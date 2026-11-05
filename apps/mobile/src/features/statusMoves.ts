/**
 * Changing a status from a list card (docs/specs/06-list-cards.md, «Аудит и решения» №6).
 * Only through EXISTING store functions and only the moves the story map allows (docs/15-story-map.md §4–§5).
 * - "direct": one tap in the picker sheet, no input (the store function needs only the id).
 * - "form":   needs a reason or a date → the card opens the existing form instead of changing anything.
 * Statuses the app sets itself are shown in the picker but locked ("ставится сам").
 * No new statuses, no new store functions here. Unit-tested in test/statusMoves.test.ts.
 */
import { CUSTOMER_STATUSES, ESTIMATE_STATUSES, JOB_STATUSES, LEAD_STATUSES, VISIT_STEPS } from "@/data/types";

export type MoveEntity = "lead" | "customer" | "task" | "estimate" | "job" | "visit";
export type TaskState = "open" | "done";
export const TASK_STATES: readonly TaskState[] = ["open", "done"];

/** every status an entity can have, in the app's order (§5 «Приложение») */
export const STATUSES: Record<MoveEntity, readonly string[]> = {
  lead: LEAD_STATUSES,
  customer: CUSTOMER_STATUSES,
  task: TASK_STATES,
  estimate: ESTIMATE_STATUSES,
  job: JOB_STATUSES,
  visit: VISIT_STEPS,
};

/** names of store functions (src/data/store.tsx) a move may call — the test checks they exist */
export type StoreFn = "reopenLead" | "closeLead" | "convertLead" | "bookLead" | "setCustomerStatus" | "saveTask";

export interface Move {
  to: string;
  how: "direct" | "form";
  via: StoreFn;
}

const OPEN_LEAD = ["new", "replied", "booked", "estimate_sent"] as const;
const closeMoves: Move[] = [
  { to: "lost", how: "form", via: "closeLead" },
  { to: "declined", how: "form", via: "closeLead" },
  { to: "won", how: "form", via: "convertLead" },
];

/** from → allowed manual moves. Everything not listed here is set by the app only. */
export const MOVES: Record<MoveEntity, Record<string, Move[]>> = {
  lead: {
    ...Object.fromEntries(OPEN_LEAD.map((s) => [s, closeMoves])),
    new: [{ to: "booked", how: "form", via: "bookLead" }, ...closeMoves],
    replied: [{ to: "booked", how: "form", via: "bookLead" }, ...closeMoves],
    lost: [{ to: "replied", how: "direct", via: "reopenLead" }],
    declined: [{ to: "replied", how: "direct", via: "reopenLead" }],
  },
  customer: {
    prospect: [
      { to: "archived", how: "direct", via: "setCustomerStatus" },
      { to: "do_not_service", how: "form", via: "setCustomerStatus" },
    ],
    active: [
      { to: "archived", how: "direct", via: "setCustomerStatus" },
      { to: "do_not_service", how: "form", via: "setCustomerStatus" },
    ],
  },
  task: {
    open: [{ to: "done", how: "direct", via: "saveTask" }],
    done: [{ to: "open", how: "direct", via: "saveTask" }],
  },
  // estimate: sent by sendEstimate, approved by signature, declined has no store mutation yet → read only
  estimate: {},
  // job: scheduled by scheduleJob (date + tech), done by the visit's payment → read only
  job: {},
  // visit: advanceVisit moves one step forward from the visit screen, never picked from a list → read only
  visit: {},
};

/** Statuses only the app sets (story map §5 «Кто меняет»): never a manual target. */
export const SYSTEM_ONLY: Record<MoveEntity, readonly string[]> = {
  lead: ["new", "estimate_sent"],
  customer: ["prospect", "active"],
  task: [],
  estimate: ESTIMATE_STATUSES,
  job: JOB_STATUSES,
  visit: VISIT_STEPS,
};

export interface PickerOption {
  status: string;
  current: boolean;
  /** can be chosen from the card */
  enabled: boolean;
  /** "form": choosing it opens the existing form (reason / date) */
  how?: Move["how"];
  via?: StoreFn;
}

/** Options of the status picker for one card: every status, the allowed ones enabled. */
export function pickerOptions(entity: MoveEntity, from: string): PickerOption[] {
  const moves = MOVES[entity][from] ?? [];
  return STATUSES[entity].map((status) => {
    const m = moves.find((x) => x.to === status);
    return { status, current: status === from, enabled: !!m, how: m?.how, via: m?.via };
  });
}

/** Does a card of this entity in this status show a tappable status chip (chevron) at all? */
export const canChangeStatus = (entity: MoveEntity, from: string) => (MOVES[entity][from] ?? []).length > 0;
