/**
 * «Сообщения» by people (docs/specs/20 «6-3», 13 §2.1.1): the SMS and emails opened from OCTODEX, one thread per person
 * (or per lead / client when the person is not known; a job's message goes to its client), and the «Новое сообщение»
 * texts — always in the CLIENT's language (rule 7: tFor(docLanguageFor(...)), never the app's), money and dates in US
 * format. Pure (no React) — unit-tested in test/messages.test.ts.
 */
import type { DB, MessageInput, Person, Role } from "@/data/types";
import type { DictKey } from "@/i18n";
import { tFor, type DocLang } from "@/i18n/translate";
import { docLanguageFor, leadPeopleOf, peopleForLead, peopleOf } from "@/data/people";
import { canSeeLead } from "@/features/leads";
import { docDay, docTime } from "@/features/docPdf";
import { realPersonId } from "./contactEvents";
import { callPlaceForClient, commsLog, techJobsAt, techScope, type CommsEntry } from "./comms";

/** whose people: a client or a lead without a client */
export interface Owner {
  type: "customer" | "lead";
  id: string;
}

/** the client a message belongs to: a job's client, a lead's client once it has one */
function ownerOf(db: DB, e: Pick<CommsEntry, "subjectType" | "subjectId">): Owner | undefined {
  if (e.subjectType === "customer") return { type: "customer", id: e.subjectId };
  if (e.subjectType === "lead") {
    const l = db.leads.find((x) => x.id === e.subjectId);
    return l?.customerId ? { type: "customer", id: l.customerId } : { type: "lead", id: e.subjectId };
  }
  if (e.subjectType === "job") {
    const j = db.jobs.find((x) => x.id === e.subjectId);
    const cid = j?.customerId ?? db.properties.find((p) => p.id === j?.propertyId)?.customerId;
    return cid ? { type: "customer", id: cid } : undefined;
  }
  return undefined;
}

export const ownerPeople = (db: DB, o: Owner): Person[] => {
  if (o.type === "customer") {
    const c = db.customers.find((x) => x.id === o.id);
    return c ? peopleOf(c) : [];
  }
  const l = db.leads.find((x) => x.id === o.id);
  return l ? peopleForLead(db, l) : [];
};
export const ownerName = (db: DB, o: Owner): string =>
  (o.type === "customer" ? db.customers.find((x) => x.id === o.id)?.name : db.leads.find((x) => x.id === o.id)?.name) ?? "";
export const ownerHref = (o: Owner): string => (o.type === "customer" ? `/client/${o.id}` : `/lead/${o.id}`);

/** may this role see whose people / messages: the office — everyone; the technician — his visits' clients and his leads */
export function ownerVisible(db: DB, role: Role, o: Owner): boolean {
  if (role !== "tech") return o.type === "customer" || canSeeLead(role, db.me, db.leads.find((l) => l.id === o.id) ?? ({} as never));
  const mine = techScope(db);
  return o.type === "customer" ? mine.customers.has(o.id) : mine.leads.has(o.id);
}

/** the key of a thread (URL-safe): p-<person> | c-<client> | l-<lead> */
export function threadKey(db: DB, e: Pick<CommsEntry, "subjectType" | "subjectId" | "contactId">): string | undefined {
  const person = realPersonId(e.contactId);
  if (person) return `p-${person}`;
  const o = ownerOf(db, e);
  if (o) return `${o.type === "customer" ? "c" : "l"}-${o.id}`;
  // a job without a client keeps its own thread (never lost from the tab)
  return e.subjectType === "job" ? `j-${e.subjectId}` : undefined;
}

export interface MessageThread {
  key: string;
  /** the person's name, or the client / lead's */
  title: string;
  owner?: Owner;
  person?: Person;
  /** newest first */
  items: CommsEntry[];
}

/** the person (and whose) behind a thread key */
export function threadTarget(db: DB, key: string): { owner?: Owner; person?: Person } {
  const [k, ...rest] = key.split("-");
  const id = rest.join("-");
  if (k === "c") return { owner: { type: "customer", id } };
  if (k === "l") return { owner: { type: "lead", id } };
  if (k === "p") {
    for (const c of db.customers) {
      const p = peopleOf(c).find((x) => x.id === id);
      if (p) return { owner: { type: "customer", id: c.id }, person: p };
    }
    for (const l of db.leads) {
      const p = leadPeopleOf(l).find((x) => x.id === id);
      if (p) return { owner: l.customerId ? { type: "customer", id: l.customerId } : { type: "lead", id: l.id }, person: p };
    }
  }
  return {};
}

/** the threads the role may see (the same scope as the log), the latest first */
export function messageThreads(db: DB, role: Role, deletedWord = ""): MessageThread[] {
  const byKey = new Map<string, CommsEntry[]>();
  for (const e of commsLog(db, role, "messages", deletedWord)) {
    const key = threadKey(db, e);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), e]);
  }
  return [...byKey.entries()]
    .map(([key, items]) => {
      const t = threadTarget(db, key);
      const owner = t.owner ?? ownerOf(db, items[0]!);
      return { key, items, owner, person: t.person, title: t.person?.name || (owner ? ownerName(db, owner) : "") || items[0]!.who };
    })
    .sort((a, b) => b.items[0]!.at.localeCompare(a.items[0]!.at));
}

/**
 * One thread by its key (it may be empty: «Написать» to someone not written to yet). Someone the role may not see —
 * nothing: no name, no owner, so no «Написать» and no «Открыть» (#227 review).
 */
export function messageThread(db: DB, role: Role, key: string, deletedWord = ""): MessageThread {
  const found = messageThreads(db, role, deletedWord).find((x) => x.key === key);
  if (found) return found;
  const t = threadTarget(db, key);
  if (!t.owner || !ownerVisible(db, role, t.owner)) return { key, items: [], title: "" };
  return { key, items: [], owner: t.owner, person: t.person, title: t.person?.name || ownerName(db, t.owner) };
}

