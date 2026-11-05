/**
 * People of clients (and, from wave L2, of leads): one shape for both (docs/specs/04 §3.2, agreed with the leads chat).
 * Pure functions — tested in test/people.test.ts.
 */
import type { Customer, DB, Person, PersonRole, PhoneLabel } from "./types";

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


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * People as the database keeps them: real ids (a person derived from an old client gets a new one), names and numbers
 * trimmed, empty phones / emails dropped, exactly one primary phone and email per person when there are any.
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
      emails: one(p.emails.map((x) => ({ ...x, address: x.address.trim() })).filter((x) => x.address)),
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
 * contacts + contact_phones + contact_emails → people of each client (primary person first).
 * Before the C1 migration a contact has only its phone / email columns: they become its one primary phone / email.
 * Old role "owner" is shown as "main". Pure — tested in test/clientsCloud.test.ts.
 */
export function peopleByCustomer(contacts: Row[], phones: Row[], emails: Row[]): Map<string, Person[]> {
  const ph = new Map<string, Row[]>();
  for (const r of phones) ph.set(s(r.contact_id), [...(ph.get(s(r.contact_id)) ?? []), r]);
  const em = new Map<string, Row[]>();
  for (const r of emails) em.set(s(r.contact_id), [...(em.get(s(r.contact_id)) ?? []), r]);
  const byPos = (a: Row, b: Row) => Number(!!b.is_primary) - Number(!!a.is_primary) || n(a.position) - n(b.position);
  const out = new Map<string, Person[]>();
  const sorted = [...contacts].sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary) || s(a.created_at).localeCompare(s(b.created_at)));
  for (const c of sorted) {
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
      language: c.preferred_language === "es" ? "es" : c.preferred_language === "en" ? "en" : undefined,
    };
    const key = s(c.customer_id);
    out.set(key, [...(out.get(key) ?? []), person]);
  }
  return out;
}
