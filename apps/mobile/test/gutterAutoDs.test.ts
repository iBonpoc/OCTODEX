/**
 * #1246 (spec 33-gutters-ds-auto А1–А3, founder 12.11: «на каждом водостоке по-любому должен быть даунспот»): a downspout by itself — one
 * per CHAIN (a joined line) per `runPerDsFt`, 12″ from a free end; a corner of two lines has one; joined → one goes, split → it
 * comes back; every touched chain's automatic downspouts stand where they belong again; hand-put ones are never touched; a removed
 * auto one is not put back on its gutter (and does not stop the rest of the chain); a measurement from before the feature gets
 * none by an edit; money: one downspout, one outlet, no doubling.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { computeGutterParts } from "@octo/estimating-engine";
import { autoDownspouts, autoManaged, AUTO_DS_EDGE_IN, AUTO_DS_SPACING_IN, chains } from "../src/modules/gutters/canvas/autoDs";
import { hitTest, moveDs, moveEndAlong, removeElement, restoreRemoved, setDsAttrs, setLength } from "../src/modules/gutters/canvas/edit";
import { DEFAULT_DS_ATTRS, fromElements, toElements } from "../src/modules/gutters/canvas/model";
import { runLengthIn, toMeasurement, type Drawing, type DrawnDownspout, type DrawnRun, type P } from "../src/modules/gutters/geometry";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const run = (id: string, a: P, b: P, over: Partial<DrawnRun["attrs"]> = {}, extra: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs: { ...attrs, ...over }, ...extra });
let n = 0;
const O = { spacingIn: AUTO_DS_SPACING_IN, edgeIn: AUTO_DS_EDGE_IN, attrs: DEFAULT_DS_ATTRS, newId: () => `ds${++n}` };
const auto = (d: Drawing, before?: Drawing, force = false) => autoDownspouts(d, O, before, force);
const none: Drawing = { runs: [], downspouts: [] };
const ds = (id: string, runId: string, atIn: number, extra: Partial<DrawnDownspout> = {}): DrawnDownspout => ({ ...DEFAULT_DS_ATTRS, id, runId, atIn, ...extra }) as DrawnDownspout;
const flagged = (d: Drawing, id: string): boolean => !!d.runs.find((r) => r.id === id)!.attrs.dsAutoOff;
const offOf = (d: Drawing, id: string): number => Number(d.runs.find((r) => r.id === id)!.attrs.dsAutoOff) || 0;
/** how far the downspout stands from the nearest FREE end of its gutter (the others do not count) */
const edgeOf = (d: Drawing, s: DrawnDownspout) => { const r = d.runs.find((x) => x.id === s.runId)!; return Math.min(s.atIn, runLengthIn(r) - s.atIn); };

