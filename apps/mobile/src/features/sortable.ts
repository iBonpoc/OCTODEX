/**
 * Dragging in the estimate's list (DS §14.6, spec 2026-11-12-estimate-editor Р5): the pure part. The list shows `ViewRow`s (sections and
 * lines); while a row is held the rest of the rows keep their order and the held one is dropped at a place BETWEEN them:
 * `resolveDrop` turns that place into what `moveLine` / `moveSection` (features/sectionLayout.ts) take. A section is carried
 * whole — its lines and subsections go with it.
 */
import type { ViewRow } from "./sectionLayout";

export const rowKey = (r: ViewRow): string => (r.type === "section" ? `s:${r.section.id}` : r.type === "line" ? `l:${r.line.id}` : "u");

/** what a row can be carried as: a line, a section, a subsection (the «без раздела» heading is not carried) */
export function dragKind(r: ViewRow): "line" | "section" | "subsection" | null {
  // a line the module (the measurement) leads is not moved by hand — not by the handle, not by a hold, as in «⋯» (no lift, no buzz)
  if (r.type === "line") return r.line.source ? null : "line";
  if (r.type === "section") return r.depth === 0 ? "section" : "subsection";
  return null;
}

/** the rows without the held one — and, for a section, without everything that goes with it (its lines and subsections) */
export function withoutBlock(rows: ViewRow[], key: string): { rest: ViewRow[]; block: ViewRow[]; at: number } {
  const i = rows.findIndex((r) => rowKey(r) === key);
  if (i < 0) return { rest: rows, block: [], at: -1 };
  const r = rows[i]!;
  let end = i + 1;
  if (r.type === "section") {
    // a top section takes everything up to the next top section or the «без раздела» heading; a subsection — up to the next heading
    while (end < rows.length) {
      const n = rows[end]!;
      if (n.type === "unsectioned") break;
      if (n.type === "section" && n.depth <= r.depth) break;
      end += 1;
    }
  }
  return { rest: [...rows.slice(0, i), ...rows.slice(end)], block: rows.slice(i, end), at: i };
}

export type Drop =
  | { kind: "line"; id: string; to: { sectionId?: string; beforeId?: string } }
  | { kind: "section"; id: string; to: { parentId?: string; beforeId?: string } };

/** the section each row stands in (a heading — itself; «без раздела» and what follows it — none) */
function owners(rows: ViewRow[]): (string | undefined)[] {
  let cur: string | undefined;
  return rows.map((r) => {
    if (r.type === "section") {
      cur = r.section.id;
      return cur;
    }
    if (r.type === "unsectioned") {
      cur = undefined;
      return undefined;
    }
    return cur;
  });
}

/**
 * The drop of the row `key` at the place `p` among the other rows (0 — before the first of them, rest.length — after the last).
 * A line: before the line that follows if there is one, else at the end of the section above (into a heading above — into
 * that section, a folded one too: at its end; above the first heading — «без раздела»). A section: before the next top section;
 * a subsection: before the next subsection of the same section, else at the end of it.
 */
export function resolveDrop(rows: ViewRow[], key: string, p: number): Drop | null {
  const { rest, block } = withoutBlock(rows, key);
  const held = block[0];
  if (!held) return null;
  const at = Math.max(0, Math.min(p, rest.length));
  const own = owners(rest);
  const after = rest[at];
  const before = rest[at - 1];
  if (held.type === "line") {
    if (after && after.type === "line") return { kind: "line", id: held.line.id, to: { sectionId: own[at], beforeId: after.line.id } };
    if (!before) return { kind: "line", id: held.line.id, to: {} };
    if (before.type === "unsectioned") return { kind: "line", id: held.line.id, to: {} };
    return { kind: "line", id: held.line.id, to: { sectionId: own[at - 1] } };
  }
  if (held.type !== "section") return null;
  if (held.depth === 0) {
    for (let i = at; i < rest.length; i++) {
      const r = rest[i]!;
      if (r.type === "unsectioned") break;
      if (r.type === "section" && r.depth === 0) return { kind: "section", id: held.section.id, to: { beforeId: r.section.id } };
    }
    return { kind: "section", id: held.section.id, to: {} };
  }
  // a subsection: which top section is the place in
  let top: string | undefined;
  for (let i = at - 1; i >= 0; i--) {
    const r = rest[i]!;
    if (r.type === "unsectioned") break;
    if (r.type === "section" && r.depth === 0) {
      top = r.section.id;
      break;
    }
  }
  if (!top) return { kind: "section", id: held.section.id, to: {} };
  for (let i = at; i < rest.length; i++) {
    const r = rest[i]!;
    if (r.type === "unsectioned" || (r.type === "section" && r.depth === 0)) break;
    if (r.type === "section" && r.depth === 1) return { kind: "section", id: held.section.id, to: { parentId: top, beforeId: r.section.id } };
  }
  return { kind: "section", id: held.section.id, to: { parentId: top } };
}

