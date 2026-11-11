/**
 * «Замеры» — the module's home (spec 33 П25.3 А, П25.4; before: П20.22, founder 09.11 версия 475): every measurement of
 * the company the phone has, the drafts without a client too, newest first — each with whom it is for, what is drawn and
 * its state (computed, never a status of the database: `draft` / `ready` there mean «the estimate was made of this
 * drawing», rule 16). Pure: one place for the list, the filters with their counts, the search and the tests.
 */
import type { DB, Estimate } from "@/data/types";
import { fromElements } from "./canvas/model";
import type { MeasurementRow } from "./canvas/model";
import { gutterData } from "./data";
import { estimateOfMeasurement, ofMeasurement } from "./estimateLink";
import { runLengthIn } from "./geometry";

/**
 * П25.4: `unlinked` — no lead and no address (a «Черновик»); `noEstimate` — linked, no estimate of it (a declined one does
 * not count: «Сделать смету» makes a new one); `estimate` — an estimate, none signed; `signed` — one of it is awaiting the
 * company's signature or approved (the same set that forbids deleting it, `signedOn`).
 */
export type MeasurementState = "unlinked" | "noEstimate" | "estimate" | "signed";
/** the chips of «Замеры», in the order of the work; «Все» first */
export const MEASUREMENT_FILTERS = ["all", "drafts", "noEstimate", "estimate", "signed"] as const;
export type MeasurementFilter = (typeof MEASUREMENT_FILTERS)[number];
const FILTER_OF: Record<MeasurementState, MeasurementFilter> = { unlinked: "drafts", noEstimate: "noEstimate", estimate: "estimate", signed: "signed" };
export const asMeasurementFilter = (s: unknown): MeasurementFilter => ((MEASUREMENT_FILTERS as readonly unknown[]).includes(s) ? (s as MeasurementFilter) : "all");

const SIGNED = new Set<Estimate["status"]>(["awaiting_countersign", "approved"]);

export interface MeasurementStateView {
  state: MeasurementState;
  /** `estimate`: the measurement's estimate now (its status is the card's chip); `signed`: the signed one */
  estimate?: Estimate;
  /** the drawing was changed after its estimate (`estimate`: «Чертёж изменён»; `signed`: «Изменён после подписи», В4) */
  changed: boolean;
}

type StateDB = Pick<DB, "estimates">;

/** the state of one measurement (П25.4); `drawn` — something is drawn (an emptied drawing makes no lines: never «changed») */
export function measurementState(db: StateDB, m: Pick<MeasurementRow, "id" | "status" | "leadId" | "propertyId">, drawn: boolean): MeasurementStateView {
  if (!m.leadId && !m.propertyId) return { state: "unlinked", changed: false };
  const mine = db.estimates.filter((e) => e.doc?.options?.some((o) => o.lines.some((l) => ofMeasurement(l, m.id))));
  // a real edit of the drawing after «Сделать смету» puts the measurement back to draft (canvas/moduleStore.ts) — the same
  // sign `staleMeasurements` reads
  const changed = drawn && m.status === "draft";
  const signed = mine.find((e) => SIGNED.has(e.status));
  if (signed) return { state: "signed", estimate: signed, changed };
  const e = estimateOfMeasurement(db, m.id);
  if (e) return { state: "estimate", estimate: e, changed };
  return { state: "noEstimate", changed: false };
}

export interface MeasurementItem {
  id: string;
  status: "draft" | "ready";
  /** the client's name (the address's), else the lead's, else null — a draft for nobody yet */
  forName: string | null;
  /** whom it is for: a client, a lead, nobody — the card's title says «Лид: имя» for a lead */
  forKind: "client" | "lead" | "none";
  address: string | null;
  leadId: string | null;
  phone: string | null;
  runs: number;
  downspouts: number;
  /** total gutter length, inches */
  lengthIn: number;
  updatedAt: string | null;
  view: MeasurementStateView;
}

type ListDB = Pick<DB, "moduleData" | "leads" | "properties" | "customers" | "estimates">;

export function measurementList(db: ListDB): MeasurementItem[] {
  const g = gutterData(db);
  return g.measurements
    .map((m): MeasurementItem => {
      const d = fromElements(g.elements.filter((e) => e.measurementId === m.id));
      const lead = m.leadId ? db.leads.find((l) => l.id === m.leadId) : undefined;
      const prop = m.propertyId ? db.properties.find((p) => p.id === m.propertyId) : undefined;
      const client = prop ? db.customers.find((c) => c.id === prop.customerId) : undefined;
      const address = prop ? [prop.address, prop.city].filter(Boolean).join(", ") : (lead?.address ?? null);
      return {
        id: m.id,
        status: m.status,
        forName: client?.name ?? lead?.name ?? null,
        forKind: client ? "client" : lead ? "lead" : "none",
        address: address || null,
        leadId: m.leadId,
        phone: client?.phone ?? lead?.phone ?? null,
        runs: d.runs.length,
        downspouts: d.downspouts.length,
        lengthIn: d.runs.reduce((n, r) => n + runLengthIn(r), 0),
        updatedAt: m.updatedAt ?? null,
        view: measurementState(db, m, d.runs.length > 0),
      };
    })
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

const digits = (s: string) => s.replace(/\D/g, "");
/** the search of «Замеры»: a part of the client's or the lead's name, the address, the phone (digits only) */
export function matchMeasurement(x: MeasurementItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if ([x.forName, x.address].some((s) => (s ?? "").toLowerCase().includes(needle))) return true;
  const d = digits(needle);
  return d.length >= 3 && !!x.phone && digits(x.phone).includes(d);
}

/** the chips' counts (searched list) and the cards of the chosen chip — one function, so a count never lies */
export function filterMeasurements(items: readonly MeasurementItem[], f: MeasurementFilter, q = ""): { shown: MeasurementItem[]; counts: Record<MeasurementFilter, number> } {
  const found = items.filter((x) => matchMeasurement(x, q));
  const counts = { all: found.length, drafts: 0, noEstimate: 0, estimate: 0, signed: 0 } as Record<MeasurementFilter, number>;
  for (const x of found) counts[FILTER_OF[x.view.state]] += 1;
  return { shown: f === "all" ? found : found.filter((x) => FILTER_OF[x.view.state] === f), counts };
}
