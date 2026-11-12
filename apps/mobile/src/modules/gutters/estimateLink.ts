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
import { ENGINE_VERSION, GUTTER_PARTS_VERSION, type PartQty } from "@octo/estimating-engine";
import type { DocAttachPage } from "@/features/docPages";
import { pagesProblem } from "@/features/docPages";
import type { DB, Estimate, EstimateDoc } from "@/data/types";
import { estimateTitle, newDoc, uid } from "@/features/estimateDoc";
import { moduleActive, type ModuleEstimateStore } from "../registry";
import { leadEstimatePropertyId } from "@/features/access";
import { docLanguageFor } from "@/data/people";
import type { DocLang } from "@/i18n/translate";
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
/** a signed estimate (awaiting countersign or approved) stands on this measurement — it can not be deleted (П24 Б6) */
export const signedOn = (db: Pick<DB, "estimates">, measurementId: string) => db.estimates.some((e) => SIGNED.has(e.status) && hasLinesOf(e, measurementId));

export function estimateOfMeasurement(db: Pick<DB, "estimates">, measurementId: string): Estimate | undefined {
  const mine = db.estimates.filter((e) => e.status !== "declined" && hasLinesOf(e, measurementId));
  const open = mine.filter((e) => !SIGNED.has(e.status));
  // the one written last (the cloud lists estimates by id — a random order, review M8b №3); ties: the later in the list
  const lastWrite = (e: Estimate) =>
    (e.doc?.options ?? []).flatMap((o) => o.lines).filter((l) => ofMeasurement(l, measurementId)).reduce((m, l) => {
      const a = sourceOf(l)?.at;
      return typeof a === "string" && a > m ? a : m;
    }, "");
  const pool = open.length ? open : mine;
  return pool.reduce<Estimate | undefined>((best, e) => (!best || lastWrite(e) >= lastWrite(best) ? e : best), undefined);
}

/**
 * C5b (spec 33 П23.11): the measurements this estimate was made of that changed after it — the measurement is a draft
 * again (a real edit of the drawing, П23.8а №7) and this estimate is still its estimate (a newer one took over → not this
 * one's business). Only something drawn: an emptied drawing makes no lines.
 */
export function staleMeasurements(db: Pick<DB, "estimates" | "moduleData">, e: Estimate): MeasurementRow[] {
  const g = gutterData(db);
  return g.measurements.filter(
    (m) => m.status === "draft" && hasLinesOf(e, m.id) && g.elements.some((x) => x.measurementId === m.id && x.kind === "run") && estimateOfMeasurement(db, m.id)?.id === e.id,
  );
}

