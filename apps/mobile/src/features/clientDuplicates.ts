/**
 * Duplicate clients and their merge (docs/specs/04 §13, map S3d). Pure — tested in test/clientDuplicates.test.ts.
 * Found on the phone, without the network: any phone of any person (last 10 digits), any email, the address of any
 * property (street + unit + zip, without case, punctuation and the usual abbreviations). Archived and merged clients and
 * pairs marked «not a duplicate» do not count. The merge does on the phone what public.merge_customers does on the server.
 */
import { fullPhoneKey, mainContact, mergePeople, peopleOf } from "@/data/people";
import type { Customer, DB, ID, Person, Role } from "@/data/types";

export type DupReason = "phone" | "email" | "address";
export interface ClientDup {
  customer: Customer;
  reasons: DupReason[];
}

const emailKey = (e: string | undefined) => (e ?? "").trim().toLowerCase();
const WORDS: Record<string, string> = {
  street: "st", avenue: "ave", av: "ave", road: "rd", drive: "dr", lane: "ln", court: "ct", boulevard: "blvd",
  place: "pl", terrace: "ter", circle: "cir", highway: "hwy", parkway: "pkwy", north: "n", south: "s", east: "e", west: "w",
  apartment: "", apt: "", suite: "", ste: "", unit: "",
};
const words = (s: string | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => WORDS[w] ?? w)
    .filter(Boolean)
    .join(" ");
/** «123 Main Street, Apt 4» in 91101 = «123 main st. #4» in 91101. Without a street or a zip / city — "". */
export function addressKey(p: { address: string; unit?: string; city?: string; place?: { city: string; zip?: string } }): string {
  const street = words(p.address);
  if (!/\d/.test(street)) return "";
  const zip = p.place?.zip?.trim().slice(0, 5) || (p.city ?? "").match(/\b\d{5}\b/)?.[0] || "";
  const where = zip || words(p.place?.city ?? (p.city ?? "").split(",")[0]);
  if (!where) return "";
  return [street, words(p.unit), where].join("|");
}

/** A client that takes part: not archived, not merged into another. */
export const isLiveClient = (c: Customer) => c.status !== "archived" && !c.mergedIntoId;
const notDup = (a: Customer, b: Customer) => !!a.notDuplicateIds?.includes(b.id) || !!b.notDuplicateIds?.includes(a.id);

/** Every live client's possible duplicates, by client id (both sides of a pair). */
/** a phone / email / address shared by more cards than this is an office's or a manager's (a property manager's email on
 *  200 clients): not a sign of a duplicate, and 199 «Не дубль» taps would be the only way out */
export const CROWD = 5;
export function clientDuplicates(db: Pick<DB, "customers" | "properties">): Map<ID, ClientDup[]> {
  const live = db.customers.filter(isLiveClient);
  const liveIds = new Set(live.map((c) => c.id));
  const byKey = new Map<string, Set<ID>>();
  const put = (k: string, id: ID) => {
    if (!k) return;
    const s = byKey.get(k) ?? new Set<ID>();
    s.add(id);
    byKey.set(k, s);
  };
  for (const c of live) {
    for (const p of peopleOf(c)) {
      for (const x of p.phones) put(fullPhoneKey(x.number) && `p:${fullPhoneKey(x.number)}`, c.id);
      for (const x of p.emails) put(emailKey(x.address) && `e:${emailKey(x.address)}`, c.id);
    }
  }
  for (const p of db.properties) if (liveIds.has(p.customerId)) put(addressKey(p) && `a:${addressKey(p)}`, p.customerId);
  const pairs = new Map<string, Set<DupReason>>();
  for (const [k, ids] of byKey) {
    if (ids.size < 2 || ids.size > CROWD) continue;
    const reason: DupReason = k[0] === "p" ? "phone" : k[0] === "e" ? "email" : "address";
    const list = [...ids];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const key = [list[i], list[j]].sort().join("|");
        pairs.set(key, (pairs.get(key) ?? new Set()).add(reason));
      }
  }
  const out = new Map<ID, ClientDup[]>();
  const byId = new Map(live.map((c) => [c.id, c]));
  const order: DupReason[] = ["phone", "email", "address"];
  for (const [key, rs] of pairs) {
    const [x, y] = key.split("|") as [ID, ID];
    const a = byId.get(x)!;
    const b = byId.get(y)!;
    if (notDup(a, b)) continue;
    const reasons = order.filter((r) => rs.has(r));
    out.set(a.id, [...(out.get(a.id) ?? []), { customer: b, reasons }]);
    out.set(b.id, [...(out.get(b.id) ?? []), { customer: a, reasons }]);
  }
  return out;
}
export const duplicatesOf = (db: Pick<DB, "customers" | "properties">, id: ID): ClientDup[] => clientDuplicates(db).get(id) ?? [];

