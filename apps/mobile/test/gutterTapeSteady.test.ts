/**
 * #2414 (founder 22.11: «рулетка — размер прыгает, „Применить“ перескакивает»): the tape under the finger and what is
 * over it. The tape's own arithmetic: the point under the finger, no jump, no reset by a redraw (rule 27 а); the row over
 * it keeps its size whatever the value (the cause: the fraction beside the inches wrapped the row on 11/16, 13/16, 15/16,
 * and the odd sixteenths' row came in on the first 1/16 — the tape and «Применить» moved 40–52 px under the finger).
 */
import { describe, expect, it } from "vitest";
import { component } from "@octo/design-tokens";
import { give, pullAt, settleAt } from "../src/modules/gutters/draw/tapeMath";
import { FRAC_SLOT, sixteenthBehind, sixteenthsOpenAtStart } from "../src/modules/gutters/draw/fracSlot";
import { fracLabel } from "../src/modules/gutters/canvas/format";

const TICK = component.tapeTick;
const MAX = 500 * 192;

describe("the tape under the finger (#2414)", () => {
  it("the point under the finger: a finger moved n marks left brings exactly n marks out, right takes them back", () => {
    for (const n of [1, 5, 16, 33, 192]) {
      expect(pullAt(3000, -n * TICK, TICK, MAX)).toBe(3000 + n);
      expect(pullAt(3000, n * TICK, TICK, MAX)).toBe(3000 - n);
    }
  });
  it("no jump: a pixel of the finger moves the tape a pixel (1/TICK of a mark), never more — inside and past the ends", () => {
    for (const start of [2, 3000, MAX - 2]) {
      let prev = pullAt(start, 400, TICK, MAX);
      for (let dx = -400; dx <= 400; dx++) {
        const f = pullAt(start, -dx, TICK, MAX);
        expect(Math.abs(f - prev)).toBeLessThanOrEqual(1 / TICK + 1e-9);
        prev = f;
      }
    }
  });
  it("no reset by a redraw: the value written back on every step does not move where the tape goes — a slow pull of 40 marks ends 40 marks on", () => {
    const start = 15 * 192 + 4 * 16;
    let shown = start;
    for (let i = 1; i <= 40 * 4; i++) {
      const f = pullAt(start, -(i * TICK) / 4, TICK, MAX);
      shown = settleAt(f, MAX); // the window writes the value back and the tape is drawn again
      expect(Math.abs(f - (start + i / 4))).toBeLessThan(1e-9);
    }
    expect(shown).toBe(start + 40);
  });
  it("past an end the tape gives a third of the pull, and comes back to the end", () => {
    expect(give(1 - 3, MAX)).toBeCloseTo(1 - 0.9);
    expect(give(MAX + 3, MAX)).toBeCloseTo(MAX + 0.9);
    expect(settleAt(pullAt(1, 10 * TICK, TICK, MAX), MAX)).toBe(1);
  });
});

describe("the row over the tape keeps its size whatever the value (#2414)", () => {
  it("the fraction's place is the widest fraction's: no fraction of 1/16 … 15/16 is longer (figures are tabular)", () => {
    expect(FRAC_SLOT).toMatch(/^\d\d\/16$/);
    for (let k = 1; k <= 15; k++) expect(fracLabel(k).length).toBeLessThanOrEqual(FRAC_SLOT.length);
  });
  it("the odd sixteenths' row: open when the window opens on one; a sixteenth from the tape does not open it — «1/16» looks chosen", () => {
    expect(sixteenthsOpenAtStart(3)).toBe(true);
    expect(sixteenthsOpenAtStart(6)).toBe(false);
    expect(sixteenthsOpenAtStart(0)).toBe(false);
    expect(sixteenthBehind(11, false)).toBe(true);
    expect(sixteenthBehind(11, true)).toBe(false);
    expect(sixteenthBehind(4, false)).toBe(false);
  });
});
