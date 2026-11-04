/**
 * Saved data from an older app version → today's shape. Runs on every load (demo and the cloud cache), so an update
 * never crashes on a phone that still holds old data. Pure — tested in test/normalize.test.ts.
 *   - lists added later (catalog, notices, notes, payments, sources, tasks, activities) default to empty
 *   - demo data gets the standard sources
 *   - leads and clients that stored the source by name ("Thumbtack") get its id
 */
import { SEED_SOURCES } from "./seed";
import type { DB } from "./types";

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
    tasks: Array.isArray(d.tasks) ? d.tasks : [],
    activities: Array.isArray(d.activities) ? d.activities : [],
    leads: (d.leads ?? []).map((l) => (l.sourceId ? l : { ...l, sourceId: sourceIdOf(l as Legacy) })),
    customers: (d.customers ?? []).map((c) => (c.sourceId ? c : { ...c, sourceId: sourceIdOf(c as Legacy) })),
  };
}
