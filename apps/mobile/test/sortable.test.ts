import { describe, it, expect } from "vitest";
import type { CustomLine, CustomOption, EstimateSection } from "@octo/estimating-engine";
import { moveLine, moveSection, sameLayout, viewRows } from "../src/features/sectionLayout";
import { canBegin, dragKind, dragWrite, edgeStep, heldGone, feelOf, insertionIndex, ownsDrag, resolveDrop, rowKey, shiftOf, withoutBlock } from "../src/features/sortable";

const L = (id: string, sectionId?: string): CustomLine => ({ id, name: id, group: "service", quantity: "1", unit: "ea", unitPriceCents: 100, ...(sectionId ? { sectionId } : {}) });
const opt = (lines: CustomLine[], sections?: EstimateSection[]): CustomOption => ({ id: "o", name: "Good", lines, ...(sections ? { sections } : {}) });
// A: a1 a2 / sub A1: x1 / B: b1 / loose: z1 z2
const o = opt([L("a1", "A"), L("a2", "A"), L("x1", "A1"), L("b1", "B"), L("z1"), L("z2")], [{ id: "A", title: "A" }, { id: "A1", title: "A1", parentId: "A" }, { id: "B", title: "B" }]);
const rows = viewRows(o);
const keys = (rs = rows) => rs.map(rowKey);

describe("the list as rows", () => {
  it("keys and kinds", () => {
    expect(keys()).toEqual(["s:A", "l:a1", "l:a2", "s:A1", "l:x1", "s:B", "l:b1", "u", "l:z1", "l:z2"]);
    expect(rows.map((r) => dragKind(r))).toEqual(["section", "line", "line", "subsection", "line", "section", "line", null, "line", "line"]);
  });
  it("a section is taken whole; a subsection with its lines; a line alone", () => {
    expect(keys(withoutBlock(rows, "s:A").rest)).toEqual(["s:B", "l:b1", "u", "l:z1", "l:z2"]);
    expect(keys(withoutBlock(rows, "s:A1").rest)).toEqual(["s:A", "l:a1", "l:a2", "s:B", "l:b1", "u", "l:z1", "l:z2"]);
    expect(keys(withoutBlock(rows, "l:a1").rest)).toEqual(["s:A", "l:a2", "s:A1", "l:x1", "s:B", "l:b1", "u", "l:z1", "l:z2"]);
  });
});

describe("where a held line lands (resolveDrop)", () => {
  // rest (a1 held): s:A, a2, s:A1, x1, s:B, b1, u, z1, z2  → places 0..9
  it("before a line: into its section, before it", () => {
    expect(resolveDrop(rows, "l:a1", 1)).toEqual({ kind: "line", id: "a1", to: { sectionId: "A", beforeId: "a2" } });
    expect(resolveDrop(rows, "l:a1", 5)).toEqual({ kind: "line", id: "a1", to: { sectionId: "B", beforeId: "b1" } });
    expect(resolveDrop(rows, "l:a1", 7)).toEqual({ kind: "line", id: "a1", to: { sectionId: undefined, beforeId: "z1" } });
  });
  it("before a heading: at the end of the section above; right under a heading: into that section", () => {
    expect(resolveDrop(rows, "l:a1", 4)).toEqual({ kind: "line", id: "a1", to: { sectionId: "A1" } }); // after x1, before B
  });
  it("the end of the list: the end of «без раздела»; right under «без раздела»: loose", () => {
    expect(resolveDrop(rows, "l:a1", 9)).toEqual({ kind: "line", id: "a1", to: { sectionId: undefined } });
    // right under «без раздела» (place 7, before z1): loose, before z1
    expect(resolveDrop(rows, "l:a1", 7)).toEqual({ kind: "line", id: "a1", to: { sectionId: undefined, beforeId: "z1" } });
  });
  it("above the first heading: «без раздела»", () => {
    expect(resolveDrop(rows, "l:a1", 0)).toEqual({ kind: "line", id: "a1", to: {} });
  });
  it("into a folded section: its end", () => {
    const folded = viewRows(o, new Set(["B"]));
    // rest: s:A… s:B(closed) u z1 z2 ; place right after the folded heading
    const idx = withoutBlock(folded, "l:a1").rest.findIndex((x) => rowKey(x) === "s:B");
    expect(resolveDrop(folded, "l:a1", idx + 1)).toEqual({ kind: "line", id: "a1", to: { sectionId: "B" } });
  });
});