describe("one line", () => {
  it("a new line gets a downspout, auto, 12″ from the end it was finished at (b); the gutter is marked as managed", () => {
    const d = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [] }, none);
    expect(d.downspouts).toHaveLength(1);
    expect(d.downspouts[0]).toMatchObject({ auto: true, runId: "a", atIn: 240 - AUTO_DS_EDGE_IN });
    expect(d.runs[0]!.attrs.dsAuto).toBe(true);
  });
  it("a short line (under 24″): in the middle", () => {
    expect(auto({ runs: [run("a", [0, 0], [20, 0])], downspouts: [] }, none).downspouts[0]!.atIn).toBe(10);
  });
  it("nothing changes → the same drawing back (no empty step of «Назад»); a second pass is the same", () => {
    const once = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [] }, none);
    expect(auto(once, once)).toBe(once);
    expect(auto(once, undefined, true)).toBe(once);
  });
  it("a long straight gutter: 40 ft → one, 41 ft → two (one downspout on it overflows)", () => {
    expect(auto({ runs: [run("a", [0, 0], [480, 0])], downspouts: [] }, none).downspouts).toHaveLength(1);
    const two = auto({ runs: [run("a", [0, 0], [492, 0])], downspouts: [] }, none);
    expect(two.downspouts).toHaveLength(2);
    expect(new Set(two.downspouts.map((s) => s.atIn)).size).toBe(2);
  });
  it("review: a long chain gets as many as it needs, evenly — 130 ft is 4 (one gutter), and 4 on three gutters of 130 ft in all", () => {
    const one = auto({ runs: [run("a", [0, 0], [1560, 0])], downspouts: [] }, none);
    expect(one.downspouts).toHaveLength(4);
    const at = one.downspouts.map((s) => s.atIn).sort((u, v) => u - v);
    expect(at[0]).toBe(AUTO_DS_EDGE_IN);
    expect(at[3]).toBe(1560 - AUTO_DS_EDGE_IN);
    expect(at[1]! - at[0]!).toBeGreaterThan(300); // not bunched
    expect(at[2]! - at[1]!).toBeGreaterThan(300);
    const three = auto({ runs: [run("a", [0, 0], [520, 0]), run("b", [520, 0], [520, 520]), run("c", [520, 520], [1040, 520])], downspouts: [] }, none);
    expect(three.downspouts).toHaveLength(Math.ceil(1560 / AUTO_DS_SPACING_IN));
    expect(new Set(three.downspouts.map((s) => `${s.runId}:${s.atIn}`)).size).toBe(three.downspouts.length);
  });
  it("the size follows the gutter as a hand-put one does (6″ → 3×4)", () => {
    expect(auto({ runs: [run("a", [0, 0], [240, 0], { size: "6" })], downspouts: [] }, none).downspouts[0]!.size).toBe("3x4");
  });
});

describe("a chain: a corner of two lines has ONE downspout", () => {
  const A = run("A", [0, 0], [200, 0]), B = run("B", [200, 0], [200, 200]); // 400″ in all: under 40 ft
  const apart = (): Drawing => auto({ runs: [A, run("B", [300, 0], [300, 200])], downspouts: [] }, none);
  it("two separate lines: one each", () => expect(apart().downspouts).toHaveLength(2));
  it("…joined into a corner: one goes; split again: it comes back", () => {
    const before = apart();
    const joined = auto({ ...before, runs: [A, B].map((r, i) => ({ ...r, attrs: { ...before.runs[i]!.attrs } })) }, before);
    expect(joined.downspouts).toHaveLength(1);
    expect(chains(joined)).toHaveLength(1);
    const split = auto({ ...joined, runs: [{ ...joined.runs[0]!, attrs: { ...joined.runs[0]!.attrs, openEnds: { b: true as const } } }, { ...joined.runs[1]!, attrs: { ...joined.runs[1]!.attrs, openEnds: { a: true as const } } }] }, joined);
    expect(split.downspouts).toHaveLength(2);
    expect(split.downspouts.every((s) => s.auto)).toBe(true);
  });
  it("deleting one line of a chain: the other has its downspout", () => {
    const base = auto({ runs: [A, B], downspouts: [] }, none);
    const after = removeElement(base, base.downspouts[0]!.runId);
    const d = auto(after, base);
    expect(d.runs).toHaveLength(1);
    expect(d.downspouts).toHaveLength(1);
    expect(d.downspouts[0]!.runId).toBe(d.runs[0]!.id);
  });
});

