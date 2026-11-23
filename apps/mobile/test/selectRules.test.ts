import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { component } from "@octo/design-tokens";
import { fitMenuPlace, opensList } from "../src/ui/menuLayout";

const S = component.select;

// DS §9б.5 (#2412, council 23.11.2026): the value menu — as wide as its words, at the field, never past the window
describe("value menu place (fitMenuPlace)", () => {
  const base = { winW: 390, minW: component.menuW, maxW: S.menuMaxW, edgeL: 16, edgeR: 16 };
  it("a full-width field: the menu's right edge on the field's right edge", () => {
    expect(fitMenuPlace({ ...base, x: 16, w: 358 })).toEqual({ right: 16, minWidth: 240, maxWidth: 280 });
  });
  it("a narrow field (the angle of an elbow): the menu starts at the field's left edge", () => {
    expect(fitMenuPlace({ ...base, x: 99, w: 100 }).left).toBe(94); // 390 − 16 − 280: not past the right edge
    expect(fitMenuPlace({ ...base, x: 40, w: 100 }).left).toBe(40);
  });
  it("a window narrower than 280 + its edges: the menu fits inside it", () => {
    const narrow = fitMenuPlace({ ...base, winW: 300, maxW: 268, x: 16, w: 100 });
    expect(narrow.left).toBe(16);
    expect(narrow.maxWidth).toBe(268);
  });
  it("never past the left edge", () => {
    expect(fitMenuPlace({ ...base, x: 4, w: 100 }).left).toBe(16);
  });
});

// DS §9б.1 п.6: more than 12, a picture or a line under the name → a list, not a menu; long names — the place says `list`
describe("menu or list (opensList)", () => {
  const short = ["Ничего", "Splash Blocks", "Flex-A-Spout", "В землю", "На нижнюю крышу"].map((label) => ({ label }));
  it("5 short words — the menu («Низ»)", () => expect(opensList(short, S.menuMaxItems)).toBe(false));
  it("a long name alone does not flip it (the language and the data would): the place's `list` does", () =>
    expect(opensList([{ label: "Sq. Side Fasten / Wire Downspout Hooks" }], S.menuMaxItems)).toBe(false));
  it("a picture or a sample — the list (colour, parts)", () => expect(opensList([{ label: "Black", leading: { icon: "image" } }], S.menuMaxItems)).toBe(true));
  it("a line under the name — the list", () => expect(opensList([{ label: "Royal", subtitle: "K 18" }], S.menuMaxItems)).toBe(true));
  it("13 short ones — the list", () => expect(opensList(Array.from({ length: 13 }, (_, i) => ({ label: `${i}` })), S.menuMaxItems)).toBe(true));
  it("SelectField: a field with `onOpen` keeps its own sheet and ⌄; `list` forces the list", () => {
    const f = readFileSync(join(__dirname, "..", "src", "ui", "selectField.tsx"), "utf8");
    expect(f).toMatch(/const long = !onOpen && \(!!list \|\| opensList\(items, MENU_MAX\)\)/);
  });
});

// CLAUDE.md rule 2, 3rd exception: a colour's sample only in the colour field (and the list row it opens)
describe("colour samples only in ColorField", () => {
  const ROOT = join(__dirname, "..", "src");
  const files: string[] = [];
  const walk = (d: string) => readdirSync(d).forEach((n) => { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(n)) files.push(p); });
  walk(ROOT);
  it("`{ swatch: … }` is built only by ui/colorField.tsx (ui/pickerSheet.tsx draws it)", () => {
    // `{ swatch: x }`, `{ swatch }`, `{ "swatch": x }` — any object with a sample
    const hits = files.filter((f) => /\{\s*"?swatch"?\s*[:},]/.test(readFileSync(f, "utf8"))).map((f) => relative(ROOT, f));
    expect(hits.sort()).toEqual(["ui/colorField.tsx", "ui/pickerSheet.tsx"]);
  });
});
