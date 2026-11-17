/**
 * The client form (docs/specs/13-app-structure.md §3.3 «Изменить», wave 4): the parts of the name, the main person's
 * phones and email, the billing address. Pure — tested in test/clientForm.test.ts.
 */
import { peopleOf } from "@/data/people";
import type { BillingAddress, Customer, Person, PersonPhone } from "@/data/types";

export interface NameParts {
  first: string;
  last: string;
  company: string;
}

/** The parts the form starts with: the saved ones (П-1); an old client has only `name` — first word, the rest. */
export function namePartsOf(c: Pick<Customer, "name" | "firstName" | "lastName" | "companyName">): NameParts {
  if (c.firstName || c.lastName || c.companyName) return { first: c.firstName ?? "", last: c.lastName ?? "", company: c.companyName ?? "" };
  const [first = "", ...rest] = c.name.trim().split(/\s+/);
  return { first, last: rest.join(" "), company: "" };
}

/** The shown name: «First Last», or the company when there is no person's name (a business client). */
export function displayName(p: NameParts): string {
  const person = [p.first.trim(), p.last.trim()].filter(Boolean).join(" ");
  return person || p.company.trim();
}

export const nameOk = (p: NameParts) => displayName(p).length >= 2;
export const phoneOk = (v: string) => v.replace(/\D/g, "").length >= 7;

/** a phone line of the form: the number and its label (a new line is «mobile») */
export interface PhoneLine {
  number: string;
  label: PersonPhone["label"];
}

/**
 * The client's people with the main person's phones and primary email replaced by the form's. Each line keeps its own
 * label (a removed line takes nothing with it); the first line is the primary phone; empty lines are dropped.
 * A cleared email removes the primary address only; the other addresses stay, none of them becomes primary.
 */
export function withMainContacts(c: Customer, phones: PhoneLine[], email: string): Person[] {
  const [main, ...others] = peopleOf(c);
  if (!main) return [];
  const nextPhones: PersonPhone[] = phones
    .map((p) => ({ ...p, number: p.number.trim() }))
    .filter((p) => p.number)
    .map((p, i) => ({ number: p.number, label: p.label, primary: i === 0 || undefined }));
  const mail = email.trim();
  const rest = main.emails.filter((e) => !e.primary && e.address !== mail).map(({ address }) => ({ address }));
  const nextEmails = mail ? [{ address: mail, primary: true }, ...rest] : rest;
  return [{ ...main, phones: nextPhones, emails: nextEmails }, ...others];
}

/** The main person's phones as the form shows them (primary first), each with its label. */
export function mainPhonesOf(c: Customer): PhoneLine[] {
  const main = peopleOf(c)[0];
  if (!main) return [];
  return [...main.phones].sort((a, b) => Number(!!b.primary) - Number(!!a.primary)).map((p) => ({ number: p.number, label: p.label }));
}
/** the primary email only: an address the user cleared from the field does not come back as «the next one» */
export const mainEmailOf = (c: Customer): string => {
  const main = peopleOf(c)[0];
  return main?.emails.find((e) => e.primary)?.address ?? "";
};

/** The main person's emails as the form shows them: the primary first (spec 56 §3а.5 — the form lists them all). */
export function mainEmailsOf(c: Customer): string[] {
  const main = peopleOf(c)[0];
  if (!main) return [];
  return [...main.emails].sort((a, b) => Number(!!b.primary) - Number(!!a.primary)).map((e) => e.address);
}

/**
 * The client's people with the main person's phones and emails replaced by the form's (all of them, spec 56 §3а.5): empty lines
 * are dropped, the first phone and the first email are the primary ones (DS §9 А14а «Основной — первым»).
 */
export function withMainContactsAll(c: Customer, phones: PhoneLine[], emails: string[]): Person[] {
  const [main, ...others] = peopleOf(c);
  if (!main) return [];
  const next: Person = {
    ...main,
    phones: phones.map((p) => ({ number: p.number.trim(), label: p.label })).filter((p) => p.number),
    emails: emails.map((e) => ({ address: e.trim() })).filter((e) => e.address),
  };
  return [markPrimaryFirst([next])[0]!, ...others];
}

/** As shown in «Контакты»: each person's primary phone and email stand first (the model keeps a flag, spec 56 §3а.3). */
export function primaryFirst(people: Person[]): Person[] {
  const first = <X extends { primary?: boolean }>(xs: X[]) => [...xs].sort((a, b) => Number(!!b.primary) - Number(!!a.primary));
  return people.map((p) => ({ ...p, phones: first(p.phones), emails: first(p.emails) }));
}

/** On save: the first phone and the first email of each person are the primary ones, the others are not (DS §9 А14а). */
export function markPrimaryFirst(people: Person[]): Person[] {
  return people.map((p) => ({
    ...p,
    phones: p.phones.map((x, i) => ({ ...x, primary: i === 0 || undefined })),
    emails: p.emails.map((x, i) => ({ ...x, primary: i === 0 || undefined })),
  }));
}

export const EMPTY_BILLING: BillingAddress = { line1: "", unit: "", city: "", state: "CA", zip: "" };
/** a billing address is saved only with a street and a city; otherwise invoices go to the property address */
export const billingOk = (b: BillingAddress) => b.line1.trim().length > 0 && b.city.trim().length > 0;
/** one line for the row «Адрес для счетов» */
export function billingLine(b: BillingAddress): string {
  const street = [b.line1.trim(), b.unit?.trim() ? `#${b.unit.trim()}` : ""].filter(Boolean).join(", ");
  const place = [b.city.trim(), [b.state?.trim(), b.zip?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [street, place].filter(Boolean).join(", ");
}