describe("review Б1: the automatic downspouts stand where they belong again after a change", () => {
  it("A drawn (downspout at A.b−12), then B drawn on from A.b: the downspout is not left at the corner — it stands 12″ from a FREE end", () => {
    const one = auto({ runs: [run("A", [0, 0], [200, 0])], downspouts: [] }, none);
    const two = auto({ ...one, runs: [...one.runs, run("B", [200, 0], [200, 200])] }, one);
    expect(two.downspouts).toHaveLength(1);
    const s = two.downspouts[0]!;
    expect(s.runId).toBe("B"); // the last drawn gutter's free end
    expect(s.atIn).toBe(200 - AUTO_DS_EDGE_IN);
    expect(s.id).toBe(one.downspouts[0]!.id); // the same downspout, moved (its own attributes kept)
  });
  it("the length typed (setLength 480″ → 100″): the downspout is 12″ from the end again, not scaled to 58″", () => {
    const d0 = auto({ runs: [run("a", [0, 0], [480, 0])], downspouts: [] }, none);
    const d1 = auto(setLength(d0, "a", 100), d0);
    expect(d1.downspouts[0]!.atIn).toBe(100 - AUTO_DS_EDGE_IN);
  });
  it("the end pulled along (moveEndAlong to 400″): the downspout is at 388, not left at 228", () => {
    const d0 = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [] }, none);
    expect(d0.downspouts[0]!.atIn).toBe(228);
    const d1 = auto(moveEndAlong(d0, "a", 1, [400, 0]), d0);
    expect(d1.downspouts[0]!.atIn).toBe(400 - AUTO_DS_EDGE_IN);
  });
  it("hand-put ones stay exactly where they are", () => {
    const d = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [ds("m", "a", 100)] }, none);
    expect(d.downspouts).toEqual([ds("m", "a", 100)]);
  });
});

