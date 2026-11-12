/**
 * End-to-end runs in a real browser (demo mode): node e2e/run.cjs [--no-build] [spec ...]
 * Builds the web app (expo export), serves dist/ with SPA fallback, runs every spec in a fresh context,
 * fails on any page error / console error, writes screenshots to e2e/out/.
 * Width and theme (CLAUDE.md rule 4): --width=390|820|1280 --theme=dark|light, or E2E_WIDTH / E2E_THEME.
 * --all-layouts runs every spec at all 3 widths × 2 themes (CI runs them as parallel jobs instead).
 * --shard=k/n runs only the k-th of n parts of the spec list (CI splits each view in parts to finish sooner).
 * Clock (e2e/clock.cjs): every spec starts at noon of the company's day; E2E_NOW=<ISO moment> starts every spec there instead,
 * to check a spec at a risky hour, e.g. E2E_NOW=2026-11-06T08:10:00Z = 12:10 AM in Los Angeles (docs/ai/CHECKS.md §5).
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { serveDist } = require("./serve.cjs");
const { helpers } = require("./h.cjs");
const settleStats = require("./settle.cjs").stats;

// The clock (e2e/clock.cjs): before each spec the specs' Date is moved to the spec's start (noon of the company's day by
// default); installClock puts a browser context on the same clock. `shift` is 0 for a spec on the real time.
const { clockFor } = require("./clock.cjs");
const Real = Date;
let shift = 0;
let clocked = false;
const Moved = class extends Real {
  constructor(...a) { super(...(a.length ? a : [Real.now() + shift])); }
  static now() { return Real.now() + shift; }
};
global.Date = Moved;
function startClock(spec) {
  const at = clockFor(spec, process.env, Real.now());
  clocked = at !== null;
  shift = clocked ? at - Real.now() : 0;
}
// Playwright stamps the install with its own Date.now() and the page counts on from that stamp by the real clock,
// so the install runs with the real Date (the runner does nothing else meanwhile). A spec with its own context calls
// installClock(ctx) (its own moment: installClock(ctx, ms)) — test/e2eClock.test.ts checks it.
async function installClock(ctx, time) {
  if (time === undefined && !clocked) return;
  global.Date = Real;
  try { await ctx.clock.install({ time: time ?? Real.now() + shift }); } finally { global.Date = Moved; }
}

const APP = path.join(__dirname, "..");
const DIST = path.join(APP, "dist");
const OUT = path.join(__dirname, "out");
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const WIDTHS = [390, 820, 1280];
const THEMES = ["dark", "light"];
const layouts = args.includes("--all-layouts")
  ? THEMES.flatMap((theme) => WIDTHS.map((width) => ({ width, theme })))
  : [{ width: Number(opt("width") || process.env.E2E_WIDTH || 390), theme: opt("theme") || process.env.E2E_THEME || "dark" }];
if (!args.includes("--no-build")) execSync("npx expo export --platform web", { cwd: APP, stdio: "inherit" });
fs.mkdirSync(OUT, { recursive: true });

// The demo is reseeded when the company's day changes (store.tsx, «day» of octo.db.v5): a spec running across the company's
// midnight loses what it planted (e2e 65 on CI, 06.11). A spec that would start in the last minutes of the company's day
// waits until just after its midnight. A spec longer than this window (08-layouts) can still cross it.
const { addDays, atMinute, todayKey } = require("./companyTime.cjs");
const DAY_GUARD_MS = 3 * 60_000;
async function waitPastCompanyMidnight() {
  const left = Date.parse(atMinute(addDays(todayKey(), 1), 0)) - Date.now();
  if (left > DAY_GUARD_MS) return;
  console.log(`  … ${Math.ceil(left / 1000)} s to the company's midnight: waiting for the demo's new day`);
  await new Promise((r) => setTimeout(r, Math.max(0, left) + 5000));
}

(async () => {
  const server = await serveDist(DIST);
  const BASE = server.base;
  const browser = await chromium.launch();
  // --shard=k/n: the k-th of n equal parts of the sorted list (CI runs the parts as parallel jobs, docs/ai/CHECKS.md §1)
  const [shardK, shardN] = (opt("shard") || "1/1").split("/").map(Number);
  if (!(shardN >= 1 && shardK >= 1 && shardK <= shardN)) { console.error(`bad --shard=${opt("shard")} (want k/n)`); process.exit(2); }
  const specs = fs.readdirSync(path.join(__dirname, "specs")).filter((f) => f.endsWith(".cjs") && (!only.length || only.some((o) => f.includes(o)))).sort()
    .filter((_, i) => i % shardN === shardK - 1);
  let failed = 0;
  let runs = 0;
  for (const layout of layouts)
  for (const file of specs) {
    // a spec that loops over widths/themes itself (08-layouts) runs once
    if (require(path.join(__dirname, "specs", file)).ownLayouts && (layout !== layouts[0] || process.env.E2E_OWN_LAYOUTS === "0")) continue;
    runs++;
    const spec = require(path.join(__dirname, "specs", file));
    startClock(spec);
    // only a spec on the real time can start near the company's midnight
    await waitPastCompanyMidnight();
    const tag = `${file} @${layout.width} ${layout.theme}`;
    const t0 = Date.now();
    const errors = [];
    const ctx = await browser.newContext({ viewport: { width: layout.width, height: layout.width === 390 ? 844 : 900 }, locale: "en-US", reducedMotion: "reduce" });
    await installClock(ctx);
    await ctx.addInitScript((o) => {
      if (localStorage.getItem("octo.lang.v1")) return;
      localStorage.setItem("octo.lang.v1", JSON.stringify(o.lang));
      localStorage.setItem("octo.role.v1", JSON.stringify(o.role));
      localStorage.setItem("octo.theme.v1", JSON.stringify(o.theme));
      localStorage.setItem("octo.hints.v1", JSON.stringify(["today", "company", "clients", "estimate-builder", "inbox", "triage", "money", "jobs", "team", "catalog", "plan", "visits"]));
    }, { lang: "ru", role: "director", theme: layout.theme, ...(spec.init || {}) });
    // the downspouts the canvas puts by itself (#1246) are off in the specs written before them: they count downspouts they put
    // themselves. A spec about them says `exports.autoDs = true` (296); the others are about something else
    if (!spec.autoDs) await ctx.addInitScript(() => { globalThis.__octoAutoDs = "off"; });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
    const h = helpers(page, BASE, OUT, `${file.replace(/\.cjs$/, "")}-${layout.width}-${layout.theme}`, { legacyWaits: !!spec.fixedWaits });
    h.layout = layout;
    try {
      await spec.run(h, { browser, BASE, layout, layouts, installClock });
      if (errors.length) throw new Error(errors.join("\n"));
      console.log(`✓ ${tag} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      failed++;
      await page.screenshot({ path: path.join(OUT, `${file}-${layout.width}-${layout.theme}-FAIL.png`) }).catch(() => {});
      console.log(`✗ ${tag}\n  ${String(e.message || e).split("\n").slice(0, 6).join("\n  ")}`);
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
  if (settleStats.capped) console.log(`\n⚠ settle was ended by its real-time cap ${settleStats.capped} time(s): a page that never went quiet`);
  if (!runs) { console.error("no spec ran — check the spec filter / --shard"); process.exit(2); }
  console.log(failed ? `\n${failed} of ${runs} spec runs FAILED` : `\nALL ${runs} E2E SPEC RUNS PASSED (${layouts.map((l) => `${l.width} ${l.theme}`).join(", ")})`);
  process.exit(failed ? 1 : 0);
})();
