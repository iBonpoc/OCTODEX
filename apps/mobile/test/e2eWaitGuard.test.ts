/**
 * No NEW fixed sleeps in e2e (#906 п.4, audit D-07; playbook §4): `waitForTimeout` is a pause that is too long when the
 * machine is fast and too short when it is slow. Wait for what you check (expect.poll / waitFor / waitForFunction / `settle`
 * from e2e/settle.cjs). The old ones are counted per file in e2e/waitForTimeoutBaseline.json and may only go DOWN (lower the number when you remove
 * some; a file that is not in the list may have none).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const baseline = JSON.parse(readFileSync(join(root, "e2e/waitForTimeoutBaseline.json"), "utf8")) as Record<string, number>;

/** every e2e .cjs file (specs, cloud specs, helpers) with its number of waitForTimeout calls */
export function counts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const dir of ["e2e/specs", "e2e/cloud", "e2e"]) {
    for (const f of readdirSync(join(root, dir))) {
      const rel = `${dir}/${f}`;
      if (!f.endsWith(".cjs") || statSync(join(root, rel)).isDirectory()) continue;
      const n = (readFileSync(join(root, rel), "utf8").match(/waitForTimeout\(/g) ?? []).length;
      if (n) out[rel] = n;
    }
  }
  return out;
}

describe("e2e: no new fixed sleeps", () => {
  it("no file has more waitForTimeout than the baseline (a new file: none)", () => {
    const now = counts();
    const more = Object.entries(now).filter(([f, n]) => n > (baseline[f] ?? 0)).map(([f, n]) => `${f}: ${n} > ${baseline[f] ?? 0}`);
    expect(more, `new waitForTimeout — wait for a sign instead (e2e/settle.cjs, expect.poll, waitFor):\n${more.join("\n")}`).toEqual([]);
  });
  it("the shared helper h.go / h.click wait for readiness (settle), not for a fixed second", () => {
    const h = readFileSync(join(root, "e2e/h.cjs"), "utf8");
    expect(h).toMatch(/go: async \(p\) => \{[^\n]*appReady\(page\)[^\n]*settle\(page\)/);
    expect(h).toMatch(/click: async[^\n]*settle\(page/);
  });
});