describe("review Б2 (director, counted): a removal is COUNTED on its gutter; the program never takes one off for lack of a place", () => {
  it("a corner A+B, the only downspout (on B) taken off, then A made shorter (setLength): none comes back", () => {
    const A = run("A", [0, 0], [200, 0]), B = run("B", [200, 0], [200, 200]);
    const base = auto({ runs: [A, B], downspouts: [] }, none);
    expect(base.downspouts).toHaveLength(1);
    const gone = removeElement(base, base.downspouts[0]!.id);
    expect(gone.downspouts).toHaveLength(0);
    expect(offOf(gone, base.downspouts[0]!.runId)).toBe(1);
    const shorter = auto(setLength(gone, "A", 150), gone);
    expect(shorter.downspouts).toHaveLength(0);
  });
  it("130 ft has 4, one taken off: 3 — and the length typed 125 ft keeps the 3 (none taken off for want of a place, none added)", () => {
    const four = auto({ runs: [run("a", [0, 0], [1560, 0])], downspouts: [] }, none);
    expect(four.downspouts).toHaveLength(4);
    const three = removeElement(four, four.downspouts[1]!.id);
    expect(three.downspouts).toHaveLength(3);
    expect(offOf(three, "a")).toBe(1);
    const typed = auto(setLength(three, "a", 1500), three);
    expect(typed.downspouts).toHaveLength(3);
    expect(typed.downspouts.every((s) => s.auto)).toBe(true);
  });
  it("the chain is made shorter so that it wants fewer: the extra one goes — the one nearest the middle (a downspout at a free end stays)", () => {
    const four = auto({ runs: [run("a", [0, 0], [1560, 0])], downspouts: [] }, none);
    const shorter = auto(setLength(four, "a", 1400), four); // 116 ft: 3 wanted
    expect(shorter.downspouts).toHaveLength(3);
    const at = shorter.downspouts.map((s) => Math.min(s.atIn, 1400 - s.atIn));
    expect(at.filter((v) => v <= AUTO_DS_EDGE_IN + 1)).toHaveLength(2); // both ends kept
  });
  it("one that already stands at its own free end does not move on a recount (a split: A:12 stays, not A:188)", () => {
    const A = run("A", [0, 0], [200, 0]), B = run("B", [200, 0], [200, 200]);
    const base = auto({ runs: [A, B], downspouts: [] }, none);
    const s0 = base.downspouts[0]!; // on B, at the free end b
    const split = auto({ ...base, runs: [{ ...base.runs[0]!, attrs: { ...base.runs[0]!.attrs, openEnds: { b: true as const } } }, { ...base.runs[1]!, attrs: { ...base.runs[1]!.attrs, openEnds: { a: true as const } } }] }, base);
    const kept = split.downspouts.find((x) => x.id === s0.id)!;
    expect(kept.atIn).toBe(s0.atIn); // it did not move
    expect(split.downspouts).toHaveLength(2); // A has its own again
  });
  it("A's downspout taken off, then B (with its own) joined to A: the counts are zeroed — the chain has ONE downspout, B's, which stays (no toast: nothing was taken off)", () => {
    const base = auto({ runs: [run("A", [0, 0], [200, 0]), run("B", [300, 0], [300, 200])], downspouts: [] }, none);
    const bDs = base.downspouts.find((s) => s.runId === "B")!;
    const gone = removeElement(base, base.downspouts.find((s) => s.runId === "A")!.id);
    expect(offOf(gone, "A")).toBe(1);
    const joined = auto({ ...gone, runs: [gone.runs[0]!, { ...gone.runs[1]!, a: [200, 0], b: [200, 200] }] }, gone);
    expect(joined.downspouts).toHaveLength(1);
    expect(joined.downspouts[0]!.id).toBe(bDs.id);
    expect(joined.downspouts[0]!.atIn).toBe(bDs.atIn); // it stays where it stands
    expect(offOf(joined, "A")).toBe(0);
  });
  it("a gutter drawn on to a chain keeps its counts (nothing was joined); a split keeps them too", () => {
    const base = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [] }, none);
    const gone = removeElement(base, base.downspouts[0]!.id);
    const longer = auto({ ...gone, runs: [...gone.runs, run("b", [240, 0], [240, 200])] }, gone);
    expect(offOf(longer, "a")).toBe(1);
    expect(longer.downspouts).toHaveLength(0);
  });
  it("the gutter that carried the count is deleted: a gutter of its chain left takes it over; «Отменить» gives it back", () => {
    const A = run("A", [0, 0], [200, 0]), B = run("B", [200, 0], [200, 200]);
    const base = auto({ runs: [A, B], downspouts: [] }, none);
    const gone = removeElement(base, base.downspouts[0]!.id); // the count is on B (its downspout was there)
    const withoutB = removeElement(gone, "B");
    expect(offOf(withoutB, "A")).toBe(1);
    const back = restoreRemoved(withoutB, gone, "B");
    expect(offOf(back, "A")).toBe(0);
    expect(offOf(back, "B")).toBe(1);
  });
  it("removed by hand and not put back: A alone — a later change of its chain (longer) puts none", () => {
    const d1 = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [] }, none);
    const gone = removeElement(d1, d1.downspouts[0]!.id);
    expect(auto(gone, d1).downspouts).toHaveLength(0);
    expect(auto({ ...gone, runs: [{ ...gone.runs[0]!, b: [300, 0] }] }, gone).downspouts).toHaveLength(0);
  });
  it("a removed hand-put one just goes (no count); joined with a line with a hand-put one: the auto one goes, the hand-put stays", () => {
    expect(flagged(removeElement({ runs: [run("a", [0, 0], [240, 0])], downspouts: [ds("m", "a", 100)] }, "m"), "a")).toBe(false);
    const before = auto({ runs: [run("A", [0, 0], [200, 0]), run("B", [300, 0], [300, 200])], downspouts: [ds("m", "B", 100)] }, none);
    const joined = auto({ ...before, runs: [before.runs[0]!, { ...before.runs[1]!, a: [200, 0], b: [200, 200] }] }, before);
    expect(joined.downspouts.map((s) => s.id)).toEqual(["m"]);
  });
  it("«Отменить» of the removal brings the count back too: a later change keeps its downspout", () => {
    const d1 = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [] }, none);
    const id = d1.downspouts[0]!.id;
    const gone = removeElement(d1, id);
    const back = restoreRemoved(gone, d1, id);
    expect(back.downspouts).toHaveLength(1);
    expect(flagged(back, "a")).toBe(false);
    expect(auto({ ...back, runs: [{ ...back.runs[0]!, b: [300, 0] }] }, back).downspouts).toHaveLength(1);
  });
  it("moved or edited by hand it is the user's own (no more auto): a join does not take it away", () => {
    const d1 = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [] }, none);
    const id = d1.downspouts[0]!.id;
    expect(moveDs(d1, id, [100, 0]).downspouts[0]!.auto).toBeUndefined();
    expect(setDsAttrs(d1, id, { color: "black" }).downspouts[0]!.auto).toBeUndefined();
  });
});

