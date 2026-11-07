/**
 * e2e run with reduced motion (07.11, docs/ai/CHECKS.md §1): charts and panels of «Наряд» animate 0.35–0.9 s;
 * screenshots and sizes read mid-animation are flaky. Every browser context of the e2e runner and of specs that
 * open their own context must ask for `reducedMotion: "reduce"` — useReducedMotion() then sets values at once.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../e2e");
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith(".cjs") ? [join(dir, d.name)] : []));

describe("e2e browser contexts", () => {
  const withContext = files(root).filter((f) => /\.newContext\(/.test(readFileSync(f, "utf8")));
  it("the runner and the specs open contexts", () => expect(withContext.length).toBeGreaterThanOrEqual(1));
  it.each(withContext.map((f) => [f.slice(root.length + 1)]))("%s asks for reduced motion", (rel) => {
    const src = readFileSync(join(root, rel), "utf8");
    const calls = src.match(/\.newContext\(\{[^)]*\}\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toMatch(/reducedMotion:\s*"reduce"/);
  });
});