/** Only the owner / admin merge (server: merge_customers); the office may say «not a duplicate». */
export const canMergeClients = (role: Role) => role === "director";
/** who sees «Возможный дубль» at all (the list's mark and the card's block — one rule): the owner / admin and the office */
export const canSeeClientDups = (role: Role) => role === "director" || role === "dispatcher";
export const canMarkNotDuplicate = (role: Role) => role === "director" || role === "dispatcher";

/** Which card stays by default: the older one (its number and its links in old messages stay). */
export function defaultKeep(db: Pick<DB, "customers">, a: ID, b: ID): ID {
  const ia = db.customers.findIndex((c) => c.id === a);
  const ib = db.customers.findIndex((c) => c.id === b);
  const ca = db.customers[ia];
  const cb = db.customers[ib];
  const na = Number(ca?.number?.replace(/\D/g, "") || NaN);
  const nb = Number(cb?.number?.replace(/\D/g, "") || NaN);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na < nb ? a : b;
  // the list keeps the newest first: the later in it is the older one
  return ib > ia ? b : a;
}

/** What moves with the second card (the numbers in the merge sheet). */
export function mergeSummary(db: DB, dropId: ID) {
  const own = <T extends { customerId?: ID }>(xs: readonly T[] | undefined) => (xs ?? []).filter((x) => x.customerId === dropId).length;
  const c = db.customers.find((x) => x.id === dropId);
  return {
    people: c ? peopleOf(c).length : 0,
    properties: own(db.properties),
    leads: own(db.leads),
    estimates: own(db.estimates),
    jobs: own(db.jobs),
    invoices: own(db.invoices),
    payments: own(db.payments),
  };
}

const fill = <T,>(keep: T | undefined, other: T | undefined): T | undefined => (keep === undefined || keep === "" ? other : keep);

/**
 * The merge on the phone (the same rule as public.merge_customers): the second card's people join the kept one
 * (a shared phone / email — one person, `mergePeople`), its properties, leads, documents, money, tasks, notes and history
 * move; tags — both sets; the kept card's own values stay, the empty ones come from the second; «do not service» of either
 * stays. The second becomes archived and merged. A repeat (already merged into this one) changes nothing.
 */
