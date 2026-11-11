import { describe, it, expect } from "vitest";
import { addDownspout } from "../src/modules/gutters/canvas/edit";
import { DEFAULT_RUN_ATTRS, DEFAULT_DS_ATTRS } from "../src/modules/gutters/canvas/model";
import type { Drawing } from "../src/modules/gutters/geometry";
import { choicesFor, MODULE_CHOICES, newDsAttrs } from "../src/modules/gutters/settings";

/** #767 (founder 11.11): a downspout put on a 6″ gutter is 3×4 by default; on 5″ it is the company's size (2×3 by default). */
const ft = (n: number) => n * 12;
const drawing = (size: string): Drawing => ({ runs: [{ id: "x", a: [0, 0], b: [ft(20), 0], attrs: { ...DEFAULT_RUN_ATTRS, size } }], downspouts: [] });
const put = (d: Drawing, attrs = newDsAttrs(MODULE_CHOICES), ch = MODULE_CHOICES) => addDownspout(d, "d1", [ft(5), 0], 36, attrs as never, ch).downspouts[0]!;

describe("addDownspout: size by the gutter (#767)", () => {
  it("5″ gutter → the company's size (2×3 by default)", () => {
    expect(put(drawing("5")).size).toBe("2x3");
  });
  it("6″ gutter → 3×4", () => {
    expect(put(drawing("6")).size).toBe("3x4");
  });
  it("6″ gutter, no settings passed → 3×4 as well", () => {
    expect(addDownspout(drawing("6"), "d1", [ft(5), 0], 36, { ...DEFAULT_DS_ATTRS }).downspouts[0]!.size).toBe("3x4");
  });
  it("a size the company set itself stays on a 6″ gutter, and a 5″ gutter takes the company's 3×4", () => {
    const ch = choicesFor({ ds: { size: "3x4" } });
    expect(put(drawing("5"), newDsAttrs(ch), ch).size).toBe("3x4");
    const round = choicesFor({ ds: { shape: "round", size: "round_3" } });
    expect(put(drawing("6"), newDsAttrs(round), round)).toMatchObject({ shape: "round" });
    expect(put(drawing("6"), newDsAttrs(round), round).size).not.toBe("3x4");
  });
  it("a company that offers no 3×4 keeps its size", () => {
    const ch = choicesFor({ off: { dsSizes: { rect: ["3x4"] } } });
    expect(put(drawing("6"), newDsAttrs(ch), ch).size).toBe("2x3");
  });
});
