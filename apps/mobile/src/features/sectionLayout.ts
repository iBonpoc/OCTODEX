/**
 * Sections of an estimate option (DS §8.5, spec 2026-11-12-estimate-editor Р4–Р5): the pure part — what the list shows, and
 * the changes (add, rename, delete, lay out by kind, move). The stored shape is the engine's: `option.sections` (the order of
 * the array is the order shown; one level of subsections via `parentId`) and `line.sectionId`. A line whose section is not
 * there (an older phone's clone, past the limit) is «без раздела». Money never depends on any of this.
 */
import { SECTIONS_MAX, countedSections, type CustomLine, type CustomOption, type EstimateSection, type LineGroup } from "@octo/estimating-engine";
import { cleanSectionTitle, uid } from "./estimateDoc";

export const KIND_ORDER: LineGroup[] = ["material", "labor", "service"];

const isModule = (s: EstimateSection) => s.kind === "module";
const isKind = (s: EstimateSection) => !!s.kind && s.kind !== "module" && !s.title;

/* ---------------------------------- what the list shows ---------------------------------- */

export type ViewRow =
  | { type: "section"; section: EstimateSection; depth: 0 | 1; lineCount: number; collapsed: boolean }
  | { type: "line"; line: CustomLine; depth: 0 | 1 }
  /** the heading over lines that belong to no section (shown when there are sections) */
  | { type: "unsectioned"; lineCount: number };

/**
 * The rows in the order they stand: each top section (its own lines, then its subsections, each with theirs), then
 * «без раздела». A collapsed section keeps its heading and hides its lines and subsections. One pass over the lines.
 */
export function viewRows(o: Pick<CustomOption, "lines" | "sections">, collapsed: ReadonlySet<string> = new Set()): ViewRow[] {
  const counted = countedSections(o);
  if (counted.length === 0) return o.lines.map((line) => ({ type: "line", line, depth: 0 }));
  const known = new Set(counted.map((s) => s.id));
  const byS = new Map<string, CustomLine[]>();
  const loose: CustomLine[] = [];
  for (const l of o.lines) {
    if (l.sectionId && known.has(l.sectionId)) {
      const a = byS.get(l.sectionId);
      if (a) a.push(l);
      else byS.set(l.sectionId, [l]);
    } else loose.push(l);
  }
  const subsOf = new Map<string, EstimateSection[]>();
  for (const s of counted) if (s.parentId) subsOf.set(s.parentId, [...(subsOf.get(s.parentId) ?? []), s]);
  const count = (s: EstimateSection): number => (byS.get(s.id)?.length ?? 0) + (subsOf.get(s.id) ?? []).reduce((n, x) => n + count(x), 0);
  const rows: ViewRow[] = [];
  const emit = (s: EstimateSection, depth: 0 | 1) => {
    const closed = collapsed.has(s.id);
    rows.push({ type: "section", section: s, depth, lineCount: count(s), collapsed: closed });
    if (closed) return;
    for (const l of byS.get(s.id) ?? []) rows.push({ type: "line", line: l, depth });
    for (const sub of subsOf.get(s.id) ?? []) emit(sub, 1);
  };
  for (const s of counted) if (!s.parentId) emit(s, 0);
  if (loose.length) {
    rows.push({ type: "unsectioned", lineCount: loose.length });
    for (const l of loose) rows.push({ type: "line", line: l, depth: 0 });
  }
  return rows;
}

/* ---------------------------------- changes ---------------------------------- */

export type Opt = Pick<CustomOption, "lines" | "sections"> & Partial<CustomOption>;
const withSections = <T extends Opt>(o: T, sections: EstimateSection[], lines: CustomLine[] = o.lines): T => ({ ...o, lines, sections });

/** a section may be added while the option has fewer than SECTIONS_MAX counted ones */
export const canAddSection = (o: Opt): boolean => countedSections(o).length < SECTIONS_MAX;

