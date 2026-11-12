/**
 * #1246 (spec 33-gutters-ds-auto А1–А3, founder 12.11): a downspout by itself — one per CHAIN (a joined line) up to 35 ft, 12″ from the
 * free end; a corner of two lines has one; joined → one goes, split → it comes back; hand-put ones are never touched; a removed
 * auto one is not put back; moved by hand it is yours.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
import { autoDownspouts, AUTO_DS_EDGE_IN, AUTO_DS_SPACING_IN, chains, removeDownspout } from "../src/modules/gutters/canvas/autoDs";
import { moveDs, removeElement } from "../src/modules/gutters/canvas/edit";
import { DEFAULT_DS_ATTRS, fromElements, toElements } from "../src/modules/gutters/canvas/model";
import { runLengthIn, type Drawing, type DrawnDownspout, type DrawnRun, type P } from "../src/modules/gutters/geometry";

const attrs = { profile: "k" as const, size: "5", material: "aluminum", color: "white", story: 1, hanger: "hidden" as const };
const run = (id: string, a: P, b: P, extra: Partial<DrawnRun> = {}): DrawnRun => ({ id, a, b, attrs, ...extra });
let n = 0;
const O = { spacingIn: AUTO_DS_SPACING_IN, edgeIn: AUTO_DS_EDGE_IN, attrs: DEFAULT_DS_ATTRS, newId: () => `ds${++n}` };
const auto = (d: Drawing, before?: Drawing) => autoDownspouts(d, O, before);
const none: Drawing = { runs: [], downspouts: [] };
const ds = (id: string, runId: string, atIn: number, extra: Partial<DrawnDownspout> = {}): DrawnDownspout => ({ ...DEFAULT_DS_ATTRS, id, runId, atIn, ...extra }) as DrawnDownspout;

describe("one line", () => {
  it("a new line gets a downspout, auto, 12″ from the end it was finished at (b)", () => {
    const d = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [] }, none);
    expect(d.downspouts).toHaveLength(1);
    expect(d.downspouts[0]!.auto).toBe(true);
    expect(d.downspouts[0]!.runId).toBe("a");
    expect(d.downspouts[0]!.atIn).toBe(240 - AUTO_DS_EDGE_IN);
  });
  it("a short line (under 24″): in the middle", () => {
    const d = auto({ runs: [run("a", [0, 0], [20, 0])], downspouts: [] }, none);
    expect(d.downspouts[0]!.atIn).toBe(10);
  });
  it("nothing changes → the same drawing back (no empty step of «Назад»); a second pass is the same", () => {
    const once = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [] }, none);
    expect(auto(once)).toBe(once);
    expect(auto(once, once)).toBe(once);
  });
  it("a long straight gutter: 35 ft → one, 36 ft → two (one downspout on it overflows)", () => {
    expect(auto({ runs: [run("a", [0, 0], [420, 0])], downspouts: [] }, none).downspouts).toHaveLength(1);
    const two = auto({ runs: [run("a", [0, 0], [432, 0])], downspouts: [] }, none);
    expect(two.downspouts).toHaveLength(2);
    expect(new Set(two.downspouts.map((s) => s.atIn)).size).toBe(2); // not on the same spot
  });
  it("the size follows the gutter as a hand-put one does (6″ → 3×4)", () => {
    const six = run("a", [0, 0], [240, 0], { attrs: { ...attrs, size: "6" } });
    const d = auto({ runs: [six], downspouts: [] }, none);
    expect(d.downspouts[0]!.size).toBe("3x4");
  });
});

describe("a chain: a corner of two lines has ONE downspout", () => {
  const A = run("A", [0, 0], [200, 0]), B = run("B", [200, 0], [200, 200]); // 400″ in all: under 35 ft
  const apart = (): Drawing => auto({ runs: [A, run("B", [300, 0], [300, 200])], downspouts: [] }, none);
  it("two separate lines: one each", () => {
    expect(apart().downspouts).toHaveLength(2);
  });
  it("…joined into a corner: one goes", () => {
    const before = apart();
    const joined = auto({ ...before, runs: [A, B] }, before);
    expect(joined.downspouts).toHaveLength(1);
    expect(chains(joined)).toHaveLength(1);
  });
  it("…split again («Разъединить угол»): the second comes back", () => {
    const before = apart();
    const joined = auto({ ...before, runs: [A, B] }, before);
    const split = auto({ ...joined, runs: [{ ...A, attrs: { ...attrs, openEnds: { b: true as const } } }, { ...B, attrs: { ...attrs, openEnds: { a: true as const } } }] }, joined);
    expect(split.downspouts).toHaveLength(2);
    expect(split.downspouts.every((s) => s.auto)).toBe(true);
  });
  it("the one that stays is the one by a free end", () => {
    const before = apart();
    const joined = auto({ ...before, runs: [A, B] }, before);
    const s = joined.downspouts[0]!;
    const r = joined.runs.find((x) => x.id === s.runId)!;
    expect(Math.min(s.atIn, runLengthIn(r) - s.atIn)).toBe(AUTO_DS_EDGE_IN);
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

describe("by hand", () => {
  it("a hand-put downspout counts and is never removed; no auto one beside it", () => {
    const d = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [ds("m", "a", 100)] }, none);
    expect(d.downspouts).toEqual([ds("m", "a", 100)]);
  });
  it("joined with a line that has a hand-put one: the auto one goes, the hand-put stays", () => {
    const before = auto({ runs: [run("A", [0, 0], [200, 0]), run("B", [300, 0], [300, 200])], downspouts: [ds("m", "B", 100)] }, none);
    expect(before.downspouts.map((s) => s.id).sort()).toEqual(["m", before.downspouts.find((s) => s.auto)!.id].sort());
    const joined = auto({ ...before, runs: [run("A", [0, 0], [200, 0]), run("B", [200, 0], [200, 200])] }, before);
    expect(joined.downspouts.map((s) => s.id)).toEqual(["m"]);
  });
  it("a removed auto one is not put back — not by a later change of the same chain either", () => {
    const d1 = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [] }, none);
    const gone = removeElement(d1, d1.downspouts[0]!.id);
    expect(gone.runs[0]!.dsAutoOff).toBe(true);
    expect(auto(gone, d1).downspouts).toHaveLength(0);
    const longer = auto({ ...gone, runs: [{ ...gone.runs[0]!, b: [300, 0] }] }, gone);
    expect(longer.downspouts).toHaveLength(0);
  });
  it("a removed hand-put one just goes (no flag)", () => {
    const d = removeElement({ runs: [run("a", [0, 0], [240, 0])], downspouts: [ds("m", "a", 100)] }, "m");
    expect(d.runs[0]!.dsAutoOff).toBeUndefined();
  });
  it("an auto one moved by hand is the user's now: it is not removed by a join, and nobody is added beside it", () => {
    const d1 = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [] }, none);
    const moved = moveDs(d1, d1.downspouts[0]!.id, [100, 0]);
    expect(moved.downspouts[0]!.auto).toBeUndefined();
    expect(auto({ ...moved, runs: [{ ...moved.runs[0]!, b: [250, 0] }] }, moved).downspouts).toHaveLength(1);
  });
  it("an old drawing without downspouts is not given any by an edit of ANOTHER line", () => {
    const old: Drawing = { runs: [run("a", [0, 0], [240, 0])], downspouts: [] };
    const d = auto({ ...old, runs: [...old.runs, run("b", [0, 500], [240, 500])] }, old);
    expect(d.downspouts.map((s) => s.runId)).toEqual(["b"]);
  });
  it("removeDownspout is removeElement for a pipe; «keep the outlet» makes it a pipe-less outlet that counts as a hand-put one", () => {
    const d1 = auto({ runs: [run("a", [0, 0], [240, 0])], downspouts: [] }, none);
    expect(removeDownspout(d1, d1.downspouts[0]!.id).downspouts).toHaveLength(0);
    const kept = removeDownspout(d1, d1.downspouts[0]!.id, { keepOutlet: true });
    expect(kept.downspouts[0]!.pipe).toBe(false);
    expect(kept.downspouts[0]!.auto).toBeUndefined();
    expect(auto(kept, d1)).toBe(kept);
  });
});

describe("saved and loaded", () => {
  it("auto and dsAutoOff survive the rows (the cloud copy) — and a downspout's size in geom is far under 2000 bytes", () => {
    const d1 = auto({ runs: [run("a", [0, 0], [240, 0]), run("b", [0, 400], [240, 400])], downspouts: [] }, none);
    const gone = removeElement(d1, d1.downspouts.find((s) => s.runId === "b")!.id);
    const back = fromElements(toElements(gone, "m1"));
    expect(back.downspouts[0]!.auto).toBe(true);
    expect(back.runs.find((r) => r.id === "b")!.dsAutoOff).toBe(true);
    for (const e of toElements(gone, "m1")) expect(JSON.stringify(e.geom).length).toBeLessThan(2000);
  });
});
