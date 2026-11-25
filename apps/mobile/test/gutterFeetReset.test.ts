import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { feetResetsRest, restTouchedAfterUnitPick } from "../src/modules/gutters/draw/lengthEntry";

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

// the wiring in the window (this suite has no renderer: the source is read; the behaviour — e2e 525)
describe("QuickLength is wired to the rules (#2446)", () => {
  const src = readFileSync(new URL("../src/modules/gutters/draw/AttrPanel.tsx", import.meta.url), "utf8");
  const lines = src.split("\n");
  const line = (needle: string) => lines.find((l) => l.includes(needle)) ?? "";
  it("the feet field resets the inches and the fraction only through feetResetsRest, in the first window", () => {
    const l = line("feetResetsRest({");
    expect(l).toContain("firstOpen: start === undefined");
    expect(l).toContain("restTouched: restTouched.current");
    expect(l).toContain('setInc("0"); setE16(0);');
  });
  it("the inches, the fraction and the tape mark the rest as touched", () => {
    expect(line("onChangeText={(v) => { restTouched.current = true; edit(setInc)(v)")).not.toBe("");
    expect(src.match(/edited\.current = true; restTouched\.current = true;/g)?.length).toBe(2); // the fraction + the tape
  });
  it("pickUnit marks the rest as touched from `edited`, before `edited` is cleared", () => {
    const from = src.indexOf("const pickUnit = (u: LenUnit)");
    const pick = src.slice(from, src.indexOf("const apply = ()", from));
    const call = "restTouched.current = restTouchedAfterUnitPick({ restTouched: restTouched.current, edited: edited.current })";
    expect(pick).toContain(call);
    expect(pick.indexOf(call)).toBeLessThan(pick.indexOf("edited.current = false"));
  });
});
