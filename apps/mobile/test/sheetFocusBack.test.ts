import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { focusBack } from "../src/ui/sheetFocus";

const sheet = readFileSync(join(__dirname, "..", "src", "ui", "overlays.tsx"), "utf8");

/** #2471 (web): the Modal's focus() on its way out scrolled the page up to the sheet's opener (539 → 0) and took the cursor */
describe("the focus as a sheet leaves", () => {
  it("lost with the sheet (nowhere, or still in it): back to the opener", () => {
    expect(focusBack("none")).toBe("give");
    expect(focusBack("sheet")).toBe("give");
  });
  it("on the opener, or on a field the person took while the sheet went: it stays", () => {
    expect(focusBack("opener")).toBe("keep");
    expect(focusBack("other")).toBe("keep");
  });
  it("given back without scrolling the page, and the Modal's late focus() goes the same way", () => {
    expect(sheet).toMatch(/own\.call\(el, \{ preventScroll: true \}\)/);
    expect(sheet).toMatch(/el\.focus = \(o\?: FocusOptions\) => \{\s*if \(focusBack\(at\(\)\) === "give"\) own\.call\(el, \{ \.\.\.o, preventScroll: true \}\)/);
  });
  it("as the sheet begins to go out (web), the opener taken before the Modal's own effects", () => {
    expect(sheet).toMatch(/passThrough\(true\);\s*giveFocusBack\(\);/);
    expect(sheet).toMatch(/useLayoutEffect\(\(\) => \{\s*if \(Platform\.OS !== "web"/);
  });
});
