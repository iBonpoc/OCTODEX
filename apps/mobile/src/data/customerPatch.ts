/**
 * The change of a client as the phone stores it (wave П-1): the same cleaning as the server write (cloud/ops.ts
 * customerCols) — trimmed text, an empty name part or address line is no value, billing null = same as the property.
 */
import type { BillingAddress, Customer } from "./types";

export interface CustomerPatch {
  name?: string;
  phone?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  billing?: BillingAddress | null;
  /** wave 4: where the client came from, changed in the client form */
  sourceId?: string;
}

const clean = (v: string | undefined) => v?.trim() || undefined;

export function applyCustomerPatch(c: Customer, patch: CustomerPatch): Customer {
  const next: Customer = { ...c };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.phone !== undefined) next.phone = patch.phone;
  if (patch.email !== undefined) next.email = patch.email;
  if (patch.sourceId) next.sourceId = patch.sourceId;
  if (patch.firstName !== undefined) next.firstName = clean(patch.firstName);
  if (patch.lastName !== undefined) next.lastName = clean(patch.lastName);
  if (patch.companyName !== undefined) next.companyName = clean(patch.companyName);
  if (patch.billing !== undefined) {
    const b = patch.billing;
    next.billing =
      b && b.line1.trim()
        ? { line1: b.line1.trim(), line2: clean(b.line2), unit: clean(b.unit), city: b.city.trim(), state: clean(b.state), zip: clean(b.zip) }
        : undefined;
  }
  return next;
}
