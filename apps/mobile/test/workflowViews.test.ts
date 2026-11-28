/**
 * Which e2e checks.yml runs per event (stop of 18.11, rule 26): the full matrix — every spec at 3 widths × 2 themes — on
 * push to main, nightly, by hand and on a PR labelled «к-влитию»; a PR without it runs only its own specs (all 6 views,
 * one job) or no e2e. scripts/e2eScope.cjs decides; release.yml is not touched.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Scope = { mode: string; views: string[]; parts: number[]; specs: string[]; draft: boolean; message: string };
const { decide, specsFrom, helperChanged, MERGE_LABEL, ALL_VIEWS } = require("../../../scripts/e2eScope.cjs") as {
  decide: (a: { event: string; labels: string[]; changedSpecs: string[] | null; helper?: boolean; draft?: boolean }) => Scope;
  helperChanged: (p: unknown) => boolean;
  specsFrom: (p: unknown) => string[];
  MERGE_LABEL: string;
  ALL_VIEWS: string[];
};
const yml = readFileSync(join(__dirname, "../../../.github/workflows/checks.yml"), "utf8");
const job = (name: string) => {
  const m = yml.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:\\n|(?![\\s\\S]))`, "m"));
  if (!m) throw new Error(`job ${name} not found in checks.yml`);
  return m[1];
};
const SIX = ["390-dark", "390-light", "820-dark", "820-light", "1280-dark", "1280-light"];

describe("e2eScope.decide: the full matrix only with «к-влитию» (and always on main)", () => {
  it("the label is «к-влитию» and the full matrix is 3 widths × 2 themes", () => {
    expect(MERGE_LABEL).toBe("к-влитию");
    expect(ALL_VIEWS).toEqual(SIX);
  });
  it("push to main, the nightly and a manual run: full matrix, 2 parts per view, every spec", () => {
    for (const event of ["push", "schedule", "workflow_dispatch"]) {
      const r = decide({ event, labels: [], changedSpecs: [] });
      expect(r).toMatchObject({ mode: "full", views: SIX, parts: [1, 2], specs: [] });
    }
  });
  it("a PR labelled «к-влитию»: full matrix, whatever it changed", () => {
    expect(decide({ event: "pull_request", labels: ["починка", "к-влитию"], changedSpecs: [] })).toMatchObject({ mode: "full", views: SIX, parts: [1, 2] });
  });
  it("a PR without the label that changed specs: only those, all 6 views in one job", () => {
    const r = decide({ event: "pull_request", labels: ["починка"], changedSpecs: ["469-date-field.cjs", "163-visit-checklist-office.cjs"] });
    expect(r).toMatchObject({ mode: "changed", views: ["all"], parts: [1], specs: ["163-visit-checklist-office.cjs", "469-date-field.cjs"] });
  });
  it("a PR without the label that changed no spec: no e2e", () => {
    expect(decide({ event: "pull_request", labels: [], changedSpecs: [] })).toMatchObject({ mode: "none", views: [], parts: [] });
  });
  it("the PR's diff unreadable → the full matrix (never less by accident)", () => {
    expect(decide({ event: "pull_request", labels: [], changedSpecs: null }).mode).toBe("full");
  });
  it("a changed e2e helper (run.cjs, helpers — not a spec) reaches every spec: full matrix", () => {
    expect(helperChanged(["apps/mobile/e2e/accent.cjs"])).toBe(true);
    expect(helperChanged(["apps/mobile/e2e/specs/68-a.cjs", "apps/mobile/src/x.tsx"])).toBe(false);
    expect(decide({ event: "pull_request", labels: [], changedSpecs: [], helper: true }).mode).toBe("full");
  });
  it("specsFrom keeps only e2e/specs/*.cjs (not helpers, not other files), once each", () => {
    expect(specsFrom(["apps/mobile/e2e/specs/68-a.cjs", "apps/mobile/e2e/accent.cjs", "apps/mobile/src/x.tsx", "apps/mobile/e2e/specs/68-a.cjs", "docs/a.md", ""])).toEqual(["68-a.cjs"]);
  });
});

describe("e2eScope.decide: a draft PR runs only the quick checks (#3117 А)", () => {
  it("a draft without the label: no e2e (mode none) and draft=true (no bundle), even with changed specs or a helper", () => {
    for (const a of [{ changedSpecs: ["68-a.cjs"] }, { changedSpecs: [], helper: true }, { changedSpecs: null }]) {
      expect(decide({ event: "pull_request", labels: ["стенд"], draft: true, ...a })).toMatchObject({ mode: "none", views: [], parts: [], specs: [], draft: true });
    }
  });
  it("a draft labelled «к-влитию»: the full matrix and the bundle (draft=false)", () => {
    expect(decide({ event: "pull_request", labels: ["к-влитию"], draft: true, changedSpecs: [] })).toMatchObject({ mode: "full", views: SIX, draft: false });
  });
  it("ready for review (draft false): the usual scope, the bundle runs", () => {
    expect(decide({ event: "pull_request", labels: [], draft: false, changedSpecs: ["68-a.cjs"] })).toMatchObject({ mode: "changed", specs: ["68-a.cjs"], draft: false });
    expect(decide({ event: "pull_request", labels: [], changedSpecs: [] }).draft).toBe(false);
  });
  it("push to main is never a draft", () => {
    expect(decide({ event: "push", labels: [], changedSpecs: [], draft: true })).toMatchObject({ mode: "full", draft: false });
  });
});

describe("checks.yml wiring", () => {
  it("putting a label on a PR starts a run («labeled» in the pull_request types)", () => {
    expect(yml).toMatch(/pull_request:\s*\n(?:\s*#.*\n)*\s*types: \[opened, synchronize, reopened, labeled, ready_for_review\]/);
  });
  it("the «changes» job asks scripts/e2eScope.cjs with the PR's labels, base and head, and passes mode/views/parts/specs on", () => {
    const c = job("changes");
    expect(c).toContain("run: node scripts/e2eScope.cjs");
    expect(c).toContain("PR_LABELS: ${{ join(github.event.pull_request.labels.*.name, ',') }}");
    expect(c).toMatch(/BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
    expect(c).toMatch(/PR_HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
    for (const o of ["e2e: ${{ steps.views.outputs.mode }}", "views: ${{ steps.views.outputs.views }}", "parts: ${{ steps.views.outputs.parts }}", "specs: ${{ steps.views.outputs.specs }}"]) expect(c).toContain(o);
    expect(c).toMatch(/pull-requests: read/);
  });
  it("e2e matrix takes views and parts from e2eScope; mode none skips it and the web build", () => {
    const e = job("e2e");
    expect(e).toContain("view: ${{ fromJSON(needs.changes.outputs.views) }}");
    expect(e).toContain("part: ${{ fromJSON(needs.changes.outputs.parts) }}");
    expect(e).toContain("needs.changes.outputs.e2e != 'none'");
    expect(job("build-web")).toContain("needs.changes.outputs.e2e != 'none'");
  });
  it("draft (#3117 А): e2eScope gets PR_DRAFT and gives «draft»; the bundle is skipped on it and «checks» reads that as green", () => {
    const c = job("changes");
    expect(c).toContain("PR_DRAFT: ${{ github.event.pull_request.draft }}");
    expect(c).toContain("draft: ${{ steps.views.outputs.draft }}");
    expect(job("bundle")).toContain("if: needs.changes.outputs.app == 'true' && needs.changes.outputs.draft != 'true'");
    expect(job("checks")).toContain(`if [ "\${{ needs.changes.outputs.draft }}" = "true" ] && [ "$bundle" = "skipped" ]; then bundle=success; fi`);
    // the quick checks do not look at the draft state
    for (const j of ["pause", "fast", "numbers", "rule22", "scenarios"]) expect(job(j)).not.toContain("draft");
  });
  it("view «all» runs only the PR's specs at all 6 views (--all-layouts); other views keep width/theme/shard", () => {
    const e = job("e2e");
    expect(e).toContain("SPECS: ${{ needs.changes.outputs.specs }}");
    expect(e).toContain("timeout-minutes: ${{ matrix.view == 'all' && 120 || 45 }}");
    expect(e).toMatch(/if \[ "\$view" = "all" \]; then[\s\S]*node e2e\/run\.cjs --no-build --all-layouts \$SPECS/);
    expect(e).toMatch(/node e2e\/run\.cjs --no-build --width="\$\{view%-\*\}" --theme="\$\{view#\*-\}" --shard=\$\{\{ matrix\.part \}\}\/2/);
  });
  it("08-layouts (all 6 views by itself) runs once in the full matrix: other views set E2E_OWN_LAYOUTS=0 except 390-dark", () => {
    expect(yml).toMatch(/\[ "\$view" = "390-dark" \] \|\| export E2E_OWN_LAYOUTS=0/);
  });
  it("«checks» stays required: skipped e2e is green only for docs-only or mode none; the full matrix skipped is red", () => {
    const c = job("checks");
    expect(c).toMatch(/needs:\s*\[[^\]]*e2e[^\]]*\]/);
    expect(c).toMatch(/if \[ "\$\{\{ needs\.changes\.outputs\.e2e \}\}" = "none" \] && \[ "\$e2e" = "skipped" \]/);
    expect(c).toContain('[ "${{ needs.build-web.result }}" = "skipped" ]; then e2e=success');
    expect(c).toContain('[ "$e2e" = "success" ]');
  });
  it("release.yml still waits for a successful Checks run of that commit", () => {
    const rel = readFileSync(join(__dirname, "../../../.github/workflows/release.yml"), "utf8");
    expect(rel).toMatch(/workflows: \[Checks\]/);
    expect(rel).toContain('[ "$res" = "success" ] || no "checks $res"');
  });
});
