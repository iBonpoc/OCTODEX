/**
 * #2363 F46 (founder 21.11.2026: «нужно единое правило отображения дат»; «сегодня, вчера, потом день недели и число» —
 * никаких «позавчера» и «3 дн. назад»). ONE rule for a day in a line, DS §4.5:
 *   today / tomorrow / yesterday — the word («Сегодня», in the middle of a line «сегодня»);
 *   any other day — the weekday short and the date, en-US order in every language («пт, 19 нояб.», «Fri, Nov 19»).
 * The time of a moment is always en-US «8:19 AM» (rule 7), written after the day word: «Сегодня 8:30».
 */

export type DayWords = { today: string; tomorrow: string; yesterday: string; day: (iso: string) => string };

/** `off` — whole days from today (0 today, 1 tomorrow, −1 yesterday); `mid` — the word stands in the middle of a line */
export function dayWord(off: number, iso: string, w: DayWords, mid = false): string {
  const word = off === 0 ? w.today : off === 1 ? w.tomorrow : off === -1 ? w.yesterday : null;
  if (word === null) return w.day(iso);
  return mid ? word.charAt(0).toLocaleLowerCase() + word.slice(1) : word;
}

