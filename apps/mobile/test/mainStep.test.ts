/** MainStep rules: layout variants and loading phases (BUILD-SPEC §1 MainStepBar). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { component, font, motion, space } from "@octo/design-tokens";
import { loadPhase, mainStepLayout, shrinkFloor, stackedBar, totalNeed } from "../src/ui/mainStepRules";

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

/** review 27.11 (#2935 п.1): «Итого · налог» and the sum are never cut — the sum shrinks to the next size down, then the total takes its own line */
describe("the bar's total never cut", () => {
  it("the sum shrinks at most to the next size of the scale below `title` (22 → `figureSm` 18)", () => {
    expect(shrinkFloor()).toBeCloseTo(font.size.figureSm / font.size.title, 6);
    expect(shrinkFloor(font.size.caption)).toBeCloseTo(font.size.micro / font.size.caption, 6);
  });
  it("the width it needs: the caption line whole, the sum at the floor", () => {
    expect(totalNeed(150, 100)).toBe(150);
    expect(totalNeed(60, 140)).toBe(Math.ceil(140 * shrinkFloor()));
  });
  it("one row while it stands beside the buttons; else stacked (red before: one row always — «налог ˎ» cut on 390)", () => {
    // 390: the bar's inner row 330; «Готово» 84 + «Отправить» 112 + gap → right 208
    expect(stackedBar({ row: 330, right: 208, need: 100 })).toBe(false);
    expect(stackedBar({ row: 330, right: 208, need: 330 - 208 - space[3] + 1 })).toBe(true);
    // «Готово · Отправить изменения» (~294) leaves no room for any total
    expect(stackedBar({ row: 330, right: 294, need: 80 })).toBe(true);
  });
  it("nothing measured yet — one row (no jump at the first frame)", () => {
    expect(stackedBar({ row: 0, right: 208, need: 100 })).toBe(false);
    expect(stackedBar({ row: 330, right: 0, need: 100 })).toBe(false);
    expect(stackedBar({ row: 330, right: 208, need: 0 })).toBe(false);
  });
});

/** round 2 Ж2: once two lines, two lines until the editor closes — no jump while typing (red before: back to one line at once) */
describe("the two-line bar holds (hysteresis)", () => {
  it("a shorter sum after two lines keeps two lines; a fresh bar with the same numbers is one line", () => {
    const short = { row: 330, right: 208, need: 100 };
    expect(stackedBar(short, true)).toBe(true);
    expect(stackedBar(short, false)).toBe(false);
    expect(stackedBar({ row: 0, right: 0, need: 0 }, true)).toBe(true);
  });
});
