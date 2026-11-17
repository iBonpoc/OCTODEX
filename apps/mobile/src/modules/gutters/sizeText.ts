/**
 * A downspout's cross-section, written one way everywhere — the canvas, the windows, the settings, the parts, the PDFs,
 * the supplier's order (founder 16.11, #1916: «не надо писать 2 инча на 3. Просто 2 на 3 оставляем»; DS §4.5):
 * a rectangular one «2×3», «3×4», «4×5» — no inch marks; a round one «3″». Anything else stays as it is.
 * The only place that knows the format: a guard (`gutterSizeText.test.ts`) fails on any other «x → ×» in the module.
 */
export function sizeText(v: string): string {
  if (/^\d+(\.\d+)?$/.test(v)) return `${v}″`;
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(v);
  return m ? `${m[1]}×${m[2]}` : v;
}
