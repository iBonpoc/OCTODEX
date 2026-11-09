/**
 * The drawing in the shape of the database (docs/specs/33-gutters-measurement-db.md П19; 33-gutters-canvas.md П20.2 №5–6).
 * M4 keeps it on the phone; M5 swaps the store for module.op (one op per element, coalesceKey = element id). Pure.
 * geom: run {a, b, lengthIn?}, downspout {runId, atIn} — whole inches; attrs: the engine's input for the element.
 */
import { DEFAULT_HANGER_BY_MOUNT } from "@octo/estimating-engine";
import type { Drawing, DrawnDownspout, DrawnRun, P } from "../geometry";

export interface MeasurementRow {
  id: string;
  label: string | null;
  status: "draft" | "ready";
  propertyId: string | null;
  leadId: string | null;
  /** how it was measured, for the whole drawing (founder 08.11, П20.16): a tape — good to cut by; rough — a satellite,
   *  a wheel or by eye. Old drafts on a phone have none: rough. */
  accuracy?: "rough" | "tape";
  /** the server's (or the phone's last) change time: the newest measurement of a lead opens first (M5b) */
  updatedAt?: string;
}
export type ElementKind = "run" | "downspout";
export interface ElementRow {
  id: string;
  measurementId: string;
  kind: ElementKind;
  geom: Record<string, unknown>;
  attrs: Record<string, unknown>;
  confidence: "auto" | "drawn" | "taped";
}

/** a new line's stock until the company's settings exist (M7): 5″ K-style aluminum .027, white, story 1, on fascia */
export const DEFAULT_RUN_ATTRS: DrawnRun["attrs"] = {
  profile: "k",
  size: "5",
  material: "aluminum",
  gauge: ".027",
  color: "white",
  story: 1,
  mount: "fascia",
  hanger: DEFAULT_HANGER_BY_MOUNT.k?.fascia ?? "hidden",
};
/** a new downspout: 2×3 aluminum, white, an extension at the bottom */
export const DEFAULT_DS_ATTRS: Omit<DrawnDownspout, "id" | "runId" | "atIn"> = {
  shape: "rect",
  size: "2x3",
  material: "aluminum",
  color: "white",
  bottom: { kind: "extension" },
};

const int = (n: number) => Math.round(n);
const pt = (p: P): [number, number] => [int(p[0]), int(p[1])];

export function toElements(d: Drawing, measurementId: string): ElementRow[] {
  const runs: ElementRow[] = d.runs.map((r) => ({
    id: r.id,
    measurementId,
    kind: "run",
    geom: { a: pt(r.a), b: pt(r.b), ...(r.lengthIn !== undefined ? { lengthIn: Math.round(r.lengthIn * 8) / 8 } : {}), ...(r.houseSide ? { houseSide: r.houseSide } : {}), ...(r.noCap ? { noCap: r.noCap } : {}), ...(r.unit ? { unit: r.unit } : {}) },
    attrs: { ...r.attrs },
    confidence: r.lengthIn !== undefined ? "taped" : "drawn",
  }));
  const ds: ElementRow[] = d.downspouts.map(({ id, runId, atIn, ...attrs }) => ({ id, measurementId, kind: "downspout", geom: { runId, atIn: int(atIn) }, attrs: { ...attrs }, confidence: "drawn" }));
  return [...runs, ...ds];
}

const isPt = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === "number" && Number.isFinite(x));

/**
 * What a stored element always gets when it lacks it: the shape of the stock, never its gauge or colour — a zinc or
 * mill element has none, and a reload must not paint it white or give it .027 (review M7b №2: the key and the price
 * list would change).
 */
const { gauge: _rg, color: _rc, ...RUN_BASE } = DEFAULT_RUN_ATTRS;
const { color: _dc, ...DS_BASE } = DEFAULT_DS_ATTRS;

/** rows back to a drawing; a broken row is left out (an old phone, a bad write) */
export function fromElements(rows: readonly ElementRow[]): Drawing {
  const runs: DrawnRun[] = [];
  const downspouts: DrawnDownspout[] = [];
  for (const e of rows) {
    if (e.kind === "run" && isPt(e.geom.a) && isPt(e.geom.b)) {
      const g = e.geom as { a: P; b: P; lengthIn?: number; houseSide?: "L" | "R"; noCap?: [boolean, boolean]; unit?: unknown };
      runs.push({ id: e.id, a: g.a, b: g.b, ...(typeof g.lengthIn === "number" ? { lengthIn: g.lengthIn } : {}), ...(g.houseSide ? { houseSide: g.houseSide } : {}), ...(g.noCap ? { noCap: g.noCap } : {}), ...(g.unit === "in" || g.unit === "m" || g.unit === "cm" || g.unit === "mm" ? { unit: g.unit } : {}), attrs: { ...RUN_BASE, ...(e.attrs as Partial<DrawnRun["attrs"]>) } });
    }
  }
  const runIds = new Set(runs.map((r) => r.id));
  for (const e of rows) {
    const g = e.geom as { runId?: unknown; atIn?: unknown };
    if (e.kind === "downspout" && typeof g.runId === "string" && runIds.has(g.runId) && typeof g.atIn === "number")
      downspouts.push({ ...DS_BASE, ...(e.attrs as object), id: e.id, runId: g.runId, atIn: g.atIn } as DrawnDownspout);
  }
  return { runs, downspouts };
}

/** what to write after an edit: changed or new rows, and ids gone (M5: one module.op each, deletes without a key) */
export function diffElements(before: readonly ElementRow[], after: readonly ElementRow[]): { save: ElementRow[]; remove: string[] } {
  const was = new Map(before.map((e) => [e.id, JSON.stringify(e)]));
  const now = new Set(after.map((e) => e.id));
  return {
    save: after.filter((e) => was.get(e.id) !== JSON.stringify(e)),
    remove: before.filter((e) => !now.has(e.id)).map((e) => e.id),
  };
}

/** a change applied to the stored rows (the local store now; the server's rows after M5) */
export function applyChange(rows: readonly ElementRow[], ch: { save: ElementRow[]; remove: string[] }): ElementRow[] {
  const gone = new Set(ch.remove);
  const byId = new Map(rows.filter((r) => !gone.has(r.id)).map((r) => [r.id, r]));
  for (const r of ch.save) byId.set(r.id, r);
  return [...byId.values()];
}

/** where the drawing is kept (M4: on the phone; M5: module.op — П19 tables) */
export interface MeasurementStore {
  load(): Promise<{ m: MeasurementRow; elements: ElementRow[] } | null>;
  /** `rows`: every element now — a store that lost the measurement sends them all */
  save(m: MeasurementRow, ch: { save: ElementRow[]; remove: string[] }, rows?: readonly ElementRow[]): Promise<void>;
}
