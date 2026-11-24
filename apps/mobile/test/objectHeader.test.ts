/** ObjectHeader's motion (rule 27а): compact on scroll, swipe to open/shut — limits, no jump, release rule. */
import { describe, expect, it } from "vitest";
import { component, size } from "@octo/design-tokens";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compactProgress, expandEndsOpen, expandShown, expandSwipeStart, followFrom, isCompact, panelMotion } from "../src/ui/objectHeaderMath";

const at = component.objectHeader.collapseAt;
const span = size.hitMin;
const rule = { settle: component.sheetDismissRatio, project: component.sheetProjectMs, slow: component.sheetSlowVelocity, flick: component.sheetFlickVelocity };
const slop = component.sheetBodySlop;
const H = 300;

describe("compact bar on scroll", () => {
  it("nothing until collapseAt (24), also when the list bounces above the top", () => {
    expect(compactProgress(0, at, span)).toBe(0);
    expect(compactProgress(-40, at, span)).toBe(0);
    expect(compactProgress(at, at, span)).toBe(0);
    expect(isCompact(at - 1, at)).toBe(false);
    expect(isCompact(at, at)).toBe(true);
  });
  it("comes in over one bar's height, no jump at the threshold, never past 1", () => {
    expect(compactProgress(at + 1, at, span)).toBeCloseTo(1 / span);
    expect(compactProgress(at + span / 2, at, span)).toBeCloseTo(0.5);
    expect(compactProgress(at + span, at, span)).toBe(1);
    expect(compactProgress(at + 1000, at, span)).toBe(1);
    expect(compactProgress(at + 1, at, 0)).toBe(1);
  });
  it("is monotonic", () => {
    let prev = 0;
    for (let y = -10; y < at + span + 10; y++) {
      const p = compactProgress(y, at, span);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});

describe("swipe on the header: when it takes hold", () => {
  it("shut: down past the slop, mostly down — activate; up — the page's scroll", () => {
    expect(expandSwipeStart(0, slop + 1, slop, false)).toBe("activate");
    expect(expandSwipeStart(0, slop - 1, slop, false)).toBe("wait");
    expect(expandSwipeStart(0, -(slop + 1), slop, false)).toBe("fail");
  });
  it("open: up activates, down fails", () => {
    expect(expandSwipeStart(0, -(slop + 1), slop, true)).toBe("activate");
    expect(expandSwipeStart(0, slop + 1, slop, true)).toBe("fail");
  });
  it("sideways is not ours (a quick action, a strip)", () => {
    expect(expandSwipeStart(slop + 1, slop, slop, false)).toBe("fail");
    expect(expandSwipeStart(slop + 5, slop + 6, slop, false)).toBe("fail");
  });
});

describe("swipe on the header: the panel follows the finger", () => {
  it("no jump at the hold: the slop travelled before activation does not count", () => {
    const base = slop + 1;
    expect(expandShown(false, followFrom(base, base), H)).toBe(0);
    expect(expandShown(true, followFrom(-base, -base), H)).toBe(H);
  });
  it("stays within 0 … height", () => {
    expect(expandShown(false, -50, H)).toBe(0);
    expect(expandShown(false, 120, H)).toBe(120);
    expect(expandShown(false, 999, H)).toBe(H);
    expect(expandShown(true, 50, H)).toBe(H);
    expect(expandShown(true, -120, H)).toBe(H - 120);
    expect(expandShown(true, -999, H)).toBe(0);
  });
  it("not measured yet — nothing shown", () => {
    expect(expandShown(false, 100, 0)).toBe(0);
  });
});

describe("swipe on the header: let go", () => {
  it("a flick opens / shuts at once", () => {
    expect(expandEndsOpen(false, 5, rule.flick, H, rule)).toBe(true);
    expect(expandEndsOpen(true, -5, -rule.flick, H, rule)).toBe(false);
  });
  it("slow: the nearer of open / shut", () => {
    expect(expandEndsOpen(false, H * 0.6, 0, H, rule)).toBe(true);
    expect(expandEndsOpen(false, H * 0.4, 0, H, rule)).toBe(false);
    expect(expandEndsOpen(true, -H * 0.4, 0, H, rule)).toBe(true);
    expect(expandEndsOpen(true, -H * 0.6, 0, H, rule)).toBe(false);
  });
  it("the speed counts: a finger going back takes it back", () => {
    expect(expandEndsOpen(false, H * 0.4, rule.slow * 3, H, rule)).toBe(H * 0.4 + rule.slow * 3 * rule.project > H * rule.settle);
    expect(expandEndsOpen(false, H * 0.6, -rule.slow * 4, H, rule)).toBe(H * 0.6 - rule.slow * 4 * rule.project > H * rule.settle);
  });
  it("not moved — stays as it was", () => {
    expect(expandEndsOpen(false, 0, 0, H, rule)).toBe(false);
    expect(expandEndsOpen(true, 0, 0, H, rule)).toBe(true);
  });
  it("not measured: the direction decides", () => {
    expect(expandEndsOpen(false, 20, 0, 0, rule)).toBe(true);
    expect(expandEndsOpen(false, 0, 0, 0, rule)).toBe(false);
    expect(expandEndsOpen(true, -20, 0, 0, rule)).toBe(false);
    expect(expandEndsOpen(true, 0, 0, 0, rule)).toBe(true);
  });
});

describe("the panel moves by transform and opacity only (LAYOUT-RULES §8 п.5, wave 3)", () => {
  it("shut — out of sight above, a hair of shown — almost there, open — in place and opaque", () => {
    expect(panelMotion(0, H, false)).toEqual({ translateY: -H, opacity: 0 });
    expect(panelMotion(H, H, false)).toEqual({ translateY: -0, opacity: 1 });
    const half = panelMotion(H / 2, H, false);
    expect(half.translateY).toBeCloseTo(-H / 2);
    expect(half.opacity).toBeCloseTo(0.5);
  });
  it("follows the finger with no jump: monotonic, the bottom edge is where `shown` says", () => {
    let prevY = -Infinity;
    let prevO = -Infinity;
    for (let shown = 0; shown <= H; shown += 7) {
      const m = panelMotion(shown, H, false);
      expect(m.translateY).toBeGreaterThanOrEqual(prevY);
      expect(m.opacity).toBeGreaterThanOrEqual(prevO);
      // the panel's bottom edge (its height + the shift) is exactly how much of it is seen
      expect(H + m.translateY).toBeCloseTo(shown);
      prevY = m.translateY;
      prevO = m.opacity;
    }
  });
  it("stays within its limits past either end (a fast flick, a bounce)", () => {
    expect(panelMotion(-50, H, false)).toEqual({ translateY: -H, opacity: 0 });
    expect(panelMotion(H + 80, H, false)).toEqual({ translateY: -0, opacity: 1 });
  });
  it("Reduce Motion — no shift, only the fade", () => {
    for (const shown of [0, H / 3, H]) expect(panelMotion(shown, H, true).translateY).toBe(0);
    expect(panelMotion(H / 4, H, true).opacity).toBeCloseTo(0.25);
  });
  it("not measured yet — nothing seen, no shift (no flash of a 0-high panel)", () => {
    expect(panelMotion(0, 0, false)).toEqual({ translateY: 0, opacity: 0 });
    expect(panelMotion(40, 0, true)).toEqual({ translateY: 0, opacity: 0 });
  });
  it("the header animates no height: the panel's style is transform + opacity", () => {
    const s = readFileSync(join(__dirname, "..", "src", "ui", "objectHeader.tsx"), "utf8");
    expect(s).not.toMatch(/height:\s*shown\.value/);
    expect(s).toMatch(/transform: \[\{ translateY: m\.translateY \}\]/);
  });
});
