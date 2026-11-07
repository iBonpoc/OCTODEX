/**
 * One box for every signature: 400 × 160 (2.5 : 1) — the PDF's viewBox and the preview's (founder 07.11: drawn on a
 * wide field at 820/1280, the right part of a signature fell outside the PDF). A client's signature is legally
 * meaningful, so the path is only SCALED, evenly on both axes: every point stays, nothing is smoothed or dropped.
 * Phone fields (≤ 400 × 160) are saved exactly as drawn.
 */
export const SIG_BOX = { w: 400, h: 160 } as const;

const NUM = /-?\d+(?:\.\d+)?/g;

/** the path with every number × k (commands and order untouched) */
export function scale(d: string, k: number): string {
  return d.replace(NUM, (n) => String(Math.round(Number(n) * k * 100) / 100));
}

/** the largest x and y of the path (M/L pairs) */
export function signatureBounds(d: string): { maxX: number; maxY: number } {
  const n = (d.match(NUM) ?? []).map(Number);
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i + 1 < n.length; i += 2) {
    maxX = Math.max(maxX, n[i]!);
    maxY = Math.max(maxY, n[i + 1]!);
  }
  return { maxX, maxY };
}

/** on save: the pad's pixels → the box, one factor for both axes; a field that already fits is kept as drawn */
export function normalizeSignature(d: string, fieldW: number, fieldH: number): string {
  if (!d || fieldW <= 0 || fieldH <= 0) return d;
  const k = Math.min(SIG_BOX.w / fieldW, SIG_BOX.h / fieldH);
  return k >= 1 ? d : scale(d, k);
}

/**
 * On show (PDF, preview): a path that goes past the box — saved before the fix from a wide field, whose width was not
 * stored — is scaled evenly to fit by its own extent. Paths inside the box are drawn as saved.
 */
export function fitSignature(d: string): string {
  if (!d) return d;
  const { maxX, maxY } = signatureBounds(d);
  const k = Math.min(maxX > SIG_BOX.w ? SIG_BOX.w / maxX : 1, maxY > SIG_BOX.h ? SIG_BOX.h / maxY : 1);
  return k >= 1 ? d : scale(d, k);
}
