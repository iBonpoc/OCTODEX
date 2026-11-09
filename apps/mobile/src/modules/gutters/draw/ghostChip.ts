/**
 * Where the live length of a stroke stands (founder 09.11, #689: «размер пишется вверху, в левом углу» — it was a chip
 * fixed at the top of the screen, over «Примерно — не для резки»). Now beside the line being drawn, like a drawn run's
 * label: at the middle of the stroke, off it on the upper side (the finger is at the end, under the hand), inside the
 * canvas and below the top bar. Pure: screen points in, the chip's top-left out.
 */
export type Pt = readonly [number, number];

export function ghostChipAt(
  a: Pt,
  b: Pt,
  chip: { w: number; h: number },
  box: { w: number; h: number; top: number },
  gap: number,
): { left: number; top: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  // the normal on the upper side (screen y grows down); a dot (no length yet) — straight above it
  let nx = 0;
  let ny = -1;
  if (len > 0) {
    nx = -dy / len;
    ny = dx / len;
    if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
  }
  // far enough that the chip's box clears the line: half its extent along the normal, and the gap
  const reach = (Math.abs(nx) * chip.w + Math.abs(ny) * chip.h) / 2 + gap;
  const cx = (a[0] + b[0]) / 2 + nx * reach;
  const cy = (a[1] + b[1]) / 2 + ny * reach;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(Math.max(lo, hi), v));
  return { left: clamp(cx - chip.w / 2, 0, box.w - chip.w), top: clamp(cy - chip.h / 2, box.top, box.h - chip.h) };
}
