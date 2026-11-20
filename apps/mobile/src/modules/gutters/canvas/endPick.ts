/**
 * A cap picked on its own (#1855, founder 16.11: «выбираю End Cap и нажимаю удалить — удаляется весь желоб… надо нажимать на
 * end cap и удалять её одну»). A tap on a free end with a cap picks that end; 🗑 then takes the cap off (the end stays a free
 * end «без заглушки», as its sheet's row does) and the gutter stays. Pure: the canvas screen keeps the picked end.
 */
import { findCorners, runEnds, type Drawing } from "../geometry";

export type PickedEnd = { id: string; end: 0 | 1 } | null;

/** the end has a cap now: a free end (not a corner, not butted to another gutter) and not set «без заглушки» */
export function hasCap(d: Pick<Drawing, "runs">, id: string, end: 0 | 1): boolean {
  const r = d.runs.find((x) => x.id === id);
  if (!r || r.noCap?.[end]) return false;
  return runEnds(d, findCorners(d))[id]?.[end]?.kind === "cap";
}

/** what 🗑 removes: the picked end's cap, else the picked element (a gutter, a downspout), else nothing */
export function deleteTarget(d: Pick<Drawing, "runs">, selected: string | null, end: PickedEnd): { kind: "cap"; id: string; end: 0 | 1 } | { kind: "element"; id: string } | null {
  if (!selected) return null;
  if (end && end.id === selected && hasCap(d, end.id, end.end)) return { kind: "cap", id: end.id, end: end.end };
  return { kind: "element", id: selected };
}
