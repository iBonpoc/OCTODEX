/** The phone's draft store, without React Native (testable): one draft, saves in a row (spec 33 П20.7). */
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
export function makeSaver(store: MeasurementStore) {
  let saved: readonly ElementRow[] = [];
  return {
    seed(rows: readonly ElementRow[]) {
      saved = rows;
    },
    async flush(m: MeasurementRow, rows: readonly ElementRow[]): Promise<"saved" | "nothing" | "failed"> {
      const ch = diffElements(saved, rows);
      if (!ch.save.length && !ch.remove.length) return "nothing";
      try {
        await store.save(m, ch);
        saved = rows;
        return "saved";
      } catch {
        return "failed";
      }
    },
  };
}