describe("where a held section lands", () => {
  it("a top section goes before the next top section, or to the end", () => {
    // rest without A: s:B, b1, u, z1, z2
    expect(resolveDrop(rows, "s:A", 0)).toEqual({ kind: "section", id: "A", to: { beforeId: "B" } });
    expect(resolveDrop(rows, "s:A", 2)).toEqual({ kind: "section", id: "A", to: {} });
  });
  it("a subsection stays in its section's children, or goes to another section", () => {
    // rest without A1: s:A a1 a2 s:B b1 u z1 z2
    expect(resolveDrop(rows, "s:A1", 2)).toEqual({ kind: "section", id: "A1", to: { parentId: "A" } });
    expect(resolveDrop(rows, "s:A1", 4)).toEqual({ kind: "section", id: "A1", to: { parentId: "B" } });
    expect(resolveDrop(rows, "s:A1", 0)).toEqual({ kind: "section", id: "A1", to: {} });
  });
  it("the «без раздела» heading cannot be carried", () => {
    expect(resolveDrop(rows, "u", 0)).toBeNull();
  });
});

describe("the geometry", () => {
  it("the place is between the middles of the other rows", () => {
    expect(insertionIndex([10, 30, 50], 5)).toBe(0);
    expect(insertionIndex([10, 30, 50], 31)).toBe(2);
    expect(insertionIndex([10, 30, 50], 99)).toBe(3);
    expect(insertionIndex([], 5)).toBe(0);
  });
  it("neighbours make room: the rows between the old and the new place move by the held row's height", () => {
    // held row slot 2 (rows 0,1 above; 2.. below once it is out); moving it up to place 0 pushes rows 0,1 down
    expect([0, 1, 2, 3].map((i) => shiftOf(i, 2, 0, 40))).toEqual([40, 40, 0, 0]);
    // moving it down to place 4 pulls rows 2,3 up
    expect([0, 1, 2, 3].map((i) => shiftOf(i, 2, 4, 40))).toEqual([0, 0, -40, -40]);
    expect(shiftOf(1, 2, 2, 40)).toBe(0);
  });
});

describe("the page follows a held row (edgeStep, #1245 Б1)", () => {
  // visible part of the window: from 100 (below the header) to 700 (above the bottom bar); the zone is 64 deep
  it("the finger's place is not known yet: the page stays (a 0 read as «the top edge» and ran away at ~750 px/s)", () => {
    expect(edgeStep(null, 100, 700, 64, 16)).toBe(0);
    expect(edgeStep(Number.NaN, 100, 700, 64, 16)).toBe(0);
  });
  it("the middle: nothing; the top zone: up, the bottom zone: down, deeper — faster", () => {
    expect(edgeStep(400, 100, 700, 64, 16)).toBe(0);
    expect(edgeStep(150, 100, 700, 64, 16)).toBeLessThan(0);
    expect(edgeStep(100, 100, 700, 64, 16)).toBe(-16);
    expect(Math.abs(edgeStep(110, 100, 700, 64, 16))).toBeGreaterThan(Math.abs(edgeStep(160, 100, 700, 64, 16)));
    expect(edgeStep(690, 100, 700, 64, 16)).toBeGreaterThan(0);
    expect(edgeStep(700, 100, 700, 64, 16)).toBe(16);
  });
  it("the zones count from the visible part (below the header, above the bottom bar), not from the screen", () => {
    // y=40 is under a 100-px header: it is deep in the top zone; y=720 is under the bottom bar: deep in the bottom zone
    expect(edgeStep(40, 100, 700, 64, 16)).toBe(-16);
    expect(edgeStep(720, 100, 700, 64, 16)).toBe(16);
    // the same finger on a screen without header: nothing
    expect(edgeStep(40, 0, 900, 64, 16)).toBeLessThan(0);
    expect(edgeStep(300, 0, 900, 64, 16)).toBe(0);
  });
});

describe("module lines are not carried (#1245 Б4)", () => {
  it("a line of the measurement has no handle and no hold — as in «⋯» there is no «Переместить»", () => {
    const m = opt([L("a1", "A"), { ...L("m1", "A"), source: { module: "gutters", key: "run" } as never }], [{ id: "A", title: "A" }]);
    expect(viewRows(m).map((r) => dragKind(r))).toEqual(["section", "line", null]);
  });
});

