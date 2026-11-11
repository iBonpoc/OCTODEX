import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** DESIGN-SYSTEM Б1а (#924): the input window never avoids the keyboard and holds at most two fields. */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
describe("InputWindow guard", () => {
  it("no KeyboardAvoidingView in the input window (it would move with the keyboard)", () => {
    const src = read("../src/modules/gutters/draw/InputWindow.tsx");
    expect(src).not.toMatch(/KeyboardAvoidingView|avoidBehavior/);
  });
  it("the length input shows at most two fields at once (feet + inches, or one number)", () => {
    const src = read("../src/modules/gutters/draw/AttrPanel.tsx");
    const body = src.slice(src.indexOf("export function QuickLength"), src.indexOf("\nexport ", src.indexOf("export function QuickLength") + 10) > 0 ? src.indexOf("\nexport ", src.indexOf("export function QuickLength") + 10) : undefined);
    const ftin = body.slice(body.indexOf('unit === "ftin" ? ('), body.indexOf(") : ("));
    expect((ftin.match(/<TextField/g) ?? []).length).toBeLessThanOrEqual(2);
    expect((body.match(/<TextField/g) ?? []).length).toBeLessThanOrEqual(3);
  });
  it("the length input goes through the window, not a sheet", () => {
    const src = read("../src/modules/gutters/draw/DrawScreen.tsx");
    expect(src).not.toMatch(/<Sheet[^>]*>\s*\{(editRun|quick) \? <QuickLength/);
    expect((src.match(/<InputWindow/g) ?? []).length).toBe(2);
  });
});
