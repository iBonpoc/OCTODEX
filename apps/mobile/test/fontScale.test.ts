/**
 * The bigger type scale (#1303 PR-1, DS §4.1): the numbers, the input token, and the rule that a control grows with its text —
 * Button, chips, segments, filterBar use `minHeight` (a fixed `height` cut a wrapped RU / ES label or a bigger system font).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { component, font } from "@octo/design-tokens";

const src = (f: string) => readFileSync(join(__dirname, "..", "src", f), "utf8");

describe("type scale (DS §4.1)", () => {
  it("28 / 22 / 17 / 15 / 15 / 13 / 11, the field text 17", () => {
    expect(font.size).toEqual({ display: 28, title: 22, heading: 17, body: 15, button: 15, caption: 13, micro: 11, input: 17 });
  });
  it("nothing is smaller than the minimum text size; a field's text is not smaller than 16 (iOS zooms the page on focus)", () => {
    expect(Math.min(...Object.values(font.size))).toBeGreaterThanOrEqual(font.minSize);
    expect(font.size.input).toBeGreaterThanOrEqual(16);
  });
  it("button heights do not change (rule 3)", () => {
    expect([component.button.sm, component.button.md, component.button.phone, component.button.hit]).toEqual([28, 32, 36, 44]);
  });
  it("a field's text is the input token, not body + 2", () => {
    expect(src("ui/controls.tsx")).not.toMatch(/font\.size\.body \+ 2/);
    expect(src("ui/filterBar.tsx")).not.toMatch(/font\.size\.body \+ 2/);
  });
});

describe("controls grow with their text", () => {
  const c = src("ui/controls.tsx");
  it("Button, StatusChip, TagChip, Segmented and ChoiceChips are minHeight", () => {
    expect(c).toMatch(/minHeight: h,\n\s+paddingHorizontal: space\[4\],\n\s+borderRadius: radius.pill/); // Button
    expect(c).toMatch(/minHeight: component\.chip\.h,\n\s+paddingHorizontal: component\.chip\.px/); // StatusChip
    expect(c).toMatch(/minHeight: component\.button\.sm,\n\s+paddingHorizontal: space\[3\]/); // TagChip
    expect(c).toMatch(/minHeight: h - pad \* 2/); // a segment
  });
  it("the filter bar's controls are minHeight", () => {
    const f = src("ui/filterBar.tsx");
    expect(f).not.toMatch(/^\s+height: h,$/m);
    expect(f).toMatch(/minHeight: component\.button\.phone/);
  });
});
