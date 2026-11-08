/**
 * The canvas's store on the core's queue (docs/specs/33-gutters-screens.md П21.3 M5a): one module.op per change —
 * the measurement first when it is new or changed (its elements refer to it), then each saved element (a full write,
 * coalesceKey = its id: moves of one element are one waiting write), then each removed one (no key). Not active
 * (moduleOp → null, founder О2) → the save fails and nothing is written. Pure but for the store it is given.
 */
import type { DB } from "@/data/types";
import { dropElement, gutterData, K, KEY, measurementOf, putElement, putMeasurement, withGutterData } from "../data";
import type { ElementRow, MeasurementRow, MeasurementStore } from "./model";

type ModuleOp = (module: string, change: { kind: string; payload: Record<string, unknown>; apply: (d: DB) => DB; coalesceKey?: string; made?: string[] }) => unknown;
export interface StoreLike {
  db: DB;
  moduleOp: ModuleOp;
}

const own = (m: MeasurementRow): MeasurementRow => ({ id: m.id, label: m.label, status: m.status, propertyId: m.propertyId, leadId: m.leadId });
const same = (a: MeasurementRow, b: MeasurementRow) => JSON.stringify(own(a)) === JSON.stringify(own(b));
/** the measurement was changed now (its own fields or one of its elements): the newest opens first */
const touched = (id: string, at: string) => (d: DB) =>
  withGutterData(d, (g) => ({ ...g, measurements: g.measurements.map((x) => (x.id === id ? { ...x, updatedAt: at } : x)) }));

export class ModuleNotActive extends Error {
  override name = "ModuleNotActive";
}

export function makeModuleStore(get: () => StoreLike, id: string, now = () => new Date().toISOString()): MeasurementStore {
  return {
    async load() {
      return measurementOf(gutterData(get().db), id);
    },
    async save(m, ch) {
      const { db, moduleOp } = get();
      const send = (kind: string, payload: Record<string, unknown>, apply: (d: DB) => DB, key?: string) => {
        const at = now();
        const ok = moduleOp(KEY, { kind, payload, apply: (d) => touched(m.id, at)(apply(d)), ...(key ? { coalesceKey: key, made: [key] } : {}) });
        if (ok == null) throw new ModuleNotActive("the module is not active");
      };
      const was = gutterData(db).measurements.find((x) => x.id === m.id);
      if (!was || !same(was, m)) send(K.mSave, { m: own(m) }, (d) => withGutterData(d, putMeasurement({ ...own(m), ...(was?.updatedAt ? { updatedAt: was.updatedAt } : {}) })), m.id);
      for (const e of ch.save) send(K.eSave, { e: e as ElementRow & Record<string, unknown> }, (d) => withGutterData(d, putElement(e)), e.id);
      for (const x of ch.remove) send(K.eRemove, { id: x }, (d) => withGutterData(d, dropElement(x)));
    },
  };
}
