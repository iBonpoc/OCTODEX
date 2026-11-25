/** v43 PR D: the downspout's own storey in its window and the length line under it */
import { describe, expect, it } from "vitest";
import { downspoutLengthIn, DEFAULT_GUTTER_RULES } from "@octo/estimating-engine";
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
