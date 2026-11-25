/**
 * The downspout window's fitting rows (v43 PR C): «Elbow A · 75° ⌄ · − n +», «Offset A · 2″ ⌄ · − n +». Pure — unit-tested
 * (test/gutterFittingRows.test.ts). The model is G2's (#2465): a rect elbow has its own `angle`, an offset its `style` "B";
 * the engine counts both in the key and the order (never the price). A default is not written (rule 16: an old phone reads the same).
 */
import { DEFAULT_ELBOW_ANGLE, defaultElbowsFor, defaultOffsetsFor } from "@octo/estimating-engine";
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

type RoundEntry = { style: string; qty: number; angle?: number };
/** the entries a round downspout has (unset — the engine's default); a window of before had a stepper per angle, so a drawing may carry several */
const roundEntries = (a: ElbowKey): RoundEntry[] => (a.elbows ?? defaultElbowsFor({ ...a, shape: "round" })).filter((e) => e.qty > 0);

/** a round downspout's one elbow row: its FIRST entry (the angle is its style «45» … «90»); 75° and 0 when it has none */
export function roundElbow(a: ElbowKey): { style: string; qty: number } {
  const first = roundEntries(a)[0];
  return first ? { style: first.style, qty: first.qty } : { style: String(DEFAULT_ELBOW_ANGLE), qty: 0 };
}

/** the entries the row does not show (old drawings, rule 16): never rewritten by the row, and told to the window */
export const roundElbowRest = (a: ElbowKey): RoundEntry[] => roundEntries(a).slice(1);

/**
 * A round downspout's elbow row changed — the angle and/or the count of the FIRST entry only; the other entries stay as they are
 * (K2 #2662: folding them into one rewrote two 90° elbows as 45° — the key and the order change). All at 0 — one style at 0.
 */
export function roundElbowPatch(a: ElbowKey, p: { style?: string; qty?: number }): Pick<DsAttrs, "elbows"> {
  const cur = roundElbow(a);
  const mine: RoundEntry = { style: p.style ?? cur.style, qty: Math.max(0, Math.round(p.qty ?? cur.qty)) };
  const list = [...(mine.qty > 0 ? [mine] : []), ...roundElbowRest(a)];
  return { elbows: list.length ? list : [{ style: mine.style, qty: 0 }] };
}

type OffsetKey = Pick<DsAttrs, "shape" | "offsets">;
export type OffsetStyle = "A" | "B";
type OffsetEntry = { lengthIn: number; qty: number; style?: "A" | "B" };
/** a round downspout has one offset row; a rect one A and B */
export const offsetStylesOf = (shape: string): readonly OffsetStyle[] => (shape === "round" ? ["A"] : ["A", "B"]);

const offsetEntries = (a: OffsetKey): OffsetEntry[] => (a.offsets ?? defaultOffsetsFor(a)) as OffsetEntry[];
const styleOf = (o: OffsetEntry): OffsetStyle => (o.style === "B" ? "B" : "A");
const firstOf = (a: OffsetKey, style: OffsetStyle) => offsetEntries(a).find((o) => styleOf(o) === style && o.qty > 0);

/** the offset row of a style: its FIRST entry (the count and the length); 2″ at 0 when none */
export function offsetRow(a: OffsetKey, style: OffsetStyle): { lengthIn: number; qty: number } {
  const e = firstOf(a, style);
  return e ? { lengthIn: e.lengthIn, qty: e.qty } : { lengthIn: OFFSETS_IN[1], qty: 0 };
}

/** the other entries of the style (another length): not shown in the row, never rewritten, told to the window (rule 16) */
export const offsetRest = (a: OffsetKey, style: OffsetStyle): OffsetEntry[] => offsetEntries(a).filter((o) => styleOf(o) === style && o.qty > 0).slice(1);

/**
 * A style's count and/or length changed: only its FIRST entry is rewritten (in place; a new one is appended; at 0 it goes); every other
 * entry stays (K2 #2662: two lengths of one style were folded into one). B is written with its style, A without (rule 16). Nothing left:
 * a rect one — none; a round one keeps a 0 (else its default 1 × 2″ would come back).
 */
export function offsetsPatch(a: OffsetKey, style: OffsetStyle, p: { qty?: number; lengthIn?: number }): Pick<DsAttrs, "offsets"> {
  const list = offsetEntries(a).map((o) => ({ ...o }));
  const at = list.findIndex((o) => styleOf(o) === style && o.qty > 0);
  const cur = at >= 0 ? list[at]! : { lengthIn: OFFSETS_IN[1], qty: 0 };
  const lengthIn = p.lengthIn ?? cur.lengthIn;
  const qty = Math.max(0, Math.round(p.qty ?? cur.qty));
  const mine: OffsetEntry = { lengthIn, qty, ...(style === "B" ? { style: "B" as const } : {}) };
  if (at >= 0) list[at] = mine;
  else list.push(mine);
  const kept = list.filter((o) => o.qty > 0).map((o) => (o.style === "B" ? { lengthIn: o.lengthIn, qty: o.qty, style: "B" as const } : { lengthIn: o.lengthIn, qty: o.qty }));
  if (kept.length) return { offsets: kept };
  return a.shape === "round" ? { offsets: [{ lengthIn, qty: 0 }] } : { offsets: undefined };
}
