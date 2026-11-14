/**
 * The canvas grid (founder 08.11, as in CAD; #1434): drawn over the SCREEN, not over the drawing's layer. Before, the grid was
 * a path of the scaled layer, drawn GRID_REACH screens beyond it (#1403) and left to `overflow: visible` — on the web that is
 * so, on an iPhone react-native-svg clips to its view: a pinch out showed the grid as a small rectangle (build 1405).
 * Now the grid is its own screen-sized Svg out of the scaled layer, and its paths are computed for every frame of a gesture
 * from the live view (`GridLayer`, useAnimatedProps on the UI thread). Every function here is a worklet: they run there.
 */

/** a grid cell, inches: 1 ft, 5 ft, 10 ft, 50 ft, 100 ft, 500 ft — the smallest not finer than `minPx` on the screen (the 1″ and 6″ steps of #1405 were reverted with it, #1443) */
export const GRID_STEPS_IN = [12, 60, 120, 600, 1200, 6000] as const;

/** the most lines of a grid (both ways) on the screen: denser than this has no grid (#1281: a pinch far out made millions of lines) */
export const MAX_GRID_LINES = 240;

export function gridStepIn(k: number, minPx: number): number {
  "worklet";
  for (let i = 0; i < GRID_STEPS_IN.length; i++) if (GRID_STEPS_IN[i]! * k >= minPx) return GRID_STEPS_IN[i]!;
  return GRID_STEPS_IN[GRID_STEPS_IN.length - 1]!;
}

/** the grid's two paths over the screen `w`×`h` for the view on the screen (plan x → x·k + ox, plan y → −y·k + oy); every 5th line is a major one */
export interface GridPaths { minor: string; major: string; stepIn: number }

export function gridPaths(k: number, ox: number, oy: number, w: number, h: number, minPx: number): GridPaths {
  "worklet";
  if (!(k > 0) || !Number.isFinite(k) || !(w > 0) || !(h > 0)) return { minor: "", major: "", stepIn: 0 };
  const step = gridStepIn(k, minPx);
  const px = step * k; // a cell on the screen
  // the plan's range on the screen: x from (0 − ox)/k to (w − ox)/k; y from (oy − h)/k to oy/k
  const i0 = Math.ceil(-ox / px), i1 = Math.floor((w - ox) / px);
  const j0 = Math.ceil((oy - h) / px), j1 = Math.floor(oy / px);
  if (i1 - i0 + 1 + (j1 - j0 + 1) > MAX_GRID_LINES) return { minor: "", major: "", stepIn: step };
  let minor = "", major = "";
  for (let i = i0; i <= i1; i++) {
    const seg = `M${(i * px + ox).toFixed(1)} 0V${h}`;
    if (i % 5 === 0) major += seg;
    else minor += seg;
  }
  for (let j = j0; j <= j1; j++) {
    const seg = `M0 ${(-j * px + oy).toFixed(1)}H${w}`;
    if (j % 5 === 0) major += seg;
    else minor += seg;
  }
  return { minor, major, stepIn: step };
}

/**
 * The view on the screen while the fingers are down: the committed view (k, ox, oy) under the canvas's live transform
 * p' = S·p + (1 − S)·f + T (CanvasView's style: a scale about the focal point f, then the shift; f is 0 while a gesture runs),
 * so x·k + ox becomes S·(x·k + ox) + (1 − S)·fx + Tx.
 */
export function liveView(k: number, ox: number, oy: number, S: number, Tx: number, Ty: number, fx = 0, fy = 0): { k: number; ox: number; oy: number } {
  "worklet";
  return { k: k * S, ox: S * ox + (1 - S) * fx + Tx, oy: S * oy + (1 - S) * fy + Ty };
}
