/**
 * DS Б3 (#2381, ревью 1 Ж3): the answers of a confirmation dialog — pure, unit-tested (test/confirmDialog.test.ts). One question at a
 * time: a question asked over another answers the first «back» (null); the screen gone with a question open answers it null too —
 * no promise is left hanging.
 */
export function confirmQueue<Q>(show: (q: Q | null) => void) {
  let done: ((k: string | null) => void) | null = null;
  return {
    ask(q: Q): Promise<string | null> {
      return new Promise((resolve) => {
        done?.(null);
        done = resolve;
        show(q);
      });
    },
    answer(k: string | null) {
      const r = done;
      done = null;
      show(null);
      r?.(k);
    },
    /** the screen leaves: an open question is answered «back» */
    dispose() {
      const r = done;
      done = null;
      r?.(null);
    },
  };
}
