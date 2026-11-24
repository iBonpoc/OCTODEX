/** The rules of StatTile / StatGrid (src/ui/statTile.tsx, BUILD-SPEC §1 «StatTile», §0 «Dynamic Type»). */

/** from this system font scale the tiles stand in one column */
export const STAT_ONE_COLUMN_SCALE = 1.35;

/** how many tiles in a row: two, one with a big system font */
export function statColumns(fontScale: number): 1 | 2 {
  return fontScale >= STAT_ONE_COLUMN_SCALE ? 1 : 2;
}

/** a tile is drawn only when it holds something: a zero (0, "0", "$0", "$0.00") or an empty figure is not shown */
export function statShown(value: number | string): boolean {
  if (typeof value === "number") return value !== 0;
  const v = value.trim();
  return v !== "" && !/^[^\d]*0+([.,]0+)?[^\d]*$/.test(v);
}

/** cut the tiles into rows of `cols` */
export function statRows<T>(items: T[], cols: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return rows;
}

/** what a screen reader hears for a tile: «label: value[, sub][, warn]» — the sub line and the «!» reason are said, not only drawn */
export function statSaid(label: string, value: number | string, sub?: string, warn?: string): string {
  return [`${label}: ${value}`, sub, warn].filter(Boolean).join(", ");
}
