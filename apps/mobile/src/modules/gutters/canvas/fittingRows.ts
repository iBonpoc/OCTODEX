/**
 * The downspout window's fitting rows (v43 PR C): «Elbow A · 75° ⌄ · − n +», «Offset A · 2″ ⌄ · − n +». Pure — unit-tested
 * (test/gutterFittingRows.test.ts). The model is G2's (#2465): a rect elbow has its own `angle`, an offset its `style` "B";
 * the engine counts both in the key and the order (never the price). A default is not written (rule 16: an old phone reads the same).
 */
import { DEFAULT_ELBOW_ANGLE, defaultOffsetsFor } from "@octo/estimating-engine";
import { boughtElbowCounts, boughtElbowPatch, elbowCounts, OFFSETS_IN, type DsAttrs } from "./attrs";

/** the angles the menu offers; another one a drawing has stays shown (and pickable) */
export const ELBOW_ANGLES = [30, 45, 60, 75, 90] as const;

type ElbowKey = Pick<DsAttrs, "shape" | "dsStyle" | "elbows" | "elbowBend">;

/** a rect elbow style's angle: its own, else 75° */
export const rectElbowAngle = (a: Pick<DsAttrs, "elbows">, style: string): number =>
  a.elbows?.find((e) => e.style === style && e.angle !== undefined)?.angle ?? DEFAULT_ELBOW_ANGLE;

/** the bought count (and the angle, when given) of one rect style changed — the list the engine reads; 75° is not written */
export function rectElbowPatch(a: ElbowKey, style: string, qty: number, angle?: number): Pick<DsAttrs, "elbows" | "elbowBend"> {
  const p = boughtElbowPatch(a, style, qty);
  if (angle === undefined || !p.elbows) return p;
  return { ...p, elbows: p.elbows.map((e) => (e.style === style ? (angle === DEFAULT_ELBOW_ANGLE ? { style: e.style, qty: e.qty } : { style: e.style, qty: e.qty, angle }) : e)) };
}

export { boughtElbowCounts };

/** a round downspout's one elbow row: the angle is its style («45» … «90»); 75° and 0 when it has none */
export function roundElbow(a: ElbowKey): { style: string; qty: number } {
  const counts = Object.entries(elbowCounts({ ...a, shape: "round" })).filter(([, q]) => q > 0);
  return counts.length ? { style: counts[0]![0], qty: counts.reduce((s, [, q]) => s + q, 0) } : { style: String(DEFAULT_ELBOW_ANGLE), qty: 0 };
}

/** a round downspout's elbow row changed: the angle (all the count moves to that style) and/or the count — one style; 0 is a style at 0 */
export function roundElbowPatch(a: ElbowKey, p: { style?: string; qty?: number }): Pick<DsAttrs, "elbows"> {
  const cur = roundElbow(a);
  return { elbows: [{ style: p.style ?? cur.style, qty: Math.max(0, Math.round(p.qty ?? cur.qty)) }] };
}

type OffsetKey = Pick<DsAttrs, "shape" | "offsets">;
export type OffsetStyle = "A" | "B";
/** a round downspout has one offset row; a rect one A and B */
export const offsetStylesOf = (shape: string): readonly OffsetStyle[] => (shape === "round" ? ["A"] : ["A", "B"]);

/** the offset row of a style: the count and the length of what the downspout has (unset — the engine's default); 2″ when none */
export function offsetRow(a: OffsetKey, style: OffsetStyle): { lengthIn: number; qty: number } {
  const mine = (a.offsets ?? defaultOffsetsFor(a)).filter((o) => ((o as { style?: string }).style ?? "A") === style);
  return { lengthIn: mine[0]?.lengthIn ?? OFFSETS_IN[1], qty: mine.reduce((s, o) => s + o.qty, 0) };
}

/** a style's count and/or length changed: the whole list (A first, B second; style B written, A not — rule 16); nothing left — none, and a round one's default stays off with a 0 */
export function offsetsPatch(a: OffsetKey, style: OffsetStyle, p: { qty?: number; lengthIn?: number }): Pick<DsAttrs, "offsets"> {
  const rows = offsetStylesOf(a.shape).map((s) => {
    const cur = offsetRow(a, s);
    return { s, lengthIn: s === style ? p.lengthIn ?? cur.lengthIn : cur.lengthIn, qty: s === style ? Math.max(0, Math.round(p.qty ?? cur.qty)) : cur.qty };
  });
  const list = rows.filter((r) => r.qty > 0).map((r) => ({ lengthIn: r.lengthIn, qty: r.qty, ...(r.s === "B" ? { style: "B" as const } : {}) }));
  if (list.length) return { offsets: list };
  return a.shape === "round" ? { offsets: [{ lengthIn: rows[0]!.lengthIn, qty: 0 }] } : { offsets: undefined };
}
