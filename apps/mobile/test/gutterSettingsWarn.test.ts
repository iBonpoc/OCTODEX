/**
 * #1200 review: a field of the module's settings that names itself (a segment or a dropdown, ChoiceChips with `label`) must
 * be written as <ChoiceWarn>: the refusal of a save («не сохранено, модуль перечитывается», #374) is said under the field
 * by <FieldWarn at={testID}>, and only ChoiceWarn draws it. A bare <ChoiceChips testID="gset-…"> rolls the pick back in silence.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "..", "src", "modules", "gutters", "settings", "SettingsScreen.tsx"), "utf8");

describe("settings fields say a refused save under themselves", () => {
  it("no bare <ChoiceChips testID=\"gset-…\"> (it would not draw the refusal)", () => {
    const bare = [...src.matchAll(/<ChoiceChips\b[^\n]*?testID="(gset-[a-z-]+)"/g)].map((m) => m[1]);
    expect(bare, `use <ChoiceWarn>: ${bare.join(", ")}`).toEqual([]);
  });
  it("the nine fields of the defaults are ChoiceWarn", () => {
    for (const id of ["gset-run-profile", "gset-run-size", "gset-run-material", "gset-run-gauge", "gset-ds-shape", "gset-ds-size", "gset-ds-style", "gset-ds-material", "gset-ds-gauge"]) {
      expect(src, id).toMatch(new RegExp(`<ChoiceWarn\\b[^\\n]*testID="${id}"`));
    }
  });
  it("the roof's overhang says a refused save under itself too (#932)", () => {
    expect(src).toMatch(/<ChoiceWarn\b[^\n]*testID="gset-roof-overhang"/);
  });
  it("ChoiceWarn draws FieldWarn at its own testID", () => {
    expect(src).toMatch(/function ChoiceWarn[\s\S]{0,400}<FieldWarn at=\{p\.testID\} \/>/);
  });
});
