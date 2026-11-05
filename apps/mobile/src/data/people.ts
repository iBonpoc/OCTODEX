/**
 * People of clients (and, from wave L2, of leads): one shape for both (docs/specs/04 §3.2, agreed with the leads chat).
 * Pure functions — tested in test/people.test.ts.
 */
import type { Customer, DB, Lead, Person, PersonRole, PhoneLabel } from "./types";
import { DOC_LANGS, type DocLang } from "@/i18n/translate";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (v == null ? 0 : Number(v));

/** The people of a client; an old client (one phone / email) becomes one main person. */
export function peopleOf(c: Customer): Person[] {
  if (Array.isArray(c.people) && c.people.length) return c.people;
  return [
    {
      id: `${c.id}-main`,
      name: c.name,
      role: "main",
      phones: c.phone ? [{ number: c.phone, label: "mobile", primary: true }] : [],
      emails: c.email ? [{ address: c.email, primary: true }] : [],
    },
  ];
}

/**
 * The people of a lead (docs/14-leads-spec.md §2, Р12). A lead saved before wave L2 part 2 has its phone / second phone /
 * email on the lead and extra people in `contacts`: they become the main person and the others, the same way the
 * migration 20261105120000 copies them on the server.
 */
export function leadPeopleOf(l: Lead): Person[] {
  if (Array.isArray(l.people) && l.people.length) return l.people;
  const phones: Person["phones"] = [];
  if (l.phone?.trim()) phones.push({ number: l.phone, label: "mobile", primary: true });
  if (l.phone2?.trim() && fullPhoneKey(l.phone2) !== fullPhoneKey(l.phone)) phones.push({ number: l.phone2, label: l.phone2Label ?? "home", primary: phones.length === 0 || undefined });
  const main: Person = { id: `${l.id}-main`, name: l.name, role: "main", phones, emails: l.email ? [{ address: l.email, primary: true }] : [], language: l.language };
  const others: Person[] = (l.contacts ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role === "owner" ? "other" : c.role,
    phones: c.phone ? [{ number: c.phone, label: "mobile", primary: true }] : [],
    emails: c.email ? [{ address: c.email, primary: true }] : [],
  }));
  return [main, ...others];
}

/** Whose people the lead card shows: the client's once the lead has one (the people moved there, S3), else the lead's own. */
export function peopleForLead(db: DB, l: Lead): Person[] {
  const c = l.customerId ? db.customers.find((x) => x.id === l.customerId) : undefined;
  return c ? peopleOf(c) : leadPeopleOf(l);
}

/** Last 10 digits of a US phone ("" if shorter): the key for "same phone". */
export const fullPhoneKey = (p: string | undefined) => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};
const emailKey = (e: string | undefined) => (e ?? "").trim().toLowerCase();

/** Every phone of these people (for duplicates and search). */
export const phonesOfPeople = (people: Person[]): string[] => people.flatMap((p) => p.phones.map((x) => x.number));

/** The main person's primary phone and email: kept on the lead / client row for search and lists. */
export function mainContact(people: Person[]): { phone: string; email?: string } {
  const m = people[0];
  return {
    phone: m?.phones.find((p) => p.primary)?.number ?? m?.phones[0]?.number ?? "",
    email: m?.emails.find((e) => e.primary)?.address ?? m?.emails[0]?.address,
  };
}

/**
 * Lead → client (S3), the same rule as app.move_lead_people on the server: a lead person who shares a phone or email with a
 * client person is merged into that person (only the missing phones / emails are added); the others join as extra people
 * (a second "main" becomes "other"). With no client people, the lead's people become them as they are.
 */
export function mergePeople(into: Person[], add: Person[]): Person[] {
  const out = into.map((p) => ({ ...p, phones: [...p.phones], emails: [...p.emails] }));
  for (const a of add) {
    const keys = new Set(a.phones.map((x) => fullPhoneKey(x.number)).filter(Boolean));
    const mails = new Set(a.emails.map((x) => emailKey(x.address)).filter(Boolean));
    const t = out.find((p) => p.phones.some((x) => keys.has(fullPhoneKey(x.number))) || p.emails.some((x) => mails.has(emailKey(x.address))));
    if (t) {
      for (const x of a.phones) {
        const k = fullPhoneKey(x.number);
        if (k && !t.phones.some((y) => fullPhoneKey(y.number) === k)) t.phones.push({ ...x, primary: (t.phones.length === 0 && x.primary) || undefined });
      }
      for (const x of a.emails) {
        if (!t.emails.some((y) => emailKey(y.address) === emailKey(x.address))) t.emails.push({ ...x, primary: (t.emails.length === 0 && x.primary) || undefined });
      }
    } else {
      out.push({ ...a, role: a.role === "main" && out.length ? "other" : a.role });
    }
  }
  return out;
}

