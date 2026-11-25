/** v43 PR D: the downspout's own storey in its window and the length line under it */
import { describe, expect, it } from "vitest";
import { downspoutLengthIn, DEFAULT_GUTTER_RULES, resolveGutterRules } from "@octo/estimating-engine";
import { dsLengthLine } from "../src/modules/gutters/canvas/dsLength";
import { dsStoryPatch, dsStoryShown } from "../src/modules/gutters/canvas/attrs";

const ds = (o: object = {}) => ({ bottom: { kind: "none" as const }, ...o }) as never;

describe("the length line under «Вид · Размер · Этаж»", () => {
  it("by the gutter's storey until the downspout has its own", () => {
    expect(dsLengthLine(ds(), 1)).toMatchObject({ own: false, ft: 10, stories: 1 });
    expect(dsLengthLine(ds(), 2)).toMatchObject({ ft: 20, stories: 2 });
    expect(dsLengthLine(ds({ story: 3 }), 1)).toMatchObject({ ft: 30, stories: 3 });
  });
  it("onto a lower roof — a storey less; «Своя высота» wins", () => {
    expect(dsLengthLine(ds({ bottom: { kind: "lower_roof" }, story: 3 }), 1).ft).toBe(20);
    expect(dsLengthLine(ds({ heightIn: 180, story: 3 }), 1)).toMatchObject({ own: true, ft: 15 });
  });
  it("it is the length the engine counts (minus its extension)", () => {
    for (const [d, s] of [[ds(), 1], [ds({ story: 2 }), 1], [ds({ bottom: { kind: "lower_roof" }, story: 3 }), 1]] as const) {
      expect(dsLengthLine(d, s).ft * 12 + DEFAULT_GUTTER_RULES.dsExtensionIn).toBe(downspoutLengthIn(d as never, s, DEFAULT_GUTTER_RULES));
    }
  });
});

describe("the storey field of the window", () => {
  it("the window shows its own, else its gutter's; the picked one is written only when it differs (rule 16)", () => {
    expect(dsStoryShown({}, 2)).toBe(2);
    expect(dsStoryPatch(2, 3)).toEqual({ story: 3 });
    expect(dsStoryPatch(2, 2)).toEqual({ story: undefined });
  });
});

describe("the company's rules (the window says what the estimate counts)", () => {
  it("a storey of 9 ft: 9 ft, and 2 storeys 18 ft; the window tells no sticks (the estimate adds the extension and the bends, then rounds up)", () => {
    expect(dsLengthLine(ds(), 1, { storyHeightIn: 108 })).toMatchObject({ ft: 9 });
    expect(dsLengthLine(ds(), 2, { storyHeightIn: 108 })).toMatchObject({ ft: 18 });
    expect(Object.keys(dsLengthLine(ds(), 2, { storyHeightIn: 108 })).sort()).toEqual(["ft", "own", "stories"]);
  });
  it("it is what the engine counts with the same rules (minus its extension)", () => {
    const over = { storyHeightIn: 108 };
    const rules = resolveGutterRules(over);
    expect(dsLengthLine(ds({ story: 2 }), 1, over).ft * 12 + rules.dsExtensionIn).toBe(downspoutLengthIn(ds({ story: 2 }) as never, 1, rules));
  });
  it("a storey of 9.5 ft gives 28.5 ft (a tenth, no float tail); onto the lower roof from the first storey — no storeys", () => {
    expect(dsLengthLine(ds(), 3, { storyHeightIn: 114 }).ft).toBe(28.5);
    expect(dsLengthLine(ds({ bottom: { kind: "lower_roof" } }), 1).stories).toBe(0);
  });
});
