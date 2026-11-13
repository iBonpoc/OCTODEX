/**
 * The Gutters module's data on the phone and on the server (docs/specs/33-gutters-screens.md П21; tables — П19).
 * On the phone: DB.moduleData.gutters (the core never looks inside). Read: `loadGutters` (ModuleDef.load). Written: one
 * module.op per change (`guttersOps`, ModuleDef.ops):
 *   measurement.save  {m}   a FULL write of the measurement row, coalesceKey = its id (sent before its elements: FK)
 *   element.save      {e}   a FULL write of one element, coalesceKey = its id (П15.6)
 *   element.remove    {id}  deleted_at; no key — never merged, keeps its place after the element's save
 *   measurement.remove {id} deleted_at; no key
 *   photo.add         {f}   a photo of the measurement or of one element: a files row (measurement_id, element_id) and
 *                           the bytes through the core's upload (spec П21.10); no key; `made` = the file id
 *   photo.remove      {id}  deleted_at of that files row; no key
 *   revision.add      {r}   a snapshot when «Смета» / «Обновить смету» is pressed (M8b, П23.8): insert or nothing (a replay
 *                           adds nothing); the number is the server's (trigger t03, T98) — the phone sends 1
 * The photos live in the core's DB.files (one list of files), the measurement only names them.
 * Pure but for `guttersOps` (the supabase client).
 */
import type { DB, FileItem } from "@/data/types";
import { supabase } from "@/cloud/client";
import { PermanentError, uploadPhoto } from "@/cloud/ops";
import type { ModuleOpHandler, ModuleRead, ModuleStore } from "../registry";
import type { ElementRow, MeasurementRow } from "./canvas/model";
import { type GuardedUndo, markOf, NO_UNDO, TOO_LATE } from "@/data/undo";

export const KEY = "gutters";
export const K = { mSave: "measurement.save", mRemove: "measurement.remove", eSave: "element.save", eRemove: "element.remove", pAdd: "photo.add", pRemove: "photo.remove", rAdd: "revision.add" } as const;

