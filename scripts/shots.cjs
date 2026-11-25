/**
 * Screenshots of every screen of the layout run (08-layouts SCREENS) from a built web app, for a «до / после» comparison
 * (Ш III, спека 63 §3а): node scripts/shots.cjs <dist> <outDir> <width> <theme>; then node scripts/pixelDiff.cjs <before> <after>.
 * No assertions, one fixed moment, reduced motion: a screen that fails to open is skipped and named, it does not stop the run.
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { serveDist } = require("../apps/mobile/e2e/serve.cjs");
const [dist, out, widthArg, theme] = process.argv.slice(2);
const width = Number(widthArg);
const spec = fs.readFileSync(path.join(__dirname, "..", "apps", "mobile", "e2e", "specs", "08-layouts.cjs"), "utf8");
const SCREENS = [...spec.slice(spec.indexOf("SCREENS = ["), spec.indexOf("];")).matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = await serveDist(path.resolve(dist));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: "reduce" });
  await ctx.clock.install({ time: new Date("2026-11-20T20:00:00Z") });
  await ctx.addInitScript((th) => {
    localStorage.setItem("octo.lang.v1", JSON.stringify("ru")); localStorage.setItem("octo.role.v1", JSON.stringify("director"));
    localStorage.setItem("octo.theme.v1", JSON.stringify(th));
    localStorage.setItem("octo.hints.v1", JSON.stringify(["today", "company", "clients", "estimate-builder", "inbox", "money", "jobs", "team", "catalog", "plan"]));
  }, theme);
  const p = await ctx.newPage();
  let n = 0;
  for (const s of SCREENS) {
    try {
      await p.goto(server.base + s);
      await p.waitForTimeout(1200);
      await p.screenshot({ path: path.join(out, `layout-${theme}-${width}${s.replace(/[/?=&]/g, "_")}.png`) });
      n++;
    } catch (e) { console.log(`skipped ${s}: ${String(e.message).split("\n")[0]}`); }
  }
  console.log(`${n}/${SCREENS.length} screens`);
  await browser.close(); server.close();
})();
