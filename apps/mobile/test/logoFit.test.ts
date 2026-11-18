import { describe, expect, it } from "vitest";
import { logoFit } from "@/features/logoFit";

// #2003: a wide logo was squeezed into a square (256 × 256)
describe("logoFit — the logo keeps its proportions (#2003)", () => {
  it("a wide logo stays wide: the longer side becomes max", () => {
    expect(logoFit(1200, 300, 256)).toEqual({ width: 256, height: 64 });
  });
  it("a tall logo stays tall", () => {
    expect(logoFit(300, 900, 256)).toEqual({ width: 85, height: 256 });
  });
  it("a square one stays square", () => {
    expect(logoFit(1000, 1000, 256)).toEqual({ width: 256, height: 256 });
  });
  it("a small one is not blown up", () => {
    expect(logoFit(120, 40, 256)).toEqual({ width: 120, height: 40 });
  });
  it("no size known: the old square, not a crash", () => {
    expect(logoFit(0, 0, 256)).toEqual({ width: 256, height: 256 });
  });
});
