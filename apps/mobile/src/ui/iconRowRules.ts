/**
 * IconRow's limits (BUILD-SPEC §1 QuickActions, BUILD-PLAN §1 поток Б): `row` — 3…5 circles across the width (the fifth is «Ещё»,
 * the screen puts it); `inline` — 2 circles in the header's address line («Позвонить», «SMS»). More than the limit is cut off
 * and told in development (a screen that gives six has lost one action silently otherwise).
 */
export type IconRowVariant = "row" | "inline";

export const ICON_ROW_MAX: Record<IconRowVariant, number> = { row: 5, inline: 2 };

export function iconRowItems<A>(actions: readonly A[], variant: IconRowVariant): { shown: A[]; over: number; problem?: string } {
  const max = ICON_ROW_MAX[variant];
  const over = Math.max(0, actions.length - max);
  return {
    shown: actions.slice(0, max),
    over,
    problem: over ? `IconRow ${variant}: ${actions.length} actions, at most ${max} — put the rest into «Ещё» / «⋯»` : undefined,
  };
}

/** a `row` caption wraps to at most this many lines under its circle (a 64 cell at 12: «Напомнить», «Записать в план») — not «…» */
export const ICON_ROW_LABEL_LINES = 2;

/**
 * A `row` cell at the system text size (DS §4.3, #2761): at the standard size (≤ 1) the cells are equal, `labelW` 64 at most
 * (`flex: 1`). Bigger, the caption grows with it (capped at `labelMaxScale`) and an equal 64 cell broke one long word by
 * syllables («Позвони / ть», «Маршру / т» at 1.25 on 390): the cell is then as wide as its word (`flexBasis` auto), up to
 * `labelW × scale` — five RU captions at 1.25 take 313 of the 358 a 390 phone gives the row.
 */
export function iconRowCell(fontScale: number, labelW: number, labelMaxScale: number): { equal: boolean; maxWidth: number } {
  const k = Math.min(Math.max(fontScale || 1, 1), labelMaxScale);
  return { equal: k <= 1, maxWidth: Math.round(labelW * k) };
}
