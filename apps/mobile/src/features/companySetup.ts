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

/**
 * #2065 (founder 18.11: «кто хочет, добавляет лицензию, кто не хочет — не добавляет… приложение об этом не должно думать»):
 * licenses and insurance are asked, never required — in any state. They never count as unfinished and are never «the next
 * step»; the wizard still shows them (the question is asked) and «Пропустить» on them is as good as filling them in.
 */
export const OPTIONAL_STEPS: readonly SetupStep[] = ["licenses", "insurance"];
export const isOptionalStep = (s: SetupStep) => OPTIONAL_STEPS.includes(s);
/** a step that needs nothing more: filled in, or an optional one (#2065) */
export const stepSettled = (c: Company, s: SetupStep, cats: ServiceCategory[] = []) => isOptionalStep(s) || stepDone(c, s, cats);

export function setupProgress(c: Company | null, cats: ServiceCategory[] = []) {
  if (!c) return { done: 0, total: SETUP_STEPS.length, next: null as SetupStep | null };
  const done = SETUP_STEPS.filter((s) => stepSettled(c, s, cats)).length;
  const open = (s: SetupStep) => !stepSettled(c, s, cats);
  const next = SETUP_STEPS.find((s) => open(s) && !c.skipped.includes(s)) ?? SETUP_STEPS.find(open) ?? null;
  return { done, total: SETUP_STEPS.length, next };
}

/** the company's own state (two letters) — the default for new addresses; empty when it has none (#2065: no «CA» in the core) */
export const companyState = (c: Pick<Company, "address"> | null | undefined) => (c?.address.state ?? "").trim().toUpperCase();

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

/** «Расписание» → saveCompany: the zone goes only when it was chosen here (another chip than the stored one) — saving
 *  the hours alone does not send it, so a long-offline phone does not overwrite another admin's zone (docs/specs/22 §1.3).
 *  `saveCompany` sets company.save's `tzChanged` from whether `timezone` is in the patch. */
export function zonePatch(chosen: string, stored: string | undefined): { timezone?: string } {
  return chosen !== stored ? { timezone: chosen } : {};
}
