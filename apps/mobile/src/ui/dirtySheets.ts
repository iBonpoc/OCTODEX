/**
 * The open sheets with unsaved work (#1912): «Обновить» must never throw such work away. A `Sheet` with `dirty` registers itself here while it
 * is open; the update asks each one through the sheet's OWN question («Сохранить изменения?» — DS rule 10) and goes on only when none is left.
 */
export type DirtySheet = {
  /** open the sheet's own question (Save / Don't save / Cancel) */
  ask: () => void;
};

const open = new Set<DirtySheet>();
const subs = new Set<() => void>();
/** a «Cancel» in the question: whoever waits for the sheets to settle stops waiting */
const cancels = new Set<() => void>();

export function registerDirtySheet(s: DirtySheet): () => void {
  open.add(s);
  subs.forEach((f) => f());
  return () => {
    open.delete(s);
    subs.forEach((f) => f());
  };
}

export const dirtySheetCount = () => open.size;
export const noteQuestionCancelled = () => [...cancels].forEach((f) => f());

/**
 * Asks the open unsaved sheets one by one (the last opened first): true — none is left (saved or discarded), false — the person cancelled.
 * `maxWaitMs`: a question nobody answers for this long counts as «no» (the person left it); the update does not hang forever.
 */
export function settleDirtySheets(maxWaitMs = 10 * 60 * 1000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      subs.delete(step);
      cancels.delete(stop);
      clearTimeout(timer);
      resolve(ok);
    };
    const asked = new WeakSet<DirtySheet>();
    function step() {
      if (done) return;
      const left = [...open].filter((s) => !asked.has(s));
      if (open.size === 0) return finish(true);
      const next = left[left.length - 1];
      if (next) {
        asked.add(next);
        next.ask();
      }
    }
    const stop = () => finish(false);
    const timer = setTimeout(() => finish(false), maxWaitMs);
    subs.add(step);
    cancels.add(stop);
    step();
  });
}
