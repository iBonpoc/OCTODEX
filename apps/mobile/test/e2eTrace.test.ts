/**
 * CHECKS §9 №87 (the lead's word 28.11): a failed run of a spec named in E2E_TRACE_SPECS keeps a Playwright trace next to its
 * screenshot (the CI artifact); a passed run and an unnamed spec keep none — tracing costs CPU, the matrix must not slow down.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Layout = { width: number; theme: string };
const T = require("../e2e/traceOnFail.cjs") as {
  tracedSpecs: (env?: string) => Set<string>;
  traceFile: (out: string, file: string, layout: Layout) => string;
  startTrace: (ctx: unknown, a: { file: string; layout: Layout; out: string; specs?: Set<string> }) => Promise<(failed: boolean) => Promise<void>>;
};
const fakeCtx = () => {
  const calls: unknown[][] = [];
  return { calls, tracing: { start: async (o: unknown) => void calls.push(["start", o]), stop: async (o: unknown) => void calls.push(["stop", o]) } };
};
const L = { width: 820, theme: "light" };

describe("e2e trace of a failed run (CHECKS §9 №87)", () => {
  it("E2E_TRACE_SPECS: comma or space separated, «.cjs» optional; empty — none", () => {
    expect([...T.tracedSpecs("37-service-categories, 72-tax-exempt-estimate.cjs  08-layouts")]).toEqual(["37-service-categories.cjs", "72-tax-exempt-estimate.cjs", "08-layouts.cjs"]);
    expect(T.tracedSpecs("").size).toBe(0);
    expect(T.tracedSpecs(undefined).size).toBe(0);
  });
  it("the trace goes next to the screenshot, the same name (no «?» — the artifact refuses it)", () => {
    expect(T.traceFile("/o", "37-service-categories.cjs", L)).toBe("/o/37-service-categories.cjs-820-light-FAIL-trace.zip");
  });
  it("a named spec: traced; failed — the file is kept; passed — dropped", async () => {
    const specs = T.tracedSpecs("37-service-categories");
    const a = fakeCtx();
    await (await T.startTrace(a, { file: "37-service-categories.cjs", layout: L, out: "/o", specs }))(true);
    expect(a.calls).toEqual([["start", { screenshots: true, snapshots: true, sources: false }], ["stop", { path: "/o/37-service-categories.cjs-820-light-FAIL-trace.zip" }]]);
    const b = fakeCtx();
    await (await T.startTrace(b, { file: "37-service-categories.cjs", layout: L, out: "/o", specs }))(false);
    expect(b.calls[1]).toEqual(["stop", undefined]);
  });
  it("a spec not named: no tracing at all", async () => {
    const c = fakeCtx();
    await (await T.startTrace(c, { file: "72-tax-exempt-estimate.cjs", layout: L, out: "/o", specs: T.tracedSpecs("37-service-categories") }))(true);
    expect(c.calls).toEqual([]);
  });
  it("run.cjs starts it per run and stops it with the run's result before the context closes; CI names spec 37", () => {
    const run = readFileSync(join(__dirname, "../e2e/run.cjs"), "utf8");
    expect(run).toContain("const stopTrace = await startTrace(ctx, { file, layout, out: OUT });");
    expect(run).toMatch(/runFailed = true;/);
    expect(run).toMatch(/await stopTrace\(runFailed\);\n\s+await ctx\.close\(\);/);
    const yml = readFileSync(join(__dirname, "../../../.github/workflows/checks.yml"), "utf8");
    expect(yml).toMatch(/E2E_TRACE_SPECS: 37-service-categories\.cjs/);
    // the trace lands in e2e/out/, the folder the artifact uploads
    expect(yml).toContain("path: apps/mobile/e2e/out/");
  });
});
