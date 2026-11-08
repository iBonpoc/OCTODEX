/**
 * A measurement and its estimate (docs/specs/33-gutters-estimate.md П23.8, M8b; stub S5g). Pure but `makeEstimate`, which
 * writes through the core's store (ModuleEstimateStore) and the module's own changes (module.op).
 *
 * The estimate of a measurement is the newest of the company's estimates with lines of it (`source.measurementId`).
 * A signed one (the client signed, or both) is never changed: «Открыть смету» — more work is a change order (S8c, stage 4).
 * A declined one is closed: «Смета» makes a new one.
 * The button: no lines of it anywhere → «Смета»; the measurement changed since (status draft) → «Обновить смета»;
 * nothing changed (ready) → «Открыть смету». No lead and no property → «Сделать заявкой» first (an estimate needs a client).
 */
import { ENGINE_VERSION, type PartQty } from "@octo/estimating-engine";
import type { DB, Estimate, EstimateDoc } from "@/data/types";
import { estimateTitle, newDoc, uid } from "@/features/estimateDoc";
import type { ModuleEstimateStore } from "../registry";
import { gutterData, K, KEY, ownFields, putMeasurement, withGutterData } from "./data";
import { linesFromParts, resyncLines, type LineSource, type ModuleLine } from "./estimate";
import type { ElementRow, MeasurementRow } from "./canvas/model";
import type { CatalogItem } from "@/data/types";

const SIGNED = new Set<Estimate["status"]>(["awaiting_countersign", "approved"]);

const sourceOf = (l: { source?: unknown }) => (l.source && typeof l.source === "object" ? (l.source as Partial<LineSource>) : undefined);
/** a line «Смета» of this measurement wrote */
export const ofMeasurement = (l: { source?: unknown }, measurementId: string) => {
  const s = sourceOf(l);
  return !!s && s.module === KEY && s.measurementId === measurementId;
};
const hasLinesOf = (e: Estimate, measurementId: string) => !!e.doc?.options?.some((o) => o.lines.some((l) => ofMeasurement(l, measurementId)));

/** the measurement's estimate: the newest open one with its lines, else the newest signed one; a declined one never */
export function estimateOfMeasurement(db: Pick<DB, "estimates">, measurementId: string): Estimate | undefined {
  const mine = db.estimates.filter((e) => e.status !== "declined" && hasLinesOf(e, measurementId));
  const open = mine.filter((e) => !SIGNED.has(e.status));
  return (open.length ? open : mine).at(-1);
}

export type EstimateAction =
  | { kind: "none" }
  | { kind: "needLead" }
  | { kind: "make" }
  | { kind: "update"; estimateId: string }
  | { kind: "open"; estimateId: string; signed?: true };

/** what the estimate button does for a measurement now */
export function estimateAction(db: Pick<DB, "estimates">, m: Pick<MeasurementRow, "id" | "status" | "leadId" | "propertyId"> | null, hasElements: boolean): EstimateAction {
  if (!m || !hasElements) return { kind: "none" };
  const e = estimateOfMeasurement(db, m.id);
  if (e && SIGNED.has(e.status)) return { kind: "open", estimateId: e.id, signed: true };
  if (e) return m.status === "ready" ? { kind: "open", estimateId: e.id } : { kind: "update", estimateId: e.id };
  if (!m.leadId && !m.propertyId) return { kind: "needLead" };
  return { kind: "make" };
}

/**
 * The document with the measurement's new lines: a new one (one option) when there is none; else every option with
 * lines of this measurement gets «Обновить» (resyncLines: hand changes and own lines stay); an option without them is
 * left alone. Lines of another measurement in the same option are someone's own here — never touched.
 */