describe("review 9: a measurement from before the feature gets none by an edit", () => {
  const old: Drawing = { runs: [run("a", [0, 0], [240, 0])], downspouts: [] };
  it("the drawing is not managed: no mark on any gutter; an edit (another line, a longer one) puts nothing", () => {
    expect(autoManaged(old)).toBe(false);
    expect(autoManaged(none)).toBe(true); // a new measurement
    const d = auto({ ...old, runs: [...old.runs, run("b", [0, 500], [240, 500])] }, old);
    expect(d.downspouts).toHaveLength(0);
  });
  it("«Расставить водостоки» (force) puts them on every chain — and from then on it is managed", () => {
    const d = auto(old, undefined, true);
    expect(d.downspouts).toHaveLength(1);
    expect(autoManaged(d)).toBe(true);
    const e = auto({ ...d, runs: [...d.runs, run("b", [0, 500], [240, 500])] }, d);
    expect(e.downspouts).toHaveLength(2);
  });
  it("the marks go in attrs (rule 16: an old phone copies attrs whole), with the flag; they survive the rows", () => {
    const d1 = auto({ runs: [run("a", [0, 0], [240, 0]), run("b", [0, 400], [240, 400])], downspouts: [] }, none);
    const gone = removeElement(d1, d1.downspouts.find((s) => s.runId === "b")!.id);
    const rows = toElements(gone, "m1");
    expect(rows.find((r) => r.id === "b")!.attrs).toMatchObject({ dsAuto: true, dsAutoOff: 1 });
    const back = fromElements(rows);
    expect(back.downspouts[0]!.auto).toBe(true);
    expect(flagged(back, "b")).toBe(true);
    for (const e of rows) expect(JSON.stringify(e.geom).length).toBeLessThan(2000);
  });
});

describe("money (К1): one downspout, one outlet, no doubling; the marks never reach the engine", () => {
  it("toMeasurement strips `auto` of a downspout and `dsAuto`/`dsAutoOff` of a gutter", () => {
    const d = removeElement(auto({ runs: [run("a", [0, 0], [240, 0]), run("b", [0, 400], [240, 400])], downspouts: [] }, none), "nope");
    const m = toMeasurement(d);
    expect(JSON.stringify(m)).not.toMatch(/dsAuto|"auto"/);
  });
  it("a line with one automatic downspout → the engine: 1 outlet, 1 downspout piece, the elbows once", () => {
    const d = auto({ runs: [run("a", [0, 0], [480, 0], { size: "6" })], downspouts: [] }, none);
    expect(d.downspouts).toHaveLength(1);
    const parts = computeGutterParts(toMeasurement(d)).parts;
    const q = (pre: string) => parts.filter((p) => p.key.startsWith(pre)).reduce((s, p) => s + Number(p.qty), 0);
    expect(q("outlet.")).toBe(1);
    expect(q("dsstick.")).toBe(1);
    const same = computeGutterParts(toMeasurement({ ...d, downspouts: [{ ...d.downspouts[0]!, auto: undefined }] })).parts;
    expect(same).toEqual(parts); // auto or by hand — the same money
  });
});

describe("review 4: the touch at an end wins over a downspout 12″ from it", () => {
  it("a downspout stands 12″ from the end; a touch AT the end → end; at the downspout → the downspout", () => {
    const d = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [] }, none);
    expect(hitTest(d, [240, 0], 22)).toMatchObject({ kind: "end", id: "a", end: 1 });
    expect(hitTest(d, [228, 0], 22)).toMatchObject({ kind: "ds" });
  });
});

describe("edgeOf is the free end", () => {
  it("the downspout of a lone line is 12″ from its end", () => {
    const d = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [] }, none);
    expect(edgeOf(d, d.downspouts[0]!)).toBe(AUTO_DS_EDGE_IN);
  });
});
