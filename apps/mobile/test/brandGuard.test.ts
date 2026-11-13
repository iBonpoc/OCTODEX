/**
 * DS §18.2 (#1156): the GoRix brand is drawn in one place and shown only where the app speaks for itself. A new mark
 * (the founder: the brand is redrawn after 1.0) is then a change of `ui/brand.tsx` + `ui/brandRules.ts`, nothing else;
 * a mark that wanders onto a working screen turns this red.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { themes } from "@octo/design-tokens";

const SRC = path.join(__dirname, "..", "src");
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
const all = files(SRC).map((f) => ({ f: rel(f), s: fs.readFileSync(f, "utf8") }));

/** the only places the brand may appear (DS §18.2 table) */
const PLACES = new Set([
  "ui/brand.tsx", // the brand itself
  "features/boot.tsx", // the launch and the full-screen wait
  "ui/emptyStates.tsx", // «Страницы нет»
  "app/auth/company.tsx", // «Новая компания»
  "app/settings/index.tsx", // «О приложении»
  "nav/SideNav.tsx", // the side menu from 820
  "features/showcase/Brand.tsx", // the showcase
  "features/showcase/registry.ts", // the showcase lists the components by name
]);

describe("design system: the GoRix brand (DS §18.2, #1156)", () => {
  it("the mark's outlines live only in ui/brandRules.ts", () => {
    const g = "M660 170 H442 A272 272";
    expect(all.filter((x) => x.s.includes(g)).map((x) => x.f)).toEqual(["ui/brandRules.ts"]);
  });
  it("Brand* components are used only in the places of the table", () => {
    const users = all.filter((x) => /\bBrand(Mark|Logo|Quick|Wait|Intro)\b/.test(x.s)).map((x) => x.f);
    expect(users.filter((f) => !PLACES.has(f))).toEqual([]);
  });
  it("the native splash: both themes' bg (the boot layer paints the same — no flash), the GR image", () => {
    const app = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app.json"), "utf8")).expo;
    const plug = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === "expo-splash-screen")?.[1];
    expect(plug).toBeTruthy();
    expect(plug.backgroundColor).toBe(themes.light.bg);
    expect(plug.dark.backgroundColor).toBe(themes.dark.bg);
    for (const img of [plug.image, plug.dark.image]) expect(fs.existsSync(path.join(__dirname, "..", img))).toBe(true);
    expect(app.userInterfaceStyle).toBe("automatic");
  });
  it("the splash module is loaded lazily (spec 30 п.9: an update reaches builds made without it)", () => {
    const boot = fs.readFileSync(path.join(SRC, "features", "boot.tsx"), "utf8");
    expect(boot).not.toMatch(/^import \* as \w+ from "expo-splash-screen"/m);
    expect(boot).toMatch(/require\("expo-splash-screen"\)/);
    expect(all.filter((x) => x.f !== "features/boot.tsx" && /from "expo-splash-screen"|require\("expo-splash-screen"\)/.test(x.s)).map((x) => x.f)).toEqual([]);
  });
  it("the root never draws a blank frame: no `return null` before the fonts — the boot layer instead", () => {
    const layout = fs.readFileSync(path.join(SRC, "app", "_layout.tsx"), "utf8");
    expect(layout).not.toMatch(/if \(!loaded\) return null/);
    expect(layout).toMatch(/<BootRoot/);
    expect(layout).toMatch(/useBootDone\(\)/);
  });
});
