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
/** the whole module (#1885, №13 17.11: «сторож на отсутствие слов желоб / водосток / заглушка в RU модуля»): the core category's
 *  title «Водостоки (Gutters)» is the one exception — it names the module among the others */
const RU_WORD_ALL = /желоб|жёлоб|водост|заглуш/i;
const CORE_TITLE = ["mod.gutters.title"];

describe("#1885 Gutters words", () => {
  it("the module's estimate lines, prices and shop drawings say gutter / downspout in Russian", () => {
    const keys = Object.keys(ru).filter((k) => /^mod\.gutters\.(pr|est\.tpl|shop|view|pdf)\./.test(k));
    expect(keys.length).toBeGreaterThan(50);
    const bad = keys.filter((k) => RU_WORD.test((ru as Record<string, string>)[k]!));
    expect(bad).toEqual([]);
  });
  it("nowhere in the module's Russian: gutter / downspout / End Cap (the core category's title aside)", () => {
    const keys = Object.keys(ru).filter((k) => k.startsWith("mod.gutters.") && !CORE_TITLE.includes(k));
    expect(keys.length).toBeGreaterThan(500);
    const bad = keys.filter((k) => RU_WORD_ALL.test((ru as Record<string, string>)[k]!)).map((k) => `${k}: ${(ru as Record<string, string>)[k]}`);
    expect(bad, "write gutter / downspout / End Cap (founder 16.11)").toEqual([]);
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
