import { describe, expect, it } from "vitest";
import { heldStep, type HeldState } from "../src/ui/heldSheet";

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
});
