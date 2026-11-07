/**
 * Сторож «нет gutter в ядре» (CLAUDE.md «Правило планирования»; docs/specs/33-gutters-module.md §9 S0b, П15.3).
 * Ядро — `apps/mobile/src` вне `src/modules/gutters/**` и `packages/design-tokens/src` — не знает ниши: слово «gutter»
 * встречается только в словаре в ключах блока модуля `mod.gutters.*` и в списке исключений ниже. Новое исключение —
 * только с объяснением и с «да» руководителя.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const APP = join(__dirname, "..");
const ROOTS = [join(APP, "src"), join(APP, "../../packages/design-tokens/src")];
const MODULE_DIR = join(APP, "src/modules/gutters");
const WORD = /gutter/i;

/** substrings that may carry the word anywhere: names in the database, the spec's file name */
const ANYWHERE = [
  "gutter_settings", // companies.gutter_settings — moved to company_modules (C1), dropped in rule 16 step 2
  "primary_trade", // companies.primary_trade='gutters' — a trade of the company, not the module
  "33-gutters-module", // a link to the spec in a comment
];
/** exact lines outside the dictionary: «file → the line's text (trimmed)» */
const LINES: Record<string, string[]> = {
  // a direction preset of the company (docs/specs/11-trade.md), not the module
  "src/features/companySetup.ts": ['"roofing", "gutters", "landscaping", "fencing", "pest", "other",'],
  // the name of a chat in a comment
  "src/data/store.tsx": ["/** for the estimate screen (chat «Сметы и модуль Gutters») */"],
};
/** dictionary keys that may carry the word besides mod.gutters.* */
const KEYS = new Set([
  "trade.gutters", // the direction preset above
  // old module screens without routes (src/modules/gutters/DrawingScreen.tsx, QuickEstimateScreen.tsx): to mod.gutters.* with M5
  "draw.modeGutter",
  "draw.hintGutter",
  "draw.total",
  "est.length",
  "est.empty",
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return p === MODULE_DIR ? [] : files(p);
    return /\.(ts|tsx|cjs|js)$/.test(f) ? [p] : [];
  });
}

/** every line of the core that names the niche and is not allowed */
function leaks(): string[] {
  const out: string[] = [];
  for (const root of ROOTS)
    for (const f of files(root)) {
      const rel = relative(APP, f).split("\\").join("/");
      const dict = /src\/i18n\/(ru|en|es)\.ts$/.test(rel);
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!WORD.test(line)) return;
          let rest = line;
          for (const a of ANYWHERE) rest = rest.split(a).join("");
          if (!WORD.test(rest)) return;
          if (dict) {
            const key = /^\s*"([^"]+)":/.exec(line)?.[1];
            if (key && (key.startsWith("mod.gutters.") || KEYS.has(key))) return;
            // a comment of the module's own block names the chat
            if (/^\s*\/\/ spec 33 П15:/.test(line)) return;
          } else if (LINES[rel]?.includes(line.trim())) return;
          out.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
  return out;
}

describe("nicheGuard: no gutter in the core (spec 33 §9 S0b)", () => {
  it("the word lives only in src/modules/gutters, the dictionary block mod.gutters.* and the listed exceptions", () => {
    expect(leaks()).toEqual([]);
  });
  it("every exception still exists (a stale one is removed from the list)", () => {
    for (const [rel, lines] of Object.entries(LINES)) {
      const text = readFileSync(join(APP, rel), "utf8").split("\n").map((l) => l.trim());
      for (const l of lines) expect(text, rel).toContain(l);
    }
    const ru = readFileSync(join(APP, "src/i18n/ru.ts"), "utf8");
    for (const k of KEYS) expect(ru, k).toContain(`"${k}":`);
  });
  it("the guard catches a leak (the scan really reads the core)", () => {
    const found = files(join(APP, "src")).map((f) => relative(APP, f).split("\\").join("/"));
    expect(found).toContain("src/modules/registry.ts");
    expect(found.some((f) => f.startsWith("src/modules/gutters/"))).toBe(false);
    expect(WORD.test("<GutterCanvas/>")).toBe(true);
  });
});
