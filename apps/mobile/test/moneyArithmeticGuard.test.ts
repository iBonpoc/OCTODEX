/**
 * Rule 8 guard (#805): «money is whole cents, counted only through @octo/estimating-engine». A heuristic over src/** (not the
 * engine, not i18n): arithmetic on `…Cents` values — `x.totalCents - x.paidCents`, `…Cents * n`, `n * …Cents`, `…Cents + …Cents`,
 * `.reduce(… Cents …)`. Showing money (`cents / 100` into a string) is not counted. What exists is listed per file in
 * moneyArithmeticBaseline.json WITH the task that moves it into the engine; a file may only go down, a new file or a higher
 * count is red, an entry without an issue number is red. Found 11.11.2026: #1054 (balance), #1057 (paid accumulation), #1058 (sums).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const baseline = JSON.parse(readFileSync(join(__dirname, "moneyArithmeticBaseline.json"), "utf8")) as Record<string, { count: number; issue: number }>;

const PATTERNS: RegExp[] = [
  /[\w.\][]*[Cc]ents\)?\s*\*\s*[\w(]/, // cents × n
  /[\w)]\s*\*\s*\(?[\w.\][]*[Cc]ents\b/, // n × cents
  /[\w.\][]*[Cc]ents\s*\+\s*[\w.\][]*[Cc]ents\b/, // cents + cents
  /[\w.\][]*[Cc]ents\s*-\s*[\w.\][]*[Cc]ents\b/, // cents − cents
  /\.reduce\([^\n]*[Cc]ents/, // a sum over a list
];

function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(f) && !/\.d\.ts$/.test(f)) out.push(p);
  }
  return out;
}

/** the number of lines with money arithmetic in a source text (comment lines are not counted) */
export function arithmeticLines(src: string): number {
  return src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && PATTERNS.some((re) => re.test(l))).length;
}

function counts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of files(join(root, "src"))) {
    const rel = relative(root, p).split("\\").join("/");
    if (rel.startsWith("src/i18n/")) continue;
    const n = arithmeticLines(readFileSync(p, "utf8"));
    if (n) out[rel] = n;
  }
  return out;
}

describe("rule 8: money arithmetic stays in the engine", () => {
  it("the detector sees the forms and not the display", () => {
    expect(arithmeticLines("const bal = inv.totalCents - inv.paidCents;")).toBe(1);
    expect(arithmeticLines("const t = items.reduce((s, x) => s + x.amountCents, 0);")).toBe(1);
    expect(arithmeticLines("const c = qty * unitPriceCents;")).toBe(1);
    expect(arithmeticLines("const next = a.paidCents + b.amountCents;")).toBe(1);
    expect(arithmeticLines("const label = String(cents / 100);\n// totalCents - paidCents in a comment")).toBe(0);
  });
  it("no file has more money arithmetic than its baseline entry (a new file: none) — use @octo/estimating-engine", () => {
    const more = Object.entries(counts()).filter(([f, n]) => n > (baseline[f]?.count ?? 0)).map(([f, n]) => `${f}: ${n} > ${baseline[f]?.count ?? 0}`);
    expect(more, `new money arithmetic outside the engine — add the function to packages/estimating-engine (with a test) and use it; do NOT raise the baseline:\n${more.join("\n")}`).toEqual([]);
  });
  it("the baseline is exact (a moved place lowers it) and every entry names its task", () => {
    const now = counts();
    const stale = Object.entries(baseline).filter(([f, e]) => (now[f] ?? 0) < e.count).map(([f, e]) => `${f}: baseline ${e.count}, now ${now[f] ?? 0}`);
    expect(stale, `lower apps/mobile/test/moneyArithmeticBaseline.json:\n${stale.join("\n")}`).toEqual([]);
    const noTask = Object.entries(baseline).filter(([, e]) => !(e.issue > 0)).map(([f]) => f);
    expect(noTask, "a baseline entry needs the issue that moves it into the engine").toEqual([]);
  });
});
