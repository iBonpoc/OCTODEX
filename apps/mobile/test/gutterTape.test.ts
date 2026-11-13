/**
 * The tape to pull (founder 09.11, his sample «tape pager»): the scales and the flick (spec 33 П20.19); #1315 (founder 13.11:
 * «шаг между метками больше, потому что тяжело попадать»): the marks are stretched (`component.tapeTick`), the tape settles on the nearest
 * mark, every mark crossed gives a tick in the hand (not a buzz on a flick).
 */
import { describe, expect, it, vi } from "vitest";
import { component } from "@octo/design-tokens";
import { settleAt, tickDue, TICK_GAP_MS } from "../src/modules/gutters/draw/tapeMath";

vi.mock("react-native", () => ({ PanResponder: { create: () => ({ panHandlers: {} }) }, View: () => null }));
vi.mock("react-native-svg", () => ({ default: () => null, Line: () => null, Path: () => null, Text: () => null }));
vi.mock("@/theme/ThemeProvider", () => ({ useTheme: () => ({ c: {} }) }));
vi.mock("@/ui/controls", () => ({ IconButton: () => null }));
vi.mock("@/ui/primitives", () => ({ T: () => null }));
vi.mock("@/ui/surfaces", () => ({ RowView: () => null }));
vi.mock("@/ui/overlays", () => ({ useSheetHold: () => ({ current: false }) }));
vi.mock("@/ui/haptics", () => ({ haptics: { selection: () => {} } }));

describe("the tape", () => {
  it("1/16″ scale: every inch with the whole length «25′ 6″», the feet bold, the fractions shorter, glyphs on the eighths only", async () => {
    const { SIXTEENTHS_SCALE: S } = await import("../src/modules/gutters/draw/Tape");
    expect(S(192)).toMatchObject({ text: "1′", bold: true });
    expect(S(192 + 80)).toMatchObject({ text: "1′ 5″" });
    expect(S(25 * 192 + 6 * 16)).toMatchObject({ text: "25′ 6″" });
    expect(S(8).h).toBeGreaterThan(S(4).h);
    expect(S(4).h).toBeGreaterThan(S(2).h);
    expect(S(2).h).toBeGreaterThan(S(1).h);
    expect(S(8)).toMatchObject({ frac: "½", big: true });
    expect(S(6).frac).toBe("⅜");
    expect(S(3).frac).toBeUndefined();
    expect(S(3).text).toBeUndefined();
  });
  it("inches alone: every inch numbered", async () => {
    const { SIXTEENTHS_SCALE_IN: S } = await import("../src/modules/gutters/draw/Tape");
    expect(S(16 * 21)).toMatchObject({ text: "21″" });
    expect(S(192)).toMatchObject({ bold: true });
    expect(S(5).h).toBeLessThan(S(8).h);
  });
  it("mm scale: every centimetre with the whole length, every 10 cm bold in metres", async () => {
    const { MM_SCALE } = await import("../src/modules/gutters/draw/Tape");
    expect(MM_SCALE(1020)).toMatchObject({ text: "102 cm" });
    expect(MM_SCALE(1100)).toMatchObject({ text: "1.1 m", bold: true });
    expect(MM_SCALE(5).h).toBeGreaterThan(MM_SCALE(3).h);
  });
  it("a flick runs on the way it was thrown, further the faster; a slow let-go stays", async () => {
    const { coastEnd } = await import("../src/modules/gutters/draw/Tape");
    expect(coastEnd(100, 0.001)).toBe(100);
    expect(coastEnd(100, 0.5)).toBeGreaterThan(100);
    expect(coastEnd(100, -0.5)).toBeLessThan(100);
    expect(coastEnd(100, 1) - 100).toBeGreaterThan(coastEnd(100, 0.5) - 100);
  });
});

describe("the tape's marks are farther apart than a real tape's (#1315)", () => {
  it("a mark is 16 px (it was 8): twice the room for a finger", () => {
    expect(component.tapeTick).toBe(16);
  });
});

describe("the tape settles on the nearest mark (#1315)", () => {
  it("between two marks: the nearer one; halves go up", () => {
    expect(settleAt(100.4, 1000)).toBe(100);
    expect(settleAt(100.6, 1000)).toBe(101);
    expect(settleAt(100.5, 1000)).toBe(101);
    expect(settleAt(-7.2, 1000)).toBe(1); // never below the first mark
    expect(settleAt(5000.2, 1000)).toBe(1000); // nor past the last
  });
  it("a value that is a mark stays that mark", () => {
    expect(settleAt(192, 99999)).toBe(192);
  });
});

describe("a tick for every mark crossed, not a buzz (#1315)", () => {
  it("another mark and enough time since the last tick → a tick", () => {
    expect(tickDue(10, 11, 0, TICK_GAP_MS)).toBe(true);
    expect(tickDue(10, 9, 100, 200)).toBe(true);
  });
  it("the same mark → none (the finger moved inside it)", () => {
    expect(tickDue(10, 10, 0, 1000)).toBe(false);
  });
  it("another mark too soon after the last tick → none", () => {
    expect(tickDue(10, 11, 1000, 1000 + TICK_GAP_MS - 1)).toBe(false);
  });
  it("a flick over 20 marks in 80 ms gives some ticks, fewer than one per mark", () => {
    let last = 0, ticks = 0;
    for (let k = 1, t = 1000; k <= 20; k++, t += 4) if (tickDue(k - 1, k, last, t)) (ticks++, (last = t));
    expect(ticks).toBeGreaterThan(1);
    expect(ticks).toBeLessThan(20);
  });
});
