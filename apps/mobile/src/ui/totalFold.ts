import { component } from "@octo/design-tokens";

/**
 * #2363 q72 (founder 21.11.2026: «вариант А — при прокрутке „Итого“ сворачивается в капсулу с суммой, нажатие раскрывает»).
 * A pure step of the fold by the page's offset: folded after `down` pt scrolled down since the last turn, open again after `up` pt
 * scrolled up, at the top, or at the end of the list (`max` — the furthest offset). `anchor` is where the direction last turned — a finger that jitters by a point does not flap it.
 */
export type FoldState = { folded: boolean; anchor: number };

export const foldStart: FoldState = { folded: false, anchor: 0 };

export function foldStep(s: FoldState, y: number, k: { down: number; up: number } = component.totalFold, max = Number.MAX_SAFE_INTEGER): FoldState {
  if (y <= 0) return { folded: false, anchor: 0 };
  // the end of the list: the whole «Итого» with «Готово» (the last lines are read with their total)
  if (y >= max - k.up) return { folded: false, anchor: y };
  if (!s.folded) {
    if (y - s.anchor > k.down) return { folded: true, anchor: y };
    return y < s.anchor ? { folded: false, anchor: y } : s;
  }
  if (s.anchor - y >= k.up) return { folded: false, anchor: y };
  return y > s.anchor ? { folded: true, anchor: y } : s;
}
