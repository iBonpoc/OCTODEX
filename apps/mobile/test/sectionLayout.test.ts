import { describe, it, expect } from "vitest";
import { SECTIONS_MAX, sectionSubtotals, type CustomLine, type CustomOption, type EstimateSection } from "@octo/estimating-engine";
import { DEFAULT_SETTINGS } from "../src/features/estimateDoc";
import { addSection, deleteSection, layoutByKind, moveLine, moveSection, renameSection, restoreLayout, shiftLine, snapshotLayout, viewRows } from "../src/features/sectionLayout";

const L = (id: string, group: CustomLine["group"], over: Partial<CustomLine> = {}): CustomLine => ({ id, name: id, group, quantity: "1", unit: "ea", unitPriceCents: 1000, ...over });
const opt = (lines: CustomLine[], sections?: EstimateSection[]): CustomOption => ({ id: "o", name: "Good", lines, ...(sections ? { sections } : {}) });
let n = 0;
const nid = () => `n${++n}`;
const ids = (o: CustomOption) => o.lines.map((l) => l.id);
const sec = (o: CustomOption) => (o.sections ?? []).map((s) => `${s.id}${s.parentId ? `<${s.parentId}` : ""}${s.kind ? `:${s.kind}` : ""}${s.title ? `"${s.title}"` : ""}`);
const rows = (o: CustomOption, collapsed: string[] = []) => viewRows(o, new Set(collapsed)).map((r) => (r.type === "section" ? `S:${r.section.id}${r.collapsed ? "(closed)" : ""}/${r.lineCount}` : r.type === "line" ? r.line.id : `U/${r.lineCount}`));

describe("what the list shows (Р4)", () => {
  it("no sections: just the lines", () => {
    expect(rows(opt([L("a", "service"), L("b", "labor")]))).toEqual(["a", "b"]);
  });
  it("sections in the order of the array, their lines, then subsections; «без раздела» last with its heading", () => {
    const o = opt([L("a", "service", { sectionId: "s1" }), L("x", "labor"), L("b", "service", { sectionId: "s1a" }), L("c", "material", { sectionId: "s2" })], [{ id: "s1", title: "Roof" }, { id: "s1a", title: "Gutters", parentId: "s1" }, { id: "s2", title: "Yard" }]);
    expect(rows(o)).toEqual(["S:s1/2", "a", "S:s1a/1", "b", "S:s2/1", "c", "U/1", "x"]);
  });
  it("a line whose section is not there is «без раздела»; so is one past the limit", () => {
    const o = opt([L("a", "service", { sectionId: "ghost" })], [{ id: "s1", title: "Roof" }]);
    expect(rows(o)).toEqual(["S:s1/0", "U/1", "a"]);
    const many = Array.from({ length: SECTIONS_MAX + 2 }, (_, i) => ({ id: `s${i}`, title: `S${i}` }));
    const late = opt([L("z", "service", { sectionId: `s${SECTIONS_MAX + 1}` })], many);
    expect(rows(late).filter((r) => r.startsWith("S:")).length).toBe(SECTIONS_MAX);
    expect(rows(late).slice(-2)).toEqual(["U/1", "z"]);
  });
  it("a collapsed section keeps its heading (with the count) and hides its lines and subsections", () => {
    const o = opt([L("a", "service", { sectionId: "s1" }), L("b", "service", { sectionId: "s1a" })], [{ id: "s1", title: "Roof" }, { id: "s1a", title: "Gutters", parentId: "s1" }]);
    expect(rows(o, ["s1"])).toEqual(["S:s1(closed)/2"]);
  });
});

