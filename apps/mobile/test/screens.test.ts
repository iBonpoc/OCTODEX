/**
 * Every screen in src/app is opened by the layout run (e2e/specs/08-layouts.cjs) at 3 widths × 2 themes (CLAUDE.md rule 4).
 * A new screen without a line in 08's SCREENS fails here.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const APP = path.resolve(__dirname, "../src/app");
/** Sign-in and the company picker need a real account; the redirect index and 404 have no content of their own. */
// inbox: the redirect of the old «Продажи» address (docs/specs/13а §2); «Ещё» (/more) is a screen again (variant Б)
const NOT_A_SCREEN = new Set(["index", "inbox", "+not-found", "auth/sign-in", "auth/company"]);

function routes(dir = APP, base = ""): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return routes(path.join(dir, e.name), e.name.startsWith("(") ? base : `${base}${e.name}/`);
    if (!e.name.endsWith(".tsx") || e.name.startsWith("_")) return [];
    return [`${base}${e.name.replace(/\.tsx$/, "")}`.replace(/\/index$/, "")];
  });
}
const layoutSpec = fs.readFileSync(path.resolve(__dirname, "../e2e/specs/08-layouts.cjs"), "utf8");
const screens = [...layoutSpec.slice(layoutSpec.indexOf("SCREENS = ["), layoutSpec.indexOf("];")).matchAll(/"\/([^"?]*)/g)].map((m) => m[1]!);
/** "lead/[id]" matches "lead/l1"; "lead/new" matches only itself */
const matches = (route: string, url: string) =>
  new RegExp(`^${route.replace(/\[[^\]]+\]/g, "[^/]+")}$`).test(url) && !(route.includes("[") && routes().includes(url));

describe("every screen is in the layout run", () => {
  for (const r of routes().filter((x) => !NOT_A_SCREEN.has(x))) {
    it(r, () => expect(screens.some((u) => matches(r, u)), `add "/${r}" to SCREENS in e2e/specs/08-layouts.cjs`).toBe(true));
  }
});
