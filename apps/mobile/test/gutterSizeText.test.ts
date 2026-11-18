/**
 * #1916 (founder 16.11: «не надо писать 2 инча на 3. Просто 2 на 3 оставляем»): a downspout's cross-section is written one
 * way everywhere — the canvas, the windows, the settings, the parts, the PDFs, the supplier's order: «2×3», a round «3″».
 * One function knows it (`modules/gutters/sizeText.ts`); any other «x → ×» in the module fails here.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { sizeText } from "../src/modules/gutters/sizeText";
import { dsSizeText } from "../src/modules/gutters/view/shop/job";
import { sizeText as pricesSizeText } from "../src/modules/gutters/prices";
import { ru } from "../src/i18n/ru";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";

const MOD = join(__dirname, "..", "src", "modules", "gutters");
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f)) files.push(p);
  }
};
walk(MOD);

describe("#1916 a downspout's size: «2×3», a round «3″» — one format everywhere", () => {
  it("the format", () => {
    expect(sizeText("2x3")).toBe("2×3");
    expect(sizeText("3X4")).toBe("3×4");
    expect(sizeText("4x5")).toBe("4×5");
    expect(sizeText("3")).toBe("3″");
    expect(sizeText("2.5x3")).toBe("2.5×3");
    expect(sizeText("other")).toBe("other");
  });
  it("the parts, the PDFs and the supplier's order use the same function", () => {
    for (const v of ["2x3", "3x4", "3", "4"]) {
      expect(dsSizeText(v)).toBe(sizeText(v));
      expect(pricesSizeText(v)).toBe(sizeText(v));
    }
  });
  it("no other place in the module writes a size its own way", () => {
    const bad: string[] = [];
    for (const f of files) {
      if (f.endsWith("sizeText.ts")) continue;
      const src = readFileSync(f, "utf8");
      if (/replace\(\s*(?:"x"|\/x\/i?)\s*,\s*"×"\s*\)|split\(\/x\/i?\)\.map|″\\u00a0×|″ × \$\{/.test(src)) bad.push(relative(MOD, f));
    }
    expect(bad, "write the size with sizeText (modules/gutters/sizeText.ts)").toEqual([]);
  });
  it("no app string writes «2″ × 3″» or «2\"×3\"»", () => {
    for (const dict of [ru, en, es] as Record<string, string>[]) {
      const hits = Object.entries(dict).filter(([, v]) => /\d″\s*×\s*\d|\d"\s*×\s*\d/.test(v)).map(([k]) => k);
      expect(hits).toEqual([]);
    }
  });
});
