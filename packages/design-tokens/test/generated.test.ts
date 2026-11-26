import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { GROUPS, cssName, cssUnit, flatten, renderCss, renderTable } from "../src/generate";
import { themes } from "../src/index";

/**
 * Дизайн-система GoRix (#2893): design/gorix/tokens.css и tokens.md строятся из index.ts, а не пишутся руками.
 * Красный тест = файл разошёлся с index.ts → `npm run gen -w @octo/design-tokens` и закоммитить результат.
 */
const OUT = join(__dirname, "../../../design/gorix");
const FILES: [string, () => string][] = [["tokens.css", renderCss], ["tokens.md", renderTable]];

describe("GoRix tokens: the generated files equal index.ts", () => {
  for (const [name, render] of FILES) {
    it(name, () => {
      const path = join(OUT, name);
      const want = render();
      if (process.env.GEN) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, want);
      }
      expect(existsSync(path), `${name} is missing — run npm run gen -w @octo/design-tokens`).toBe(true);
      expect(readFileSync(path, "utf8"), `${name} differs from index.ts — run npm run gen -w @octo/design-tokens`).toBe(want);
    });
  }
  it("units by meaning (code review 26.11): lengths px, times ms, tracking em, ratios and counts bare", () => {
    const css = renderCss();
    for (const line of [
      "--space-4: 16px;",
      "--radius-card: 22px;",
      "--size-hit-min: 44px;",
      "--size-row-max: 60px;",
      "--layout-content-max: 1200px;",
      "--font-size-body: 15px;",
      "--font-tracking-display: -0.02em;",
      "--motion-dur-fast: 160ms;",
      "--motion-long-press-ms: 500ms;",
      "--motion-blink-steps: 4;",
      "--component-dim-opacity: 0.45;",
      "--component-chart-muted-opacity: 0.55;",
      "--component-sheet-flick-velocity: 1;",
      "--component-pair-char-em: 0.62;",
      "--font-weight-bold: 700;",
      "--layout-grid-cols-desktop: 3;",
      "--z-toast: 8;",
      "--c-blur: 20px;",
    ])
      expect(css, line).toContain(line);
    expect(cssUnit("c.ground.stops.1.offset")).toBe("");
    expect(cssUnit("component.header.plateAlpha")).toBe("");
  });
  it("no two tokens share one css name", () => {
    const names = [...GROUPS.flatMap((g) => flatten(g.value, g.name)), ...flatten(themes.light, "c")].map(([p]) => cssName(p));
    expect(names.length - new Set(names).size).toBe(0);
  });
  it("both themes name the same colour tokens", () => {
    const keys = (t: "light" | "dark") => flatten(themes[t], "c").map(([p]) => p).sort();
    expect(keys("dark")).toEqual(keys("light"));
  });
  it("every colour token reaches the css of both themes", () => {
    const css = renderCss();
    for (const [p] of flatten(themes.light, "c")) {
      const name = cssName(p);
      expect(css.split(name + ":").length - 1, name).toBe(3);
    }
  });
});
