import { component, space } from "@octo/design-tokens";

/**
 * DS §8.7а (#2954, founder 26.11: «депозит, маленький переключатель… текстовое поле 10% и итоговая сумма» — one line): how a totals
 * row (`ModeRow`) stands, by the row's width and the toggle's:
 * - `wide` — one line, the word a column `titleW` (the toggles of the rows stand one under another), the field `fieldW`, the sum `sumW`;
 * - `line` — one line on a phone: the word takes what is left (≥ `titleMinW`, two lines at most), the field `fieldNarrowW`;
 * - `two` — nothing fits (a large font): «word · sum», under it the toggle and the field.
 * Not measured yet (0) — `line` (a phone never jumps).
 */
export type ModeRowShape = "wide" | "line" | "two";
export function modeRowShape(rowW: number, toggleW: number): ModeRowShape {
  const g = 3 * space[2];
  const { titleW, fieldW, sumW } = component.modeRow;
  const { titleMinW, fieldNarrowW, sumMinW } = component.modeToggle;
  if (rowW <= 0 || toggleW <= 0) return "line";
  if (rowW >= titleW + toggleW + fieldW + sumW + g) return "wide";
  if (rowW >= titleMinW + toggleW + fieldNarrowW + sumMinW + g) return "line";
  return "two";
}
