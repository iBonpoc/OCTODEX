/**
 * The grid under the drawing as PURE worklets (docs/specs/33-gutters-canvas.md П36, #1403, #1434): drawn from the view the screen shows RIGHT
 * NOW — the committed view and the live transform of the fingers — on the UI thread, every frame, in a layer that does not move with the
 * drawing. So it covers the whole screen at any scale and any shift, with the cell the scale asks for, with no «reach» beyond the screen
 * (a Svg clips what is outside its own box on iOS: `overflow: visible` did nothing there, founder's phone 14.11, build 1405).
 * Plan coordinates are integer inches, x east, y north; screen = (x·k + ox, −y·k + oy).
 */

/** a grid cell, inches: 1″, 6″, 1 ft, 5 ft, 10 ft, 50 ft, 100 ft, 500 ft — the smallest not finer than `minPx` on the screen (1″ and 6″ for the nearest scale, where 1″ is a finger's target) */
export const GRID_STEPS_IN = [1, 6, 12, 60, 120, 600, 1200, 6000] as const;
/** the most lines of a grid (both ways): a view so far away that the largest step is still denser than this has no grid (#1281: a pinch far out made millions of lines) */
export const MAX_GRID_LINES = 240;

export function gridStepIn(k: number, minPx: number): number {
  "worklet";
  for (let i = 0; i < GRID_STEPS_IN.length; i++) if (GRID_STEPS_IN[i]! * k >= minPx) return GRID_STEPS_IN[i]!;
  return GRID_STEPS_IN[GRID_STEPS_IN.length - 1]!;
}

export interface GridPaths { minor: string; major: string; stepIn: number }

/** the lines over the screen `w × h` for the view (k, ox, oy): every 5th is a major one. Exactly the screen: the first line is less than a cell from its edge */
export function gridPaths(k: number, ox: number, oy: number, w: number, h: number, minPx: number): GridPaths {
  "worklet";
  const step = gridStepIn(k, minPx);
  if (!(k > 0) || !isFinite(k) || !isFinite(ox) || !isFinite(oy) || !(w > 0) || !(h > 0)) return { minor: "", major: "", stepIn: step };
  const x0 = (0 - ox) / k, x1 = (w - ox) / k; // plan x at the left and right edge
  const yTop = oy / k, yBottom = -(h - oy) / k; // plan y at the top and bottom edge
  if ((x1 - x0) / step + (yTop - yBottom) / step > MAX_GRID_LINES) return { minor: "", major: "", stepIn: step };
  let minor = "";
  let major = "";
  for (let i = Math.ceil(x0 / step); i * step <= x1; i++) {
    const seg = "M" + (i * step * k + ox).toFixed(1) + " 0V" + h;
    if (i % 5 === 0) major += seg; else minor += seg;
  }
  for (let j = Math.ceil(yBottom / step); j * step <= yTop; j++) {
    const seg = "M0 " + (-j * step * k + oy).toFixed(1) + "H" + w;
    if (j % 5 === 0) major += seg; else minor += seg;
  }
  return { minor, major, stepIn: step };
}
