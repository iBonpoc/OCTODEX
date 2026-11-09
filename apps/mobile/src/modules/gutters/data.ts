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

/** the newest measurement of a lead or a property (the place's «Открыть замер»), or undefined */
export function latestFor(g: GutterData, by: { leadId?: string; propertyId?: string }): MeasurementRow | undefined {
  const of = g.measurements.filter((m) => (by.leadId ? m.leadId === by.leadId : !!by.propertyId && m.propertyId === by.propertyId));
  return of.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
}

/** the measurement's own fields (what measurement.save writes) */
export const ownFields = (m: MeasurementRow): MeasurementRow => ({ id: m.id, label: m.label, status: m.status, propertyId: m.propertyId, leadId: m.leadId, ...(m.accuracy ? { accuracy: m.accuracy } : {}) });

/**
 * S1b «Сделать заявкой»: the new lead made from a draft takes it (ModuleDef.leadCreated). A measurement the store does
 * not have (never saved) or one already on a lead — nothing. Returns the store's «Отменить».
 */
export function linkLead(store: ModuleStore, ref: string, leadId: string): (() => void) | null {
  const m = gutterData(store.db).measurements.find((x) => x.id === ref);
  if (!m || m.leadId) return null;
  const row = { ...ownFields(m), leadId };
  const undo = store.moduleOp(KEY, { kind: K.mSave, payload: { m: row }, apply: (d) => withGutterData(d, putMeasurement({ ...m, leadId })), coalesceKey: m.id, made: [m.id] });
  return typeof undo === "function" ? (undo as () => void) : null;
}

/**
 * «Привязать» (founder 09.11, версия 475): a draft for nobody goes to a client's address (the client's place shows it,
 * «Открыть замер»). A measurement the store does not have, or one already on a lead or an address — nothing.
 */
export function linkProperty(store: ModuleStore, ref: string, propertyId: string): (() => void) | null {
  const m = gutterData(store.db).measurements.find((x) => x.id === ref);
  if (!m || m.leadId || m.propertyId) return null;
  const row = { ...ownFields(m), propertyId };
  const undo = store.moduleOp(KEY, { kind: K.mSave, payload: { m: row }, apply: (d) => withGutterData(d, putMeasurement({ ...m, propertyId })), coalesceKey: m.id, made: [m.id] });
  return typeof undo === "function" ? (undo as () => void) : null;
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
  return store.moduleOp(KEY, { kind: K.pRemove, payload: { id }, apply: (d) => ({ ...d, files: (d.files ?? []).filter((y) => y.id !== id) }) });
}

/* ---------- module.op → the server ---------- */
export const measurementToDb = (m: MeasurementRow, companyId: string) => ({
  id: m.id, company_id: companyId, property_id: m.propertyId, lead_id: m.leadId, label: m.label, status: m.status, ...(m.accuracy ? { accuracy: m.accuracy } : {}), deleted_at: null,
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
