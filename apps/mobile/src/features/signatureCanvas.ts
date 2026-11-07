import { SIG_BOX } from "./signaturePath";

/**
 * The full-screen signature (spec 29, founder 07.11: «на маленьком телефоне — развернуть на весь экран, горизонтально»).
 * While the window is portrait the canvas is turned 90° clockwise, so the long side of the phone is the signing line —
 * no need to turn the phone; turned to landscape, the window is wide and nothing is rotated. Pure geometry, unit-tested.
 */

/** the canvas for a window: same proportions as the field on the screen, as large as fits along the long side */
export function fullCanvas(winW: number, winH: number, fieldW: number, fieldH: number, gap: number, bar: number): { w: number; h: number; rotate: boolean } {
  const rotate = winH > winW;
  const long = (rotate ? winH : winW) - gap * 2;
  const short = (rotate ? winW : winH) - gap * 2 - bar; // the button bar sits under the canvas, along the long side
  const aspect = fieldW > 0 && fieldH > 0 ? fieldW / fieldH : SIG_BOX.w / SIG_BOX.h;
  const w = Math.min(long, short * aspect);
  return { w: Math.floor(w), h: Math.floor(w / aspect), rotate };
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
