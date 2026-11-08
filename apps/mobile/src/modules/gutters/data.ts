/**
 * The Gutters module's data on the phone and on the server (docs/specs/33-gutters-screens.md П21; tables — П19).
 * On the phone: DB.moduleData.gutters (the core never looks inside). Read: `loadGutters` (ModuleDef.load). Written: one
 * module.op per change (`guttersOps`, ModuleDef.ops):
 *   measurement.save  {m}   a FULL write of the measurement row, coalesceKey = its id (sent before its elements: FK)
 *   element.save      {e}   a FULL write of one element, coalesceKey = its id (П15.6)
 *   element.remove    {id}  deleted_at; no key — never merged, keeps its place after the element's save
 *   measurement.remove {id} deleted_at; no key
 * Pure but for `guttersOps` (the supabase client).
 */
import type { DB } from "@/data/types";
import { supabase } from "@/cloud/client";
import { PermanentError } from "@/cloud/ops";
import type { ModuleOpHandler, ModuleRead } from "../registry";
import type { ElementRow, MeasurementRow } from "./canvas/model";

export const KEY = "gutters";
export const K = { mSave: "measurement.save", mRemove: "measurement.remove", eSave: "element.save", eRemove: "element.remove" } as const;

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
    read.live("gutter_measurements", "id, property_id, lead_id, label, status, updated_at"),
    read.live("gutter_measurement_elements", "id, measurement_id, kind, geom, attrs, confidence"),
  ]);
  const measurements = ms.map(measurementFromRow).filter((x): x is MeasurementRow => !!x);
  const ids = new Set(measurements.map((m) => m.id));
  const elements = es.map(elementFromRow).filter((x): x is ElementRow => !!x && ids.has(x.measurementId));
  return { measurements, elements };
}

/* ---------- module.op → the server ---------- */
export const measurementToDb = (m: MeasurementRow, companyId: string) => ({
  id: m.id, company_id: companyId, property_id: m.propertyId, lead_id: m.leadId, label: m.label, status: m.status, deleted_at: null,
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
    default:
      throw bad(`unknown change ${op.kind}`);
  }
};