/** «＋ Раздел» (a top one, at the end) or «Добавить подраздел» (under a top section that is not a module's, one level only) */
export function addSection<T extends Opt>(o: T, opts: { parentId?: string; title?: string; kind?: LineGroup } = {}, newId: () => string = uid): { option: T; id: string } | null {
  if (!canAddSection(o)) return null;
  const all = o.sections ?? [];
  if (opts.parentId) {
    const parent = all.find((s) => s.id === opts.parentId);
    if (!parent || parent.parentId || isModule(parent)) return null;
  }
  const id = newId();
  const title = opts.title === undefined ? undefined : cleanSectionTitle(opts.title);
  const s: EstimateSection = { id, ...(title ? { title } : {}), ...(opts.kind && !title ? { kind: opts.kind } : {}), ...(opts.parentId ? { parentId: opts.parentId } : {}) };
  // a subsection stands after its parent's last child (the order of the array is the order shown)
  let at = all.length;
  if (opts.parentId) {
    const last = Math.max(all.findIndex((x) => x.id === opts.parentId), ...all.map((x, i) => (x.parentId === opts.parentId ? i : -1)));
    at = last + 1;
  }
  return { option: withSections(o, [...all.slice(0, at), s, ...all.slice(at)]), id };
}

/** «Переименовать»: the section's own title is kept and its `kind` goes; an empty title leaves it as it was */
export function renameSection<T extends Opt>(o: T, id: string, title: string): T {
  const clean = cleanSectionTitle(title);
  if (!clean) return o;
  return withSections(
    o,
    (o.sections ?? []).map((s) => {
      if (s.id !== id) return s;
      const { kind: _k, ...rest } = s;
      // a module's section keeps its kind and module (the measurement leads it); only the title is the person's
      return isModule(s) ? { ...s, title: clean } : { ...rest, title: clean };
    }),
  );
}

/**
 * «Удалить раздел»: nothing is lost. Its lines go one level up (a subsection's — to its section, a top section's — to «без
 * раздела»); its subsections become top sections with their lines.
 */
export function deleteSection<T extends Opt>(o: T, id: string): T {
  const all = o.sections ?? [];
  const gone = all.find((s) => s.id === id);
  if (!gone) return o;
  const up = gone.parentId;
  const sections = all.filter((s) => s.id !== id).map((s) => (s.parentId === id ? (({ parentId: _p, ...rest }) => rest)(s) : s));
  const lines = o.lines.map((l) => {
    if (l.sectionId !== id) return l;
    const { sectionId: _s, ...rest } = l;
    return up ? { ...rest, sectionId: up } : rest;
  });
  return withSections(o, sections, lines);
}

/**
 * «Вернуть» of a layout change (delete a section, «Разложить по видам») takes back THAT change only, never the whole
 * document (#1227, #1231, #1241): the function is built from the option before and after the change, and later applied to
 * whatever the option is by then. It puts a section that went back (after its old neighbour), gives a subsection its
 * parent again if nobody has moved it since, sends a line back to the section it left if it still stands where the change
 * put it, and removes a section the change made only if nothing stands in it now. What the person added or moved
 * meanwhile stays as it is.
 */
export function layoutUndo(before: Opt, after: Opt): <T extends Opt>(o: T) => T {
  const b = before.sections ?? [];
  const a = after.sections ?? [];
  const inAfter = new Set(a.map((x) => x.id));
  const inBefore = new Set(b.map((x) => x.id));
  const gone = b.map((sec, i) => ({ sec, prev: i > 0 ? b[i - 1]!.id : undefined })).filter((x) => !inAfter.has(x.sec.id));
  const created = a.filter((x) => !inBefore.has(x.id)).map((x) => x.id);
  const parentWas = new Map<string, { was?: string; now?: string }>();
  for (const sec of a) {
    const old = b.find((x) => x.id === sec.id);
    if (old && (old.parentId ?? undefined) !== (sec.parentId ?? undefined)) parentWas.set(sec.id, { was: old.parentId, now: sec.parentId });
  }
  const afterOf = new Map(after.lines.map((l) => [l.id, l.sectionId] as const));
  const moves = before.lines.filter((l) => afterOf.has(l.id) && (afterOf.get(l.id) ?? undefined) !== (l.sectionId ?? undefined)).map((l) => ({ id: l.id, from: l.sectionId, to: afterOf.get(l.id) }));
  return <T extends Opt>(o: T): T => {
    let sections = [...(o.sections ?? [])];
    // sections that went come back after the neighbour they stood after (or at the start)
    for (const g of gone) {
      if (sections.some((x) => x.id === g.sec.id)) continue;
      const at = g.prev ? sections.findIndex((x) => x.id === g.prev) : -1;
      sections = [...sections.slice(0, at + 1), g.sec, ...sections.slice(at + 1)];
    }
    // a subsection that became a top section gets its parent back, if nobody moved it since and the parent is there
    sections = sections.map((x) => {
      const w = parentWas.get(x.id);
      if (!w || (x.parentId ?? undefined) !== (w.now ?? undefined)) return x;
      if (w.was && !sections.some((y) => y.id === w.was)) return x;
      const { parentId: _p, ...rest } = x;
      return w.was ? { ...rest, parentId: w.was } : rest;
    });
    const moved = new Map(moves.map((m) => [m.id, m] as const));
    const lines: CustomLine[] = o.lines.map((l) => {
      const m = moved.get(l.id);
      if (!m || (l.sectionId ?? undefined) !== (m.to ?? undefined)) return l;
      if (m.from && !sections.some((x) => x.id === m.from)) return l;
      const { sectionId: _s, ...rest } = l;
      return m.from ? { ...rest, sectionId: m.from } : rest;
    });
    // a section the change made goes if it is empty now (no line, no subsection)
    for (const id of created) {
      if (lines.some((l) => l.sectionId === id) || sections.some((x) => x.parentId === id)) continue;
      sections = sections.filter((x) => x.id !== id);
    }
    const { sections: _old, ...rest } = o;
    return { ...(rest as T), lines, ...(sections.length || before.sections ? { sections } : {}) } as T;
  };
}

