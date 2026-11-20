/**
 * «Графит» (пилот #2254): the sheet's arithmetic, apart from the gestures so it is unit-tested (rule 27 (а)).
 * handoff §2.7–§2.8: detents ¼ / ½ / full on the screen's height (on 844: 211 / 422 / 776), the finger 1:1, close when the
 * speed down is > 0.5 pt/ms or the sheet is below 30 % of its height, else the nearest detent of the 150 ms projection;
 * above the top detent the pull is 1:4, no bounce. Heights are «how much of the sheet shows» (0 = closed).
 */
import { graphite } from "@octo/design-tokens";

const S = graphite.sheet;

export interface Detents {
  quarter: number;
  half: number;
  full: number;
}

/** the three heights on a screen of `screenH` pt: full = screen − top gap − float */
export function detents(screenH: number): Detents {
  return {
    quarter: Math.round(screenH * S.quarter),
    half: Math.round(screenH * S.half),
    full: screenH - S.topGap - S.float,
  };
}

/**
 * the shown height while the finger is down: `start` the height at touch-down, `dy` the finger's travel (down = +).
 * Never below 0; past `top` only a quarter of the travel (1:4).
 */
export function dragHeight(start: number, dy: number, top: number): number {
  const raw = start - dy;
  if (raw <= top) return Math.max(0, raw);
  return top + (raw - top) * S.resist;
}

/**
 * where the sheet goes when the finger lifts: 0 (closed) or one of `stops`. `v` = speed in pt/ms, down = +.
 * `open` = the detent the sheet was opened at (the reference height for «below 30 %»).
 */
export function release(
  h: number,
  v: number,
  stops: number[],
  open: number,
): number {
  if (v > S.closeVelocity) return 0;
  if (h < open * S.closeBelow) return 0;
  const projected = h - v * S.projectMs;
  if (projected < open * S.closeBelow) return 0;
  let best = stops[0]!;
  for (const s of stops)
    if (Math.abs(s - projected) < Math.abs(best - projected)) best = s;
  return best;
}

/** how much the scene behind shrinks: 1 up to ½, then to `behindScale` at full */
export function behindScale(h: number, d: Detents): number {
  if (h <= d.half) return 1;
  const t = Math.min(1, (h - d.half) / (d.full - d.half));
  return 1 - (1 - graphite.motion.behindScale) * t;
}
