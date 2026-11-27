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
import { computeGutterParts, ENGINE_VERSION, GUTTER_PARTS_VERSION, type PartQty } from "@octo/estimating-engine";
import type { DocAttachPage } from "@/features/docPages";
import { pagesProblem } from "@/features/docPages";
import type { DB, Estimate, EstimateDoc } from "@/data/types";
import { estimateTitle, newDoc, uid } from "@/features/estimateDoc";
import { SECTIONS_MAX, SECTION_TITLE_MAX } from "@octo/estimating-engine";
import { moduleActive, type ModuleEstimateStore } from "../registry";
import { leadEstimatePropertyId } from "@/features/access";
import { docLanguageFor } from "@/data/people";
import type { DocLang } from "@/i18n/translate";
import { gutterData, K, KEY, ownFields, putMeasurement, removeMeasurement, undoAll, withGutterData } from "./data";
import { linesFromParts, resyncLines, type LineSource, type ModuleLine } from "./estimate";
import { fromElements, type ElementRow, type MeasurementRow } from "./canvas/model";
import { toMeasurement } from "./geometry";
import { readRules, toRulesOverride } from "./settings";
import type { CatalogItem } from "@/data/types";
import { type GuardedUndo, NO_UNDO } from "@/data/undo";

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

/**
 * #2990 (founder 27.11: «привязал чертёж к лиду… что должно произойти? непонятно»): the estimates the measurement's lead (or its client's
 * address) already has WITHOUT this measurement's lines — the card says so («У … уже есть смета EST-0006 · Отправлена»), not «Без сметы».
 * Declined ones are left out; the newest number first (the one shown is [0]).
 */
export function otherEstimates(db: Pick<DB, "estimates">, m: Pick<MeasurementRow, "id" | "leadId" | "propertyId">): Estimate[] {
  if (!m.leadId && !m.propertyId) return [];
  return db.estimates
    .filter((e) => e.status !== "declined" && !hasLinesOf(e, m.id) && ((!!m.leadId && e.leadId === m.leadId) || (!!m.propertyId && e.propertyId === m.propertyId)))
    .sort((a, b) => (b.number ?? "").localeCompare(a.number ?? "", "en", { numeric: true }));
}

/**
 * #3027 (founder 26.11, #3047 А, #3048 А, решение #3054; spec 70 §4.2): ONE estimate for the whole job — which one a measurement's
 * lines go to. 1) the estimate with its lines (`own`); 2) else the lead's / the address's open DRAFT without them; 3) else its sent
 * one without an answer (it becomes «Изменена после отправки» — «Отправить изменения», #2637); 4) else a new one. A signed or a
 * declined one is never joined (a signed one gets «Доп. смета», #2728).
 */
export type EstimateTarget = { kind: "own"; estimate: Estimate } | { kind: "join"; estimate: Estimate } | { kind: "new" };
export function estimateTarget(db: Pick<DB, "estimates">, m: Pick<MeasurementRow, "id" | "leadId" | "propertyId">): EstimateTarget {
  const own = estimateOfMeasurement(db, m.id);
  if (own) return { kind: "own", estimate: own };
  const open = otherEstimates(db, m).filter((e) => !SIGNED.has(e.status));
  const pick = open.find((e) => e.status === "draft") ?? open.find((e) => e.status === "sent");
  return pick ? { kind: "join", estimate: pick } : { kind: "new" };
}

/**
 * #3027 (spec 70 §4.1 А): does the estimate step run BY ITSELF now («Готово» on the canvas, a draft just linked)? Yes for a new
 * estimate, for joining an open one (a sent one too — #3048 А) and for a draft of its own the drawing changed after. A sent or a
 * signed one of its own is never changed by itself: the card's step asks («Перенести изменения» → «Отправить изменения»; «Доп. смета»).
 */
export function autoEstimate(db: Pick<DB, "estimates"> & Partial<Pick<DB, "moduleData" | "company">>, m: Pick<MeasurementRow, "id" | "status" | "leadId" | "propertyId"> | null, hasElements: boolean): boolean {
  const a = estimateAction(db, m, hasElements);
  if (a.kind === "make") return true;
  if (a.kind !== "update") return false;
  return db.estimates.find((e) => e.id === a.estimateId)?.status === "draft";
}

