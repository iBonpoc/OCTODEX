/**
 * Which queued op may go out while an earlier one is held (docs/specs/23 §3, task 2 of «Лиды» №9; review #259 Б1, Б2).
 * An op that keeps getting the server's error («500», a statement timeout) must not hold every later op of its owner
 * forever — but an op that needs it on the server must still wait for it, in order, and a dependency on the server is
 * not always visible in the op (a visit's step and «the job is done», a job line and the job's invoice, two contacts
 * of which one becomes the primary). So the rule is the other way round: **every op waits** behind a held one, except
 * the kinds of SELF_KINDS — ops that only add something of their own (a new lead, a new client, a note, a call, a task,
 * an event) — and even those wait when they share the id of an object with an op that is held or waiting.
 * An op still in its «Отменить» window stops everything after it, as before. Other people's ops (another owner) never
 * hold this person's (as before the change: they are never sent by this person, and would hold them for good).
 *
 * Ids: the client-made UUIDs of the objects the op is about, found anywhere in it — but not the ids it only refers to
 * (REF_KEYS: the source, tags, people, categories, types, catalog items): two leads with the same source are not
 * related. Pure: test/outboxDeps.test.ts.
 */
import type { Op } from "@/cloud/ops";
import { readyToSend } from "@/cloud/outboxTiming";
import { mineOf, type Owner, type OwnedItem } from "./outboxOwner";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ops that only add something of their own: they may go past a held op when they share no object with it */
export const SELF_KINDS: ReadonlySet<Op["k"]> = new Set<Op["k"]>([
  "lead.add", "customer.create", "note.add", "activity.call", "activity.message", "task.save", "calendarEvent.save", "calendarEvent.remove",
]);

/** fields that only refer to something shared (not the object the op changes) */
export const REF_KEYS: ReadonlySet<string> = new Set([
  "sourceId", "source", "tagIds", "tagId", "techId", "userId", "userIds", "assigneeId", "assigneeIds", "serviceCategoryId",
  "jobTypeId", "categoryId", "catalogItemId", "createdBy", "ownerId", "doneBy",
]);

/** the ids of the objects the op is about (lowercase), at any depth, without the REF_KEYS */
export function uuidsOf(op: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 8 || v == null) return;
    if (typeof v === "string") {
      if (UUID.test(v)) out.add(v.toLowerCase());
    } else if (Array.isArray(v)) for (const x of v) walk(x, depth + 1);
    else if (typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (!REF_KEYS.has(k)) walk(x, depth + 1);
  };
  walk(op, 0);
  return out;
}

/** may it go past a held op (when it shares no object with it) */
export const mayPass = (op: Op) => SELF_KINDS.has(op.k) && uuidsOf(op).size > 0;

const isMine = (o: OwnedItem, who: Owner) => !o.owner || (o.owner.userId === who.userId && o.owner.companyId === who.companyId);

/**
 * The person's ops that are not held and not waiting behind a held one, in order. `held` — ops that may not go now
 * (stuck, waiting for their own pause, failed in this pass). Behind a held op every op waits, except one of SELF_KINDS
 * that shares no object with a held or waiting op.
 */
export function liveOf(items: readonly OwnedItem[], who: Owner | null, held: (o: OwnedItem) => boolean): OwnedItem[] {
  if (!who) return [];
  const out: OwnedItem[] = [];
  const blocked = new Set<string>();
  let anyHeld = false;
  for (const o of items) {
    if (!isMine(o, who)) continue;
    const ids = uuidsOf(o.op);
    const shares = [...ids].some((x) => blocked.has(x));
    if (held(o) || (anyHeld && (shares || !mayPass(o.op)))) {
      anyHeld = true;
      ids.forEach((x) => blocked.add(x));
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

/**
 * The ops that need `id` and leave with it on «Отменить изменение…» (review #259 Б2): the person's later ops about
 * the same object, and those about the objects of these — never an op only because it stood behind it, never by a
 * shared source / tag / person. The others are free again once it is gone.
 */
export function dependentsOf(items: readonly OwnedItem[], who: Owner | null, id: string): OwnedItem[] {
  const mine = mineOf(items, who);
  const at = mine.findIndex((o) => o.id === id);
  if (at < 0) return [];
  const ids = uuidsOf(mine[at]!.op);
  const out: OwnedItem[] = [];
  for (const o of mine.slice(at + 1)) {
    const own = uuidsOf(o.op);
    if (![...own].some((x) => ids.has(x))) continue;
    out.push(o);
    own.forEach((x) => ids.add(x));
  }
  return out;
}
