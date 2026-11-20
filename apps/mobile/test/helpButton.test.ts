/**
 * «?» (DS Б7, founder 16.11, #1843, #1853):
 * - it stands right after the words it explains, never as the first of the header's actions on the right. A new «?» put
 *   among a row's actions (next to `{headerFab}` / `{right}` / `{home}`) fails; the old places are listed and the list only
 *   shrinks (wave 1б of spec 56 moves the screen header's «?» to the title — then `src/ui/surfaces.tsx` leaves the list);
 * - inside: what it is, then the way to where the value is set or the thing is made — the `to` prop (a link), never the old
 *   words «Где настроить: Ещё → …» (`where`). A value that can be set has `to`.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ru } from "../src/i18n/ru";

const ROOT = join(__dirname, "..", "src");
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(f)) files.push(p);
  }
};
walk(ROOT);

/** the «?» among a row's actions — only shrinks */
const LEGACY_CORNER: Record<string, number> = { "ui/surfaces.tsx": 2 };

/** a «?» whose next sibling (within 3 lines) is a slot of header actions */
function cornerHelps(src: string): number {
  const lines = src.split("\n");
  let n = 0;
  lines.forEach((l, i) => {
    if (!/<HelpButton\b/.test(l)) return;
    const next = lines.slice(i + 1, i + 4).join("\n");
    if (/\{(headerFab|right|home \?)/.test(next)) n++;
  });
  return n;
}

describe("«?» — next to its words, with the way to where it is set (DS Б7)", () => {
  it("no new «?» among a row's actions; the old places only go away", () => {
    const found: Record<string, number> = {};
    for (const f of files) {
      const n = cornerHelps(readFileSync(f, "utf8"));
      if (n) found[relative(ROOT, f)] = n;
    }
    for (const [f, n] of Object.entries(found)) expect(n, `${f}: a «?» among the header's actions — put it right after its words (DS Б7)`).toBeLessThanOrEqual(LEGACY_CORNER[f] ?? 0);
    for (const [f, n] of Object.entries(LEGACY_CORNER)) expect(found[f] ?? 0, `${f}: fewer «?» in the corner now — lower LEGACY_CORNER to ${found[f] ?? 0}`).toBe(n);
  });
  it("the way to a setting is a link (`to`), never the old words «Где настроить» (`where`)", () => {
    const src = readFileSync(join(ROOT, "ui", "overlays.tsx"), "utf8");
    expect(src).toMatch(/to\?: \{ href: Href; label\?: string \}/);
    expect(src).toMatch(/router\.push\(to\.href\)/);
    expect(Object.keys(ru).some((k) => k === "common.whereToSet")).toBe(false);
    for (const f of files) expect(readFileSync(f, "utf8"), relative(ROOT, f)).not.toMatch(/<HelpButton[^>]*\bwhere=/);
  });
  it("a «?» about a module's setting in Gutters says where it is set", () => {
    const src = readFileSync(join(ROOT, "modules", "gutters", "view", "ViewScreen.tsx"), "utf8");
    const groupHelp = src.match(/<HelpButton[^>]*view-parts-\$\{g\.key\}-help[^>]*>/)?.[0] ?? "";
    expect(groupHelp).toMatch(/to=\{/);
    // #2118: the parts' «?» leads where the parts are made and priced — «Цены и прайс»
    const partsHelp = src.match(/<HelpButton[^>]*testID="view-parts-help"[^>]*>/)?.[0] ?? "";
    expect(partsHelp).toMatch(/to=\{\{ href: "\/module\/gutters\/prices" \}\}/);
  });
});