export function mergeCustomersDb(db: DB, keepId: ID, dropId: ID): DB {
  const a = db.customers.find((c) => c.id === keepId);
  const b = db.customers.find((c) => c.id === dropId);
  if (!a || !b || a.id === b.id || b.mergedIntoId === a.id || a.mergedIntoId || b.mergedIntoId) return db;
  const people: Person[] = mergePeople(peopleOf(a), peopleOf(b));
  const main = mainContact(people);
  const dns = a.status === "do_not_service" ? a : b.status === "do_not_service" ? b : null;
  const kept: Customer = {
    ...a,
    people,
    phone: a.phone || main.phone,
    email: a.email || main.email,
    firstName: fill(a.firstName, b.firstName),
    lastName: fill(a.lastName, b.lastName),
    companyName: fill(a.companyName, b.companyName),
    billing: a.billing ?? b.billing,
    // «no sales tax» if either card had it, with that card's note (as on the server)
    taxExempt: a.taxExempt || b.taxExempt || undefined,
    taxExemptNote: a.taxExempt ? a.taxExemptNote : b.taxExempt ? b.taxExemptNote : a.taxExemptNote,
    sourceId: a.sourceId || b.sourceId,
    tagIds: [...new Set([...(a.tagIds ?? []), ...(b.tagIds ?? [])])],
    status: dns ? "do_not_service" : a.status === "archived" && b.status !== "archived" ? "active" : a.status,
    statusReason: dns ? dns.statusReason : a.statusReason,
    notDuplicateIds: [...new Set([...(a.notDuplicateIds ?? []), ...(b.notDuplicateIds ?? [])])].filter((x) => x !== a.id && x !== b.id),
  };
  const dropped: Customer = { ...b, status: "archived", statusReason: undefined, mergedIntoId: a.id };
  const move = <T extends { customerId?: ID }>(x: T): T => (x.customerId === dropId ? { ...x, customerId: keepId } : x);
  const subj = <T extends { subjectType: string; subjectId: ID }>(x: T): T =>
    x.subjectType === "customer" && x.subjectId === dropId ? { ...x, subjectId: keepId } : x;
  // a property's people point at the kept person when theirs became one (mergePeople keeps the first's ids)
  const gone = new Map<ID, ID>();
  for (const p of peopleOf(b)) {
    if (people.some((x) => x.id === p.id)) continue;
    const same = people.find(
      (x) =>
        x.phones.some((y) => p.phones.some((z) => fullPhoneKey(z.number) && fullPhoneKey(z.number) === fullPhoneKey(y.number))) ||
        x.emails.some((y) => p.emails.some((z) => emailKey(z.address) && emailKey(z.address) === emailKey(y.address))),
    );
    if (same) gone.set(p.id, same.id);
  }
  return {
    ...db,
    customers: db.customers.map((c) => (c.id === keepId ? kept : c.id === dropId ? dropped : c)),
    properties: db.properties.map((p) => {
      const m = move(p);
      return m.contactIds?.some((x) => gone.has(x)) ? { ...m, contactIds: [...new Set(m.contactIds.map((x) => gone.get(x) ?? x))] } : m;
    }),
    leads: db.leads.map(move),
    estimates: db.estimates.map(move),
    jobs: db.jobs.map(move),
    cancelledJobs: db.cancelledJobs?.map(move),
    invoices: db.invoices.map(move),
    payments: db.payments.map(move),
    files: db.files?.map(move),
    sources: db.sources.map(move),
    tasks: db.tasks.map(subj),
    activities: db.activities.map((x) => {
      const m = subj(x);
      return m.contactId && gone.has(m.contactId) ? { ...m, contactId: gone.get(m.contactId) } : m;
    }),
    // own fields: B's value only where the kept card has none (the value itself stays with B, as on the server)
    customFieldValues: db.customFieldValues && [
      ...db.customFieldValues,
      ...db.customFieldValues
        .filter((v) => v.entityId === dropId && !db.customFieldValues!.some((w) => w.entityId === keepId && w.fieldId === v.fieldId))
        .filter((v) => db.customFields?.some((f) => f.id === v.fieldId && f.entity === "customer" && !f.archivedAt))
        .map((v) => ({ ...v, id: `${v.id}-${keepId}`, entityId: keepId })),
    ],
    notes: db.notes.map(subj),
  };
}

/** «Not a duplicate»: the pair is not shown again (server: customers.not_duplicate_ids of the first). */
export function markNotDuplicateDb(db: DB, aId: ID, bId: ID): DB {
  return {
    ...db,
    customers: db.customers.map((c) => (c.id === aId ? { ...c, notDuplicateIds: [...new Set([...(c.notDuplicateIds ?? []), bId])] } : c)),
  };
}

/** The card a merged client's old link leads to (follows a chain, at most 10 steps). */
export function mergedTarget(db: Pick<DB, "customers">, id: ID): Customer | undefined {
  let c = db.customers.find((x) => x.id === id);
  for (let i = 0; i < 10 && c?.mergedIntoId; i++) c = db.customers.find((x) => x.id === c!.mergedIntoId);
  return c && c.id !== id ? c : undefined;
}
