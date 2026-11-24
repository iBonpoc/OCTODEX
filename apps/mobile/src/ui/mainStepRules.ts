import { component, motion } from "@octo/design-tokens";

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
