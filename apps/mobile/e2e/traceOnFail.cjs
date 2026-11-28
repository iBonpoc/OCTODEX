/**
 * A Playwright trace of a FAILED run of a chosen spec (CHECKS §9 №87, the lead's word 28.11): a red that does not come back on
 * a re-run leaves only a screenshot, and the screenshot does not say why a press went nowhere. The trace (actions, the DOM
 * at each step, the console) does. Only the specs named in E2E_TRACE_SPECS are traced — tracing costs CPU on every run, and
 * the full matrix must not slow down (#3117 п.4); a passed run's trace is dropped, a failed one goes next to its screenshot
 * (e2e/out/, the CI artifact e2e-screenshots-*). Open it with `npx playwright show-trace <file>`.
 */
const path = require("node:path");

/** the spec files named in E2E_TRACE_SPECS (comma or space separated, with or without .cjs) */
function tracedSpecs(env = process.env.E2E_TRACE_SPECS) {
  return new Set(String(env || "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map((s) => (s.endsWith(".cjs") ? s : `${s}.cjs`)));
}

/** the trace file of a failed run: next to its screenshot, the same name */
function traceFile(out, file, layout) {
  return path.join(out, `${file}-${layout.width}-${layout.theme}-FAIL-trace.zip`);
}

/** start tracing the context when the spec is chosen; returns stop(failed) that keeps the trace only when the run failed */
async function startTrace(ctx, { file, layout, out, specs = tracedSpecs() }) {
  if (!specs.has(file)) return async () => {};
  await ctx.tracing.start({ screenshots: true, snapshots: true, sources: false });
  return async (failed) => {
    await ctx.tracing.stop(failed ? { path: traceFile(out, file, layout) } : undefined).catch(() => {});
    if (failed) console.log(`  trace: ${path.basename(traceFile(out, file, layout))} (npx playwright show-trace)`);
  };
}

module.exports = { tracedSpecs, traceFile, startTrace };
