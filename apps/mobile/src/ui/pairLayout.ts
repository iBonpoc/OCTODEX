import { component, font, space } from "@octo/design-tokens";

/**
 * Two side by side when they fit (founder 21.11.2026, #2350: «в стиле компакт… если две кнопки в столбик — я бы сделал две кнопки
 * в ряд. Также и селекторы… дата, время… горизонтально в ряд, если помещаются»; DS §7.4). Pure: the components (`ButtonPair`,
 * `FieldRow`) only measure their width and ask here.
 */

export type PairLayout = "row" | "column";

/** the width a button label takes in one line: the padding, the icon with its gap, the characters (`component.pair.charEm` of the font) */
export function buttonNeed(label: string, icon: boolean): number {
  return space[4] * 2 + (icon ? component.button.glyph + space[2] : 0) + Math.ceil(label.length * font.size.button * component.pair.charEm);
}

/**
 * Two buttons stand in a row (halves, `space[2]` apart) when there are exactly two, each label is short (≤ `pair.labelMax`
 * characters) and, once the width is known, each fits its half in one line. Otherwise (three, a long label, a narrow screen) — a column.
 * `width` 0 / undefined — not measured yet: the labels alone decide (the measure corrects it right after the first layout).
 */
export function buttonPairLayout(buttons: readonly { label: string; icon?: boolean }[], width?: number): PairLayout {
  if (buttons.length !== 2) return "column";
  if (buttons.some((b) => b.label.length > component.pair.labelMax)) return "column";
  if (!width) return "row";
  const half = (width - space[2]) / 2;
  return buttons.every((b) => buttonNeed(b.label, !!b.icon) <= half) ? "row" : "column";
}

/**
 * A pair of fields (a date and a time, «с — по», a quantity and a unit) stands in a row when the width holds `count` fields of at
 * least `pair.fieldMin` with `space[2]` between them; a narrow screen keeps the column. Not measured yet — a row (the phone of 390
 * holds two).
 */
export function fieldRowLayout(width: number | undefined, count = 2): PairLayout {
  if (count < 2) return "column";
  if (!width) return "row";
  return width >= count * component.pair.fieldMin + (count - 1) * space[2] ? "row" : "column";
}