describe("add / rename / delete", () => {
  it("«＋ Раздел» at the end; the title is cleaned; a subsection stands after its section's last child", () => {
    const a = addSection(opt([]), { title: "  Roof\u0000 " }, nid)!;
    expect(sec(a.option)).toEqual([`${a.id}"Roof"`]);
    const b = addSection(a.option, {}, nid)!;
    const sub1 = addSection(b.option, { parentId: a.id }, nid)!;
    const sub2 = addSection(sub1.option, { parentId: a.id }, nid)!;
    expect(sec(sub2.option)).toEqual([`${a.id}"Roof"`, `${sub1.id}<${a.id}`, `${sub2.id}<${a.id}`, b.id]);
  });
  it("one level only; nothing under a module's section; the limit", () => {
    const o = opt([], [{ id: "s1", title: "A" }, { id: "s1a", title: "B", parentId: "s1" }, { id: "m", kind: "module", module: "gutters", title: "Gutters" }]);
    expect(addSection(o, { parentId: "s1a" })).toBeNull();
    expect(addSection(o, { parentId: "m" })).toBeNull();
    expect(addSection(opt([], Array.from({ length: SECTIONS_MAX }, (_, i) => ({ id: `s${i}`, title: `S${i}` }))))).toBeNull();
  });
  it("rename keeps the person's own title and drops the kind; empty leaves it; a module's keeps its kind", () => {
    const o = opt([], [{ id: "k", kind: "material" }, { id: "m", kind: "module", module: "gutters", title: "Old" }]);
    expect(sec(renameSection(o, "k", " Metal "))[0]).toBe('k"Metal"');
    expect(renameSection(o, "k", "  ")).toBe(o);
    expect((renameSection(o, "m", "New").sections ?? [])[1]).toMatchObject({ kind: "module", module: "gutters", title: "New" });
  });
  it("delete: nothing is lost — lines go up, subsections become top sections", () => {
    const o = opt([L("a", "service", { sectionId: "s1" }), L("b", "service", { sectionId: "s1a" }), L("c", "service")], [{ id: "s1", title: "Roof" }, { id: "s1a", title: "Gutters", parentId: "s1" }]);
    const d1 = deleteSection(o, "s1a");
    expect(d1.lines.map((l) => l.sectionId)).toEqual(["s1", "s1", undefined]);
    const d2 = deleteSection(o, "s1");
    expect(sec(d2)).toEqual(['s1a"Gutters"']);
    expect(d2.lines.map((l) => l.sectionId)).toEqual([undefined, "s1a", undefined]);
    expect(ids(d2)).toEqual(ids(o));
  });
  it("«Вернуть» of a delete restores the sections and the lines' sections, not the rest of the option", () => {
    const o = opt([L("a", "service", { sectionId: "s1" })], [{ id: "s1", title: "Roof" }]);
    const snap = snapshotLayout(o);
    const after = { ...deleteSection(o, "s1"), lines: deleteSection(o, "s1").lines.map((l) => ({ ...l, name: "edited" })) };
    const back = restoreLayout(after, snap);
    expect(back.sections).toEqual(o.sections);
    expect(back.lines[0]).toMatchObject({ sectionId: "s1", name: "edited" });
  });
});

describe("«Разложить по видам» (Р4)", () => {
  it("lines of no section go to Материалы, Работа, Услуги in that order; the order among lines stays", () => {
    n = 0;
    const o = opt([L("s1", "service"), L("m1", "material"), L("l1", "labor"), L("m2", "material")]);
    const r = layoutByKind(o, nid)!;
    expect(sec(r)).toEqual(["n1:material", "n2:labor", "n3:service"]);
    expect(ids(r)).toEqual(["s1", "m1", "l1", "m2"]);
    expect(rows(r)).toEqual(["S:n1/2", "m1", "m2", "S:n2/1", "l1", "S:n3/1", "s1"]);
  });
  it("a second run changes nothing", () => {
    n = 0;
    const r = layoutByKind(opt([L("a", "service"), L("b", "material")]), nid)!;
    expect(layoutByKind(r, nid)).toBeNull();
  });
  it("a person's own section gets subsections by kind; its own title and the section stay", () => {
    n = 0;
    const o = opt([L("a", "service", { sectionId: "s1" }), L("b", "material", { sectionId: "s1" })], [{ id: "s1", title: "Roof" }]);
    const r = layoutByKind(o, nid)!;
    expect(sec(r)).toEqual(['s1"Roof"', "n1<s1:material", "n2<s1:service"]);
    expect(r.lines.map((l) => l.sectionId)).toEqual(["n2", "n1"]);
  });
  it("an existing kind section is reused; an empty section of a kind goes, a person's own empty one never", () => {
    n = 0;
    const o = opt([L("a", "material")], [{ id: "old", kind: "labor" }, { id: "mine", title: "Mine" }, { id: "mat", kind: "material" }]);
    const r = layoutByKind(o, nid)!;
    expect(sec(r)).toEqual(['mine"Mine"', "mat:material"]);
    expect(r.lines[0]!.sectionId).toBe("mat");
  });
  it("a module's lines stay where they are", () => {
    n = 0;
    const src = { module: "gutters", key: "run" } as never;
    const r = layoutByKind(opt([L("g", "material", { source: src }), L("a", "material")]), nid)!;
    expect(r.lines[0]!.sectionId).toBeUndefined();
    expect(r.lines[1]!.sectionId).toBe("n1");
  });
  it("nothing to do → null; the limit stops it without half a layout", () => {
    expect(layoutByKind(opt([]))).toBeNull();
    const full = opt([L("a", "service")], Array.from({ length: SECTIONS_MAX }, (_, i) => ({ id: `s${i}`, title: `S${i}` })));
    expect(layoutByKind(full)).toBeNull();
  });
  it("the sums do not change (Σ of the sections + loose = the subtotal)", () => {
    n = 0;
    const o = opt([L("a", "service", { unitPriceCents: 1234 }), L("b", "material", { unitPriceCents: 5678, quantity: "3" }), L("c", "labor", { unitPriceCents: 999 })]);
    const r = layoutByKind(o, nid)!;
    const before = sectionSubtotals(o, DEFAULT_SETTINGS);
    const after = sectionSubtotals(r, DEFAULT_SETTINGS);
    const sum = Object.values(after.bySection).reduce((x, y) => x + y, 0) + after.unsectioned;
    expect(sum).toBe(before.unsectioned);
  });
  it("«Вернуть» of the layout restores the sections and each line's section", () => {
    n = 0;
    const o = opt([L("a", "service"), L("b", "material")]);
    const snap = snapshotLayout(o);
    const r = layoutByKind(o, nid)!;
    const back = restoreLayout(r, snap);
    expect(back.sections).toBeUndefined();
    expect(back.lines.every((l) => l.sectionId === undefined)).toBe(true);
  });
});

