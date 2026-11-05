/**
 * Direction of the business (docs/specs/11-trade.md, stык S16). Core, niche-free: works with ids of the company's list.
 * The same inheritance rule runs in the database (trigger t15_service_category_inherit, migration 20261105230000).
 * Pure — tested in test/serviceCategories.test.ts.
 */
import type { DB, ID, ServiceCategory } from "@/data/types";
import { TRADES } from "@/features/companySetup";

type Db = Pick<DB, "serviceCategories" | "leads" | "estimates" | "jobs" | "properties">;

export const activeCategories = (list: ServiceCategory[]) =>
  list.filter((c) => !c.archivedAt).sort((a, b) => a.position - b.position);

/** the only active direction of the company, else none */
export function onlyCategory(list: ServiceCategory[]): ID | undefined {
  const a = activeCategories(list);
  return a.length === 1 ? a[0].id : undefined;
}

const isActive = (db: Db, id?: ID) => !!id && db.serviceCategories.some((c) => c.id === id && !c.archivedAt);

/** the direction of the client's latest estimate or job (later in the list = newer), active ones only */
export function lastOfCustomer(db: Db, customerId?: ID): ID | undefined {
  if (!customerId) return undefined;
  const props = new Set(db.properties.filter((p) => p.customerId === customerId).map((p) => p.id));
  const seen: ID[] = [];
  for (const e of db.estimates) if (e.customerId === customerId && e.serviceCategoryId) seen.push(e.serviceCategoryId);
  for (const j of db.jobs) if (props.has(j.propertyId) && j.serviceCategoryId) seen.push(j.serviceCategoryId);
  for (let i = seen.length - 1; i >= 0; i--) if (isActive(db, seen[i])) return seen[i];
  return undefined;
}

export type InheritFor =
  | { kind: "lead" }
  | { kind: "estimate"; leadId?: ID; customerId?: ID }
  | { kind: "job"; estimateId?: ID; customerId?: ID };

/**
 * Default direction of a new row, only when it has none: company → lead → estimate → job.
 * The direct parent's value is taken even if archived (the same deal); fallbacks take active ones only.
 * An estimate deliberately "without a direction" gives a job without one.
 */
export function inheritCategory(db: Db, f: InheritFor, explicit?: ID): ID | undefined {
  if (explicit) return explicit;
  if (f.kind === "lead") return onlyCategory(db.serviceCategories);
  if (f.kind === "estimate") {
    if (f.leadId) return db.leads.find((l) => l.id === f.leadId)?.serviceCategoryId;
    return lastOfCustomer(db, f.customerId) ?? onlyCategory(db.serviceCategories);
  }
  if (f.estimateId) return db.estimates.find((e) => e.id === f.estimateId)?.serviceCategoryId;
  return lastOfCustomer(db, f.customerId) ?? onlyCategory(db.serviceCategories);
}

/** the name to show: own name, else the translated preset */
export function categoryLabel(c: ServiceCategory | undefined, t: (k: never) => string): string {
  if (!c) return "";
  if (c.name) return c.name;
  return (TRADES as readonly string[]).includes(c.seedKey ?? "") ? t(`trade.${c.seedKey}` as never) : (c.seedKey ?? "");
}

/** a value that can be chosen now: active, or the one the row already has */
export const choosable = (list: ServiceCategory[], current?: ID) =>
  list.filter((c) => !c.archivedAt || c.id === current).sort((a, b) => a.position - b.position);

/** old local data (company.trades as text) → directions, same rule as the migration: trim, no blanks, no duplicates */
export function fromLegacyTrades(trades: string[] | undefined, makeId: () => ID): ServiceCategory[] {
  const out: ServiceCategory[] = [];
  const seen = new Set<string>();
  for (const raw of trades ?? []) {
    const t = (raw ?? "").trim();
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    const preset = (TRADES as readonly string[]).includes(k);
    out.push({ id: makeId(), ...(preset ? { seedKey: k } : { name: t }), position: out.length });
  }
  return out;
}

/** a name not already taken among active directions (case and spaces ignored) */
export function nameTaken(list: ServiceCategory[], name: string, exceptId?: ID, t?: (k: never) => string): boolean {
  const k = name.trim().toLowerCase();
  return activeCategories(list).some((c) => c.id !== exceptId && (c.name ?? (t ? categoryLabel(c, t) : c.seedKey ?? "")).trim().toLowerCase() === k);
}
