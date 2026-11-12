/**
 * Saved data from an older app version → today's shape. Runs on every load (demo and the cloud cache), so an update
 * never crashes on a phone that still holds old data. Pure — tested in test/normalize.test.ts.
 *   - lists added later (catalog, notices, notes, payments, sources, tasks, activities) default to empty
 *   - demo data gets the standard sources
 *   - leads and clients that stored the source by name ("Thumbtack") get its id
 *   - demo data gets the standard tags; demo clients saved by an older build get their number, tags and people
 *     from the seed (same id), other demo clients the next CLT number (a cloud client is read through peopleOf)
 *   - wave П-1 / П-2a / П-2b: cancelledJobs, jobTypes, files, jobLines, calendarEvents, customFields, customFieldValues
 *     default to empty (demo: the standard job types); a job without
 *     customerId takes the client of its property; demo jobs get their JOB number from the seed or the next one
 *   - an estimate's document goes through normalizeDoc (a priced line marked hidden is visible, sections in limits)
 */
import { fromLegacyTrades } from "@/features/serviceCategories";
import { normalizeDoc } from "@/features/estimateDoc";
import { nextJobNumber } from "./jobs";
import { makeSeed, SEED_JOB_TYPES, SEED_SERVICE_CATEGORIES, SEED_SOURCES, SEED_TAGS } from "./seed";
import { MEMBER_PREFS_DEFAULT, type Customer, type DB, type Job, type Property, type Visit } from "./types";

type Legacy = { source?: string; sourceId?: string };

/** #1189: the lists of a store (every list the seed has): a record of an older version without one gets it empty */
let listKeys: string[] | null = null;
function withLists(d: DB): DB {
  listKeys ??= Object.entries(makeSeed()).filter(([, v]) => Array.isArray(v)).map(([k]) => k);
  const missing = listKeys.filter((k) => !Array.isArray((d as unknown as Record<string, unknown>)[k]));
  return missing.length ? ({ ...d, ...Object.fromEntries(missing.map((k) => [k, []])) } as DB) : d;
}

export function normalizeDB(d: DB, mode: "demo" | "cloud"): DB {
  // the lists it does not build itself, filled at the end (what it builds from older fields — jobs from visits — first)
  return withLists(normalizeFields(d, mode));
}

function normalizeFields(d: DB, mode: "demo" | "cloud"): DB {
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
    // an estimate's document as it may be counted and shown (normalizeDoc, spec 2026-11-12-estimate-editor Р3, Р4): the
    // phone's own copy at the start too, not only the cloud's — a priced line marked hidden is visible, sections in limits
    estimates: (d.estimates ?? []).map((e) => (e.doc && Array.isArray(e.doc.options) ? { ...e, doc: normalizeDoc(e.doc).doc } : e)),
    ...invoicesApart(d),
    company: d.company ?? null,
    sources,
    tags: Array.isArray(d.tags) && d.tags.length ? d.tags : mode === "demo" ? SEED_TAGS : [],
    serviceCategories: serviceCategoriesOf(d, mode),
    cancelledVisits: Array.isArray(d.cancelledVisits) ? d.cancelledVisits : [],
    cancelledJobs: Array.isArray(d.cancelledJobs) ? d.cancelledJobs : [],
    jobTypes: Array.isArray(d.jobTypes) ? d.jobTypes : mode === "demo" ? SEED_JOB_TYPES : [],
    files: Array.isArray(d.files) ? d.files : [],
    jobLines: Array.isArray(d.jobLines) ? d.jobLines : [],
    calendarEvents: Array.isArray(d.calendarEvents) ? d.calendarEvents : [],
    customFields: Array.isArray(d.customFields) ? d.customFields : [],
    customFieldValues: Array.isArray(d.customFieldValues) ? d.customFieldValues : [],
    prefs: { ...MEMBER_PREFS_DEFAULT, planShowDone: d.prefs?.planShowDone === true },
    // wave 7б-2: off unless saved — in the demo too, as for every company until the lawyer's answer on AB 1331
    location: { allowed: d.location?.allowed === true, on: d.location?.on === true, ...(d.location?.ackAt ? { ackAt: d.location.ackAt } : {}) },
    visitPoints: Array.isArray(d.visitPoints) ? d.visitPoints : [],
    ...withJobFields(withoutLateFlag(inspectionsWithoutJobs(d)), d.properties ?? [], d.cancelledJobs, mode),
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

/** В1-5 (#1107): a voided invoice never stays among the live ones (an older record, a copy from the server) — it moves
 *  to voidInvoices, so no sum counts it; an old record without voidInvoices gets [] */
function invoicesApart(d: DB): Pick<DB, "invoices" | "voidInvoices"> {
  const all = d.invoices ?? [];
  const moved = all.filter((i) => i.status === "void");
  const kept = Array.isArray(d.voidInvoices) ? d.voidInvoices : [];
  return {
    invoices: moved.length ? all.filter((i) => i.status !== "void") : all,
    voidInvoices: moved.length ? [...kept.filter((k) => !moved.some((m) => m.id === k.id)), ...moved] : kept,
  };
}

/** wave П-1: an older phone's job has no customerId (→ the client of its property) and, in the demo, no JOB number
 *  (→ the seed's number for the same id, else the next free one). A cloud job's number comes only from the server. */
function withJobFields(x: Pick<DB, "jobs" | "visits">, properties: Property[], cancelledJobs: Job[] | undefined, mode: "demo" | "cloud"): Pick<DB, "jobs" | "visits"> {
  const ownerOf = new Map(properties.map((p) => [p.id, p.customerId]));
  let jobs = x.jobs.map((j) => (j.customerId || !ownerOf.get(j.propertyId) ? j : { ...j, customerId: ownerOf.get(j.propertyId) }));
  if (mode === "demo" && jobs.some((j) => !j.number)) {
    const seed = new Map(makeSeed().jobs.map((j) => [j.id, j.number]));
    const taken = new Set(jobs.map((j) => j.number).filter(Boolean));
    jobs = jobs.map((j) => {
      if (j.number) return j;
      const fromSeed = seed.get(j.id);
      return fromSeed && !taken.has(fromSeed) ? (taken.add(fromSeed), { ...j, number: fromSeed }) : j;
    });
    for (let i = 0; i < jobs.length; i++) {
      if (jobs[i]!.number) continue;
      jobs[i] = { ...jobs[i]!, number: nextJobNumber({ jobs, cancelledJobs }) };
    }
  }
  return { ...x, jobs };
}

/** П3c (docs/specs/03): «late» is computed now; the old demo flag `late` is dropped from saved visits. */
function withoutLateFlag(x: Pick<DB, "jobs" | "visits">): Pick<DB, "jobs" | "visits"> {
  return { ...x, visits: x.visits.map((v) => ("late" in v ? (({ late: _l, ...rest }) => rest)(v as Visit & { late?: boolean }) : v)) };
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