export interface GutterData {
  measurements: MeasurementRow[];
  elements: ElementRow[];
}
const EMPTY: GutterData = { measurements: [], elements: [] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** the module's slice of the phone's data (absent or broken → empty) */
/** «Отменить» of several of the module's changes made together (in the order made): all of them or none — the store's
 *  undoTogether (DS §15.2); an older test store without it — one by one, the last first */
export function undoAll(store: Pick<ModuleStore, "undoTogether">, undos: readonly unknown[]): GuardedUndo {
  // what moduleOp gave (the store's undo, or null when the module is off) and the core's own undos; anything else is not
  // an undo — the whole «Отменить» is refused then, never a part silently left out (the director's review of #1279)
  // NO_UNDO — «nothing to take back» (a target the client already has, a refused action): no part, as undoTogether skips it
  const parts = undos.filter((u) => u != null && u !== NO_UNDO);
  if (parts.some((u) => !markOf(u))) {
    console.error("[undo] undoAll got a function the store did not make — refused");
    return TOO_LATE;
  }
  if (store.undoTogether) return store.undoTogether(parts as GuardedUndo[]);
  // an older test store without undoTogether: nothing to take back together
  return NO_UNDO;
}

/** what the module store's moduleOp gave, as the toast takes it: the store's own undo (mutate) — the module not active —
 *  null. Any other function is not an undo (NO_UNDO): a module never makes one of its own (the director's review of
 *  #1279 Б2; test/undoBrand.test.ts) */
export const asUndo = (u: unknown): GuardedUndo | null => (u == null ? null : markOf(u) ? (u as GuardedUndo) : NO_UNDO);

export function gutterData(db: Pick<DB, "moduleData"> | null | undefined): GutterData {
  const g = db?.moduleData?.[KEY];
  if (!isObj(g) || !Array.isArray(g.measurements) || !Array.isArray(g.elements)) return EMPTY;
  return g as unknown as GutterData;
}
export const withGutterData = (db: DB, f: (g: GutterData) => GutterData): DB => ({ ...db, moduleData: { ...db.moduleData, [KEY]: f(gutterData(db)) } });

/* ---------- local changes (the apply of each module.op) ---------- */
export const putMeasurement = (m: MeasurementRow) => (g: GutterData): GutterData => ({ ...g, measurements: [...g.measurements.filter((x) => x.id !== m.id), m] });
export const putElement = (e: ElementRow) => (g: GutterData): GutterData => ({ ...g, elements: [...g.elements.filter((x) => x.id !== e.id), e] });
export const dropElement = (id: string) => (g: GutterData): GutterData => ({ ...g, elements: g.elements.filter((x) => x.id !== id) });
export const dropMeasurement = (id: string) => (g: GutterData): GutterData => ({
  measurements: g.measurements.filter((x) => x.id !== id),
  elements: g.elements.filter((x) => x.measurementId !== id),
});

/** one measurement and its elements, or null */
export function measurementOf(g: GutterData, id: string): { m: MeasurementRow; elements: ElementRow[] } | null {
  const m = g.measurements.find((x) => x.id === id);
  return m ? { m, elements: g.elements.filter((e) => e.measurementId === id) } : null;
}

/** the module's data as a place gets it (DB.moduleData.gutters, unknown to the core) */
export const asGutterData = (data: unknown): GutterData => gutterData({ moduleData: { [KEY]: data } });

/**
 * the newest measurement of a lead or a property (the place's «Открыть замер»), or undefined. A property also finds the
 * measurements of its leads (`leadIds`): a lead that got the address (S3, conversion, S8b, merge) keeps its measurement
 * with an empty property — it shows on the address without a write (spec 33 П24 Б4, S4h, #704)
 */
export function latestFor(g: GutterData, by: { leadId?: string; propertyId?: string; leadIds?: readonly string[] }): MeasurementRow | undefined {
  const of = g.measurements.filter((m) =>
    by.leadId ? m.leadId === by.leadId : (!!by.propertyId && m.propertyId === by.propertyId) || (!!m.leadId && !!by.leadIds?.includes(m.leadId)),
  );
  return of.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
}

/** the module's two doors of a measurement: the canvas (a new one is drawn there) and its card («Просмотр замера») */
export interface MeasureDoors {
  draw: string;
  view: string;
}

/**
 * where «Замер желобов» goes for a lead / an address (spec 33 П25.3 В): its newest measurement's card, else the canvas
 * of a new one linked to it (nothing to look at yet; «Готово» → the card)
 */
export function measureHref(to: MeasureDoors, g: GutterData, by: { leadId?: string; propertyId?: string; leadIds?: readonly string[] }): { href: string; open?: MeasurementRow } {
  const m = latestFor(g, by);
  if (m) return { href: `${to.view}?m=${encodeURIComponent(m.id)}`, open: m };
  const draw = to.draw;
  const q = [by.leadId ? `lead=${encodeURIComponent(by.leadId)}` : "", by.propertyId ? `property=${encodeURIComponent(by.propertyId)}` : ""].filter(Boolean).join("&");
  return { href: `${draw}?${q}` };
}

/**
 * «Замер желобов» on a client's card (spec 33 П24 А3, #697): the measurement is always an address's — one address →
 * straight to it; several → pick; none → the client's card says to add one first
 */
export function clientStart(to: MeasureDoors, db: Pick<DB, "moduleData" | "leads" | "properties">, customerId: string) {
  const g = gutterData(db);
  const places = db.properties.filter((p) => p.customerId === customerId);
  const go = (propertyId: string) => measureHref(to, g, { propertyId, leadIds: db.leads.filter((l) => l.propertyId === propertyId).map((l) => l.id) }).href;
  if (!places.length) return { kind: "none" as const };
  if (places.length === 1) return { kind: "go" as const, href: go(places[0]!.id) };
  return { kind: "pick" as const, places: places.map((p) => ({ id: p.id, address: p.address, city: p.city, href: go(p.id) })) };
}

/** the measurement's own fields (what measurement.save writes) */
export const ownFields = (m: MeasurementRow): MeasurementRow => ({ id: m.id, label: m.label, status: m.status, propertyId: m.propertyId, leadId: m.leadId, ...(m.accuracy ? { accuracy: m.accuracy } : {}) });

/**
 * #1265: a waiting op written again from the phone's data (an earlier change folded into it was taken back): a
 * measurement's save — its row now; an element's — the element now; gone from the phone, or another kind — null. The
 * row as the phone holds it after the undo: so the op carries every later change folded into it (B, C…) and none of the
 * one taken back (the director's review of #1279 №4).
 */
export function rebuildOp(op: { kind: string; payload: Record<string, unknown> }, d: DB): Record<string, unknown> | null {
  const g = gutterData(d);
  if (op.kind === K.mSave) {
    const id = (op.payload.m as { id?: unknown } | undefined)?.id;
    const m = g.measurements.find((x) => x.id === id);
    return m ? { ...op.payload, m: ownFields(m) } : null;
  }
  if (op.kind === K.eSave) {
    const id = (op.payload.e as { id?: unknown } | undefined)?.id;
    const e = g.elements.find((x) => x.id === id);
    return e ? { ...op.payload, e: e as ElementRow & Record<string, unknown> } : null;
  }
  return null;
}

/**
 * S1b «Сделать заявкой»: the new lead made from a draft takes it (ModuleDef.leadCreated). A measurement the store does
 * not have (never saved) or one already on a lead — nothing. Returns the store's «Отменить».
 */
export function linkLead(store: ModuleStore, ref: string, leadId: string): GuardedUndo | null {
  const m = gutterData(store.db).measurements.find((x) => x.id === ref);
  if (!m || m.leadId) return null;
  const row = { ...ownFields(m), leadId };
  const undo = store.moduleOp(KEY, { kind: K.mSave, payload: { m: row }, apply: (d) => withGutterData(d, putMeasurement({ ...m, leadId })), coalesceKey: m.id, made: [m.id] });
  return asUndo(undo);
}

/**
 * «Привязать» (founder 09.11, версия 475): a draft for nobody goes to a client's address (the client's place shows it,
 * «Открыть замер»). A measurement the store does not have, or one already on a lead or an address — nothing.
 */
export function linkProperty(store: ModuleStore, ref: string, propertyId: string): GuardedUndo | null {
  const m = gutterData(store.db).measurements.find((x) => x.id === ref);
  if (!m || m.leadId || m.propertyId) return null;
  const row = { ...ownFields(m), propertyId };
  const undo = store.moduleOp(KEY, { kind: K.mSave, payload: { m: row }, apply: (d) => withGutterData(d, putMeasurement({ ...m, propertyId })), coalesceKey: m.id, made: [m.id] });
  return asUndo(undo);
}

/**
 * «Привязать к другому» / «Отвязать» (founder 09.11, #692; spec 33 П24 Б5): a measurement linked by mistake goes to
 * another lead or address, or back to the drafts (`null`). Unlike linkLead / linkProperty an existing link is replaced:
 * a lead → the lead only, an address → the address only. Returns the store's «Отменить».
 */
export function relink(store: ModuleStore, ref: string, to: { leadId: string } | { propertyId: string } | null): GuardedUndo | null {
  const m = gutterData(store.db).measurements.find((x) => x.id === ref);
  if (!m) return null;
  const next: MeasurementRow = { ...m, leadId: to && "leadId" in to ? to.leadId : null, propertyId: to && "propertyId" in to ? to.propertyId : null };
  if (next.leadId === m.leadId && next.propertyId === m.propertyId) return null;
  const undo = store.moduleOp(KEY, { kind: K.mSave, payload: { m: ownFields(next) }, apply: (d) => withGutterData(d, putMeasurement(next)), coalesceKey: m.id, made: [m.id] });
  return asUndo(undo);
}

/**
 * «Удалить замер» (founder 09.11, #690; П24 Б6): soft (the server sets deleted_at), its elements go with it on the
 * phone. Not when a signed estimate stands on it — the caller checks (estimateLink.signedOn); the server refuses too.
 */
export function removeMeasurement(store: ModuleStore, ref: string): GuardedUndo | null {
  const g = gutterData(store.db);
  if (!g.measurements.some((x) => x.id === ref)) return null;
  const undo = store.moduleOp(KEY, {
    kind: K.mRemove,
    payload: { id: ref },
    apply: (d) => withGutterData(d, (x) => ({ ...x, measurements: x.measurements.filter((m) => m.id !== ref), elements: x.elements.filter((e) => e.measurementId !== ref) })),
    coalesceKey: ref,
  });
  return asUndo(undo);
}

/**
 * «Точность замера» from the measurement's card (spec 33 П25.3 Б1; the same choice as the canvas's «⋯», #739): only the
 * measurement's own field — the drawing is not changed, so its status (made into an estimate or not) stays.
 */
export function setAccuracy(store: ModuleStore, ref: string, accuracy: "rough" | "tape"): GuardedUndo | null {
  const m = gutterData(store.db).measurements.find((x) => x.id === ref);
  if (!m || (m.accuracy ?? "rough") === accuracy) return null;
  const next: MeasurementRow = { ...m, accuracy };
  const undo = store.moduleOp(KEY, { kind: K.mSave, payload: { m: ownFields(next) }, apply: (d) => withGutterData(d, putMeasurement(next)), coalesceKey: m.id, made: [m.id] });
  return asUndo(undo);
}

/**
 * The rows of a copy (pure): a new measurement with the same link and accuracy, a draft (no estimate of it yet); every
 * element with a new id — a downspout follows its gutter's new id. No estimates, sends or photos (spec 33 П25.3 Г).
 */
export function copyRows(m: MeasurementRow, elements: readonly ElementRow[], newId: () => string): { m: MeasurementRow; elements: ElementRow[] } {
  const id = newId();
  const ids = new Map(elements.map((e) => [e.id, newId()]));
  const copy: MeasurementRow = { id, label: m.label, status: "draft", propertyId: m.propertyId, leadId: m.leadId, ...(m.accuracy ? { accuracy: m.accuracy } : {}) };
  return {
    m: copy,
    elements: elements.map((e) => {
      const runId = (e.geom as { runId?: unknown }).runId;
      const geom = e.kind === "downspout" && typeof runId === "string" ? { ...e.geom, runId: ids.get(runId) ?? runId } : { ...e.geom };
      return { ...e, id: ids.get(e.id)!, measurementId: id, geom, attrs: { ...e.attrs } };
    }),
  };
}

/**
 * «Дублировать» (spec 33 П25.3 Г): the copy is written as the canvas writes a new one — the measurement first (its
 * elements refer to it), then each element. One «Отменить» takes all of it back. The module not active → nothing.
 */
export function duplicateMeasurement(store: ModuleStore, ref: string, newId: () => string, now = () => new Date().toISOString()): { id: string; undo: GuardedUndo } | null {
  const v = measurementOf(gutterData(store.db), ref);
  if (!v) return null;
  const c = copyRows(v.m, v.elements, newId);
  const at = now();
  const undos: GuardedUndo[] = [];
  const put = (u: unknown) => {
    const undo = asUndo(u);
    if (undo) undos.push(undo);
    return u != null;
  };
  const row: MeasurementRow = { ...c.m, updatedAt: at };
  if (!put(store.moduleOp(KEY, { kind: K.mSave, payload: { m: ownFields(c.m) }, apply: (d) => withGutterData(d, putMeasurement(row)), coalesceKey: c.m.id, made: [c.m.id] }))) return null;
  for (const e of c.elements) put(store.moduleOp(KEY, { kind: K.eSave, payload: { e: e as ElementRow & Record<string, unknown> }, apply: (d) => withGutterData(d, putElement(e)), coalesceKey: e.id, made: [e.id] }));
  return { id: c.m.id, undo: undoAll(store, undos) };
}

/** what «Привязать» offers for a typed text: open leads and clients by name (and a lead's address), the first few */
export function linkChoices(db: Pick<DB, "leads" | "customers" | "properties">, q: string, max = 8) {
  const s = q.trim().toLowerCase();
  const hit = (...xs: (string | undefined)[]) => !s || xs.some((x) => x?.toLowerCase().includes(s));
  const leads = db.leads.filter((l) => l.status !== "won" && l.status !== "lost" && l.status !== "declined" && hit(l.name, l.address)).slice(0, max);
  const clients = db.customers
    .filter((c) => hit(c.name))
    .slice(0, max)
    .map((c) => ({ c, places: db.properties.filter((p) => p.customerId === c.id) }));
  return { leads, clients };
}

/* ---------- the server's rows ---------- */
const KINDS = new Set(["run", "downspout"]);
const CONF = new Set(["auto", "drawn", "taped"]);

export function measurementFromRow(r: Record<string, unknown>): MeasurementRow | null {
  const id = str(r.id);
  if (!id) return null;
  return {
    id,
    label: str(r.label),
    status: r.status === "ready" ? "ready" : "draft",
    propertyId: str(r.property_id),
    leadId: str(r.lead_id),
    accuracy: r.accuracy === "tape" ? "tape" : "rough",
    ...(str(r.updated_at) ? { updatedAt: str(r.updated_at)! } : {}),
  };
}
/** the kinds this version draws (run, downspout); a newer version's kinds are left out, so they are never «removed» */
export function elementFromRow(r: Record<string, unknown>): ElementRow | null {
  const id = str(r.id);
  const measurementId = str(r.measurement_id);
  if (!id || !measurementId || typeof r.kind !== "string" || !KINDS.has(r.kind)) return null;
  return {
    id,
    measurementId,
    kind: r.kind as ElementRow["kind"],
    geom: isObj(r.geom) ? r.geom : {},
    attrs: isObj(r.attrs) ? r.attrs : {},
    confidence: typeof r.confidence === "string" && CONF.has(r.confidence) ? (r.confidence as ElementRow["confidence"]) : "drawn",
  };
}

/** ModuleDef.load: the company's live measurements and their live elements (RLS: what this person sees) */
export async function loadGutters(read: ModuleRead): Promise<GutterData> {
  const [ms, es] = await Promise.all([
    read.live("gutter_measurements", "id, property_id, lead_id, label, status, accuracy, updated_at"),
    read.live("gutter_measurement_elements", "id, measurement_id, kind, geom, attrs, confidence"),
  ]);
  const measurements = ms.map(measurementFromRow).filter((x): x is MeasurementRow => !!x);
  const ids = new Set(measurements.map((m) => m.id));
  const elements = es.map(elementFromRow).filter((x): x is ElementRow => !!x && ids.has(x.measurementId));
  return { measurements, elements };
}

/* ---------- photos (spec П21.10) ---------- */
/** the photos of a measurement (elementId undefined), of one element (an id), newest last */
export function photosOf(db: Pick<DB, "files">, measurementId: string, elementId?: string | null): FileItem[] {
  return (db.files ?? [])
    .filter((f) => f.kind === "photo" && f.measurementId === measurementId && (elementId === undefined ? !f.elementId : f.elementId === elementId))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** a photo of the measurement (or of its element): on the phone at once, to the server through the queue */
export function addPhoto(store: ModuleStore, x: { id: string; measurementId: string; elementId?: string | null; uri?: string; at: string }) {
  const f: FileItem = { id: x.id, kind: "photo", measurementId: x.measurementId, ...(x.elementId ? { elementId: x.elementId } : {}), ...(x.uri ? { uri: x.uri } : {}), at: x.at };
  return store.moduleOp(KEY, {
    kind: K.pAdd,
    payload: { f: { id: f.id, measurementId: f.measurementId, elementId: f.elementId ?? null, uri: f.uri ?? null } },
    apply: (d) => ({ ...d, files: [...(d.files ?? []).filter((y) => y.id !== f.id), f] }),
    made: [f.id],
  });
}

/** a photo removed (deleted_at); the returned undo puts it back (rule 5) */
export function removePhoto(store: ModuleStore, id: string) {
  return asUndo(store.moduleOp(KEY, { kind: K.pRemove, payload: { id }, apply: (d) => ({ ...d, files: (d.files ?? []).filter((y) => y.id !== id) }) }));
}

/* ---------- module.op → the server ---------- */
export const measurementToDb = (m: MeasurementRow, companyId: string) => ({
  id: m.id, company_id: companyId, property_id: m.propertyId ?? null, lead_id: m.leadId ?? null, label: m.label, status: m.status, ...(m.accuracy ? { accuracy: m.accuracy } : {}), deleted_at: null,
});
export const elementToDb = (e: ElementRow, companyId: string) => ({
  id: e.id, company_id: companyId, measurement_id: e.measurementId, kind: e.kind, geom: e.geom, attrs: e.attrs, confidence: e.confidence, deleted_at: null,
});

const bad = (what: string) => new PermanentError(`gutters: ${what}`, 400, "22023");

export const guttersOps: ModuleOpHandler = async (op, { companyId, run }) => {
  const p = op.payload;
  const now = new Date().toISOString();
  switch (op.kind) {
    case K.mSave: {
      const m = isObj(p.m) ? measurementFromRow({ ...p.m, property_id: p.m.propertyId, lead_id: p.m.leadId }) : null;
      if (!m) throw bad("measurement.save without a measurement");
      return run(supabase.from("gutter_measurements").upsert(measurementToDb(m, companyId), { onConflict: "id" }));
    }
    case K.eSave: {
      const e = isObj(p.e) ? elementFromRow({ ...p.e, measurement_id: p.e.measurementId }) : null;
      if (!e) throw bad("element.save without an element");
      return run(supabase.from("gutter_measurement_elements").upsert(elementToDb(e, companyId), { onConflict: "id" }));
    }
    case K.eRemove:
    case K.mRemove: {
      const id = str(p.id);
      if (!id) throw bad(`${op.kind} without an id`);
      const table = op.kind === K.eRemove ? "gutter_measurement_elements" : "gutter_measurements";
      return run(supabase.from(table).update({ deleted_at: now }).eq("id", id).eq("company_id", companyId));
    }
    case K.pAdd: {
      const f = isObj(p.f) ? p.f : null;
      const id = f && str(f.id);
      const mid = f && str(f.measurementId);
      if (!f || !id || !mid) throw bad("photo.add without a photo");
      const eid = str(f.elementId);
      await run(
        supabase.from("files").upsert(
          { id, company_id: companyId, kind: "photo", measurement_id: mid, element_id: eid ?? null, taken_at: now },
          { onConflict: "id", ignoreDuplicates: true },
        ),
      );
      const uri = str(f.uri);
      if (uri) await uploadPhoto(companyId, id, uri);
      return;
    }
    case K.pRemove: {
      const id = str(p.id);
      if (!id) throw bad("photo.remove without an id");
      return run(supabase.from("files").update({ deleted_at: now }).eq("id", id).eq("company_id", companyId));
    }
    case K.rAdd: {
      const r = isObj(p.r) ? p.r : null;
      const id = r && str(r.id);
      const mid = r && str(r.measurementId);
      if (!r || !id || !mid || !Array.isArray(r.elements) || !Array.isArray(r.parts)) throw bad("revision.add without a revision");
      return run(
        supabase.from("gutter_measurement_revisions").upsert(
          { id, company_id: companyId, measurement_id: mid, revision: 1, elements: r.elements, parts: r.parts, engine_version: str(r.engineVersion) ?? "unknown" },
          { onConflict: "id", ignoreDuplicates: true },
        ),
      );
    }
    default:
      throw bad(`unknown change ${op.kind}`);
  }
};
