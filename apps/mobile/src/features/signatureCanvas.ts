import { SIG_BOX } from "./signaturePath";

/**
 * The full-screen signature (spec 29, founder 07.11: «на маленьком телефоне — развернуть на весь экран, горизонтально»).
 * While the window is portrait the canvas is turned 90° clockwise, so the long side of the phone is the signing line —
 * no need to turn the phone; turned to landscape, the window is wide and nothing is rotated. Pure geometry, unit-tested.
 */

type Edges = { top: number; bottom: number; left: number; right: number };
const NONE: Edges = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * The canvas for a window: same proportions as the field on the screen, as large as fits along the long side.
 * `insets` — the safe area (docs/specs/32): the notch / Dynamic Island, the home indicator, the rounded corners.
 * `pad` is the screen's padding on each side, max(inset, gap): the canvas and its buttons lie inside it.
 */
export function fullCanvas(
  winW: number,
  winH: number,
  fieldW: number,
  fieldH: number,
  gap: number,
  bar: number,
  insets: Edges = NONE,
): { w: number; h: number; rotate: boolean; pad: Edges } {
  const pad = { top: Math.max(insets.top, gap), bottom: Math.max(insets.bottom, gap), left: Math.max(insets.left, gap), right: Math.max(insets.right, gap) };
  const rotate = winH > winW;
  const across = winW - pad.left - pad.right;
  const down = winH - pad.top - pad.bottom;
  const long = rotate ? down : across;
  const short = (rotate ? across : down) - bar; // the button bar sits under the canvas, along the long side
  const aspect = fieldW > 0 && fieldH > 0 ? fieldW / fieldH : SIG_BOX.w / SIG_BOX.h;
  const w = Math.max(0, Math.min(long, short * aspect));
  return { w: Math.floor(w), h: Math.floor(w / aspect), rotate, pad };
}

/**
 * A finger on the turned canvas → a point of the canvas. The canvas (cw × ch) is rotated 90° clockwise about its centre;
 * `box` is where the turned canvas lies on the window (its left-top and its on-screen size ch × cw). Uses page
 * coordinates: locationX is not reliable under a rotation on the web.
 */
export function turnedToCanvas(pageX: number, pageY: number, box: { x: number; y: number }, ch: number): { x: number; y: number } {
  // a canvas point (x, y) shows at screen (box.x + ch − y, box.y + x)
  return { x: pageY - box.y, y: ch - (pageX - box.x) };
}

/** a finger on the upright canvas → a point of the canvas */
export const uprightToCanvas = (pageX: number, pageY: number, box: { x: number; y: number }) => ({ x: pageX - box.x, y: pageY - box.y });
