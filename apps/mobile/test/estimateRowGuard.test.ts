/**
 * DS §8.3 (#1307 «а», spec §11.7 «Сторожа»): a folded estimate line never shows profit, margin or cost — the client may
 * see the screen over the shoulder; the one exception is the «расход» of a hidden line (`hiddenSpend`, only for who sees
 * costs and never on «Экран для клиента»). The trash is a quiet (bare) icon, the zone 44, on every line (#2387).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { component, size } from "@octo/design-tokens";

const src = fs.readFileSync(path.join(__dirname, "..", "src", "features", "estimate", "LineRow.tsx"), "utf8");
// the folded row: its face (#2421 — the same face heads the open line, so the face is checked too) and the folded branch
const folded = src.slice(src.indexOf("  const web = Platform.OS"), src.indexOf("  const unitItems"));

describe("design system: the estimate line (DS §8.3)", () => {
  it("the folded branch exists and is the part from the line's face to the open row", () => {
    expect(folded.length).toBeGreaterThan(500);
    expect(folded).toContain("const face = ");
    expect(folded).toContain("  if (!open) {");
  });
  it("a folded line shows no profit, margin or cost — only the hidden line's «расход»", () => {
    for (const bad of ["est.row.profit", "marginPct", "unitCostCents", "figures.", "est.row.cost"]) expect(folded, bad).not.toContain(bad);
    expect(folded).toContain("hiddenSpend(l, { costsVisible: p.costsVisible, clientScreen: !!p.clientScreen })");
  });
  it("the trash (#2387, founder 21.11 «корзина — всегда»): a quiet IconButton on the folded line (by the «⠿» at the edge, zones 44 meet, `space[6]` from the sum) AND in the open line's head (the same place, #2421), the zone 44", () => {
    expect(size.hitMin).toBe(44);
    expect(folded).toMatch(/testID=\{`est-row-trash-\$\{l\.id\}`\} style=\{\{ marginLeft: space\[6\], width: size\.hitMin, alignItems: "center" \}\}>\s*<IconButton bare icon="trash"/);
    // the open line's head is its folded face (#2421): its trash stands where the folded one stood
    expect(src).toMatch(/testID=\{`est-trash-\$\{l\.id\}`\} style=\{\{ marginLeft: space\[6\], width: size\.hitMin, alignItems: "center" \}\}>\s*<IconButton bare icon="trash"/);
    void component;
  });
});
