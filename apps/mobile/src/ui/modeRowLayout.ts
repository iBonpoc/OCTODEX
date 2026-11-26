import { component, space } from "@octo/design-tokens";

/**
 * DS §8.7а (#2954): does a totals row (`ModeRow`) stand on one line — the word, the switch, the field and the sum — or on two
 * («слово · сумма», then the switch and its field)? One line only where all four fit with their gaps; until the row and the switch
 * are measured (0) — two lines (a phone never jumps from one to two).
 */
export const modeRowOneLine = (rowW: number, switchW: number): boolean =>
  rowW > 0 && switchW > 0 && rowW >= component.modeRow.titleW + switchW + component.modeRow.fieldW + component.modeRow.sumW + 3 * space[3];
