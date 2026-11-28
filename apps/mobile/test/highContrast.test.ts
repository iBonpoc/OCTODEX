/**
 * GoRix этап 3 «Основа» (опись 26.11.2026): «Повышение контраста» системы (iOS darker system colors, Android high text
 * contrast, веб prefers-contrast: more) меняет только слова — серые, жёлтые и статусов — на цвета ≥ 7:1 (`highContrast`).
 */
import { describe, expect, it } from "vitest";
import { highContrast, themes } from "@octo/design-tokens";
import { themeColors } from "../src/theme/colors";

describe("high contrast: the system switch changes the words, not the look", () => {
  for (const name of ["dark", "light"] as const) {
    it(`${name}: off — the theme as it is`, () => {
      const c = themeColors(name, "yellow", false);
      expect(c.mut).toBe(themes[name].mut);
      expect(c.status.bad.text).toBe(themes[name].status.bad.text);
    });
    it(`${name}: on — mut and the status words take the high-contrast colours; grounds, the accent and accText stay`, () => {
      const c = themeColors(name, "yellow", true);
      expect(c.mut).toBe(highContrast[name].mut);
      expect(c.accText).toBe(themes[name].accText);
      expect(c.status.warn.text).toBe(highContrast[name].status.warn);
      expect(c.status.warn.on).toBe(highContrast[name].status.warn);
      expect(c.bg).toBe(themes[name].bg);
      expect(c.acc).toBe(themes[name].acc);
      expect(c.status.neutral.on).toBe(themes[name].status.neutral.on);
    });
  }
});

import { accEdgeFrame } from "../src/ui/accEdge";

describe("#2935 п.2: the yellow fill gets its accEdge back only under «Повышение контраста»", () => {
  it("light: off — no frame (#2363 F36); on — the accEdge frame", () => {
    expect(accEdgeFrame(themes.light, false).borderWidth).toBe(0);
    const on = accEdgeFrame(themes.light, true);
    expect(on.borderWidth).toBeGreaterThan(0);
    expect(on.borderColor).toBe(themes.light.accEdge);
  });
  it("dark: accEdge is transparent — no frame either way", () => {
    expect(accEdgeFrame(themes.dark, true).borderWidth).toBe(0);
    expect(accEdgeFrame(themes.dark, false).borderWidth).toBe(0);
  });
  it("the Button and the filled IconButton use it", () => {
    const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/ui/controls.tsx"), "utf8");
    expect(src.match(/accEdgeFrame\(c, highContrast\)/g)?.length).toBe(2);
  });
});
