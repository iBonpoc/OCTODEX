/**
 * The saver of the canvas (what was written, the next save sends the difference) and the M4b draft store on the phone —
 * the app no longer writes it (spec 33 П21: the queue does), kept for the saver's tests and the old draft's key.
 */
import { applyChange, diffElements, type ElementRow, type MeasurementRow, type MeasurementStore } from "./model";

export const DRAFT_KEY = "octo.mod.gutters.draft.v1";

/** the storage a store writes to (AsyncStorage in the app; a stand-in in tests) */
export interface KV { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> }

/**
 * Saves run one after another (read → apply → write is not atomic: two at once would lose the first one's change).
 * A failed save rejects, and the caller keeps its change to send again.
 */
export function makeLocalStore(kv: KV, key = DRAFT_KEY): MeasurementStore {
  let chain: Promise<unknown> = Promise.resolve();
  const load = async () => {
    try {
      const raw = await kv.getItem(key);
      const v = raw ? (JSON.parse(raw) as { m?: MeasurementRow; elements?: ElementRow[] }) : null;
      return v?.m && Array.isArray(v.elements) ? { m: v.m, elements: v.elements } : null;
    } catch {
      return null;
    }
  };
  return {
    load,
    save(m, ch) {
      const run = chain.then(async () => {
        const cur = await load();
        const elements = applyChange(cur?.m.id === m.id ? cur.elements : [], ch);
        await kv.setItem(key, JSON.stringify({ m, elements }));
      });
      chain = run.catch(() => {});
      return run;
    },
  };
}


/**
 * What the canvas has written: the next save sends only the difference. «Saved» moves only after the write
 * succeeded — a failed write leaves its change to be sent again.
 */
/** the measurement's own fields as one key: a change of them alone (the accuracy, a link) is a change to write too */
const ownKey = (m: MeasurementRow) => JSON.stringify([m.label, m.status, m.propertyId, m.leadId, m.accuracy ?? null]);

export function makeSaver(store: MeasurementStore) {
  let saved: readonly ElementRow[] = [];
  let savedM: string | null = null;
  return {
    seed(rows: readonly ElementRow[], m?: MeasurementRow) {
      saved = rows;
      if (m) savedM = ownKey(m);
    },
    async flush(m: MeasurementRow, rows: readonly ElementRow[]): Promise<"saved" | "nothing" | "failed"> {
      const ch = diffElements(saved, rows);
      const mk = ownKey(m);
      // nothing drawn changed and the measurement's own fields neither (e2e 174: «Рулетка» alone was never written once
      // every stroke was written at once)
      // — and a measurement never written with nothing drawn stays unwritten (opening the canvas makes no empty draft)
      if (!ch.save.length && !ch.remove.length && (savedM === null || mk === savedM)) return "nothing";
      try {
        await store.save(m, ch, rows);
        saved = rows;
        savedM = mk;
        return "saved";
      } catch {
        return "failed";
      }
    },
  };
}
