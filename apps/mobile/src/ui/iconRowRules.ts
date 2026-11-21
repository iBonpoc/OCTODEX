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