/** the measurement's own section in an option (spec 70 §4.3: «Gutters» — the measurement's lines; a person's own lines outside it) */
export const sectionIdOf = (measurementId: string) => `${KEY}:${measurementId}`.slice(0, 64);
/** the option with the measurement's section (put first once, when its lines first come) and its lines without a section put in it */
function withSection<O extends EstimateDoc["options"][number]>(o: O, measurementId: string, title: string): O {
  if (!o.lines.some((l) => ofMeasurement(l, measurementId))) return o;
  const secs = Array.isArray(o.sections) ? o.sections : [];
  // a saved new version of a sent estimate gives every section a new id (reIdDoc, the lines follow): the measurement's section is the one
  // its lines already stand in — never a second one
  const held = o.lines.find((l) => ofMeasurement(l, measurementId) && !!l.sectionId && secs.some((x) => x?.id === l.sectionId))?.sectionId;
  const id = held ?? sectionIdOf(measurementId);
  const has = secs.some((x) => x?.id === id);
  if (!has && secs.length >= SECTIONS_MAX) return o;
  const sections = has ? secs : [{ id, title: title.slice(0, SECTION_TITLE_MAX), kind: "module" as const, module: KEY }, ...secs];
  return { ...o, sections, lines: o.lines.map((l) => (ofMeasurement(l, measurementId) && !l.sectionId ? { ...l, sectionId: id } : l)) };
}

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

/** what the module wrote, key → quantity (П23.1 `source`), of one option's lines of this measurement; lines kept by hand («gone») are not the module's */
function writtenQty(lines: readonly { source?: unknown }[], measurementId: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of lines) {
    const s = sourceOf(l);
    if (!ofMeasurement(l, measurementId) || !s || s.gone || typeof s.key !== "string") continue;
    out.set(s.key, String(s.qty));
  }
  return out;
}

/**
 * The measurement's lines as «Обновить» would write them now, key → quantity (#1776): its drawing, the company's rules,
 * the same `linesFromParts` («как будет»; prices are not part of it — a price change is not the engine's).
 */
export function linesNowOf(db: Partial<Pick<DB, "moduleData" | "company">>, measurementId: string): Map<string, string> {
  const all = gutterData(db).elements;
  const settings = db.company?.modules?.gutters?.settings;
  // the list of measurements asks this for every old draft on every render: one count per drawing and settings (review of #1776)
  let memo = nowMemo.get(all);
  if (!memo || memo.settings !== settings) nowMemo.set(all, (memo = { settings, byM: new Map() }));
  const hit = memo.byM.get(measurementId);
  if (hit) return hit;
  const d = fromElements(all.filter((x) => x.measurementId === measurementId));
  const out = d.runs.length
    ? writtenQty(linesFromParts(computeGutterParts(toMeasurement(d, { method: readRules(settings).corner }), toRulesOverride(settings)).parts, [], () => "", () => "", undefined, measurementId), measurementId)
    : new Map<string, string>();
  memo.byM.set(measurementId, out);
  return out;
}
const nowMemo = new WeakMap<readonly ElementRow[], { settings: unknown; byM: Map<string, Map<string, string>> }>();

const sameQty = (a: Map<string, string>, b: Map<string, string>) => a.size === b.size && [...a].every(([k, q]) => b.has(k) && Number(b.get(k)) === Number(q));

/**
 * «Расчёт изменился — обновите» (#1165): the measurement's lines in this estimate were computed by an older engine AND
 * «Обновить» would change them now (#1776, director №13 16.11: a rule that changes nothing here says nothing — a corrugated
 * downspout, a round one, elbows set by hand). Only a DRAFT is told: a sent estimate stays as it went to the client, a
 * signed one is never changed. An emptied drawing says nothing («Обновить» makes no lines of it, as `staleMeasurements`).
 * Without the module's data (`db` without `moduleData`) the drawing can not be read: an older engine alone says it (a draft).
 */
