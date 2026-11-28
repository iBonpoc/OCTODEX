/**
 * The «Свой» fields of a properties window holding text that is no value (#3090, review #3007/#3090: «набрал 1000, нажал
 * „Сохранить“ — окно закрылось молча, в чертеже 100»). A good value goes in at once; a bad one goes in nowhere and is said when
 * the field is left — and «Сохранить» does not close the window while one is there: it says it instead. One window is open at
 * a time, so one registry. Pure, no react-native — unit-tested (test/gutterOwnBad.test.ts).
 */
const bad = new Map<string, () => void>();

/** a field says whether its text is bad; `reveal` shows its warning. null — good or gone */
export function markOwnBad(id: string, reveal: (() => void) | null): void {
  if (reveal) bad.set(id, reveal);
  else bad.delete(id);
}

/** «Сохранить»: true — a field holds a bad value, its warning is shown and the window stays */
export function holdForOwnBad(): boolean {
  bad.forEach((reveal) => reveal());
  return bad.size > 0;
}