describe("moving (Р5)", () => {
  const base = () => opt([L("a", "service", { sectionId: "s1" }), L("b", "service", { sectionId: "s1" }), L("c", "service", { sectionId: "s2" }), L("d", "service")], [{ id: "s1", title: "One" }, { id: "s2", title: "Two" }, { id: "m", kind: "module", module: "gutters", title: "Gutters" }]);
  it("a line to another section — at its end, or before a line of it", () => {
    const end = moveLine(base(), "a", { sectionId: "s2" });
    expect(end.ok && ids(end.option)).toEqual(["b", "c", "a", "d"]);
    expect(end.ok && end.option.lines.find((l) => l.id === "a")!.sectionId).toBe("s2");
    const before = moveLine(base(), "d", { sectionId: "s1", beforeId: "b" });
    expect(before.ok && ids(before.option)).toEqual(["a", "d", "b", "c"]);
  });
  it("to «без раздела»; into an empty section", () => {
    const loose = moveLine(base(), "a", {});
    expect(loose.ok && loose.option.lines.find((l) => l.id === "a")!.sectionId).toBeUndefined();
    const empty = moveLine(opt([L("a", "service")], [{ id: "e", title: "E" }]), "a", { sectionId: "e" });
    expect(empty.ok && empty.option.lines[0]!.sectionId).toBe("e");
  });
  it("into a module's section — refused; a module's line — refused; a missing section — refused", () => {
    expect(moveLine(base(), "a", { sectionId: "m" })).toEqual({ ok: false, reason: "module" });
    const withMod = opt([L("g", "material", { source: { module: "gutters", key: "k" } as never })]);
    expect(moveLine(withMod, "g", {})).toEqual({ ok: false, reason: "moduleLine" });
    expect(moveLine(base(), "a", { sectionId: "zz" })).toEqual({ ok: false, reason: "missing" });
  });
  it("up / down swaps with the neighbour of the same section", () => {
    const o = base();
    expect(ids(shiftLine(o, "a", 1))).toEqual(["b", "a", "c", "d"]);
    expect(ids(shiftLine(o, "a", -1))).toEqual(["a", "b", "c", "d"]);
    expect(ids(shiftLine(o, "c", 1))).toEqual(["a", "b", "c", "d"]);
  });
  it("a section whole (with its subsections) before another; a subsection into another section; one level only", () => {
    const o = opt([], [{ id: "s1", title: "One" }, { id: "s1a", title: "A", parentId: "s1" }, { id: "s2", title: "Two" }, { id: "m", kind: "module", module: "gutters", title: "G" }]);
    const whole = moveSection(o, "s1", { beforeId: "m" });
    expect(whole.ok && sec(whole.option)).toEqual(['s2"Two"', 's1"One"', 's1a<s1"A"', 'm:module"G"']);
    const sub = moveSection(o, "s1a", { parentId: "s2" });
    expect(sub.ok && sec(sub.option)).toEqual(['s1"One"', 's2"Two"', 's1a<s2"A"', 'm:module"G"']);
    const top = moveSection(o, "s1a", {});
    expect(top.ok && sec(top.option)).toEqual(['s1"One"', 's2"Two"', 'm:module"G"', 's1a"A"']);
    expect(moveSection(o, "s1", { parentId: "s2" })).toEqual({ ok: false, reason: "self" }); // has a subsection: two levels
    expect(moveSection(o, "s2", { parentId: "m" })).toEqual({ ok: false, reason: "module" });
    expect(moveSection(o, "s2", { parentId: "s1a" })).toEqual({ ok: false, reason: "missing" });
  });
});

describe("a long estimate (performance)", () => {
  it("120 lines in 40 sections lay out and show in a blink and keep every line", () => {
    const secs = Array.from({ length: SECTIONS_MAX }, (_, i) => ({ id: `s${i}`, title: `S${i}` }));
    const lines = Array.from({ length: 120 }, (_, i) => L(`l${i}`, KINDS[i % 3]!, { sectionId: i % 4 === 0 ? undefined : `s${i % SECTIONS_MAX}` }));
    const t0 = Date.now();
    const r = viewRows(opt(lines, secs));
    expect(r.filter((x) => x.type === "line").length).toBe(120);
    const moved = moveLine(opt(lines, secs), "l1", { sectionId: "s5" });
    expect(moved.ok && moved.option.lines.length).toBe(120);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
const KINDS: CustomLine["group"][] = ["material", "labor", "service"];
