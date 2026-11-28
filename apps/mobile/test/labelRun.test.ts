/**
 * A label other than «к-влитию» does not start the full Checks run (#3130, #3117): the stand puts «стенд» / «принято» on PRs
 * often. The light run does no work and its «checks» repeats the commit's last finished «checks» — a green light run never
 * hides a red full one. scripts/labelRun.cjs decides; checks.yml wiring below.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Cr = { name: string; status: string; conclusion: string | null; completed_at?: string | null; details_url?: string };
const L = require("../../../scripts/labelRun.cjs") as {
  isLight: (a: { event: string; action?: string; label?: string; labels?: string[] }) => boolean;
  reflect: (runs: Cr[], own: string) => { ok: boolean; message: string };
  runIdOf: (c: Cr) => string;
};
const cr = (run: number, conclusion: string | null, at: string, status = "completed", name = "checks"): Cr =>
  ({ name, status, conclusion, completed_at: at, details_url: `https://github.com/o/r/actions/runs/${run}/job/1` });

describe("labelRun.isLight", () => {
  it("«стенд» / «принято» put on a PR: light", () => {
    for (const label of ["стенд", "принято", "починка"]) expect(L.isLight({ event: "pull_request", action: "labeled", label, labels: [label] })).toBe(true);
  });
  it("«к-влитию» itself: the full run", () => {
    expect(L.isLight({ event: "pull_request", action: "labeled", label: "к-влитию", labels: ["к-влитию"] })).toBe(false);
  });
  it("any label on a PR that has «к-влитию»: the full run (it must not take the full run's pending slot)", () => {
    expect(L.isLight({ event: "pull_request", action: "labeled", label: "стенд", labels: ["к-влитию", "стенд"] })).toBe(false);
  });
  it("a push, opened, ready_for_review, main, nightly: never light", () => {
    for (const action of ["synchronize", "opened", "reopened", "ready_for_review"]) expect(L.isLight({ event: "pull_request", action, label: "стенд" })).toBe(false);
    for (const event of ["push", "schedule", "workflow_dispatch"]) expect(L.isLight({ event, action: "labeled", label: "стенд" })).toBe(false);
  });
});

describe("labelRun.reflect: the light run repeats the commit's last finished «checks»", () => {
  it("the last finished one green → green", () => {
    expect(L.reflect([cr(1, "failure", "2026-11-27T10:00:00Z"), cr(2, "success", "2026-11-27T11:00:00Z")], "9").ok).toBe(true);
  });
  it("the last finished one red (an older green does not count) → red, naming the run", () => {
    const r = L.reflect([cr(1, "success", "2026-11-27T10:00:00Z"), cr(2, "failure", "2026-11-27T11:00:00Z")], "9");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("failure (прогон 2)");
  });
  it("cancelled or skipped counts as red", () => {
    for (const c of ["cancelled", "skipped", null]) expect(L.reflect([cr(1, c, "2026-11-27T10:00:00Z")], "9").ok).toBe(false);
  });
  it("its own check run, ones still running and other names are not looked at; none left → red", () => {
    const r = L.reflect([cr(9, "success", "2026-11-27T12:00:00Z"), cr(3, null, "", "in_progress"), cr(4, "success", "2026-11-27T12:00:00Z", "completed", "fast")], "9");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("нет законченного прогона checks");
  });
  it("runIdOf reads the run from details_url", () => expect(L.runIdOf(cr(12345, "success", ""))).toBe("12345"));
});

describe("checks.yml wiring of the light run", () => {
  const yml = readFileSync(join(__dirname, "../../../.github/workflows/checks.yml"), "utf8");
  const job = (name: string) => {
    const m = yml.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:\\n|(?![\\s\\S]))`, "m"));
    if (!m) throw new Error(`job ${name} not found`);
    return m[1];
  };
  it("pause decides (event, action, the label, the PR's labels) and gives «light»", () => {
    const p = job("pause");
    expect(p).toContain("light: ${{ steps.light.outputs.light }}");
    expect(p).toContain("run: node scripts/labelRun.cjs light");
    expect(p).toContain("LABEL: ${{ github.event.label.name }}");
    expect(p).toContain("ACTION: ${{ github.event.action }}");
  });
  it("every job behind pause is skipped on a light run (the heavy ones follow «changes»)", () => {
    for (const j of ["changes", "fast", "numbers", "rule22", "scenarios"]) expect(job(j), j).toMatch(/^ {4}if: needs\.pause\.outputs\.light != 'true'/m);
    for (const j of ["bundle", "build-web", "e2e"]) expect(job(j), j).toMatch(/needs: (changes|\[changes)/);
  });
  it("«checks»: on a light run only the reflection, otherwise the usual «all green»", () => {
    const c = job("checks");
    expect(c).toMatch(/if: needs\.pause\.outputs\.light == 'true'\n\s+env:\n\s+GH_TOKEN[^\n]*\n\s+HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}\n\s+run: node scripts\/labelRun\.cjs reflect/);
    expect(c).toMatch(/- name: All checks green\n\s+if: needs\.pause\.outputs\.light != 'true'/);
    expect(c).toMatch(/checks: read/);
  });
});
