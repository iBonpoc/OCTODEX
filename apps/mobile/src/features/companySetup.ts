/** Company setup steps (wizard after "Create company" + checklist on Today). docs/13 §1–2. */
import type { Company, ServiceCategory } from "@/data/types";
import type { DictKey } from "@/i18n";
import type { IconKey } from "@/ui/primitives";

export type SetupStep = "profile" | "address" | "contacts" | "licenses" | "insurance" | "brand" | "trades" | "documents";
export const SETUP_STEPS: SetupStep[] = ["profile", "address", "contacts", "licenses", "insurance", "brand", "trades", "documents"];

export const stepIcon: Record<SetupStep, IconKey> = {
  profile: "invoice",
  address: "pin",
  contacts: "phone",
  licenses: "check",
  insurance: "alert",
  brand: "star",
  trades: "wrench",
  documents: "note",
};
export const stepTitle = (s: SetupStep): DictKey => `co.step.${s}` as DictKey;
export const stepHint = (s: SetupStep): DictKey => `co.hint.${s}` as DictKey;

/** `cats` — the company's directions (docs/specs/11-trade.md): the "trades" step is done with at least one active */
export function stepDone(c: Company, s: SetupStep, cats: ServiceCategory[] = []): boolean {
  switch (s) {
    case "profile":
      return !!c.name.trim() && !!c.legalName?.trim() && !!c.entityType;
    case "address":
      return !!c.address.line1.trim() && !!c.address.city.trim() && !!c.address.state.trim() && !!c.address.zip.trim();
    case "contacts":
      return c.contacts.some((x) => !!x.phone);
    case "licenses":
      return c.licenses.length > 0;
    case "insurance":
      return !!c.insurance.cglCarrier && (!!c.insurance.wcExempt || !!c.insurance.wcCarrier);
    case "brand":
      return !!c.brand.logo;
    case "trades":
      return cats.some((x) => !x.archivedAt);
    case "documents":
      return !!(c.payment.zelle || c.payment.checkPayableTo) && c.estimate.validDays > 0;
  }
}

export function setupProgress(c: Company | null, cats: ServiceCategory[] = []) {
  if (!c) return { done: 0, total: SETUP_STEPS.length, next: null as SetupStep | null };
  const done = SETUP_STEPS.filter((s) => stepDone(c, s, cats)).length;
  const next = SETUP_STEPS.find((s) => !stepDone(c, s, cats) && !c.skipped.includes(s)) ?? SETUP_STEPS.find((s) => !stepDone(c, s, cats)) ?? null;
  return { done, total: SETUP_STEPS.length, next };
}

/** CSLB license that is not expired (CA: number must be on estimates and contracts). */
export const hasValidCslb = (c: Company | null) =>
  !!c?.licenses.some((l) => l.kind === "cslb" && (!l.expiresOn || new Date(l.expiresOn).getTime() >= Date.now() - 86_400_000));

export const TRADES = [
  "handyman", "plumbing", "electrical", "hvac", "painting", "cleaning", "remodeling", "flooring",
  "roofing", "gutters", "landscaping", "fencing", "pest", "other",
] as const;
export const US_TIMEZONES = ["America/Los_Angeles", "America/Phoenix", "America/Denver", "America/Chicago", "America/New_York", "America/Anchorage", "Pacific/Honolulu"];
/** «Расписание»: the US zones, plus the stored one when it is another (America/Puerto_Rico) — else no chip is chosen
 *  (docs/specs/22 §1). A stored zone the phone does not know is not offered (the screen warns about it). */
export function zoneChoices(stored: string | undefined, known: (tz: string) => boolean): string[] {
  return stored && !US_TIMEZONES.includes(stored) && known(stored) ? [...US_TIMEZONES, stored] : US_TIMEZONES;
}
