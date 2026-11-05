/**
 * Groups of list cards (docs/specs/06-list-cards.md): what needs the contractor first, then drafts, then waiting, then done.
 * Pure functions, unit-tested in test/listGroups.test.ts.
 */
import type { Estimate } from "@/data/types";
import { estimateSigns } from "./listSigns";

export type EstimateGroup = "action" | "drafts" | "waiting" | "done";
export const ESTIMATE_GROUPS: readonly EstimateGroup[] = ["action", "drafts", "waiting", "done"];

/**
 * action  — a sign (no reply N days) or the client signed and waits for the contractor's signature;
 * drafts  — not sent yet; waiting — sent, the client's turn; done — approved, declined and anything closed.
 */
export function estimateGroup(e: Pick<Estimate, "status" | "sentAt">, now = Date.now()): EstimateGroup {
  if (e.status === "awaiting_countersign" || estimateSigns(e, now).length) return "action";
  if (e.status === "draft") return "drafts";
  if (e.status === "sent") return "waiting";
  return "done";
}

/** filter chips: open = everything still in work (action, drafts, waiting); closed = done */
export type EstimateFilter = "open" | "closed" | "all";
export const inEstimateFilter = (g: EstimateGroup, f: EstimateFilter) => f === "all" || (f === "closed" ? g === "done" : g !== "done");
