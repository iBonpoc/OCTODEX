import { component, motion } from "@octo/design-tokens";

/**
 * MainStep's rules, pure (BUILD-SPEC §1 MainStepBar):
 * - the layout: one main button across the width; «вторая + главная» in a row; «итог + кнопка» (the total on the left, the main
 *   one on the right, not narrower than half). A second label longer than `pair.labelMax` does not stand in the row — it goes
 *   into «⋯» (the screen puts it there; `secondInMore` says so).
 * - the loading phases: nothing for `spinnerDelayMs` (a fast step does not flash), then the spinner, after `actionTimeoutMs` — «Не получилось».
 */
export type MainStepLayout = "single" | "pair" | "total";

export function mainStepLayout(p: { second?: { label: string } | null; total?: unknown }): { layout: MainStepLayout; secondInMore: boolean } {
  if (p.total) return { layout: "total", secondInMore: !!p.second };
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
