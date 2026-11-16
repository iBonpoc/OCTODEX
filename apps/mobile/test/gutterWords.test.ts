/**
 * #1885 and the founder's word of 16.11 (through №13): «желоб и водосток мы не пишем» — in the Gutters module the words are
 * gutter / downspout, in Russian too (canvas, windows, parts, PDF, the module's estimate and order lines, shop drawings);
 * a supplier palette's name is the module's data, never an app string.
 */
import { describe, expect, it } from "vitest";
import { tFor } from "../src/i18n/translate";
import { ru } from "../src/i18n/ru";
import { PALETTE_NAMES, PALETTES } from "../src/modules/gutters/settings";

const RU_WORD = /желоб|жёлоб|водост/i;

describe("#1885 Gutters words", () => {
  it("the module's estimate lines, prices and shop drawings say gutter / downspout in Russian", () => {
    const keys = Object.keys(ru).filter((k) => /^mod\.gutters\.(pr|est\.tpl|shop|view|pdf)\./.test(k));
    expect(keys.length).toBeGreaterThan(50);
    const bad = keys.filter((k) => RU_WORD.test((ru as Record<string, string>)[k]!));
    expect(bad).toEqual([]);
  });
  it("no palette name is an app string: the button reads the module's data", () => {
    for (const lang of ["ru", "en", "es"] as const) {
      const t = tFor(lang);
      for (const id of Object.keys(PALETTES) as (keyof typeof PALETTES)[]) {
        const label = t("mod.gutters.set.palOf", { name: PALETTE_NAMES[id], n: PALETTES[id].length });
        expect(label).toBe(`${PALETTE_NAMES[id]} (${PALETTES[id].length})`);
      }
    }
    const all = Object.values(ru as Record<string, string>).join("\n");
    for (const name of Object.values(PALETTE_NAMES)) expect(all.includes(name)).toBe(false);
  });
});