/** a person one may write to: whose, and how (phone for SMS, address for email) */
export interface Addressee {
  owner: Owner;
  person: Person;
  label: string;
}
/**
 * Whom a role may write to: the office — the people of every client and of every lead without a client; the technician —
 * the people of the clients of his visits and of his own leads (the same scope as the log). Only people with a phone or an email.
 */
export function messagePeople(db: DB, role: Role, query = ""): Addressee[] {
  const out: Addressee[] = [];
  const mine = role === "tech" ? techScope(db) : undefined;
  for (const c of db.customers) {
    if (mine && !mine.customers.has(c.id)) continue;
    for (const p of peopleOf(c)) out.push({ owner: { type: "customer", id: c.id }, person: p, label: p.name && p.name !== c.name ? `${p.name} · ${c.name}` : c.name });
  }
  for (const l of db.leads) {
    if (l.customerId) continue;
    if (mine ? !mine.leads.has(l.id) : !canSeeLead(role, db.me, l)) continue;
    for (const p of leadPeopleOf(l)) out.push({ owner: { type: "lead", id: l.id }, person: p, label: p.name && p.name !== l.name ? `${p.name} · ${l.name}` : l.name });
  }
  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  return out
    .filter((a) => a.person.phones.length || a.person.emails.length)
    .filter((a) => !q || a.label.toLowerCase().includes(q) || (digits.length >= 3 && a.person.phones.some((x) => x.number.replace(/\D/g, "").includes(digits))));
}

/**
 * Where the event of a message is written (RLS activities_insert, like a call): the office — the client or the lead;
 * the technician — his lead, or his one job at that client (undefined = he cannot write here: the button is not offered).
 */
export function messageSubject(db: DB, role: Role, owner: Owner): Pick<MessageInput, "subjectType" | "subjectId"> | undefined {
  if (!ownerVisible(db, role, owner)) return undefined;
  if (owner.type === "lead") return { subjectType: "lead", subjectId: owner.id };
  return callPlaceForClient(db, role, owner.id);
}

/** the technician with several of his jobs at this client picks the one the message is about (else [] — nothing to pick) */
export const messageJobChoices = (db: DB, role: Role, owner: Owner) =>
  role === "tech" && owner.type === "customer" && ownerVisible(db, role, owner) ? techJobsAt(db, owner.id) : [];

/** the language the client reads (rule 7): the person's → the client's / lead's → the company's → en */
export const messageLanguage = (db: DB, owner: Owner, person?: Person): DocLang =>
  docLanguageFor(db, { personId: person?.id, ...(owner.type === "customer" ? { customerId: owner.id } : { leadId: owner.id }) });

export type MessageTemplate = "onMyWay" | "visitReminder" | "estimateSent" | "thanksPayment" | "custom";
export const TEMPLATE_LABEL: Record<MessageTemplate, DictKey> = {
  onMyWay: "w6.msg.tpl.onMyWay",
  visitReminder: "w6.msg.tpl.visitReminder",
  estimateSent: "w6.msg.tpl.estimateSent",
  thanksPayment: "w6.msg.tpl.thanksPayment",
  custom: "w6.msg.tpl.custom",
};

/** the templates that make sense for this owner: a visit reminder only with a coming visit, an estimate only with a sent one */
export function messageTemplates(db: DB, owner: Owner, now = Date.now()): { id: MessageTemplate; params: Record<string, string> }[] {
  const out: { id: MessageTemplate; params: Record<string, string> }[] = [{ id: "onMyWay", params: {} }];
  if (owner.type === "customer") {
    const props = new Set(db.properties.filter((p) => p.customerId === owner.id).map((p) => p.id));
    const jobs = new Set(db.jobs.filter((j) => j.customerId === owner.id || props.has(j.propertyId)).map((j) => j.id));
    const next = db.visits.filter((v) => v.jobId && jobs.has(v.jobId) && !v.closed && Date.parse(v.start) > now).sort((a, b) => a.start.localeCompare(b.start))[0];
    if (next) out.push({ id: "visitReminder", params: { date: docDay(next.start), time: docTime(next.start) } });
    const est = db.estimates.filter((e) => e.customerId === owner.id && e.status === "sent" && e.number).sort((a, b) => (b.number ?? "").localeCompare(a.number ?? ""))[0];
    if (est) out.push({ id: "estimateSent", params: { number: est.number ?? "" } });
    out.push({ id: "thanksPayment", params: {} });
  } else {
    const visit = db.visits.filter((v) => v.leadId === owner.id && !v.closed && Date.parse(v.start) > now).sort((a, b) => a.start.localeCompare(b.start))[0];
    if (visit) out.push({ id: "visitReminder", params: { date: docDay(visit.start), time: docTime(visit.start) } });
  }
  out.push({ id: "custom", params: {} });
  return out;
}

/** the text of a template in the client's language; «Свой текст» is empty */
export function messageText(lang: DocLang, tpl: MessageTemplate, params: Record<string, string>, ctx: { firstName: string; company: string }): string {
  if (tpl === "custom") return "";
  const key = `w6.msgc.${tpl}` as DictKey;
  return tFor(lang)(key, { ...params, name: ctx.firstName, company: ctx.company });
}

/** the address in the phone's app — never stored in the event */
export const firstPhone = (p?: Person) => p?.phones.find((x) => x.primary)?.number ?? p?.phones[0]?.number;
export const firstEmail = (p?: Person) => p?.emails.find((x) => x.primary)?.address ?? p?.emails[0]?.address;
