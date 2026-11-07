import { component } from "@octo/design-tokens";

/** the height of a bar in a column: 0 (only the track) for an empty or future day; a value never shrinks below barMin */
export function barHeight(value: number, max: number, future?: boolean): number {
  const { h, barMin } = component.chart;
  if (future || value <= 0 || max <= 0) return 0;
  return barMin + ((h - barMin) * value) / max;
}
