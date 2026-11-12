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
 * Ids: the client-made UUIDs of the objects the op is about, found anywhere in it; the ids it only refers to (REF_KEYS:
 * the source, tags, people, categories, types, catalog items) are kept apart — two leads with the same source are not
 * related, but a lead waits for the held op that makes its new source (review #259 Б1-бис). What an op makes on the
 * server — CREATES, one entry per kind. Pure: test/outboxDeps.test.ts.
 */
import type { Op } from "@/cloud/ops";
import { readyToSend } from "@/cloud/outboxTiming";
import { mineOf, type Owner, type OwnedItem } from "./outboxOwner";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ops that only add something of their own: they may go past a held op when they share no object with it */
export const SELF_KINDS: ReadonlySet<Op["k"]> = new Set<Op["k"]>([
  "lead.add", "customer.create", "note.add", "activity.call", "activity.message", "task.save", "calendarEvent.save", "calendarEvent.remove",
]);

/**
 * Fields that only refer to something shared (not the object the op is about): two leads with the same source are not
 * related. But a reference still ties the op to the op that CREATES what it refers to (review #259 Б1-бис): a new lead
 * waits for its new source (leads.source_id → lead_sources), a job for its new category / type, a job line for its new
 * catalog item. So the ids under these keys are kept apart (refsOf), not thrown away.
 */
export const REF_KEYS: ReadonlySet<string> = new Set([
  "sourceId", "tagIds", "tagId", "techId", "userId", "userIds", "assigneeId", "assigneeIds", "serviceCategoryId",
  "jobTypeId", "categoryId", "catalogItemId", "serviceItemId", "createdBy", "ownerId", "doneBy",
  // spec 36: an item waits for its new supplier (catalog_items.supplier_id → suppliers)
  "supplierId",
  // the same in a lead's columns (cloud/leadCols.ts: lead.add / lead.update `cols`)
  "source_id", "service_item_id", "service_category_id", "assigned_to",
]);

/** the ids in the op (lowercase), at any depth: `own` — the objects it is about, `refs` — under REF_KEYS */
function idsOf(op: unknown): { own: Set<string>; refs: Set<string> } {
  const own = new Set<string>();
  const refs = new Set<string>();
  const walk = (v: unknown, depth: number, ref: boolean) => {
    if (depth > 8 || v == null) return;
    if (typeof v === "string") {
      if (UUID.test(v)) (ref ? refs : own).add(v.toLowerCase());
    } else if (Array.isArray(v)) for (const x of v) walk(x, depth + 1, ref);
    else if (typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, depth + 1, ref || REF_KEYS.has(k));
  };
  walk(op, 0, false);
  return { own, refs };
}
/** the ids of the objects the op is about (lowercase), at any depth, without the REF_KEYS */
export const uuidsOf = (op: unknown): Set<string> => idsOf(op).own;
/** the ids the op only refers to (under REF_KEYS) */
export const refsOf = (op: unknown): Set<string> => idsOf(op).refs;
/** every id in the op: its own and the ones it refers to */
const allIdsOf = (op: unknown): Set<string> => {
  const { own, refs } = idsOf(op);
  refs.forEach((x) => own.add(x));
  return own;
};

type Creates = { [K in Op["k"]]: (op: Extract<Op, { k: K }>) => (string | null | undefined)[] };
const none = () => [];
/**
 * The objects each kind of op makes on the server (review #259 п.1, п.2): an op that refers to one of them cannot go
 * without it, and leaves with it on «Отменить изменение…». Every kind is listed (TypeScript checks it): a new kind
 * must say what it makes. An upsert with `isNew` makes only when new; an upsert without it counts as making (the
 * phone cannot tell — the confirmation says how many changes leave with it). Ids it only changes or refers to — not.
 */
const CREATES: Creates = {
  "visit.step": none, "photo.add": (o) => [o.id], "photo.remove": none, "visit.checklist": none, "visit.sign": none,
  "chk.item.set": none, "chk.item.add": (o) => [o.item.id], "chk.item.remove": none, "chk.item.edit": none, "chk.visit.review": none, "chk.visit.mins": none,
  "chk.template.save": (o) => [o.template.id], "est.template.save": (o) => [o.template.id], "company.visitSettings": none,
  "supplier.save": (o) => [o.supplier.id],
  "po.save": (o) => [o.order.id, ...o.order.lines.map((l) => l.id)], "po.receive": none,
  "visit.pay": (o) => [o.invoiceId, o.paymentId], "lead.reply": none,
  "lead.book": (o) => [o.customerId, o.contactId, o.propertyId, o.jobId, o.visitId],
  "visit.notified": none, "visit.inspection": (o) => [o.visitId], "visit.cancel": none, "visit.reschedule": none,
  "lead.visit": (o) => [o.jobId, o.visitId], "lead.add": (o) => [o.id], "visit.assign": none,
  "estimate.add": (o) => [o.id, o.versionId, o.optionId], "estimate.send": none, "estimate.save": (o) => [o.id, o.versionId],
  "estimate.approve": (o) => [o.jobId, o.invoiceId], "payment.record": (o) => [o.id], "invoice.issue": (o) => [o.id], "invoice.void": none,
  "job.schedule": (o) => [o.visitId], "company.save": none, "license.save": (o) => [o.license.id], "license.remove": none,
  "contact.save": (o) => [o.contact.id], "contact.remove": none,
  "lead.prospect": (o) => [o.customerId, o.contactId, o.propertyId],
  "lead.convert": (o) => (o.needCustomer ? [o.customerId, o.contactId, o.propertyId, o.noteId] : [o.noteId]),
  "lead.update": none, "lead.touch": (o) => [o.activityId], "activity.message": (o) => [o.activityId],
  "activity.call": (o) => [o.activityId], "invoice.remind": (o) => [o.activityId], "lead.close": (o) => [o.activityId],
  "lead.reopen": (o) => [o.activityId], "lead.assign": (o) => [o.activityId], "lead.cost": none,
  "lead.contactSave": (o) => [o.contact.id], "lead.contactRemove": none, "task.save": (o) => [o.task.id],
  "calendarEvent.save": (o) => (o.isNew ? [o.event.id] : []), "calendarEvent.remove": none, "me.prefs": none, "me.location": none, "me.pushKind": none,
  "module.enable": none, "module.disable": none, "module.saveSettings": none, "module.op": (o) => o.made ?? [],
  "customField.save": (o) => (o.isNew ? [o.field.id] : []), "customFieldValue.save": (o) => (o.isNew ? [o.value.id] : []),
  "customFieldValue.remove": none, "source.save": (o) => [o.source.id],
  "customer.create": (o) => [o.customerId, o.contactId, o.propertyId], "customer.update": none,
  "customer.people": (o) => o.people.map((x) => x.id), "lead.people": (o) => o.people.map((x) => x.id),
  "customer.tags": none, "customer.status": none, "customer.merge": none, "customer.notDup": none, "tag.save": (o) => [o.tag.id],
  "serviceCategory.save": (o) => (o.isNew ? [o.category.id] : []), "job.category": none, "job.complete": none,
  "job.create": (o) => [o.id], "job.update": none, "job.tags": none, "jobLine.save": (o) => (o.isNew ? [o.line.id] : []),
  "jobLine.remove": none, "jobLine.restore": none, "jobType.save": (o) => (o.isNew ? [o.jobType.id] : []),
  "estimate.category": none, "property.update": none, "property.save": (o) => [o.property.id], "property.gate": none,
  "note.add": (o) => [o.id], "note.update": none, "catalog.save": (o) => [o.item.id], "catalog.remove": none,
  "notice.read": none, "estimate.sign": none, "estimate.countersign": (o) => [o.jobId, o.invoiceId], "estimate.revoke": none,
  "estimate.decline": none, "estimate.reopen": none, "member.signature": (o) => [o.id], "member.update": none,
  "estimate.deposit": (o) => [o.jobId, o.invoiceId, o.paymentId], "invoice.pay": (o) => [o.paymentId], "expense.add": (o) => [o.id],
};
/**
 * Upserts that do not say whether the object is new: their CREATES lists every id they write. When the op is queued, the
 * store keeps only the ids that were not on the phone before (madeOnQueue → OwnedItem.made, review #259 круг 3): an edit
 * of an existing estimate, tag, person makes nothing — what refers to them stays on «Отменить изменение…».
 */
export const UNSURE_KINDS: ReadonlySet<Op["k"]> = new Set<Op["k"]>([
  "source.save", "tag.save", "catalog.save", "contact.save", "license.save", "property.save", "task.save", "lead.contactSave",
  "customer.people", "lead.people", "estimate.save", "chk.template.save", "est.template.save", "supplier.save",
  // the deposit: the job and its deposit invoice are the signature's when they are on the phone already — only the payment
  // is the deposit's own then (review of #1061: «Отменить изменение…» took the job's and the invoice's later ops with it)
  "estimate.deposit",
]);

/**
 * is `id` an object on the phone: a record anywhere up to 4 levels down (a client's person, an estimate's version, the
 * company's contacts and licenses — db.company is an object, not a list; review #259 круг 4 п.1)
 */
function onPhone(db: object, id: string): boolean {
  const low = id.toLowerCase();
  const walk = (v: unknown, depth: number): boolean => {
    if (depth > 4 || !v || typeof v !== "object") return false;
    if (Array.isArray(v)) return v.some((x) => walk(x, depth + 1));
    const rec = v as Record<string, unknown>;
    if (typeof rec.id === "string" && rec.id.toLowerCase() === low) return true;
    return Object.values(rec).some((x) => x && typeof x === "object" && walk(x, depth + 1));
  };
  return walk(db, 0);
}

/**
 * ids an upsert always makes, new or not (review #259 круг 4, Б1): an estimate's send, approval, signatures and deposit
 * carry the estimate's id, not the version's — and they belong to the content this save writes (an approval of an
 * option of the new version, a deposit of its total). So they go and leave with its estimate.save, also when it edits.
 */
const ALWAYS_MADE: Partial<Record<Op["k"], (op: Op) => string>> = {
  "estimate.save": (op) => (op as Extract<Op, { k: "estimate.save" }>).id,
};

/** what an op of UNSURE_KINDS makes, by the phone's data before it (`before`); other kinds: undefined (by their kind) */
export function madeOnQueue(op: Op, before: object): string[] | undefined {
  if (!UNSURE_KINDS.has(op.k)) return undefined;
  const always = ALWAYS_MADE[op.k]?.(op)?.toLowerCase();
  return [...createdBy(op)].filter((x) => x === always || !onPhone(before, x));
}

/** what the queued op makes: decided when it was queued, else by its kind */
export const createdOf = (o: OwnedItem): Set<string> => (o.made ? new Set(o.made.map((x) => x.toLowerCase())) : createdBy(o.op));

/**
 * Does the op carry money (the confirmation warns, review #259 круг 3): a payment, an invoice, a deposit, an expense — and
 * any op that makes an invoice or a payment (the client's approval, the company's countersign with its deposit invoice).
 */
export function isMoneyOp(o: OwnedItem, moneyKinds: ReadonlySet<string>): boolean {
  if (moneyKinds.has(o.op.k)) return true;
  const made = createdOf(o);
  const op = o.op as { invoiceId?: unknown; paymentId?: unknown };
  return [op.invoiceId, op.paymentId].some((x) => typeof x === "string" && made.has(x.toLowerCase()));
}

/** the ids of the objects the op makes on the server (lowercase); an unknown kind (a newer version's) makes nothing known */
export function createdBy(op: Op): Set<string> {
  const f = (CREATES as Record<string, ((o: Op) => (string | null | undefined)[]) | undefined>)[op.k];
  const out = new Set<string>();
  for (const x of f ? f(op) : []) if (typeof x === "string" && UUID.test(x)) out.add(x.toLowerCase());
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
  // the objects of held / waiting ops (an op about one of them waits) and what they make (an op referring to one waits)
  const blocked = new Set<string>();
  const made = new Set<string>();
  let anyHeld = false;
  for (const o of items) {
    if (!isMine(o, who)) continue;
    const ids = uuidsOf(o.op);
    // its own objects or what it refers to (a new source, category, type, catalog item) are held or waiting
    const shares = [...ids].some((x) => blocked.has(x)) || [...refsOf(o.op)].some((x) => made.has(x));
    if (held(o) || (anyHeld && (shares || !mayPass(o.op)))) {
      anyHeld = true;
      ids.forEach((x) => blocked.add(x));
      createdOf(o).forEach((x) => made.add(x));
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
 * The ops that leave with `id` on «Отменить изменение…» (review #259 Б2, п.1, п.2): the person's later ops that are
 * about or refer to an object this op makes, and, along the chain, to an object one of those makes. An op that only
 * changes something (customer.update) makes nothing: nothing leaves with it. Never an op only because it stood behind
 * it, never by a shared source / tag / person. The others are free again once it is gone.
 */
export function dependentsOf(items: readonly OwnedItem[], who: Owner | null, id: string): OwnedItem[] {
  const mine = mineOf(items, who);
  const at = mine.findIndex((o) => o.id === id);
  if (at < 0) return [];
  const made = createdOf(mine[at]!);
  const out: OwnedItem[] = [];
  if (!made.size) return out;
  for (const o of mine.slice(at + 1)) {
    if (![...allIdsOf(o.op)].some((x) => made.has(x))) continue;
    out.push(o);
    createdOf(o).forEach((x) => made.add(x));
  }
  return out;
}

/** the person's ops that wait for `id` alone: not live while it is held (they go when it goes, or after «Отменить»)  */
export function waitingFor(items: readonly OwnedItem[], who: Owner | null, id: string): number {
  const mine = mineOf(items, who);
  if (!mine.some((o) => o.id === id)) return 0;
  return mine.length - 1 - liveOf(mine, who, (o) => o.id === id).length;
}