export function engineChangedFor(e: Estimate | undefined, measurementId: string, now: string = GUTTER_PARTS_VERSION, db?: Partial<Pick<DB, "moduleData" | "company">>): boolean {
  if (!e || e.status !== "draft") return false;
  const opts = (e.doc?.options ?? []).filter((o) => o.lines.some((l) => ofMeasurement(l, measurementId) && engineOlder(sourceOf(l)?.engineVersion, now)));
  if (!opts.length) return false;
  if (!db || !("moduleData" in db)) return true;
  if (!gutterData(db).elements.some((x) => x.measurementId === measurementId && x.kind === "run")) return false;
  const willBe = linesNowOf(db, measurementId);
  return opts.some((o) => !sameQty(writtenQty(o.lines, measurementId), willBe));
}

/**
 * #1165: the measurements of this estimate whose lines «Обновить» would change because the engine's rule changed since
 * (`engineChangedFor`) — the estimate is still theirs (no newer one took over). A hint «расчёт изменился — обновите», on a
 * draft only.
 */
export function engineStaleMeasurements(db: Pick<DB, "estimates" | "moduleData"> & Partial<Pick<DB, "company">>, e: Estimate, now: string = GUTTER_PARTS_VERSION): MeasurementRow[] {
  return gutterData(db).measurements.filter((m) => hasLinesOf(e, m.id) && estimateOfMeasurement(db, m.id)?.id === e.id && engineChangedFor(e, m.id, now, db));
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
export function estimateAction(db: Pick<DB, "estimates"> & Partial<Pick<DB, "moduleData" | "company">>, m: Pick<MeasurementRow, "id" | "status" | "leadId" | "propertyId"> | null, hasElements: boolean): EstimateAction {
  if (!m || !hasElements) return { kind: "none" };
  const e = estimateOfMeasurement(db, m.id);
  if (e && SIGNED.has(e.status)) return { kind: "open", estimateId: e.id, signed: true };
  // an estimate the engine computed in an older version is updated too, though the drawing is as it was (#1165)
  if (e) return m.status === "ready" && !engineChangedFor(e, m.id, GUTTER_PARTS_VERSION, db) ? { kind: "open", estimateId: e.id } : { kind: "update", estimateId: e.id };
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
export function docWithLines(prev: EstimateDoc | undefined, next: readonly ModuleLine[], measurementId: string, fresh: () => EstimateDoc, catalog: readonly CatalogItem[] = [], section?: string): EstimateDoc {
  const sec = (d: EstimateDoc): EstimateDoc => (section ? { ...d, options: d.options.map((o) => withSection(o, measurementId, section)) } : d);
  if (!prev) {
    const d = fresh();
    return sec({ ...d, options: d.options.map((o, i) => (i === 0 ? { ...o, lines: [...(next as EstimateDoc["options"][number]["lines"])] } : o)) });
  }
  const touched = prev.options.some((o) => o.lines.some((l) => ofMeasurement(l, measurementId)));
  return sec({
    ...prev,
    options: prev.options.map((o, i) => {
      const mine = o.lines.some((l) => ofMeasurement(l, measurementId));
      // no option has lines of it (they were all removed by hand): the first option gets them again
      if (!mine && (touched || i > 0)) return o;
      const out = resyncLines(o.lines as ModuleLine[], next, (l) => sourceOf(l)?.module === KEY && !ofMeasurement(l, measurementId), catalog);
      return { ...o, lines: out as typeof o.lines };
    }),
  });
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
  /** #3027: the title of the measurement's section in the estimate, in the CLIENT's language («Gutters · по замеру 11/26») */
  section?: string;
  /** the drawing as the client sees it (the sheet, #739) — in the CLIENT's language, no prices; none — the estimate's
   *  page of this measurement is left as it is */
  page?: DocAttachPage;
}

export type MakeResult =
  | { ok: true; estimateId: string; undo: GuardedUndo; updated: boolean; /** #3027: put into the lead's / the address's open estimate */ joined?: true }
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
  // #3027: one estimate for the job — its own, else the lead's / the address's open one (a section «Gutters» in it), else a new one
  const to = estimateTarget(db, x.m);
  const e = to.kind === "new" ? undefined : to.estimate;
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
  if (e) target = { customerId: e.customerId, propertyId: e.propertyId, undo: NO_UNDO, ...(e.leadId ? { leadId: e.leadId } : {}) };
  if (!target && x.m.leadId && db.leads.some((l) => l.id === x.m.leadId)) {
    const t = store.leadEstimateTarget(x.m.leadId);
    if (t) target = { ...t, leadId: x.m.leadId };
  }
  if (!target && x.m.propertyId) {
    const p = db.properties.find((q) => q.id === x.m.propertyId);
    if (p) target = { customerId: p.customerId, propertyId: p.id, undo: NO_UNDO };
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
  const withLines = docWithLines(e?.doc, lines, x.m.id, () => newDoc(db.company?.estimate?.depositBps), x.catalog, x.section);
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
    updated: to.kind === "own",
    ...(to.kind === "join" ? { joined: true as const } : {}),
    // the estimate, the measurement a draft again («Смета» stays in reach; the revision itself is history, it stays) and
    // the lead's new client: all of them go back or none (DS §15.2)
    undo: undoAll(store, [t.undo, undoReady, undoSave]),
  };
}

/* ---------- «Удалить замер» with an estimate on it (#2013) ---------- */

/** the open estimates with this measurement's lines: drafts (their lines are let go of the measurement) and sent ones (left as they are) */
export function estimatesOn(db: Pick<DB, "estimates">, measurementId: string): { drafts: Estimate[]; sent: Estimate[] } {
  const mine = db.estimates.filter((e) => !SIGNED.has(e.status) && e.status !== "declined" && hasLinesOf(e, measurementId));
  return { drafts: mine.filter((e) => e.status === "draft"), sent: mine.filter((e) => e.status === "sent") };
}

/**
 * The estimate's lines of this measurement become ordinary lines (#2013, director's option Б): the same name, quantity, price, cost —
 * only the module's mark goes (no «Из замера», no «Обновить из замера» to a measurement that is gone). The drawing's page in the
 * document is a picture of what was counted (withMeasurementPage): it stays. The same document back when nothing is of it.
 */
export function detachDoc(doc: EstimateDoc, measurementId: string): EstimateDoc {
  let changed = false;
  const options = doc.options.map((o) => ({
    ...o,
    lines: o.lines.map((l) => {
      if (!ofMeasurement(l, measurementId)) return l;
      changed = true;
      const { source: _s, ...rest } = l as typeof l & { source?: unknown };
      return rest as typeof l;
    }),
  }));
  return changed ? { ...doc, options } : doc;
}

/** who deletes: a tech edits only the estimates he made (the server's can_edit_estimate: created_by = auth.uid()) */
export interface Deleter { role: string; me?: string | null }
const mayEdit = (e: Estimate, w: Deleter) => w.role !== "tech" || (!!w.me && e.createdBy === w.me);

/**
 * What stops «Удалить замер» (#2013): a signed estimate on it (never deleted — the server refuses too), or a draft estimate on it this
 * person may not change (a tech and the office's draft: its lines could not be let go — the server would refuse the estimate's save
 * and keep the removal). Null — it may go.
 */
export function deleteBlock(db: Pick<DB, "estimates">, measurementId: string, w: Deleter): "signed" | "notYours" | null {
  if (signedOn(db, measurementId)) return "signed";
  return estimatesOn(db, measurementId).drafts.some((e) => !mayEdit(e, w)) ? "notYours" : null;
}

/**
 * «Удалить замер» (#2013): the measurement goes (soft, removeMeasurement) FIRST — not removed (the module is off meanwhile), nothing else
 * is written; then its draft estimates keep their lines as ordinary ones (one save each, through the core's save — money through the
 * engine, the queue); a sent estimate is not touched (its status and the client's copy stay — the director, 17.11). One «Отменить» takes
 * all of it back, offline too. Null — nothing done (blocked: deleteBlock, or nothing to delete).
 */
export function removeMeasurementDetached(store: ModuleEstimateStore & { role?: string }, measurementId: string, w: Deleter = { role: store.role ?? "owner", me: store.db.me }): GuardedUndo | null {
  if (deleteBlock(store.db, measurementId, w)) return null;
  const { drafts } = estimatesOn(store.db, measurementId);
  const del = removeMeasurement(store, measurementId);
  if (!del) return null;
  const saves = drafts.map((e) =>
    store.saveEstimate({ id: e.id, customerId: e.customerId, propertyId: e.propertyId, title: e.title, doc: detachDoc(e.doc!, measurementId), ...(e.leadId ? { leadId: e.leadId } : {}) }),
  );
  return undoAll(store, [del, ...saves]);
}
