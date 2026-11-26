import { component, font, motion, space } from "@octo/design-tokens";

/**
 * MainStep's rules, pure (BUILD-SPEC §1 MainStepBar):
 * - the layout of the compact bar (one row, the main button on the right by its words): alone; «вторая + главная»; «итог + кнопка»;
 *   a held step's reason takes the left place (the second one then goes into «⋯»). A second label longer than `pair.labelMax` does not stand in the row — it goes
 *   into «⋯» (the screen puts it there; `secondInMore` says so).
 * - the loading phases: nothing for `spinnerDelayMs` (a fast step does not flash), then the spinner, after `actionTimeoutMs` — «Не получилось».
 */
export type MainStepLayout = "single" | "pair" | "total";

export function mainStepLayout(p: { second?: { label: string } | null; total?: unknown; reason?: string }): { layout: MainStepLayout; secondInMore: boolean } {
  if (p.total) return { layout: "total", secondInMore: !!p.second };
  // the compact bar has one place on the left: the reason (why the step is held) takes it, the second one goes into «⋯»
  if (p.second && p.reason) return { layout: "single", secondInMore: true };
  if (!p.second) return { layout: "single", secondInMore: false };
  if (p.second.label.length > component.pair.labelMax) return { layout: "single", secondInMore: true };
  return { layout: "pair", secondInMore: false };
}

export type LoadPhase = "idle" | "wait" | "spinner" | "failed";

export function loadPhase(loading: boolean, elapsedMs: number): LoadPhase {
  if (!loading) return "idle";
  if (elapsedMs < motion.spinnerDelayMs) return "wait";
  if (elapsedMs < motion.actionTimeoutMs) return "spinner";
  return "failed";
}

/**
 * #2405: how the bar's fold moves (pure; test/totalFoldMotion.test.ts). The capsule slides in from the right (`foldShift`) growing from
 * `foldScale`; the card comes up by `foldShift`; both fade in over `durBase` (easeOut), the one going fades out over `durFast`.
 * Reduced motion — null: the swap is a cut.
 */
export type FoldFrom = { opacity: number; x?: number; y?: number; scale: number };
export function foldMotion(reduce: boolean): { capsule: { from: FoldFrom; ms: number }; card: { from: FoldFrom; ms: number }; outMs: number } | null {
  if (reduce) return null;
  return {
    capsule: { from: { opacity: 0, x: motion.foldShift, scale: motion.foldScale }, ms: motion.durBase },
    card: { from: { opacity: 0, y: motion.foldShift, scale: 1 }, ms: motion.durBase },
    outMs: motion.durFast,
  };
}

/**
 * Review 27.11 (#2935, «налог ˎ» cut on 390): the bar's sum shrinks to fit its room — never cut — down to the next size of the scale
 * below its own (`title` 22 → `figureSm` 18): the least part it may take. Pure: test/mainStepRules.test.ts.
 */
export function shrinkFloor(fs: number = font.size.title): number {
  const below = Object.values(font.size).filter((x) => x < fs);
  return below.length ? Math.max(...below) / fs : 1;
}

/** the width the bar's total needs not to be cut: its caption line whole, the sum at its `shrinkFloor` (rounded up) */
export function totalNeed(caption: number, sum: number, floor: number = shrinkFloor()): number {
  return Math.max(caption, Math.ceil(sum * floor));
}

/** the total gets its own line over the buttons when it and the buttons (`right`, natural) do not stand in one `row` (gap `space[3]`);
 *  nothing measured yet — one row */
export function stackedBar(m: { row: number; right: number; need: number }, was = false): boolean {
  // round 2 (Ж2): once two lines in an editing session, two lines until the editor is closed — typing a price never makes the
  // bar jump between one line and two (the MainStep keeps `was` for its life: the editor's)
  if (was) return true;
  if (!(m.row > 0 && m.right > 0 && m.need > 0)) return false;
  return m.need + space[3] + m.right > m.row;
}
