/** The tape to pull (founder 09.11, his sample «tape pager»): the scales and the flick (spec 33 П20.19). */
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ PanResponder: { create: () => ({ panHandlers: {} }) }, View: () => null }));
vi.mock("react-native-svg", () => ({ default: () => null, Line: () => null, Path: () => null, Text: () => null }));
vi.mock("@/theme/ThemeProvider", () => ({ useTheme: () => ({ c: {} }) }));
vi.mock("@/ui/controls", () => ({ IconButton: () => null }));
vi.mock("@/ui/primitives", () => ({ T: () => null }));
vi.mock("@/ui/surfaces", () => ({ RowView: () => null }));

describe("the tape", () => {
  it("1/8″ scale: inches numbered within the foot, the feet bold, the eighths shorter", async () => {
    const { EIGHTHS_SCALE } = await import("../src/modules/gutters/draw/Tape");
    expect(EIGHTHS_SCALE(96)).toMatchObject({ text: "1′", bold: true });
    expect(EIGHTHS_SCALE(96 + 40)).toMatchObject({ text: "5" });
    expect(EIGHTHS_SCALE(4).h).toBeGreaterThan(EIGHTHS_SCALE(2).h);
    expect(EIGHTHS_SCALE(2).h).toBeGreaterThan(EIGHTHS_SCALE(1).h);
    expect(EIGHTHS_SCALE(3).text).toBeUndefined();
  });
  it("mm scale: the centimetres numbered, every 10 cm bold", async () => {
    const { MM_SCALE } = await import("../src/modules/gutters/draw/Tape");
    expect(MM_SCALE(250)).toMatchObject({ text: "25" });
    expect(MM_SCALE(300)).toMatchObject({ text: "30", bold: true });
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
