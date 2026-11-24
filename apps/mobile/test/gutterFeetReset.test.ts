import { describe, expect, it } from "vitest";
import { feetResetsRest } from "../src/modules/gutters/draw/lengthEntry";

// #2434 (founder 23.11.2026): the first length window after drawing — new feet put the inches and the fraction to 0;
// the window opened again keeps them; inches or fraction touched in this window are never wiped
describe("feet typed: do the inches and the fraction go to 0", () => {
  it("the first window after drawing, nothing else touched — yes", () => expect(feetResetsRest({ firstOpen: true, restTouched: false })).toBe(true));
  it("the window opened again (a length label) — no", () => expect(feetResetsRest({ firstOpen: false, restTouched: false })).toBe(false));
  it("the inches or the fraction already touched here — no", () => expect(feetResetsRest({ firstOpen: true, restTouched: true })).toBe(false));
});
