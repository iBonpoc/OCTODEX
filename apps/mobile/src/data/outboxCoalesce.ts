/**
 * Merging in the queue (docs/specs/33-gutters-module.md §8, П14.2 №5, П15.6). Drawing on the measuring canvas changes one
 * element many times; without merging the offline queue would hold hundreds of writes.
 *
 * Contract (ModuleDef.ops, spec П15.6): an op with a coalesceKey is a FULL, idempotent write of one thing (an upsert of the
 * element with everything it has), so a newer one makes an older one of the same module, kind and key unneeded. A delete
 * or anything that is not a full write carries no coalesceKey and never merges.
 *
 * The newer op takes the waiting one's place only when nothing queued after that place is tied to either of them — no op
 * after it refers to or makes an id the older or the newer one makes or refers to (review #354 Б3, Б4). Otherwise it goes
 * to the end, as any op, and both are sent in order. Never an op on its way to the server (in flight), never another
 * person's or an owner-less one, never another module's or another kind. Other kinds of ops never merge.
 */
import type { Op } from "@/cloud/ops";
import { createdOf, refsOf, uuidsOf } from "./outboxDeps";
import { sameOwner, type Owner, type OwnedItem } from "./outboxOwner";

const lower = (xs: Iterable<string>) => new Set([...xs].map((x) => x.toLowerCase()));
/** every id an op names (made, own, referred to) */
function idsIn(op: Op, made?: readonly string[]): Set<string> {
  const out = lower([...uuidsOf(op), ...refsOf(op), ...(made ?? []), ...(op.k === "module.op" ? op.made ?? [] : [])]);
  return out;
}

/** where the op merges into the queue, or -1 (append) */
export function coalesceAt(items: readonly OwnedItem[], op: Op, who: Owner | null, inFlight: string | null): number {
  if (op.k !== "module.op" || !op.coalesceKey || !who) return -1;
  for (let i = items.length - 1; i >= 0; i--) {
    const x = items[i]!;
    if (x.id === inFlight || x.op.k !== "module.op") continue;
    if (x.op.module !== op.module || x.op.kind !== op.kind || x.op.coalesceKey !== op.coalesceKey) continue;
    // an older version's op has no owner: it is nobody's to merge into
    if (!x.owner || !sameOwner(x.owner, who)) return -1;
    const ids = new Set([...idsIn(x.op, x.made), ...idsIn(op)]);
    const tied = items.slice(i + 1).some((y) => [...idsIn(y.op), ...createdOf(y)].some((id) => ids.has(id.toLowerCase())));
    return tied ? -1 : i;
  }
  return -1;
}

/** the newer op in the older one's place: tries start again (it is a new change), what both make stays made */
export function coalesced(older: OwnedItem, newer: OwnedItem): OwnedItem {
  const ids = (o: OwnedItem) => [...(o.made ?? []), ...(o.op.k === "module.op" ? o.op.made ?? [] : [])];
  const made = [...lower([...ids(older), ...ids(newer)])];
  const op = newer.op.k === "module.op" && made.length ? { ...newer.op, made } : newer.op;
  return { ...newer, op, ...(made.length ? { made } : {}) };
}
