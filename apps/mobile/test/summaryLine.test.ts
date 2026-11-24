/** SummaryLine fit: one line, cut at a whole item, «…» at the end (BUILD-PLAN §1 поток Б). */
import { describe, expect, it } from "vitest";
import { summaryFit } from "../src/ui/summaryLineFit";

const sep = 10;
const tail = 12;
describe("summaryFit", () => {
  it("all fit — no tail", () => {
    expect(summaryFit([50, 50, 50], 170, sep, tail)).toEqual({ shown: 3, cut: false });
  });
  it("exactly fits — no tail", () => {
    expect(summaryFit([50, 50], 110, sep, tail)).toEqual({ shown: 2, cut: false });
  });
  it("cut at a whole item, room left for « · …»", () => {
    // 50+10+50 = 110, +10+12 = 132 ≤ 140; three would be 170
    expect(summaryFit([50, 50, 50], 140, sep, tail)).toEqual({ shown: 2, cut: true });
    // 110 + 22 = 132 > 130 → only the first one
    expect(summaryFit([50, 50, 50], 130, sep, tail)).toEqual({ shown: 1, cut: true });
  });
  it("not even one with the tail — the first stays (cut by the line), the tail after it", () => {
    expect(summaryFit([200, 50], 100, sep, tail)).toEqual({ shown: 1, cut: true });
    expect(summaryFit([200], 100, sep, tail)).toEqual({ shown: 1, cut: false });
  });
  it("not measured yet — all drawn", () => {
    expect(summaryFit([50, 50, 50], 0, sep, tail)).toEqual({ shown: 3, cut: false });
    expect(summaryFit([], 100, sep, tail)).toEqual({ shown: 0, cut: false });
  });
});
