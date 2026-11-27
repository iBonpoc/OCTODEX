/** #2412 G1: what the downspout's window shows and when its «Ещё» opens by itself (NAMES-41, code review of G1). */
import { describe, expect, it } from "vitest";
import { dsMoreSet, dsRareShown, ownColor } from "../src/modules/gutters/draw/attrShown";

const rect = { shape: "rect", dsStyle: "plain" };

describe("dsRareShown", () => {
  it("a plain square downspout: no reducer, no diverter, no outlet screen", () => {
    expect(dsRareShown(rect)).toEqual({ reducer: false, diverter: false, outletScreen: false });
  });
  it("square corrugated — the diverter; round — the outlet screen", () => {
    expect(dsRareShown({ shape: "rect", dsStyle: "corrugated" }).diverter).toBe(true);
    expect(dsRareShown({ shape: "round" }).outletScreen).toBe(true);
    expect(dsRareShown({ shape: "round" }).diverter).toBe(false);
  });
  it("an old drawing keeps what it has set (the data stays visible)", () => {
    expect(dsRareShown({ ...rect, reducers: [{}], diverter: true, outletScreen: true })).toEqual({ reducer: true, diverter: true, outletScreen: true });
  });
  it("switched off in this window: the row stays until the window closes", () => {
    const at = { ...rect, reducers: [{}], diverter: true, outletScreen: true };
    expect(dsRareShown(rect, at)).toEqual({ reducer: true, diverter: true, outletScreen: true });
  });
});

describe("dsMoreSet", () => {
  it("nothing set under «Ещё» — shut", () => {
    expect(dsMoreSet({ ...rect, finish: "painted", color: "White" }, { finish: "painted", color: "White" })).toBe(false);
  });
  it("its own length, a rare part or its own colour — open", () => {
    // its own height is not under «Ещё» any more (#3090 п.4): it does not open it
    expect(dsMoreSet({ ...rect, heightIn: 144 })).toBe(false);
    expect(dsMoreSet({ ...rect, diverter: true })).toBe(true);
    expect(dsMoreSet({ ...rect, finish: "painted", color: "Black" }, { finish: "painted", color: "White" })).toBe(true);
  });
  it("the head and offsets are on top now: they do not open «Ещё»", () => {
    expect(dsMoreSet({ ...rect, ...({ head: "funnel", offsets: [{ lengthIn: 2, qty: 1 }] } as object) })).toBe(false);
  });
});

describe("ownColor", () => {
  it("the same as the gutter — not its own; bare vs painted — its own", () => {
    expect(ownColor({ ...rect, finish: "painted", color: "White" }, { color: "White" })).toBe(false);
    expect(ownColor({ ...rect, finish: "mill" }, { finish: "painted", color: "White" })).toBe(true);
    expect(ownColor({ ...rect, color: "White" })).toBe(false);
  });
});
