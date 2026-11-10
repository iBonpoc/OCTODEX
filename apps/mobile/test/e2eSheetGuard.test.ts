/**
 * Sheets and waits in e2e (#617, docs/ai/CHECKS.md §10 п.5): 18 of 41 red runs (07–09.11) were a key or a tap that met
 * a sheet still opening or still leaving, or a wait whose failure was swallowed. Specs (e2e/specs, e2e/cloud) and the
 * shared helpers:
 * - press Esc only through e2e/sheet.cjs — `pressEscUntilClosed` (a sheet or a menu: again until it is gone),
 *   `closeSheet`, `escOnPage` (the side panel, a step back: once no sheet is open);
 * - never swallow a wait: no `.catch(() => {})` (nor `=> null / undefined / false / true`) on waitFor*; a wait a check
 *   reads goes through `waited()` into `h.expect`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../e2e");
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith(".cjs") ? [join(dir, d.name)] : []));

// the helpers that press Esc and the runner's own screenshots on failure; gutters.cjs is checked by PR-B of #617
const EXEMPT = new Set(["sheet.cjs", "run.cjs", "gutters.cjs", "cloud/cloud.cjs"]);

// comments that start a line (a doc block, a `// …` line, the tail after code) — not a `/*` or `//` inside a string or
// a regex literal (`"/api/*"`, `/\/settings\//`); lines are kept so the line numbers stay right
const stripComments = (src: string) =>
  src
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, (c) => c.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/([;,{}])\s*\/\/ .*$/gm, "$1");
const lineOf = (src: string, at: number) => src.slice(0, at).split("\n").length;

// the `(` that the `)` at `close` closes; strings and template literals are skipped
function openParen(src: string, close: number): number {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      for (i--; i >= 0 && !(src[i] === q && src[i - 1] !== "\\"); i--);
      continue;
    }
    if (c === ")") depth++;
    else if (c === "(" && --depth === 0) return i;
  }
  return -1;
}

/** What the guard finds in one file: «<line>: <rule>». */
export function sheetGuardFindings(raw: string): string[] {
  const src = stripComments(raw);
  const out: string[] = [];
  for (const m of src.matchAll(/\.press\(\s*["'`]Escape["'`]/g)) out.push(`${lineOf(src, m.index!)}: bare Escape — use pressEscUntilClosed / closeSheet / escOnPage (e2e/sheet.cjs)`);
  // a waitFor* call whose rejection is caught by an empty / constant handler: from each such `.catch(`, back over the
  // call it hangs on (its parentheses, bodies with `;` inside included) to the name of that call
  for (const m of src.matchAll(/\)\s*\.catch\(\s*(?:\(\s*\w*\s*\)|\w+)\s*=>\s*(?:\{\s*\}|null|undefined|false|true|0)\s*\)/g)) {
    const open = openParen(src, m.index!);
    const name = open < 0 ? "" : (src.slice(0, open).match(/\.(\w+)\s*$/)?.[1] ?? "");
    if (/^waitFor/.test(name)) out.push(`${lineOf(src, open)}: a swallowed wait — let it fail, or h.expect(await waited(…), "…")`);
  }
  return out;
}

describe("e2e: sheets and waits", () => {
  const all = files(root).map((f) => f.slice(root.length + 1)).filter((rel) => !EXEMPT.has(rel));
  it("finds the specs", () => expect(all.length).toBeGreaterThan(100));
  it.each(all.map((f) => [f]))("%s", (rel) => {
    expect(sheetGuardFindings(readFileSync(join(root, rel), "utf8"))).toEqual([]);
  });

  // the guard itself: it is red on what broke runs, green on the helpers
  it.each([
    ['await p.keyboard.press("Escape");', "bare Escape"],
    ["await page.keyboard.press('Escape'); await p.waitForTimeout(300);", "bare Escape"],
    ['await field.press("Escape");', "bare Escape"],
    ['await x.waitFor({ timeout: 5000 }).catch(() => {});', "swallowed"],
    ['await p.waitForFunction(() => {\n  return ok;\n}, null, { timeout: 4000 }).catch(() => {});', "swallowed"],
    ['await p.waitForURL(/a/, { timeout: 1 }).catch(() => null);', "swallowed"],
    ['await x.waitFor({ state: "detached" }).catch((e) => false);', "swallowed"],
    ['await page\n  .waitForFunction(f, c, { timeout: 3000 })\n  .catch(() => {});', "swallowed"],
  ])("red on %j", (code, rule) => {
    const found = sheetGuardFindings(code);
    expect(found.length).toBe(1);
    expect(found[0]).toContain(rule);
  });
  it.each([
    "await pressEscUntilClosed(p);",
    'await pressEscUntilClosed(p, p.getByRole("menu").first());',
    "await escOnPage(p);",
    'h.expect(await waited(x.waitFor({ timeout: 4000 })), "shows");',
    "// Esc: p.keyboard.press(\"Escape\") would be lost here",
    'await x.click().catch(() => {}); await y.waitFor();',
    'const ok = await x.waitFor().then(() => true, () => false);',
  ])("green on %j", (code) => expect(sheetGuardFindings(code)).toEqual([]));
});
