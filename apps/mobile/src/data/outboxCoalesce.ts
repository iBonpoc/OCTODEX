/**
 * Merging in the queue (docs/specs/33-gutters-module.md §8, П14.2 №5, П15.2 C2c). Drawing on the measuring canvas changes
 * one element many times; without merging the offline queue would hold hundreds of writes. A module.op with a coalesceKey
 * replaces the waiting op of the same module and key — in its place (ops after it that refer to what it makes keep their
 * order), with the newer change and every id either of them makes. Never an op on its way to the server (in flight), never
 * another person's, never another module's. Other kinds of ops never merge.
 */
import type { Op } from "@/cloud/ops";
import { sameOwner, type Owner, type OwnedItem } from "./outboxOwner";

/** where the op merges into the queue, or -1 (append) */
export function coalesceAt(items: readonly OwnedItem[], op: Op, who: Owner | null, inFlight: string | null): number {
  if (op.k !== "module.op" || !op.coalesceKey) return -1;
  for (let i = items.length - 1; i >= 0; i--) {
    const x = items[i]!;
    if (x.id === inFlight || x.op.k !== "module.op") continue;
    if (x.op.module !== op.module || x.op.coalesceKey !== op.coalesceKey) continue;
    // an older version's op has no owner: it is nobody's to merge into
    if (!who || !x.owner || !sameOwner(x.owner, who)) continue;
    return i;
  }
  return -1;
}

/** the newer op in the older one's place: tries start again (it is a new change), what both make stays made */
export function coalesced(older: OwnedItem, newer: OwnedItem): OwnedItem {
  const ids = (o: OwnedItem) => [...(o.made ?? []), ...(o.op.k === "module.op" ? o.op.made ?? [] : [])];
  const made = [...new Set([...ids(older), ...ids(newer)].map((x) => x.toLowerCase()))];
  const op = newer.op.k === "module.op" && made.length ? { ...newer.op, made } : newer.op;
  return { ...newer, op, ...(made.length ? { made } : {}) };
}