/**
 * «Разложить по видам»: lines with no section go into sections «Материалы», «Работа», «Услуги» (in that order, the first
 * ones the option already has are reused); lines of a person's own top section go into its subsections by kind. The order of
 * the lines among themselves stays; empty sections of a kind go, a person's own never; the second run changes nothing.
 * A module's lines stay where they are (the measurement leads them). Null — nothing to do or the limit stops it.
 */
export function layoutByKind<T extends Opt>(o: T, newId: () => string = uid): T | null {
  let sections = [...(o.sections ?? [])];
  const room = () => SECTIONS_MAX - countedSections({ sections }).length;
  const lines = o.lines.map((l) => ({ ...l }));
  const known = new Set(countedSections(o).map((s) => s.id));
  const ensure = (kind: LineGroup, parentId?: string): string | null => {
    const have = sections.find((s) => isKind(s) && s.kind === kind && (s.parentId ?? undefined) === parentId);
    if (have) return have.id;
    if (room() <= 0) return null;
    const s: EstimateSection = { id: newId(), kind, ...(parentId ? { parentId } : {}) };
    if (parentId) {
      const last = Math.max(sections.findIndex((x) => x.id === parentId), ...sections.map((x, i) => (x.parentId === parentId ? i : -1)));
      sections = [...sections.slice(0, last + 1), s, ...sections.slice(last + 1)];
    } else sections = [...sections, s];
    return s.id;
  };
  let changed = false;
  // 1. lines of no section → kind sections (a stable pass per kind keeps the order of the kinds)
  for (const kind of KIND_ORDER) {
    for (const l of lines) {
      if (l.source || l.group !== kind || (l.sectionId && known.has(l.sectionId))) continue;
      const id = ensure(kind);
      if (!id) return changed ? finish() : null;
      l.sectionId = id;
      changed = true;
    }
  }
  // 2. lines that stand directly in a person's own top section → its subsections by kind
  const own = sections.filter((s) => !s.parentId && !isModule(s) && !isKind(s) && s.title);
  for (const top of own) {
    for (const kind of KIND_ORDER) {
      for (const l of lines) {
        if (l.sectionId !== top.id || l.source || l.group !== kind) continue;
        const id = ensure(kind, top.id);
        if (!id) return changed ? finish() : null;
        l.sectionId = id;
        changed = true;
      }
    }
  }
  return changed ? finish() : null;

  function finish(): T {
    // the sections of a kind that hold nothing go (their own subsections' lines count); a person's own never
    const used = new Set(lines.map((l) => l.sectionId).filter((x): x is string => !!x));
    let keep = sections.filter((s) => !(isKind(s) && !used.has(s.id) && !sections.some((c) => c.parentId === s.id && used.has(c.id))));
    keep = keep.filter((s) => !(isKind(s) && s.parentId && !used.has(s.id)));
    // the kind sections stand in the order of the kinds among each other (new ones were added in that order)
    return withSections(o, keep, lines);
  }
}

/* ---------------------------------- moving ---------------------------------- */

export type MoveFail = "module" | "moduleLine" | "missing" | "self";

/**
 * Move a line to a section (none = «без раздела»), before the line `beforeId` (which stands in that section) or at the end of
 * it. A module's section takes nobody in by hand and a module's line is not moved by hand.
 */