/** `was` is an older parts rule than `now` (GUTTER_PARTS_VERSION, not the core's ENGINE_VERSION: a core change must not mark every estimate) (dotted numbers: 0.1.3 < 0.1.10 < 0.2.0); none or unreadable — not older (an old line has no version: nobody knows, nothing is said) */
export function engineOlder(was: unknown, now: string = GUTTER_PARTS_VERSION): boolean {
  if (typeof was !== "string" || !/^\d+(\.\d+)*$/.test(was)) return false;
  const a = was.split(".").map(Number), b = now.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/** the measurement's estimate was computed by an older engine (#1165): any line of this measurement carries an older version */
export function engineChangedFor(e: Estimate | undefined, measurementId: string, now: string = GUTTER_PARTS_VERSION): boolean {
  return !!e?.doc?.options?.some((o) => o.lines.some((l) => ofMeasurement(l, measurementId) && engineOlder(sourceOf(l)?.engineVersion, now)));
}

/**
 * #1165: the measurements of this estimate whose lines the engine computed in an older version than now — the estimate is still
 * theirs (no newer one took over). A hint «расчёт изменился — обновите»; a signed estimate is only shown the hint, never changed.
 */
export function engineStaleMeasurements(db: Pick<DB, "estimates" | "moduleData">, e: Estimate, now: string = GUTTER_PARTS_VERSION): MeasurementRow[] {
  return gutterData(db).measurements.filter((m) => hasLinesOf(e, m.id) && estimateOfMeasurement(db, m.id)?.id === e.id && engineChangedFor(e, m.id, now));
}

/** the client's language for the lines of a measurement's estimate (rule 7): the lead's, else the property's client's */
export function clientLangOf(db: DB, m: Pick<MeasurementRow, "leadId" | "propertyId">): DocLang {
  const prop = m.propertyId ? db.properties.find((p) => p.id === m.propertyId) : undefined;
  const lead = m.leadId ? db.leads.find((l) => l.id === m.leadId) : undefined;
  return docLanguageFor(db, { ...(lead ? { leadId: lead.id } : {}), ...(prop ? { customerId: prop.customerId } : {}) });
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
  // an estimate the engine computed in an older version is updated too, though the drawing is as it was (#1165)
  if (e) return m.status === "ready" && !engineChangedFor(e, m.id) ? { kind: "open", estimateId: e.id } : { kind: "update", estimateId: e.id };
  if (!m.leadId && !m.propertyId) return { kind: "needLead" };
  return { kind: "make" };
}

/**
 * The document with the measurement's new lines: a new one (one option) when there is none; else every option with
 * lines of this measurement gets «Обновить» (resyncLines: hand changes and own lines stay); an option without them is
 * left alone. Lines of another measurement in the same option are never touched and never hold back this one's
 * (review M8b №5). A line someone deleted comes back on «Обновить» — to keep a part out, set its quantity to 0
 * (a hand change: it stays 0); spec П23.8.
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
      const out = resyncLines(o.lines as ModuleLine[], next, (l) => sourceOf(l)?.module === KEY && !ofMeasurement(l, measurementId));
      return { ...o, lines: out as typeof o.lines };
    }),
  };
}

/** the measurement's drawing as the estimate's attached page (spec 33 П24.7, S6g; #705): this measurement's page is
 *  put in (or replaced), other pages stay; a page the server would refuse is left out — the estimate itself goes */
export const pageIdOf = (measurementId: string) => `${KEY}:${measurementId}`;
export function withMeasurementPage(doc: EstimateDoc, measurementId: string, page: DocAttachPage | undefined): EstimateDoc {
  const id = pageIdOf(measurementId);
  const others = (Array.isArray(doc.pages) ? doc.pages : []).filter((p) => p?.id !== id);
  const next = page ? [...others, { ...page, id }] : others;
  if (page && pagesProblem(next) !== null) return others.length ? { ...doc, pages: others } : withoutPages(doc);
  return next.length ? { ...doc, pages: next } : withoutPages(doc);
}
const withoutPages = (doc: EstimateDoc): EstimateDoc => {
  const { pages: _p, ...rest } = doc;
  return rest;
};

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
  /** the clock (tests) */
  now?: () => string;
  /** the drawing as the client sees it (the sheet, #739) — in the CLIENT's language, no prices; none — the estimate's
   *  page of this measurement is left as it is */
  page?: DocAttachPage;
}

export type MakeResult =
  | { ok: true; estimateId: string; undo: () => void; updated: boolean }
  /** off: the module is not active (О2); signed: never changed; noClient: no lead or property this person can make an estimate for */
  | { ok: false; reason: "off" | "signed" | "noClient" | "notHere" };

/**
 * «Смета» / «Обновить смету»: a revision of the measurement (the server numbers it, T98), the measurement is ready, and
 * the estimate saved through the core (offline: all of it waits in the queue, in this order). Nothing is written —
 * not even the lead's client — when the module is off, the estimate is signed or there is no client to make it for.
 */
