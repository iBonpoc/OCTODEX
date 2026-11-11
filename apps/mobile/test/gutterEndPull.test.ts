import { describe, expect, it } from "vitest";
import { MIN_RUN_IN, finishStroke, moveEndAlong, type Stroke } from "../src/modules/gutters/canvas/edit";
import { MAX_RUN_IN } from "../src/modules/gutters/canvas/attrs";
import { DEFAULT_RUN_ATTRS } from "../src/modules/gutters/canvas/model";
import type { Drawing, P } from "../src/modules/gutters/geometry";

/** #504: a free end taken (long press on the cap) follows the finger ALONG its gutter — longer and shorter. */
const run = (id: string, a: P, b: P, o = {}) => ({ id, a, b, attrs: { ...DEFAULT_RUN_ATTRS }, ...o });
const d0: Drawing = { runs: [run("r1", [0, 0], [480, 0], { lengthIn: 480 })], downspouts: [{ id: "d1", runId: "r1", atIn: 450, shape: "rect", size: "2x3", material: "aluminum", color: "white", bottom: { kind: "extension" } } as never] };

describe("moveEndAlong", () => {
  it("pulls the far end out: 480″ → 600″, the other end and the direction stay", () => {
    const m = moveEndAlong(d0, "r1", 1, [600, 40]);
    expect(m.runs[0]).toMatchObject({ a: [0, 0], b: [600, 0] });
  });
  it("pulls it in: shorter than before, a typed length dropped, a downspout past the end comes back onto the line", () => {
    const m = moveEndAlong(d0, "r1", 1, [300, -50]);
    expect(m.runs[0]!.b).toEqual([300, 0]);
    expect(m.runs[0]!.lengthIn).toBeUndefined();
    expect(m.downspouts[0]!.atIn).toBe(300);
  });
  it("the near end the same way (end 0): the far end stays fixed", () => {
    const m = moveEndAlong(d0, "r1", 0, [-120, 9]);
    expect(m.runs[0]).toMatchObject({ a: [-120, 0], b: [480, 0] });
  });
  it("a slanted gutter keeps its slant", () => {
    const d: Drawing = { runs: [run("r", [0, 0], [300, 400])], downspouts: [] };
    const m = moveEndAlong(d, "r", 1, [600, 800]);
    expect(m.runs[0]!.b).toEqual([600, 800]);
  });
  it("not shorter than 1 ft, not past the longest gutter, and the finger over the other end does not turn it round", () => {
    expect(moveEndAlong(d0, "r1", 1, [5, 0]).runs[0]!.b).toEqual([MIN_RUN_IN, 0]);
    expect(moveEndAlong(d0, "r1", 1, [-300, 0]).runs[0]!.b).toEqual([MIN_RUN_IN, 0]);
    expect(moveEndAlong(d0, "r1", 1, [1e9, 0]).runs[0]!.b).toEqual([MAX_RUN_IN, 0]);
  });
  it("nothing moves → the same drawing back (no empty «Назад» step); an unknown gutter too", () => {
    expect(moveEndAlong(d0, "r1", 1, [480, 77])).toBe(d0);
    expect(moveEndAlong(d0, "nope", 1, [10, 0])).toBe(d0);
  });
  it("finishStroke: a pull ends where the finger lifted; cancelled — back to before", () => {
    const g: Stroke = { kind: "pull", id: "r1", end: 1, before: d0 };
    const nr = { id: "n", attrs: DEFAULT_RUN_ATTRS };
    expect(finishStroke(g, d0, [720, 3], 18, false, nr).runs[0]!.b).toEqual([720, 0]);
    expect(finishStroke(g, d0, [720, 3], 18, true, nr)).toBe(d0);
  });
});
