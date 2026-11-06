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

export const EMPTY_BILLING: BillingAddress = { line1: "", unit: "", city: "", state: "CA", zip: "" };
/** a billing address is saved only with a street and a city; otherwise invoices go to the property address */
export const billingOk = (b: BillingAddress) => b.line1.trim().length > 0 && b.city.trim().length > 0;
/** one line for the row «Адрес для счетов» */
export function billingLine(b: BillingAddress): string {
  const street = [b.line1.trim(), b.unit?.trim() ? `#${b.unit.trim()}` : ""].filter(Boolean).join(", ");
  const place = [b.city.trim(), [b.state?.trim(), b.zip?.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [street, place].filter(Boolean).join(", ");
}
