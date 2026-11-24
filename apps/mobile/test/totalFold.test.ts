/** unit:totalFold — #2363 q72 (founder 21.11.2026, вариант А): when the estimate's «Итого» folds into the capsule and opens again */
import { describe, expect, it } from "vitest";
import { foldStart, foldStep, type FoldState } from "../src/ui/totalFold";

const run = (ys: number[], s: FoldState = foldStart) => ys.reduce((a, y) => foldStep(a, y), s);

describe("unit:totalFold", () => {
  it("stays open for a small scroll down, folds past 24 pt", () => {
    expect(run([10, 20, 24]).folded).toBe(false);
    expect(run([10, 20, 25]).folded).toBe(true);
  });
  it("folded, a jitter up of a few points keeps it folded; 8 pt up opens it", () => {
    const f = run([50, 300]);
    expect(f.folded).toBe(true);
    expect(run([295], f).folded).toBe(true);
    expect(run([292], f).folded).toBe(false);
  });
  it("the anchor follows the finger: down again after opening needs 24 pt more, not from the top", () => {
    const open = run([50, 300, 290]);
    expect(open.folded).toBe(false);
    expect(run([310], open).folded).toBe(false);
    expect(run([315], open).folded).toBe(true);
  });
  it("at the end of the list it opens (the last lines are read with their total)", () => {
    const f = [50, 300].reduce((a, y) => foldStep(a, y), foldStart);
    expect(f.folded).toBe(true);
    expect(foldStep(f, 600, undefined, 604).folded).toBe(false);
    expect(foldStep(f, 590, undefined, 604).folded).toBe(true);
  });
  it("at the top it is always open", () => {
    expect(run([400, 0]).folded).toBe(false);
  });
});
