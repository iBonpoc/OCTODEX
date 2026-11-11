/**
 * No fixed sleeps in e2e (#906 п.4, #1034; audit D-07; playbook §4). A fixed pause is too long on a fast machine and too short
 * on a slow one: wait for what you check (expect.poll / waitFor / waitForFunction / `settle` from e2e/settle.cjs).
 * What exists is counted per file in e2e/waitForTimeoutBaseline.json — a sleep is `waitForTimeout(` or
 * `new Promise(… setTimeout(…))`, in any .cjs/.mjs/.js under e2e/ (nested folders too). The count must EQUAL the baseline:
 * more = a new sleep (red); fewer = you removed some — lower the number, so the freed sleep cannot be taken again.
 * The two escape hatches (a spec's `exports.fixedWaits`, the helper option `legacyWaits`) are allowed only in the lists below.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const e2e = join(root, "e2e");
const baseline = JSON.parse(readFileSync(join(e2e, "waitForTimeoutBaseline.json"), "utf8")) as Record<string, number>;

/** specs that keep the fixed waits of h.go / h.click on purpose (each needs an issue to move it off) */
const FIXED_WAITS_SPECS = ["e2e/specs/12-tech-day.cjs"]; // #1020
/** files that pass `legacyWaits: true` to the helper (the cloud runner: a live server keeps the page busy) */
const LEGACY_WAITS_FILES = ["e2e/cloud/cloud.cjs", "e2e/cloud/specs/103-cloud-lead-to-payment.cjs", "e2e/h.cjs", "e2e/run.cjs"];

function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    if (f === "out" || f === "node_modules") continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(cjs|mjs|js)$/.test(f)) out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(root, p).split("\\").join("/");
const read = (p: string) => readFileSync(p, "utf8");

/** sleeps in a source text */
export function sleepsIn(src: string): number {
  return (src.match(/waitForTimeout\(/g) ?? []).length + (src.match(/new Promise\([\s\S]{0,80}?setTimeout\(/g) ?? []).length;
}
export function counts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of files(e2e)) {
    const n = sleepsIn(read(p));
    if (n) out[rel(p)] = n;
  }
  return out;
}

describe("e2e: no fixed sleeps beyond the baseline", () => {
  it("the counter sees both kinds of sleep", () => {
    expect(sleepsIn("await page.waitForTimeout(300); await new Promise((r) => setTimeout(r, 500));")).toBe(2);
    expect(sleepsIn("await p.waitForFunction(() => true)")).toBe(0);
  });
  it("no file has more sleeps than the baseline (a new file: none)", () => {
    const more = Object.entries(counts()).filter(([f, n]) => n > (baseline[f] ?? 0)).map(([f, n]) => `${f}: ${n} > ${baseline[f] ?? 0}`);
    expect(more, `new fixed sleep — wait for a sign instead (e2e/settle.cjs, expect.poll, waitFor):\n${more.join("\n")}`).toEqual([]);
  });
  it("the baseline is exact: a file with fewer sleeps (or gone) is lowered in e2e/waitForTimeoutBaseline.json", () => {
    const now = counts();
    const stale = Object.entries(baseline).filter(([f, n]) => (now[f] ?? 0) < n).map(([f, n]) => `${f}: baseline ${n}, now ${now[f] ?? 0}`);
    expect(stale, `lower the numbers (or delete the entries) in e2e/waitForTimeoutBaseline.json:\n${stale.join("\n")}`).toEqual([]);
  });
});

describe("e2e: the escape hatches stay on their lists", () => {
  it("only the listed specs set exports.fixedWaits", () => {
    const set = files(join(e2e, "specs")).filter((p) => /^\s*exports\.fixedWaits\s*=/m.test(read(p))).map(rel).sort();
    expect(set).toEqual([...FIXED_WAITS_SPECS].sort());
  });
  it("run.cjs takes the flag from the spec, not from a constant", () => {
    expect(read(join(e2e, "run.cjs"))).toMatch(/legacyWaits:\s*!!spec\.fixedWaits/);
  });
  it("only the listed files pass legacyWaits to the helper", () => {
    const uses = files(e2e).filter((p) => /legacyWaits\s*:\s*true/.test(read(p))).map(rel).sort();
    expect(uses.filter((f) => f !== "e2e/h.cjs" && f !== "e2e/run.cjs")).toEqual(LEGACY_WAITS_FILES.filter((f) => f !== "e2e/h.cjs" && f !== "e2e/run.cjs").sort());
  });
  it("every helpers(...) call in the cloud runner and cloud specs passes legacyWaits (a live server keeps the page busy)", () => {
    for (const p of files(join(e2e, "cloud"))) {
      for (const m of read(p).matchAll(/helpers\([^;]*\)/g)) {
        if (/function helpers/.test(m[0])) continue;
        expect(m[0], `${rel(p)}: ${m[0]}`).toMatch(/legacyWaits\s*:\s*true/);
      }
    }
  });
});

describe("e2e: the shared helper waits for readiness", () => {
  it("h.go / h.click wait with settle, not for a fixed second", () => {
    const h = read(join(e2e, "h.cjs"));
    expect(h).toMatch(/go: async \(p\) => \{[^\n]*appReady\(page\)[^\n]*settle\(page\)/);
    expect(h).toMatch(/click: async[^\n]*settle\(page/);
  });
  it("settle has a real-time cap on the Node side that is counted", () => {
    const s = read(join(e2e, "settle.cjs"));
    expect(s).toMatch(/Promise\.race\(/);
    expect(s).toMatch(/stats\.capped\+\+/);
  });
});
