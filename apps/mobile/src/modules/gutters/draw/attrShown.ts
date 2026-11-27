/**
 * What the downspout's window shows and opens by itself (#2412 G1, NAMES-41). Pure — the e2e cannot see why a row is
 * there; the unit test can.
 */
export interface DsShownIn {
  shape: string;
  dsStyle?: string;
  heightIn?: number;
  reducers?: readonly unknown[];
  diverter?: boolean;
  outletScreen?: boolean;
  finish?: "mill" | "painted";
  color?: string;
}
export interface RunPaint { finish?: "mill" | "painted"; color?: string }

const bare = (x: { finish?: "mill" | "painted"; color?: string }) => (x.finish ?? (x.color ? "painted" : "mill")) === "mill";

/** the downspout's colour differs from its gutter's («Как у gutter» is the default) */
export const ownColor = (ds: DsShownIn, run?: RunPaint) => !!run && (bare(ds) !== bare(run) || (!bare(ds) && ds.color !== run.color));

/** «Ещё» of a downspout opens by itself when something under it is set: its colour, the rare parts (its own height is above it, #3090) */
export const dsMoreSet = (ds: DsShownIn, run?: RunPaint) => !!(ds.reducers?.length || ds.diverter || ds.outletScreen || ownColor(ds, run));

/**
 * The rare rows (not on the chart for every kind): Reducer — only while set; «Cutoff with Diverter» — a square corrugated
 * downspout; the outlet screen — a round one. A row the window opened with stays until the window closes (`at`: the
 * downspout as it was then) — switching it off never makes the row vanish under the finger.
 */
export function dsRareShown(ds: DsShownIn, at: DsShownIn = ds) {
  const one = (d: DsShownIn) => ({
    reducer: !!d.reducers?.length,
    diverter: (d.shape === "rect" && d.dsStyle === "corrugated") || !!d.diverter,
    outletScreen: d.shape === "round" || !!d.outletScreen,
  });
  const a = one(ds);
  const b = one(at);
  return { reducer: a.reducer || b.reducer, diverter: a.diverter || b.diverter, outletScreen: a.outletScreen || b.outletScreen };
}
