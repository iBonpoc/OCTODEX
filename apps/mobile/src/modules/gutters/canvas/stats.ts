/**
 * Numbers of the speed check (docs/specs/33-gutters-module.md §9, П14.2; П20.3). Pure.
 * A frame's rate is 1000 / its interval; «p90 ≥ 55 fps» = 90 % of frames came within 1000/55 ms.
 */
export const pct = (xs: readonly number[], p: number): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!;
};
/** frame intervals (ms) → the rate 90 % of frames reach */
export const fpsP90 = (intervalsMs: readonly number[]) => {
  const t = pct(intervalsMs, 90);
  return Number.isFinite(t) && t > 0 ? 1000 / t : NaN;
};
/** a histogram of frame intervals (index = whole ms, the last bucket = that and above) → intervals */
export const fromHistogram = (h: readonly number[]): number[] => h.flatMap((n, ms) => Array<number>(n).fill(Math.max(ms, 1)));
export const intervals = (stamps: readonly number[]) => stamps.slice(1).map((t, i) => t - stamps[i]!);

export type BenchKey = "pan" | "drag" | "tap" | "open";
/** the founder's thresholds (§9): fps for pan and drag, ms for tap and open */
export const LIMITS: Record<BenchKey, { kind: "fps" | "ms"; limit: number }> = {
  pan: { kind: "fps", limit: 55 },
  drag: { kind: "fps", limit: 50 },
  tap: { kind: "ms", limit: 100 },
  open: { kind: "ms", limit: 500 },
};
export const passes = (k: BenchKey, v: number) => Number.isFinite(v) && (LIMITS[k].kind === "fps" ? v >= LIMITS[k].limit : v < LIMITS[k].limit);

export interface BenchResult { key: BenchKey; value: number; samples: number }
/** the text the founder copies and sends (no personal data: the device model, the OS, the build, the numbers) */
export function reportText(rs: readonly BenchResult[], head: string, word: (ok: boolean) => string, name: (k: BenchKey) => string): string {
  const unit = (k: BenchKey) => (LIMITS[k].kind === "fps" ? "fps" : "ms");
  const lines = rs.map((r) => `${name(r.key)}: ${Number.isFinite(r.value) ? Math.round(r.value) : "—"} ${unit(r.key)} (${LIMITS[r.key].kind === "fps" ? "≥" : "<"} ${LIMITS[r.key].limit}) — ${word(passes(r.key, r.value))} · n=${r.samples}`);
  return [head, ...lines].join("\n");
}
