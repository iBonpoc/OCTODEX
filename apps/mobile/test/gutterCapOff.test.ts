import { describe, expect, it } from "vitest";
import { setCapOff } from "../src/modules/gutters/canvas/edit";
import { DEFAULT_RUN_ATTRS } from "../src/modules/gutters/canvas/model";
import { findCorners, runEnds, toMeasurement, type Drawing } from "../src/modules/gutters/geometry";

/** #1273 «Без заглушки»: noCap[end] — the end has no cap, and none is counted */
const D: Drawing = { runs: [{ id: "a", a: [0, 0], b: [240, 0], lengthIn: 240, attrs: { ...DEFAULT_RUN_ATTRS } }], downspouts: [] };
const capsOf = (d: Drawing) => toMeasurement(d).runs[0]!.ends.filter((e) => e.kind === "cap").length;

describe("setCapOff", () => {
  it("a free end has a cap; off removes it from the measurement, on puts it back", () => {
    expect(capsOf(D)).toBe(2);
    const off = setCapOff(D, "a", 1, true);
    expect(capsOf(off)).toBe(1);
    expect(runEnds(off, findCorners(off))["a"]![1].kind).toBe("join");
    expect(capsOf(setCapOff(off, "a", 1, false))).toBe(2);
  });
  it("only the chosen end changes", () => {
    expect(setCapOff(D, "a", 0, true).runs[0]!.noCap).toEqual([true, false]);
  });
  it("same drawing back when nothing changes or no such run", () => {
    expect(setCapOff(D, "a", 0, false)).toBe(D);
    expect(setCapOff(D, "zz", 0, true)).toBe(D);
  });
  it("both back on: written as [false, false] (a missing key could stay in a saved copy), and counted as caps again", () => {
    const back = setCapOff(setCapOff(D, "a", 0, true), "a", 0, false);
    expect(back.runs[0]!.noCap).toEqual([false, false]);
    expect(capsOf(back)).toBe(2);
  });
});
