/**
 * unit:actionBar — the pinned panel (DS §8.9, РС-7c1, review of #1277): the autoscroll and the visible window count the bar; the toast stands
 * above it; only screens without the tab bar pin one.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { NO_TAB_BAR } from "../src/nav/tabBarRule";
import { coveredBottomOf } from "../src/ui/requiredLogic";
import { toastBottom } from "../src/ui/footerInset";

const APP = join(__dirname, "..", "src", "app");
const files = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? files(join(d, n)) : n.endsWith(".tsx") ? [join(d, n)] : []));
const routeOf = (f: string) => relative(APP, f).replace(/\.tsx$/, "").replace(/\(.*?\)\//g, "").replace(/\/index$/, "");

describe("unit:actionBar — the bottom the page cannot reach", () => {
  it("counts the pinned bar: the held row's autoscroll and the visible window end ABOVE it", () => {
    const base = { keyboard: false, keyboardMargin: 24, navBottom: 0, fab: 0, footer: 0 };
    expect(coveredBottomOf(base)).toBe(0);
    expect(coveredBottomOf({ ...base, footer: 150 })).toBe(150);
    expect(coveredBottomOf({ ...base, navBottom: 34, fab: 60, footer: 150 })).toBe(244);
  });
  it("under the keyboard the bar is away: only the small margin", () => {
    expect(coveredBottomOf({ keyboard: true, keyboardMargin: 24, navBottom: 34, fab: 60, footer: 150 })).toBe(24);
  });
});

describe("unit:actionBar — the toast stands above the bar", () => {
  it("no bar: the usual place; a bar: above it by the gap (never lower than usual)", () => {
    expect(toastBottom(110, 0, 12)).toBe(110);
    expect(toastBottom(110, 150, 12)).toBe(162);
    expect(toastBottom(110, 40, 12)).toBe(110);
  });
});

describe("unit:actionBar — only a screen without the tab bar pins one", () => {
  it("every screen that passes `footer=` is in NO_TAB_BAR (else the bar and the tab bar would meet)", () => {
    const bad = files(APP).filter((f) => /\bfooter=\{/.test(readFileSync(f, "utf8"))).filter((f) => !(NO_TAB_BAR as readonly string[]).includes(routeOf(f)));
    expect(bad.map((f) => routeOf(f))).toEqual([]);
  });
  it("the screen itself ignores a footer where the tab bar shows", () => {
    expect(readFileSync(join(__dirname, "..", "src", "ui", "surfaces.tsx"), "utf8")).toMatch(/const footerOn = !!footer && !wide && !showsTabBar\(routeName\)/);
  });
});
