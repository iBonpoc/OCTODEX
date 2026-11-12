/** #1159 (DS §15.6): the haptic of letting the toolbar go — «set down» only on another edge. */
import { describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } }));
import { dropHaptic, placeAt, TOOLBAR_PLACES } from "../src/modules/gutters/canvas/localStore";

describe("dropHaptic", () => {
  it("another edge: medium; the same edge: nothing — every pair", () => {
    for (const a of TOOLBAR_PLACES) for (const b of TOOLBAR_PLACES) expect(dropHaptic(a, b), `${a} → ${b}`).toBe(a === b ? null : "medium");
  });
  it("with the edge placeAt picks for a drop point (left side of a 400×800 screen from the bottom: left)", () => {
    expect(dropHaptic("bottom", placeAt(10, 400, 400, 800))).toBe("medium");
    expect(dropHaptic("left", placeAt(10, 400, 400, 800))).toBeNull();
  });
});
