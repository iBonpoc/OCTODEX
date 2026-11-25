import { describe, expect, it } from "vitest";
import { heldExit, heldStep, type HeldState } from "../src/ui/heldSheet";
import { quickSheetKey } from "../src/features/quickPrice";

/** the data of a sheet that is led out by its owner (#1163): what it keeps, and when an opening is a new one */
describe("heldStep", () => {
  const start: HeldState<string> = { seen: null, held: null, opening: 1 };
  it("data comes: it is held", () => {
    expect(heldStep(start, "a")).toEqual({ seen: "a", held: "a", opening: 1 });
  });
  it("the owner empties it: the last data is still held (the sheet goes out with it)", () => {
    const a = heldStep(start, "a");
    expect(heldStep(a, null)).toEqual({ seen: null, held: "a", opening: 1 });
  });
  it("the same render again is not a change (no state is set for nothing)", () => {
    const a = heldStep(start, "a");
    expect(heldStep(a, "a")).toBe(a);
  });
  it("the data comes back while it is still held: a new opening — the form starts fresh", () => {
    const gone = heldStep(heldStep(start, "a"), null);
    expect(heldStep(gone, "a")).toEqual({ seen: "a", held: "a", opening: 2 });
  });
  it("another value in a row is the same opening", () => {
    const a = heldStep(start, "a");
    expect(heldStep(a, "b")).toEqual({ seen: "b", held: "b", opening: 1 });
  });
  it("opened for the first time after nothing was held: not a new opening (nothing to reset)", () => {
    expect(heldStep(start, "a").opening).toBe(1);
  });
  it("#1826: the sheet left and opens again (nothing held any more) — still a new opening: the form starts fresh", () => {
    const a = heldStep(start, "a");
    const closed = heldExit(heldStep(a, null));
    expect(closed).toEqual({ seen: null, held: null, opening: 2 });
    expect(heldStep(closed, "b").opening).toBe(2);
    expect(heldStep(heldExit(heldStep(heldStep(closed, "b"), null)), "a").opening).toBe(3);
  });
  it("#1826: the exit after the data came back meanwhile changes nothing", () => {
    const back = heldStep(heldStep(heldStep(start, "a"), null), "a");
    expect(heldExit(back)).toBe(back);
  });
});

/** #1826 (money): the price sheet's state is reset by the opening AND by the item's id */
describe("quickSheetKey", () => {
  it("another item → another key, the same opening", () => {
    expect(quickSheetKey(1, { id: "a" })).not.toBe(quickSheetKey(1, { id: "b" }));
  });
  it("another opening of the same item → another key", () => {
    expect(quickSheetKey(1, { id: "a" })).not.toBe(quickSheetKey(2, { id: "a" }));
  });
  it("the same opening and item → the same key (no remount while typing)", () => {
    expect(quickSheetKey(3, { id: "a" })).toBe(quickSheetKey(3, { id: "a" }));
  });
});
