/** Company profile ↔ database rows (companies, company_secrets, company_licenses, company_contacts). */
import { DOC_LANGS } from "@/i18n/translate";
import type { Address, Company, CompanyContact, CompanyLicense, EntityType, LicenseKind } from "@/data/types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const opt = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : String(v));
const addr = (r: Row, p: string): Address => ({ line1: s(r[`${p}line1`]), city: s(r[`${p}city`]), state: s(r[`${p}state`]), zip: s(r[`${p}zip`]) });

export function companyFromDb(r: Row, ein: string | undefined, licenses: Row[], contacts: Row[]): Company {
  const brand = (r.brand ?? {}) as { logo?: string; color?: string };
  const contract = (r.contract_settings ?? {}) as { insurance?: Company["insurance"]; cancel_email?: string };
  const est = (r.estimate_settings ?? {}) as { valid_days?: number; deposit_bps?: number | null; terms?: string };
  const pay = (r.payment_settings ?? {}) as { zelle?: string; check_payable_to?: string };
  const onb = (r.onboarding_state ?? {}) as { skipped?: string[] };
  const mailing = addr(r, "mailing_address_");
  return {
    id: s(r.id),
    name: s(r.name),
    dba: opt(r.dba),
    legalName: opt(r.legal_name),
    entityType: (opt(r.entity_type) as EntityType | undefined) ?? undefined,
    ein,
    phone: opt(r.phone),
    email: opt(r.email),
    website: opt(r.website),
    address: addr(r, "address_"),
    mailingAddress: mailing.line1 ? mailing : undefined,
    timezone: s(r.timezone) || "America/Los_Angeles",
    docLanguage: DOC_LANGS.find((x) => x === r.doc_language) ?? "en",
    brand: { logo: brand.logo, color: brand.color },
    insurance: contract.insurance ?? {},
    cancelEmail: contract.cancel_email,
    leadSettings: (r.lead_settings as Company["leadSettings"] | null) ?? undefined,
    estimate: { validDays: est.valid_days ?? 7, depositBps: est.deposit_bps === undefined ? 1000 : est.deposit_bps, terms: est.terms },
    payment: { zelle: pay.zelle, checkPayableTo: pay.check_payable_to },
    licenses: licenses.map(licenseFromDb),
    contacts: contacts.sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)).map(contactFromDb),
    skipped: onb.skipped ?? [],
  };
}

const licenseFromDb = (r: Row): CompanyLicense => ({
  id: s(r.id), kind: s(r.kind) as LicenseKind, number: s(r.number), classes: (r.classes as string[] | null) ?? [],
  expiresOn: opt(r.expires_on), onDocuments: r.on_documents !== false,
});
const contactFromDb = (r: Row): CompanyContact => ({
  id: s(r.id), name: s(r.name), title: opt(r.title), phone: opt(r.phone), email: opt(r.email), isPrimary: !!r.is_primary, onDocuments: r.on_documents !== false,
});

/** Columns of `companies` (jsonb settings are merged with what is already stored). */
export function companyToDb(c: Company, stored: Row) {
  const n = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    name: c.name.trim(),
    dba: n(c.dba),
    legal_name: n(c.legalName),
    entity_type: c.entityType ?? null,
    phone: n(c.phone),
    email: n(c.email),
    website: n(c.website),
    address_line1: n(c.address.line1), address_city: n(c.address.city), address_state: n(c.address.state), address_zip: n(c.address.zip),
    mailing_address_line1: n(c.mailingAddress?.line1), mailing_address_city: n(c.mailingAddress?.city),
    mailing_address_state: n(c.mailingAddress?.state), mailing_address_zip: n(c.mailingAddress?.zip),
    timezone: c.timezone,
    doc_language: c.docLanguage ?? "en",
    brand: { ...((stored.brand as Row) ?? {}), logo: c.brand.logo ?? null, color: c.brand.color ?? null },
    contract_settings: { ...((stored.contract_settings as Row) ?? {}), insurance: c.insurance, cancel_email: n(c.cancelEmail) },
    estimate_settings: { ...((stored.estimate_settings as Row) ?? {}), valid_days: c.estimate.validDays, deposit_bps: c.estimate.depositBps, terms: n(c.estimate.terms) },
    payment_settings: { ...((stored.payment_settings as Row) ?? {}), zelle: n(c.payment.zelle), check_payable_to: n(c.payment.checkPayableTo) },
    onboarding_state: { ...((stored.onboarding_state as Row) ?? {}), skipped: c.skipped },
    lead_settings: { ...((stored.lead_settings as Row) ?? {}), ...(c.leadSettings ?? {}) },
  };
}

export const licenseToDb = (l: CompanyLicense, companyId: string) => ({
  id: l.id, company_id: companyId, kind: l.kind, number: l.number.trim(), classes: l.classes, expires_on: l.expiresOn || null, on_documents: l.onDocuments,
});
export const contactToDb = (c: CompanyContact, companyId: string, position: number) => ({
  id: c.id, company_id: companyId, name: c.name.trim(), title: c.title || null, phone: c.phone || null, email: c.email || null,
  is_primary: c.isPrimary, on_documents: c.onDocuments, position,
});
