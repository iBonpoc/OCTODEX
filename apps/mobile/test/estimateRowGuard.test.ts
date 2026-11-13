/**
 * DS §8.3 (#1307 «а», spec §11.7 «Сторожа»): a folded estimate line never shows profit, margin or cost — the client may
 * see the screen over the shoulder; the one exception is the «расход» of a hidden line (`hiddenSpend`, only for who sees
 * costs and never on «Экран для клиента»). The trash is a 36 button with the zone 44 and `space[6]` from «≡».
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { component, size } from "@octo/design-tokens";

const src = fs.readFileSync(path.join(__dirname, "..", "src", "features", "estimate", "LineRow.tsx"), "utf8");
const folded = src.slice(src.indexOf("  if (!open) {"), src.indexOf("  const unitItems"));

describe("design system: the estimate line (DS §8.3)", () => {
  it("the folded branch exists and is the part between `if (!open)` and the open row", () => {
    expect(folded.length).toBeGreaterThan(500);
  });
  it("a folded line shows no profit, margin or cost — only the hidden line's «расход»", () => {
    for (const bad of ["est.row.profit", "marginPct", "unitCostCents", "figures.", "est.row.cost"]) expect(folded, bad).not.toContain(bad);
    expect(folded).toContain("hiddenSpend(l, { costsVisible: p.costsVisible, clientScreen: !!p.clientScreen })");
  });
  it("the trash: an IconButton (visible dockBtn 36, Press makes the zone 44) and space[6] before «≡»", () => {
    expect(component.dockBtn).toBe(36);
    expect(size.hitMin).toBe(44);
    const trash = src.slice(src.indexOf("function Trash("), src.indexOf("function Trash(") + 600);
    expect(trash).toMatch(/<IconButton icon="trash"/);
    expect(trash).toMatch(/marginRight: space\[6\]/);
  });
});
