/**
 * The window of a gutter or a downspout works on a copy (spec 33-gutters-windows §3.17 е, #1858; DS §7.3 exception of Gutters):
 * every choice changes the copy only, «Сохранить» puts the whole copy into the drawing as ONE edit (one step of «Назад»),
 * «Закрыть» / «Не сохранять» drop it — nothing is written. The length is part of the copy: the fields ft · in and the fraction
 * (keys, the tape) are kept as typed and read only on «Сохранить» (no «Применить» any more).
 *
 * Pure: the screen keeps one draft in its state, the rules are here (tests: test/gutterAttrDraft.test.ts).
 */
import { changeDs, changeRun, sameAttrs, tapeIn, unitFields, type DsAttrs, type RunAttrs } from "../canvas/attrs";
import { putDsAttrs, putRunAttrs, setLength } from "../canvas/edit";
import { runLengthIn, type Drawing } from "../geometry";
import type { Choices } from "../settings";

/** the length as typed: feet, inches, sixteenths (0–15) */
export interface LenFields { ft: string; inc: string; e16: number }

export type AttrDraft =
  | { kind: "run"; id: string; attrs: RunAttrs; len: LenFields }
  | { kind: "ds"; id: string; attrs: DsAttrs };

/** the fields of a length, to the sixteenth */
export const lenFields = (inches: number): LenFields => {
  const f = unitFields(inches, "ftin");
  return { ft: f.ft, inc: f.inc, e16: f.e16 };
};

/** the copy of what the drawing has now for this element; none — it is not on the drawing */
export function draftOf(d: Drawing, id: string): AttrDraft | null {
  const r = d.runs.find((x) => x.id === id);
  if (r) return { kind: "run", id, attrs: r.attrs, len: lenFields(runLengthIn(r)) };
  const s = d.downspouts.find((x) => x.id === id);
  if (!s) return null;
  const { id: _id, runId: _r, atIn: _a, ...attrs } = s;
  return { kind: "ds", id, attrs };
}

/** one choice in the window: the same rules as on the drawing (a new profile takes its size and kit, …) — on the copy */
export function patchDraft(dr: AttrDraft, patch: Partial<RunAttrs> | Partial<DsAttrs>, ch?: Choices): AttrDraft {
  if (dr.kind === "run") {
    const attrs = changeRun(dr.attrs, patch as Partial<RunAttrs>, ch);
    return attrs === dr.attrs ? dr : { ...dr, attrs };
  }
  const attrs = changeDs(dr.attrs, patch as Partial<DsAttrs>, ch);
  return attrs === dr.attrs ? dr : { ...dr, attrs };
}

/** the length typed into the copy (the fields, a fraction key, the tape) */
export function setDraftLen(dr: AttrDraft, len: Partial<LenFields>): AttrDraft {
  return dr.kind === "run" ? { ...dr, len: { ...dr.len, ...len } } : dr;
}

/** the typed length in inches; null — nothing sensible (empty, 0, inches ≥ 12, longer than a run can be) */
export const draftLengthIn = (dr: AttrDraft): number | null => (dr.kind === "run" ? tapeIn(dr.len.ft, dr.len.inc, dr.len.e16) : null);

/** what «Сохранить» would change: the attributes, the length — none, nothing to ask on «Закрыть» */
export function draftChanges(d: Drawing, dr: AttrDraft): { attrs: boolean; length: boolean } {
  const now = draftOf(d, dr.id);
  if (!now || now.kind !== dr.kind) return { attrs: false, length: false };
  const attrs = !sameAttrs(now.attrs, dr.attrs);
  if (dr.kind !== "run" || now.kind !== "run") return { attrs, length: false };
  // the fields as they opened are no change, even a half-typed one put back; typed — compared to the sixteenth
  const same = now.len.ft === dr.len.ft && now.len.inc === dr.len.inc && now.len.e16 === dr.len.e16;
  const n = draftLengthIn(dr);
  const length = !same && (n === null || Math.round(n * 16) !== Math.round(runLengthIn(d.runs.find((x) => x.id === dr.id)!) * 16));
  return { attrs, length };
}

export const isDirty = (d: Drawing, dr: AttrDraft | null): boolean => {
  if (!dr) return false;
  const x = draftChanges(d, dr);
  return x.attrs || x.length;
};

/**
 * «Сохранить»: the copy into the drawing, one drawing back (one step of «Назад»). A length that is not a number is not
 * saved — `bad`, the window stays open and says so under the field. Nothing changed — the same drawing.
 */
export function applyDraft(d: Drawing, dr: AttrDraft): { drawing: Drawing; bad: boolean } {
  if (dr.kind === "ds") return { drawing: putDsAttrs(d, dr.id, dr.attrs), bad: false };
  const ch = draftChanges(d, dr);
  let next = putRunAttrs(d, dr.id, dr.attrs);
  if (ch.length) {
    const n = draftLengthIn(dr);
    if (n === null) return { drawing: d, bad: true };
    next = setLength(next, dr.id, n);
  }
  return { drawing: next, bad: false };
}
