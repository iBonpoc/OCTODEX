/** MainStep rules: layout variants and loading phases (BUILD-SPEC §1 MainStepBar). */
import { describe, expect, it } from "vitest";
import { component, motion } from "@octo/design-tokens";
import { loadPhase, mainStepLayout } from "../src/ui/mainStepRules";

describe("mainStepLayout", () => {
  it("one main button", () => expect(mainStepLayout({})).toEqual({ layout: "single", secondInMore: false }));
  it("second + main in a row when the second label fits", () => {
    expect(mainStepLayout({ second: { label: "x".repeat(component.pair.labelMax) } })).toEqual({ layout: "pair", secondInMore: false });
  });
  it("a long second label goes into «⋯»", () => {
    expect(mainStepLayout({ second: { label: "x".repeat(component.pair.labelMax + 1) } })).toEqual({ layout: "single", secondInMore: true });
  });
  it("total + button; a second then goes into «⋯»", () => {
    expect(mainStepLayout({ total: { label: "Итого", value: "$1" } })).toEqual({ layout: "total", secondInMore: false });
    expect(mainStepLayout({ total: {}, second: { label: "Черновик" } })).toEqual({ layout: "total", secondInMore: true });
  });
});

describe("loadPhase", () => {
  it("idle when not loading", () => expect(loadPhase(false, 99999)).toBe("idle"));
  it("no spinner before spinnerDelayMs (a fast step does not flash)", () => {
    expect(loadPhase(true, 0)).toBe("wait");
    expect(loadPhase(true, motion.spinnerDelayMs - 1)).toBe("wait");
  });
  it("spinner until actionTimeoutMs, then failed", () => {
    expect(loadPhase(true, motion.spinnerDelayMs)).toBe("spinner");
    expect(loadPhase(true, motion.actionTimeoutMs - 1)).toBe("spinner");
    expect(loadPhase(true, motion.actionTimeoutMs)).toBe("failed");
  });
});
