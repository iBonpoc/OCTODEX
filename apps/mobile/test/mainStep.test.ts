/** MainStep rules: layout variants and loading phases (BUILD-SPEC §1 MainStepBar). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  it("the compact bar has one place on the left: a held step's reason takes it, the second goes into «⋯» (21.11, #2350)", () => {
    expect(mainStepLayout({ second: { label: "Черновик" }, reason: "Нет подписи" })).toEqual({ layout: "single", secondInMore: true });
    expect(mainStepLayout({ reason: "Нет подписи" })).toEqual({ layout: "single", secondInMore: false });
    expect(mainStepLayout({ total: {}, reason: "Нет подписи" }).layout).toBe("total");
  });
  it("the bar is one row ≤ 56: the button 40 by its words, no 44 plate across the width", () => {
    const s = readFileSync(join(__dirname, "..", "src", "ui", "mainStep.tsx"), "utf8");
    expect(s).not.toMatch(/size=\{placement === "bar" \? "bar"/);
    expect(s).toMatch(/full=\{!byWords\}/);
    expect(component.button.phone + 2 * 8).toBeLessThanOrEqual(56);
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
