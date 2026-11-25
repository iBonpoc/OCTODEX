import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { feetResetsRest, restTouchedAfterUnitPick, unitPickStep } from "../src/modules/gutters/draw/lengthEntry";

// #2434 (founder 23.11.2026): the first length window after drawing — new feet put the inches and the fraction to 0;
// the window opened again keeps them; inches or fraction touched in this window are never wiped
describe("feet typed: do the inches and the fraction go to 0", () => {
  it("the first window after drawing, nothing else touched — yes", () => expect(feetResetsRest({ firstOpen: true, restTouched: false })).toBe(true));
  it("the window opened again (a length label) — no", () => expect(feetResetsRest({ firstOpen: false, restTouched: false })).toBe(false));
  it("the inches or the fraction already touched here — no", () => expect(feetResetsRest({ firstOpen: true, restTouched: true })).toBe(false));
});

// #2446: a unit picked after an edit — the fields show the typed length, so the feet never wipe them
describe("a unit picked: is the rest touched", () => {
  it("edited before, then a unit — touched", () => expect(restTouchedAfterUnitPick({ restTouched: false, edited: true })).toBe(true));
  it("nothing edited, a unit only — still the drawn guess", () => expect(restTouchedAfterUnitPick({ restTouched: false, edited: false })).toBe(false));
  it("already touched stays touched", () => expect(restTouchedAfterUnitPick({ restTouched: true, edited: false })).toBe(true));
  it("the chain: feet typed, a unit round trip, feet typed again — the inches stay", () => {
    const touched = restTouchedAfterUnitPick({ restTouched: false, edited: true });
    expect(feetResetsRest({ firstOpen: true, restTouched: touched })).toBe(false);
  });
});

// the whole step of a unit picked
describe("unitPickStep: what a unit pick does to the window", () => {
  const base = { edited: false, typed: null, canon: 100.5, restTouched: false, unit: "ftin" as const };
  it("feet typed, inches by hand in «in», back to feet+inches: the inches stay touched and shown", () => {
    const s = unitPickStep({ ...base, edited: true, typed: 113.625 });
    expect(s.fields).toMatchObject({ ft: "9", inc: "5", e16: 10 });
    expect(s.restTouched).toBe(true);
    expect(s.edited).toBe(false);
    expect(s.bad).toBe(false);
    expect(s.canon).toBe(113.625);
  });
  it("nothing edited: the drawn length, the rest stays the drawn guess", () => {
    const s = unitPickStep(base);
    expect(s.canon).toBe(100.5);
    expect(s.restTouched).toBe(false);
    expect(s.bad).toBe(false);
  });
  it("edited but half-typed: the length in hand comes back, «bad» says so, the rest is touched", () => {
    const s = unitPickStep({ ...base, edited: true, typed: null });
    expect(s.canon).toBe(100.5);
    expect(s.bad).toBe(true);
    expect(s.restTouched).toBe(true);
  });
  it("then feet typed again: the inches are not wiped", () => {
    const s = unitPickStep({ ...base, edited: true, typed: 113.625 });
    expect(feetResetsRest({ firstOpen: true, restTouched: s.restTouched })).toBe(false);
  });
});

// the window really uses them (one minimal check; the behaviour — e2e 525)
describe("QuickLength uses the rules", () => {
  const src = readFileSync(new URL("../src/modules/gutters/draw/AttrPanel.tsx", import.meta.url), "utf8");
  it("the pick and the feet go through lengthEntry", () => {
    expect(src).toContain("unitPickStep(");
    expect(src).toContain("feetResetsRest(");
  });
});