/**
 * The place between the other rows where a held row's centre is: `mids` are the middles of the other rows, top to bottom.
 * (0 — above the first one's middle … mids.length — below the last one's.)
 */
export function insertionIndex(mids: number[], centre: number): number {
  let p = 0;
  while (p < mids.length && centre > mids[p]!) p += 1;
  return p;
}

/**
 * The place with a margin (DS §14.6, `gesture.slotHysteresis`): from the place `cur` the held row goes down only once its centre is
 * `hyst` below a neighbour's middle, and up only once it is `hyst` above — a finger resting on a middle does not flick between two places.
 */
export function placeWithMargin(mids: number[], centre: number, cur: number, hyst: number): number {
  const down = insertionIndex(mids, centre - hyst);
  if (down > cur) return down;
  const up = insertionIndex(mids, centre + hyst);
  if (up < cur) return up;
  return Math.max(0, Math.min(cur, mids.length));
}

/**
 * Does the new place cross into another section (#1312, DS §14.6)? «selection» buzzes ONLY then, not on every place change: for a
 * line — the section it would land in; for a section — where it would stand (its parent and the one after it).
 */
export function crossesSection(rows: ViewRow[], key: string, from: number, to: number): boolean {
  if (from === to) return false;
  const a = resolveDrop(rows, key, from);
  const b = resolveDrop(rows, key, to);
  if (!a || !b) return false;
  if (a.kind === "line" && b.kind === "line") return (a.to.sectionId ?? "") !== (b.to.sectionId ?? "");
  if (a.kind === "section" && b.kind === "section") return (a.to.parentId ?? "") !== (b.to.parentId ?? "") || (a.to.beforeId ?? "") !== (b.to.beforeId ?? "");
  return false;
}

/** how far a row is pushed to make room: rows between the held one's old and new place move by its height (down or up) */
export function shiftOf(index: number, from: number, to: number, height: number): number {
  // index, from, to — positions in the list WITHOUT the held row's own slot: rows at [to, from) move down, rows at [from, to) move up
  if (to < from && index >= to && index < from) return height;
  if (to > from && index >= from && index < to) return -height;
  return 0;
}

/**
 * How far the page scrolls in one tick while a row is held: nothing while the finger's place is not known yet (`y` is null until the
 * drag reports it — before, a 0 read as «at the very top» and the page ran away, #1245), then up inside the top edge zone and down
 * inside the bottom one, faster the deeper in. `top` / `bottom` are the edges of what the person can see (below the header and the
 * status bar, above the bottom bar), `edge` the depth of the zone, `max` the fastest step.
 */
export function edgeStep(y: number | null, top: number, bottom: number, edge: number, max: number): number {
  if (y === null || !Number.isFinite(y) || edge <= 0) return 0;
  const depth = y < top + edge ? (top + edge - y) / edge : y > bottom - edge ? (y - (bottom - edge)) / edge : 0;
  if (depth <= 0) return 0;
  // the speed grows with the depth squared: a finger just inside the zone creeps, at the very edge it runs (DS §14.6)
  const d = Math.min(1, depth);
  const step = Math.max(1, Math.round(d * d * max));
  return y < top + edge ? -step : step;
}

/**
 * While a LINE is carried, «Без раздела» is a place to drop even when no line is outside a section yet (DS §14.6): the heading is
 * added at the end of a list that has sections and no loose lines. A list with no sections needs none (every place is «without»).
 */
export function withLooseTarget(rows: ViewRow[], carryingLine: boolean): ViewRow[] {
  if (!carryingLine || rows.some((r) => r.type === "unsectioned") || !rows.some((r) => r.type === "section")) return rows;
  return [...rows, { type: "unsectioned", lineCount: 0 }];
}

/** what a drop came to: the list is different now / it ended where it was / the module leads the order and refused */
export type DropResult = "moved" | "same" | "refused";

/** the feel of a drop, decided by what it CAME TO (never before): a move — «medium»; a refusal — «warning»; nothing moved — none */
export const feelOf = (r: DropResult): "medium" | "warning" | null => (r === "moved" ? "medium" : r === "refused" ? "warning" : null);

/** one row is held at a time: a second finger on another row (or its handle and its body) is not a second drag (#1245) */
export const canBegin = (active: string | null): boolean => active === null;
/** only the row that is held hears about moves and the end of ITS drag */
export const ownsDrag = (active: string | null, key: string): boolean => active === key;

/**
 * What a gesture may write to the held row's place: only THE held row's own finger. A second finger on another row (its `begin` was
 * refused) or on the other handler of the same row must not move the lifted row — it would jump between the fingers (#1262).
 * Runs on the UI thread (a worklet): `active` is the held key, "" — none.
 */
export function dragWrite(active: string, key: string, translationY: number, scrolled: number): number | null {
  "worklet";
  return active !== "" && active === key ? translationY + scrolled : null;
}

/** the held row is no longer in the list (its adding was undone, another option opened): the drag must end by itself */
export const heldGone = (active: string | null, keys: string[]): boolean => active !== null && !keys.includes(active);
