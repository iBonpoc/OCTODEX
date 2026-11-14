/**
 * «Заливка» — the one look of a chosen item (DS «Выделение выбранного», #1306): a neutral raised fill + the small shadow, never
 * the accent (rule 2) and never an ink frame. The guards read the sources of the controls that show a choice.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { component, themes } from "@octo/design-tokens";

const src = (f: string) => readFileSync(join(__dirname, "..", "src", f), "utf8");

describe("«Заливка» of the chosen (#1306)", () => {
  it("the fill is surf2 with the small shadow", () => {
    const f = src("ui/fill.ts");
    expect(f).toMatch(/backgroundColor: c\.surf2/);
    expect(f).toMatch(/component\.shadowSm\.opacity/);
    expect(f).not.toMatch(/c\.acc/);
  });
  it("ChoiceChips, MultiChips and the filter bar take it", () => {
    for (const f of ["ui/controls.tsx", "ui/filterBar.tsx"]) expect(src(f), f).toMatch(/fillStyle\(c\)/);
  });
  it("a moving slider (tab bar pill, Segmented) takes the fill without the shadow (#1354)", () => {
    const flat = src("ui/fill.ts").match(/export function fillStyleFlat[\s\S]*?\n}/)?.[0] ?? "";
    expect(flat).toMatch(/backgroundColor: c\.surf2/);
    expect(flat).not.toMatch(/shadow|elevation/);
    // the pill of the tab bar lives in the iOS 26 GlassView and animates left/width: no shadow on it
    expect(src("nav/TabBar.tsx")).toMatch(/borderRadius: radius\.pill \}, fillStyleFlat\(c\), pill\]/);
    expect(src("nav/TabBar.tsx")).not.toMatch(/fillStyle\(c\)/);
    expect(src("ui/controls.tsx")).toMatch(/borderRadius: radius\.pill \}, fillStyleFlat\(c\), pill\]/);
  });
  it("the chosen is never the accent and never an ink frame", () => {
    const c = src("ui/controls.tsx");
    expect(c).not.toMatch(/sel \? c\.acc/);
    expect(c).not.toMatch(/sel \? c\.ink : c\.bd/);
    expect(src("ui/filterBar.tsx")).not.toMatch(/sel \? c\.ink : c\.bd|active \? c\.ink : c\.bd/);
    expect(src("nav/TabBar.tsx")).not.toMatch(/borderColor: c\.ink/);
  });
  it("cards and days: no ink frame, a check instead (DS «Выделение выбранного»)", () => {
    for (const f of ["ui/listCard.tsx", "features/PlanParts.tsx", "features/DatePick.tsx"]) {
      const t = src(f);
      expect(t, f).not.toMatch(/selected \? c\.ink : c\.bd/);
      expect(t, f).toMatch(/SelectedCheck/);
    }
  });
  it("a chosen chip of several carries a check icon, not «✓ » as text", () => {
    const c = src("ui/controls.tsx");
    expect(c).not.toMatch(/"✓ "/);
  });
});

/** the fill must be seen: «surf2» over the track of a segment / the ground of a chip, measured per theme (WCAG relative luminance) */
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgba = (s: string) => {
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)/)!;
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] === undefined ? 1 : Number(m[4]) };
};
const over = (top: string, base: number[]) => {
  const t = top.startsWith("#") ? { rgb: hex(top), a: 1 } : rgba(top);
  return base.map((b, i) => Math.round(b + (t.rgb[i]! - b) * t.a));
};
const lum = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
describe("the fill is seen in both themes", () => {
  for (const t of ["dark", "light"] as const) {
    it(`${t}: surf2 over the segment track differs from the track, and the text cue (ink vs mut) carries the rest`, () => {
      const c = themes[t];
      const ground = hex(c.bg);
      const track = over(c.track, ground);
      const fill = over(c.surf2, track);
      const hi = Math.max(lum(track), lum(fill));
      const lo = Math.min(lum(track), lum(fill));
      const ratio = (hi + 0.05) / (lo + 0.05);
      // measured 13.11.2026: dark ≈ 1.4, light ≈ 1.2–1.35 — a quiet lift, the weight and ink-vs-mut text (and the check) are the sure sign
      expect(ratio).toBeGreaterThan(1.1);
      expect(component.shadowSm.elevation).toBeGreaterThan(0);
    });
  }
});
