/** The tape to pull (founder 09.11, his sample «tape pager»): the scales and the flick (spec 33 П20.19). */
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ PanResponder: { create: () => ({ panHandlers: {} }) }, View: () => null }));
vi.mock("react-native-svg", () => ({ default: () => null, Line: () => null, Path: () => null, Text: () => null }));
vi.mock("@/theme/ThemeProvider", () => ({ useTheme: () => ({ c: {} }) }));
vi.mock("@/ui/controls", () => ({ IconButton: () => null }));
vi.mock("@/ui/primitives", () => ({ T: () => null }));
vi.mock("@/ui/surfaces", () => ({ RowView: () => null }));
vi.mock("@/ui/overlays", () => ({ useSheetHold: () => ({ current: false }) }));

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
