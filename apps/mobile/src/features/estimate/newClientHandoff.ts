/**
 * #2887: «＋ Новый клиент» in the client sheet of an estimate. The estimate opens the new-client form with its own key
 * (`client/edit?for=<key>`); the form, once the client is made, leaves it here and goes BACK — the estimate screen was
 * never unmounted, so what was typed in it stays; on its focus it takes the client (and its first property) by its key.
 * One-shot and keyed: another estimate, or the same one later, never takes a client made for someone else.
 *
 * No React here (test/newClientHandoff.test.ts).
 */

export interface NewClient {
  customerId: string;
  propertyId: string;
}

const waiting = new Map<string, NewClient>();

/** the key an estimate puts in the form's `for`: the estimate's own id */
export const handoffKey = (estimateId: string): string => `estimate:${estimateId}`;

/** the form made the client for `key` (no key — a form opened on its own: nothing is left) */
export function offerNewClient(key: string | undefined, c: NewClient): boolean {
  if (!key || !c.customerId || !c.propertyId) return false;
  waiting.set(key, c);
  return true;
}

/** the estimate of `key` takes its new client once; nothing waits — null */
export function takeNewClient(key: string): NewClient | null {
  const c = waiting.get(key) ?? null;
  waiting.delete(key);
  return c;
}

/**
 * What was typed in the client sheet's search, for the new client's form (crm-reviewer №2, as iOS «Create New Contact» from
 * what is typed): mostly digits — the phone; anything else — the name, the first word the first name, the rest the last name.
 */
export function splitTyped(q: string | undefined): { first: string; last: string; phone: string } {
  const s = (q ?? "").trim().replace(/\s+/g, " ");
  if (!s) return { first: "", last: "", phone: "" };
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 3 && digits.length >= s.replace(/[\s()+.-]/g, "").length) return { first: "", last: "", phone: s };
  const [first, ...rest] = s.split(" ");
  return { first, last: rest.join(" "), phone: "" };
}