export function moveLine<T extends Opt>(o: T, lineId: string, to: { sectionId?: string; beforeId?: string }): { ok: true; option: T } | { ok: false; reason: MoveFail } {
  const line = o.lines.find((l) => l.id === lineId);
  if (!line) return { ok: false, reason: "missing" };
  if (line.source) return { ok: false, reason: "moduleLine" };
  if (to.sectionId) {
    const target = countedSections(o).find((s) => s.id === to.sectionId);
    if (!target) return { ok: false, reason: "missing" };
    if (isModule(target)) return { ok: false, reason: "module" };
  }
  if (to.beforeId === lineId) return { ok: false, reason: "self" };
  const { sectionId: _s, ...rest } = line;
  const moved: CustomLine = to.sectionId ? { ...rest, sectionId: to.sectionId } : rest;
  const others = o.lines.filter((l) => l.id !== lineId);
  let at = to.beforeId ? others.findIndex((l) => l.id === to.beforeId) : -1;
  if (at < 0) {
    // the end of that section: right after its last line; an empty section — the end of the list
    let last = -1;
    others.forEach((l, i) => {
      if ((l.sectionId ?? undefined) === to.sectionId) last = i;
    });
    at = last < 0 ? others.length : last + 1;
  }
  return { ok: true, option: { ...o, lines: [...others.slice(0, at), moved, ...others.slice(at)] } };
}

/** «Переместить выше / ниже»: swap with the neighbour in the same section (none at the edge → same option) */
export function shiftLine<T extends Opt>(o: T, lineId: string, dir: -1 | 1): T {
  const i = o.lines.findIndex((l) => l.id === lineId);
  if (i < 0 || o.lines[i]!.source) return o;
  const sec = o.lines[i]!.sectionId;
  let j = i + dir;
  while (j >= 0 && j < o.lines.length && o.lines[j]!.sectionId !== sec) j += dir;
  if (j < 0 || j >= o.lines.length || o.lines[j]!.source) return o;
  const lines = [...o.lines];
  [lines[i], lines[j]] = [lines[j]!, lines[i]!];
  return { ...o, lines };
}

/**
 * Move a section: a top one as a whole (with its subsections) before the top section `beforeId` or to the end; a
 * subsection into another top section (`parentId`) or to the top level, before `beforeId` among them. A section with
 * subsections cannot become a subsection (one level); nothing goes into a module's section by hand.
 */
export function moveSection<T extends Opt>(o: T, id: string, to: { parentId?: string; beforeId?: string }): { ok: true; option: T } | { ok: false; reason: MoveFail } {
  const all = o.sections ?? [];
  const s = all.find((x) => x.id === id);
  if (!s) return { ok: false, reason: "missing" };
  if (to.beforeId === id || to.parentId === id) return { ok: false, reason: "self" };
  if (to.parentId) {
    const parent = all.find((x) => x.id === to.parentId);
    if (!parent || parent.parentId) return { ok: false, reason: "missing" };
    if (isModule(parent)) return { ok: false, reason: "module" };
    if (all.some((x) => x.parentId === id)) return { ok: false, reason: "self" };
  }
  const family = [s, ...all.filter((x) => x.parentId === id)];
  const moving = new Set(family.map((x) => x.id));
  const rest = all.filter((x) => !moving.has(x.id));
  const placed = family.map((x, i) => (i === 0 ? ((({ parentId: _p, ...r }) => (to.parentId ? { ...r, parentId: to.parentId } : r))(x) as EstimateSection) : x));
  let at = rest.length;
  if (to.beforeId) {
    const k = rest.findIndex((x) => x.id === to.beforeId);
    if (k >= 0) at = k;
  } else if (to.parentId) {
    const last = Math.max(rest.findIndex((x) => x.id === to.parentId), ...rest.map((x, i) => (x.parentId === to.parentId ? i : -1)));
    at = last + 1;
  }
  return { ok: true, option: withSections(o, [...rest.slice(0, at), ...placed, ...rest.slice(at)]) };
}

/** «Вернуть» of a move: the line back in its section at its old place in the list (the rest of the option is left as it is) */
export function putBack<T extends Opt>(o: T, lineId: string, place: { sectionId?: string; index: number }): T {
  const line = o.lines.find((l) => l.id === lineId);
  if (!line) return o;
  const { sectionId: _s, ...rest } = line;
  const back: CustomLine = place.sectionId ? { ...rest, sectionId: place.sectionId } : rest;
  const others = o.lines.filter((l) => l.id !== lineId);
  const at = Math.max(0, Math.min(place.index, others.length));
  return { ...o, lines: [...others.slice(0, at), back, ...others.slice(at)] };
}
