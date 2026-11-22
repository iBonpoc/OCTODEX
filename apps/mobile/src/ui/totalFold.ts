import { component } from "@octo/design-tokens";

/**
 * #2363 q72 (founder 21.11.2026: «вариант А — при прокрутке „Итого“ сворачивается в капсулу с суммой, нажатие раскрывает»).
 * A pure step of the fold by the page's offset: folded after `down` pt scrolled down since the last turn, open again after `up` pt
 * scrolled up, or at the top. `anchor` is where the direction last turned — a finger that jitters by a point does not flap it.
 */
export type FoldState = { folded: boolean; anchor: number };

export const foldStart: FoldState = { folded: false, anchor: 0 };

export function foldStep(s: FoldState, y: number, k: { down: number; up: number } = component.totalFold): FoldState {
  if (y <= 0) return { folded: false, anchor: 0 };
  if (!s.folded) {
    if (y - s.anchor > k.down) return { folded: true, anchor: y };
    return y < s.anchor ? { folded: false, anchor: y } : s;
  }
  if (s.anchor - y >= k.up) return { folded: false, anchor: y };
  return y > s.anchor ? { folded: true, anchor: y } : s;
}
