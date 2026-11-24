import { describe, expect, it } from "vitest";
import { component, space } from "@octo/design-tokens";
import { kindWidth, openClip } from "../src/features/estimate/rowOpen";

// #2421 / #2426: the open line's fields come out by height under its folded face (rule 27 (а): the math of the animation)
describe("openClip — the fields open by height", () => {
  it("shut: no height, clipped", () => expect(openClip(0, 300)).toEqual({ height: 0, overflow: "hidden" }));
  it("half way: half the fields' height", () => expect(openClip(0.5, 300)).toEqual({ height: 150, overflow: "hidden" }));
  it("grows with the animation, never past the fields", () => {
    let last = -1;
    for (let g = 0; g < 1; g += 0.05) {
      const h = openClip(g, 300).height as number;
      expect(h).toBeGreaterThanOrEqual(last);
      expect(h).toBeLessThanOrEqual(300);
      last = h;
    }
  });
  it("open: no fixed height — «Ещё» opening later grows the row", () => expect(openClip(1, 300)).toEqual({ height: "auto", overflow: "visible" }));
  it("an overshoot is open, a negative is shut", () => {
    expect(openClip(1.02, 300).height).toBe("auto");
    expect(openClip(-0.1, 300).height).toBe(0);
  });
  it("not measured yet: nothing shows (no jump to a wrong height)", () => expect(openClip(0.4, 0).height).toBe(0));
  it("both keys every time (a native animated style keeps a dropped key)", () => {
    for (const g of [0, 0.3, 1]) expect(Object.keys(openClip(g, 120)).sort()).toEqual(["height", "overflow"]);
  });
});

describe("kindWidth — one grid for the two rows", () => {
  it("«Вид» is «Кол-во» + the gap + «Ед.»", () => expect(kindWidth()).toBe(component.estRow.qty + space[2] + component.estRow.unit));
});