export function makeEstimate(store: ModuleEstimateStore, x: MakeInput): MakeResult {
  const db = store.db;
  // the module first: a lead's client is made only for an estimate that will be (review M8b №1, rule 5)
  if (!moduleActive(db.company, KEY)) return { ok: false, reason: "off" };
  const e = estimateOfMeasurement(db, x.m.id);
  if (e && SIGNED.has(e.status)) return { ok: false, reason: "signed" };
  // #1138 (review of #1169 Б1): a NEW estimate only where the person may make one (a tech: a property he works at, the
  // server's estimates_insert) — asked before anything is written: no revision, no «ready», no client from the lead, no
  // false «Смета составлена». The property it would be at: the lead's (or its client's), else the measurement's own.
  if (!e && store.mayMakeEstimateAt) {
    const lead = x.m.leadId ? db.leads.find((l) => l.id === x.m.leadId) : undefined;
    const at = lead ? leadEstimatePropertyId(db, lead) : x.m.propertyId ?? undefined;
    if (!store.mayMakeEstimateAt(at)) return { ok: false, reason: "notHere" };
  }
  // the client and the property: the estimate's own, else the lead's (made from it when it has none, S3), else the
  // property's — also when the lead is not seen here (a tech on his visit's property; review M8b №6)
  let target: { customerId: string; propertyId: string; undo: () => void; leadId?: string } | null = null;
  if (e) target = { customerId: e.customerId, propertyId: e.propertyId, undo: () => {}, ...(e.leadId ? { leadId: e.leadId } : {}) };
  if (!target && x.m.leadId && db.leads.some((l) => l.id === x.m.leadId)) {
    const t = store.leadEstimateTarget(x.m.leadId);
    if (t) target = { ...t, leadId: x.m.leadId };
  }
  if (!target && x.m.propertyId) {
    const p = db.properties.find((q) => q.id === x.m.propertyId);
    if (p) target = { customerId: p.customerId, propertyId: p.id, undo: () => {} };
  }
  if (!target) return { ok: false, reason: "noClient" };

  const revisionId = uid();
  const rev = store.moduleOp(KEY, {
    kind: K.rAdd,
    payload: { r: { id: revisionId, measurementId: x.m.id, elements: x.elements, parts: x.parts, engineVersion: ENGINE_VERSION } },
    apply: (d) => d,
    made: [revisionId],
  });
  if (rev == null) {
    target.undo();
    return { ok: false, reason: "off" };
  }
  const was = gutterData(db).measurements.find((q) => q.id === x.m.id) ?? x.m;
  // always: the screen's last save may have just made it a draft, and the store this function sees can be a render old
  const row = { ...ownFields(was), status: "ready" as const };
  const undoReady = store.moduleOp(KEY, { kind: K.mSave, payload: { m: row }, apply: (d) => withGutterData(d, putMeasurement({ ...was, status: "ready" })), coalesceKey: was.id, made: [was.id] });

  const lines = linesFromParts(x.parts, x.catalog, x.name, uid, revisionId, x.m.id, (x.now ?? (() => new Date().toISOString()))(), GUTTER_PARTS_VERSION);
  const withLines = docWithLines(e?.doc, lines, x.m.id, () => newDoc(db.company?.estimate?.depositBps));
  // the drawing of this revision goes with the estimate (S6g): the client sees on /p/ and in the PDF what it was counted from
  const doc = x.page ? withMeasurementPage(withLines, x.m.id, x.page) : withLines;
  const estimateId = e?.id ?? uid();
  const t = target;
  const undoSave = store.saveEstimate({
    id: estimateId,
    customerId: t.customerId,
    propertyId: t.propertyId,
    title: e?.title ?? estimateTitle(doc, x.fallbackTitle),
    doc,
    ...(t.leadId ? { leadId: t.leadId } : {}),
  });
  return {
    ok: true,
    estimateId,
    updated: !!e,
    undo: () => {
      undoSave();
      // the measurement is a draft again: «Смета» stays in reach (the revision itself is history, it stays)
      if (typeof undoReady === "function") (undoReady as () => void)();
      t.undo();
    },
  };
}
