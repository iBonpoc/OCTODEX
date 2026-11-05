/**
 * Saved data from an older app version → today's shape. Runs on every load (demo and the cloud cache), so an update
 * never crashes on a phone that still holds old data. Pure — tested in test/normalize.test.ts.
 *   - lists added later (catalog, notices, notes, payments, sources, tasks, activities) default to empty
 *   - demo data gets the standard sources
 *   - leads and clients that stored the source by name ("Thumbtack") get its id
 *   - demo data gets the standard tags; demo clients saved by an older build get their number, tags and people
 *     from the seed (same id), other demo clients the next CLT number (a cloud client is read through peopleOf)
 */
import { fromLegacyTrades } from "@/features/serviceCategories";
import { makeSeed, SEED_SERVICE_CATEGORIES, SEED_SOURCES, SEED_TAGS } from "./seed";
import type { Customer, DB } from "./types";

type Legacy = { source?: string; sourceId?: string };

export function normalizeDB(d: DB, mode: "demo" | "cloud"): DB {
  const sources = Array.isArray(d.sources) && d.sources.length ? d.sources : mode === "demo" ? SEED_SOURCES : [];
  const byName = new Map(sources.map((s) => [s.name.toLowerCase(), s.id]));
  const fallback = sources.find((s) => s.name === "Other")?.id ?? sources[0]?.id ?? "";
  const sourceIdOf = (x: Legacy) => x.sourceId ?? (x.source ? byName.get(x.source.toLowerCase()) ?? fallback : fallback);
  return {
    ...d,
    catalog: d.catalog ?? [],
    notices: d.notices ?? [],
    notes: d.notes ?? [],
    payments: d.payments ?? [],
    company: d.company ?? null,
    sources,
    tags: Array.isArray(d.tags) && d.tags.length ? d.tags : mode === "demo" ? SEED_TAGS : [],
    serviceCategories: serviceCategoriesOf(d, mode),
    cancelledVisits: Array.isArray(d.cancelledVisits) ? d.cancelledVisits : [],
    ...inspectionsWithoutJobs(d),
    tasks: Array.isArray(d.tasks) ? d.tasks : [],
    activities: Array.isArray(d.activities) ? d.activities : [],
    leads: (d.leads ?? []).map((l) => (l.sourceId ? l : { ...l, sourceId: sourceIdOf(l as Legacy) })),
    // people / tagIds are optional: screens read them through peopleOf(c) and c.tagIds ?? []
    customers: backfillDemoClients(
      (d.customers ?? []).map((c) => (c.sourceId ? c : { ...c, sourceId: sourceIdOf(c as Legacy) })),
      mode,
    ),
  };
}

/** Visit and Plan П1 (docs/specs/03 §3.1, migration 20261105280000): an older phone keeps inspections as jobs with the
 *  status "estimate" (or "lead"). They become visits of the lead at the property, without a job; the job goes. */
function inspectionsWithoutJobs(d: DB): Pick<DB, "jobs" | "visits"> {
  const old = new Map((d.jobs ?? []).filter((j) => (j.status as string) === "estimate" || (j.status as string) === "lead").map((j) => [j.id, j]));
  if (!old.size) return { jobs: d.jobs ?? [], visits: d.visits ?? [] };
  const visits = (d.visits ?? []).map((v) => {
    const j = v.jobId ? old.get(v.jobId) : undefined;
    if (!j) return v;
    const lead = (d.leads ?? []).find((l) => l.propertyId === j.propertyId);
    const { jobId: _j, ...rest } = v;
    return { ...rest, propertyId: v.propertyId ?? j.propertyId, leadId: v.leadId ?? lead?.id, kind: "inspection" as const };
  });
  return { jobs: (d.jobs ?? []).filter((j) => !old.has(j.id)), visits };
}

/** Directions (docs/specs/11-trade.md): an older phone holds them as text in company.trades — moved once, same rule as
 *  the migration (demo only); a demo with neither gets the demo set. The cloud cache is refilled from the server. */
function serviceCategoriesOf(d: DB, mode: "demo" | "cloud") {
  if (Array.isArray(d.serviceCategories)) return d.serviceCategories;
  if (mode === "cloud") return [];
  const old = fromLegacyTrades(d.company?.trades, () => `cat-${Math.random().toString(36).slice(2, 10)}`);
  if (old.length) return old;
  return mode === "demo" ? SEED_SERVICE_CATEGORIES : [];
}

/** Demo only: what newer builds added to the test clients (number CLT-…, tags, several people). */
function backfillDemoClients(customers: Customer[], mode: "demo" | "cloud"): Customer[] {
  if (mode !== "demo" || customers.every((c) => c.number)) return customers;
  const seed = new Map(makeSeed().customers.map((c) => [c.id, c]));
  let max = Math.max(0, ...customers.map((c) => Number(/^CLT-(\d+)$/.exec(c.number ?? "")?.[1] ?? 0)), ...[...seed.values()].map((c) => Number(/^CLT-(\d+)$/.exec(c.number ?? "")?.[1] ?? 0)));
  return customers.map((c) => {
    if (c.number) return c;
    const s = seed.get(c.id);
    if (s) return { ...c, number: s.number, tagIds: c.tagIds ?? s.tagIds, people: c.people ?? s.people };
    max += 1;
    return { ...c, number: `CLT-${String(max).padStart(4, "0")}` };
  });
}
