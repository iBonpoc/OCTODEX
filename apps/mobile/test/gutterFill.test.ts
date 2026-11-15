/**
 * #1306 «Заливка» in the Gutters module (DS «Выделение выбранного»): the chosen option of the attribute panel and of the settings is a
 * raised fill + `check` — not an ink frame (`selectedBorder`) and not a «✓ » written as text. The module's two places were left on the old look.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(__dirname, "..", "src", "modules", "gutters", rel), "utf8");

describe("the module's chosen options use «Заливка»", () => {
  for (const f of ["draw/AttrPanel.tsx", "settings/SettingsScreen.tsx"]) {
    it(`${f}: fillStyle, no ink frame (selectedBorder) and no «✓ » text`, () => {
      const s = read(f);
      expect(s).toMatch(/fillStyle\(c\)/);
      expect(s).not.toMatch(/selectedBorder/);
      expect(s).not.toMatch(/"✓ "/);
    });
  }
  it("the attribute panel's options (rows) carry the check in the corner", () => {
    expect(read("draw/AttrPanel.tsx")).toMatch(/<SelectedCheck/);
  });
  it("the settings' checkbox chips carry `check` before the word", () => {
    expect(read("settings/SettingsScreen.tsx")).toMatch(/Icon name="check"/);
  });
});

describe("the fraction picker uses «Заливка» too (#1345 follow-up)", () => {
  it("draw/FracPicker.tsx: fillStyle for the open «1/16», no ink frame (selectedBorder)", () => {
    const s = read("draw/FracPicker.tsx");
    expect(s).toMatch(/fillStyle\(c\)/);
    expect(s).not.toMatch(/selectedBorder/);
  });
});
