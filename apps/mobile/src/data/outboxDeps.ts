/**
 * Which queued op may go out while an earlier one is held (docs/specs/23 §3, task 2 of «Лиды» №9). An op that keeps
 * getting the server's error («500», a statement timeout) must not hold every later op of its owner forever — but an
 * op that needs it (the same client, estimate, visit…) must still wait for it, in order. Pure: test/outboxDeps.test.ts.
 *
 * Two ops are related when they share an id (a client-made UUID, found anywhere in the op). A **barrier** is an op
 * nothing may pass while something before it is held, and that itself stops everything after it while it is held:
 * an op with no UUID (company settings, demo or old ids — we cannot tell what it touches) and the kinds of
 * BARRIER_KINDS (company-wide state that later ops read on the server: settings, sources, tags, numbering, the lead
 * returned by a cancelled visit…). An op still in its «Отменить» window stops everything after it, as before.
 * Other people's ops (another owner in the same company) are never sent by this person: they hold only what shares
 * an id with them, never as a barrier (else one person's queue would stop another's for good).
 */
import type { Op } from "@/cloud/ops";
import { readyToSend } from "@/cloud/outboxTiming";
import { mineOf, type Owner, type OwnedItem } from "./outboxOwner";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** company-wide state that later ops depend on through the server, not through a shared id */
export const BARRIER_KINDS: ReadonlySet<Op["k"]> = new Set<Op["k"]>([
  "company.save", "source.save", "tag.save", "serviceCategory.save", "jobType.save", "customField.save",
  "license.save", "license.remove", "member.update", "member.signature", "me.prefs", "me.location", "visit.cancel",
]);

/** every UUID in the op (lowercase), at any depth */
export function uuidsOf(op: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 8 || v == null) return;
    if (typeof v === "string") {
      if (UUID.test(v)) out.add(v.toLowerCase());
    } else if (Array.isArray(v)) for (const x of v) walk(x, depth + 1);
    else if (typeof v === "object") for (const x of Object.values(v as Record<string, unknown>)) walk(x, depth + 1);
  };
  walk(op, 0);
  return out;
}

export const isBarrier = (op: Op) => BARRIER_KINDS.has(op.k) || uuidsOf(op).size === 0;

const sameOwnerOf = (o: OwnedItem, who: Owner) => !o.owner || (o.owner.userId === who.userId && o.owner.companyId === who.companyId);

/**
 * The person's ops that are not held and not behind a held one, in order. `held` — ops that may not go now (stuck,
 * waiting for their own pause, failed in this pass). What is behind a held op: an op that shares an id with it (and,
 * from then on, the ids of that op too), everything after a held barrier, and a barrier after anything held.
 * Ops of another owner in the same company hold the ops that share an id with them.
 */
export function liveOf(items: readonly OwnedItem[], who: Owner | null, held: (o: OwnedItem) => boolean): OwnedItem[] {
  if (!who) return [];
  const out: OwnedItem[] = [];
  const blockedIds = new Set<string>();
  let anyHeld = false;
  const overlaps = (ids: Set<string>) => [...ids].some((x) => blockedIds.has(x));
  const block = (ids: Set<string>) => ids.forEach((x) => blockedIds.add(x));
  for (const o of items) {
    const ids = uuidsOf(o.op);
    if (!sameOwnerOf(o, who)) {
      if (o.owner?.companyId === who.companyId) block(ids); // never a barrier for this person
      continue;
    }
    const barrier = isBarrier(o.op);
    if (held(o) || overlaps(ids) || (barrier && anyHeld)) {
      anyHeld = true;
      block(ids);
      if (barrier) break; // nothing passes a held barrier
      continue;
    }
    out.push(o);
  }
  return out;
}

/** the op to send now: the first live one — unless an earlier live op is still in its «Отменить» window */
export function nextToSend(items: readonly OwnedItem[], who: Owner | null, held: (o: OwnedItem) => boolean, now: number): OwnedItem | null {
  for (const o of liveOf(items, who, held)) return readyToSend(o, now) ? o : null;
  return null;
}

/** the ops that wait for `id` (later, sharing an id with it or with one of them, or behind it as a barrier) */
export function dependentsOf(items: readonly OwnedItem[], who: Owner | null, id: string): OwnedItem[] {
  // what goes without it minus what goes while only it is held — not what other people's ops hold anyway
  const free = new Set(liveOf(items, who, () => false).map((o) => o.id));
  const without = new Set(liveOf(items, who, (o) => o.id === id).map((o) => o.id));
  return mineOf(items, who).filter((o) => o.id !== id && free.has(o.id) && !without.has(o.id));
}