describe("a drop that changes nothing is no move (#1245 Б3)", () => {
  it("the last subsection let go a little above the middle of its section's last line: the same order", () => {
    // A: a1 a2 / A1: x1 — A1 is the last child of A; the place right under a2 resolves to {parentId: A}: the same order
    const r = viewRows(o);
    const d = resolveDrop(r, "s:A1", 2);
    expect(d).toEqual({ kind: "section", id: "A1", to: { parentId: "A" } });
    const res = moveSection(o, "A1", (d as { to: { parentId?: string } }).to);
    expect(res.ok && sameLayout(o, res.option)).toBe(true);
  });
  it("the last top section let go in «без раздела»: the same order", () => {
    const r = viewRows(o);
    const d = resolveDrop(r, "s:B", 7);
    expect(d).toEqual({ kind: "section", id: "B", to: {} });
    const res = moveSection(o, "B", {});
    expect(res.ok && sameLayout(o, res.option)).toBe(true);
  });
  it("a line let go at the end of its own section: the same; into another place: different", () => {
    const same = moveLine(o, "a2", { sectionId: "A" });
    expect(same.ok && sameLayout(o, same.option)).toBe(true); // a2 is already the last line of A
    const lastOfB = moveLine(o, "b1", { sectionId: "B" });
    expect(lastOfB.ok && sameLayout(o, lastOfB.option)).toBe(true);
    const other = moveLine(o, "a1", { sectionId: "B" });
    expect(other.ok && sameLayout(o, other.option)).toBe(false);
  });
  it("refused moves (a module's line, a module's section) are not moves", () => {
    const m = opt([L("m1", "M"), L("a1", "A")], [{ id: "M", kind: "module", module: "gutters" } as never, { id: "A", title: "A" }]);
    expect(moveLine(m, "a1", { sectionId: "M" })).toMatchObject({ ok: false, reason: "module" });
    const withSource = opt([{ ...L("m1", "A"), source: { module: "gutters", key: "run" } as never }], [{ id: "A", title: "A" }]);
    expect(moveLine(withSource, "m1", {})).toMatchObject({ ok: false, reason: "moduleLine" });
  });
});

describe("a long estimate does not slow the drag (100 rows)", () => {
  it("finding the place for 100 rows, 1000 times, is a blink", () => {
    const lines = Array.from({ length: 100 }, (_, i) => L(`l${i}`, `S${i % 10}`));
    const sections = Array.from({ length: 10 }, (_, i) => ({ id: `S${i}`, title: `S${i}` }));
    const big = viewRows(opt(lines, sections));
    const mids = withoutBlock(big, "l:l50").rest.map((_, i) => i * 40 + 20);
    const t0 = performance.now();
    let sink = 0;
    for (let i = 0; i < 1000; i++) sink += insertionIndex(mids, (i * 7) % 4000) + (resolveDrop(big, "l:l50", i % 100) ? 1 : 0);
    expect(sink).toBeGreaterThan(0);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe("the feel of a drop follows what it came to (#1245)", () => {
  it("moved — medium; refused — warning; ended where it was — none (never a buzz for a move that did not happen)", () => {
    expect(feelOf("moved")).toBe("medium");
    expect(feelOf("refused")).toBe("warning");
    expect(feelOf("same")).toBeNull();
  });
});

describe("one drag at a time (#1245 Б2)", () => {
  it("a second finger starts nothing while a row is held; moves and the end belong to the held row only", () => {
    expect(canBegin(null)).toBe(true);
    expect(canBegin("l:a")).toBe(false);
    expect(ownsDrag("l:a", "l:a")).toBe(true);
    expect(ownsDrag("l:a", "l:b")).toBe(false);
    expect(ownsDrag(null, "l:a")).toBe(false);
  });
});

describe("a second finger does not move the held row (#1262 Б-1)", () => {
  it("row A is held; a finger on row B (its begin was refused) or on A's other handler writes nothing to A's place", () => {
    // the UI thread asks dragWrite for every update of every gesture; only the held key's own finger gets a place
    const heldKey = "l:a";
    const fingerA = dragWrite(heldKey, "l:a", -40, 100);
    const fingerB = dragWrite(heldKey, "l:b", 300, 100);
    expect(fingerA).toBe(60);
    expect(fingerB).toBeNull();
    // before any row is held (""), and after the end, nobody writes
    expect(dragWrite("", "l:a", 10, 0)).toBeNull();
    // the sequence of one drag: B's moves come between A's, the place follows A only
    let y = 0;
    for (const [k, t] of [["l:a", 10], ["l:b", 250], ["l:a", 20], ["l:b", -90], ["l:a", 30]] as const) {
      const w = dragWrite(heldKey, k, t, 0);
      if (w !== null) y = w;
    }
    expect(y).toBe(30);
  });
});

describe("a held row that is gone ends the drag (#1262 замечание 2)", () => {
  it("held and still in the list: goes on; gone (adding undone, another option): ends; nothing held: nothing to end", () => {
    expect(heldGone("l:a", ["s:A", "l:a"])).toBe(false);
    expect(heldGone("l:a", ["s:A", "l:b"])).toBe(true);
    expect(heldGone(null, ["l:b"])).toBe(false);
  });
});
