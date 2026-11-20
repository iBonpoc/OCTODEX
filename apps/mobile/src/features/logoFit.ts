/**
 * #2003: the company logo keeps its proportions. The picked image is scaled so that its LONGER side is at most `max` px
 * (a wide logo stays wide, a tall one tall); a smaller one is not blown up. Before, it was squeezed into max × max.
 */
export function logoFit(width: number, height: number, max: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: max, height: max };
  const k = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}
