/** #679 (founder 16.11): the full colour list — both cards of docs/prototypes/gutters-ref merged, one name once */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PALETTE_ALL, PALETTES } from "../src/modules/gutters/settings";

describe("#679 the full colour list", () => {
  it("both cards, every name once, English", () => {
    expect(PALETTE_ALL).toHaveLength(PALETTES.servicePartners.length + PALETTES.berger.length - 2); // Royal Brown, Black on both
    for (const n of [...PALETTES.servicePartners, ...PALETTES.berger]) expect(PALETTE_ALL.some((x) => x.toLowerCase() === n.toLowerCase())).toBe(true);
    expect(new Set(PALETTE_ALL.map((x) => x.toLowerCase())).size).toBe(PALETTE_ALL.length);
    for (const n of PALETTE_ALL) expect(n).toMatch(/^[A-Za-z0-9 è-]+$/);
  });
  it("the cards' own lists are what the reference says (docs/prototypes/gutters-ref/README.md)", () => {
    const readme = readFileSync(join(__dirname, "..", "..", "..", "docs", "prototypes", "gutters-ref", "README.md"), "utf8");
    for (const n of PALETTE_ALL) expect(readme.includes(n), n).toBe(true);
  });
});