/**
 * The language of what goes to a client (founder's rule 05.11.2026, docs/specs/07 §2.1): the person's own → the client's
 * (its main person) → the lead's → the company's default → English. Never the app's language.
 */
export function docLanguageFor(db: DB, at: { personId?: string; customerId?: string; leadId?: string }): DocLang {
  const lead = at.leadId ? db.leads.find((l) => l.id === at.leadId) : undefined;
  const customer = db.customers.find((c) => c.id === (at.customerId ?? lead?.customerId));
  const people = [...(customer ? peopleOf(customer) : []), ...(lead ? leadPeopleOf(lead) : [])];
  const person = at.personId ? people.find((p) => p.id === at.personId) : undefined;
  return person?.language ?? (customer ? peopleOf(customer)[0]?.language : undefined) ?? (lead ? leadPeopleOf(lead)[0]?.language ?? lead.language : undefined) ?? db.company?.docLanguage ?? "en";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * People as the database keeps them: real ids (a person derived from an old client gets a new one), names and numbers
 * trimmed, empty phones and emails without "@" dropped (the database refuses them), exactly one primary phone and email per person when there are any.
 */
export function cleanPeople(people: Person[], newId: () => string): Person[] {
  const one = <T extends { primary?: boolean }>(xs: T[]): T[] => {
    const i = Math.max(0, xs.findIndex((x) => x.primary));
    return xs.map((x, k) => ({ ...x, primary: k === i || undefined }));
  };
  return people
    .map((p) => ({
      ...p,
      id: UUID.test(p.id) ? p.id : newId(),
      name: p.name.trim(),
      phones: one(p.phones.map((x) => ({ ...x, number: x.number.trim() })).filter((x) => x.number)),
      emails: one(p.emails.map((x) => ({ ...x, address: x.address.trim() })).filter((x) => x.address.indexOf("@") > 0)),
    }))
    .filter((p) => p.name || p.phones.length || p.emails.length);
}
/** Demo only: the next CLT number (the server numbers clients in the cloud). */
export function nextClientNumber(d: DB): string {
  const max = Math.max(0, ...d.customers.map((c) => Number(/^CLT-(\d+)$/.exec(c.number ?? "")?.[1] ?? 0)));
  return `CLT-${String(max + 1).padStart(4, "0")}`;
}

const PERSON_ROLES: PersonRole[] = ["main", "spouse", "assistant", "tenant", "property_manager", "accountant", "other"];
const PHONE_LABELS: PhoneLabel[] = ["mobile", "home", "work", "other"];

/**
 * contacts + contact_phones + contact_emails → people of each client (or, with key "lead_id", of each lead), primary person first.
 * Before the C1 migration a contact has only its phone / email columns: they become its one primary phone / email.
 * Old role "owner" is shown as "main". Pure — tested in test/clientsCloud.test.ts.
 */
export function peopleByCustomer(contacts: Row[], phones: Row[], emails: Row[], key: "customer_id" | "lead_id" = "customer_id"): Map<string, Person[]> {
  const ph = new Map<string, Row[]>();
  for (const r of phones) ph.set(s(r.contact_id), [...(ph.get(s(r.contact_id)) ?? []), r]);
  const em = new Map<string, Row[]>();
  for (const r of emails) em.set(s(r.contact_id), [...(em.get(s(r.contact_id)) ?? []), r]);
  const byPos = (a: Row, b: Row) => Number(!!b.is_primary) - Number(!!a.is_primary) || n(a.position) - n(b.position);
  const out = new Map<string, Person[]>();
  const sorted = [...contacts].sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary) || s(a.created_at).localeCompare(s(b.created_at)));
  for (const c of sorted) {
    // a lead's person (customer_id empty) is not a client's; a client's person is grouped by its client even if it came from a lead
    if (key === "lead_id" ? !!c.customer_id || !c.lead_id : !c.customer_id) continue;
    const id = s(c.id);
    const role = s(c.role) === "owner" ? "main" : s(c.role);
    const pRows = ph.get(id);
    const eRows = em.get(id);
    const person: Person = {
      id,
      name: s(c.name),
      role: (PERSON_ROLES.includes(role as PersonRole) ? role : "other") as PersonRole,
      phones: pRows
        ? [...pRows].sort(byPos).map((r) => ({ number: s(r.number), label: (PHONE_LABELS.includes(s(r.label) as PhoneLabel) ? s(r.label) : "other") as PhoneLabel, primary: !!r.is_primary || undefined }))
        : c.phone ? [{ number: s(c.phone), label: "mobile", primary: true }] : [],
      emails: eRows ? [...eRows].sort(byPos).map((r) => ({ address: s(r.address), primary: !!r.is_primary || undefined })) : c.email ? [{ address: s(c.email), primary: true }] : [],
      language: DOC_LANGS.find((x) => x === c.preferred_language),
    };
    const owner = s(c[key]);
    out.set(owner, [...(out.get(owner) ?? []), person]);
  }
  return out;
}