export function docWithLines(prev: EstimateDoc | undefined, next: readonly ModuleLine[], measurementId: string, fresh: () => EstimateDoc): EstimateDoc {
  if (!prev) {
    const d = fresh();
    return { ...d, options: d.options.map((o, i) => (i === 0 ? { ...o, lines: [...(next as EstimateDoc["options"][number]["lines"])] } : o)) };
  }
  const touched = prev.options.some((o) => o.lines.some((l) => ofMeasurement(l, measurementId)));
  return {
    ...prev,
    options: prev.options.map((o, i) => {
      const mine = o.lines.some((l) => ofMeasurement(l, measurementId));
      // no option has lines of it (they were all removed by hand): the first option gets them again
      if (!mine && (touched || i > 0)) return o;
      const others = new Map<string, (typeof o.lines)[number]>();
      const masked = o.lines.map((l) => {
        if (sourceOf(l)?.module === KEY && !ofMeasurement(l, measurementId)) {
          others.set(l.id, l);
          const { source: _s, ...own } = l;
          return own as ModuleLine;
        }
        return l as ModuleLine;
      });
      const out = resyncLines(masked, next).map((l) => others.get(l.id) ?? l);
      return { ...o, lines: out as typeof o.lines };
    }),
  };
}

/** what «Смета» / «Обновить смету» needs from the canvas */
export interface MakeInput {
  m: MeasurementRow;
  elements: readonly ElementRow[];
  parts: readonly PartQty[];
  catalog: readonly CatalogItem[];
  /** a part's name in the CLIENT's language (rule 7) — for a part with no item in the price list */
  name: (p: PartQty) => string;
  /** the estimate's title when it has no lines to name it */
  fallbackTitle: string;
}

/**
 * «Смета» / «Обновить смету»: a revision of the measurement (the server numbers it, T98), the measurement is ready, and
 * the estimate saved through the core (offline: all of it waits in the queue, in this order). Returns the estimate's id
 * and the core's «Отменить» of the estimate — or null when the measurement has no client to make it for.
 */
export function makeEstimate(store: ModuleEstimateStore, x: MakeInput): { estimateId: string; undo: () => void; updated: boolean } | null {
  const db = store.db;
  const e = estimateOfMeasurement(db, x.m.id);
  if (e && SIGNED.has(e.status)) return null;
  // the client and the property: the estimate's own, else the lead's (made from it when it has none, S3), else the property's
  let target: { customerId: string; propertyId: string; undo: () => void; leadId?: string } | null = null;
  if (e) target = { customerId: e.customerId, propertyId: e.propertyId, undo: () => {}, ...(e.leadId ? { leadId: e.leadId } : {}) };
  else if (x.m.leadId) {
    const t = store.leadEstimateTarget(x.m.leadId);
    if (t) target = { ...t, leadId: x.m.leadId };
  } else if (x.m.propertyId) {
    const p = db.properties.find((q) => q.id === x.m.propertyId);
    if (p) target = { customerId: p.customerId, propertyId: p.id, undo: () => {} };
  }
  if (!target) return null;

  const revisionId = uid();
  const rev = store.moduleOp(KEY, {
    kind: K.rAdd,
    payload: { r: { id: revisionId, measurementId: x.m.id, elements: x.elements, parts: x.parts, engineVersion: ENGINE_VERSION } },
    apply: (d) => d,
    made: [revisionId],
  });
  // the module is off (founder О2): nothing is written — the canvas says «Подключить»
  if (rev == null) return null;
  const was = gutterData(db).measurements.find((q) => q.id === x.m.id) ?? x.m;
  let undoReady: unknown = null;
  if (was.status !== "ready") {
    const row = { ...ownFields(was), status: "ready" as const };
    undoReady = store.moduleOp(KEY, { kind: K.mSave, payload: { m: row }, apply: (d) => withGutterData(d, putMeasurement({ ...was, status: "ready" })), coalesceKey: was.id, made: [was.id] });
  }

  const lines = linesFromParts(x.parts, x.catalog, x.name, uid, revisionId, x.m.id);
  const doc = docWithLines(e?.doc, lines, x.m.id, () => newDoc(db.company?.estimate?.depositBps));
  const estimateId = e?.id ?? uid();
  const undoSave = store.saveEstimate({
    id: estimateId,
    customerId: target.customerId,
    propertyId: target.propertyId,
    title: e?.title ?? estimateTitle(doc, x.fallbackTitle),
    doc,
    ...(target.leadId ? { leadId: target.leadId } : {}),
  });
  return {
    estimateId,
    updated: !!e,
    undo: () => {
      undoSave();
      // the measurement is a draft again: «Смета» stays in reach (the revision itself is history, it stays)
      if (typeof undoReady === "function") (undoReady as () => void)();
      target!.undo();
    },
  };
}
