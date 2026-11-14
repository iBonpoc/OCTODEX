// #1413: снимки всех SCREENS спеки 08-layouts (390 и 1280, тёмная), демо-данные как в e2e. Запуск: node shots.cjs <apps/mobile>
const path = require("node:path");
const fs = require("node:fs");
const APP = process.argv[2];
const E2E = path.join(APP, "e2e");
const { chromium } = require(require.resolve("playwright", { paths: [APP] }));
const { serveDist } = require(path.join(E2E, "serve.cjs"));
const { clockFor } = require(path.join(E2E, "clock.cjs"));
const OUT = path.join(APP, "e2e", "out-audit");
fs.mkdirSync(OUT, { recursive: true });
// SCREENS: read from the spec file text (the spec does not export it)
const src = fs.readFileSync(path.join(E2E, "specs", "08-layouts.cjs"), "utf8");
const SCREENS = eval(src.match(/const SCREENS = (\[[\s\S]*?\]);/)[1]);
const widths = (process.argv[3] || "390,1280").split(",").map(Number);
(async () => {
  const server = await serveDist(path.join(APP, "dist"));
  const browser = await chromium.launch();
  const at = clockFor(null, process.env, Date.now());
  for (const width of widths) {
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: "reduce", deviceScaleFactor: 1 });
    await ctx.clock.install({ time: at });
    await ctx.addInitScript(() => {
      localStorage.setItem("octo.lang.v1", JSON.stringify("ru")); localStorage.setItem("octo.role.v1", JSON.stringify("director"));
      localStorage.setItem("octo.theme.v1", JSON.stringify("dark")); localStorage.setItem("octo.hints.v1", JSON.stringify(["today", "company", "clients", "estimate-builder", "inbox", "money", "jobs", "team", "catalog", "plan"]));
    });
    const p = await ctx.newPage();
    let i = 0;
    for (const s of SCREENS) {
      i++;
      await p.goto(server.base + s); await p.waitForTimeout(900);
      const name = `${String(i).padStart(3, "0")}-${width}${s.replace(/[/?=&]/g, "_")}.png`.slice(0, 120);
      // full page at 390 (the reviewer sees the whole screen), first screen only at 1280 (the layout)
      await p.screenshot({ path: path.join(OUT, name), fullPage: width === 390 });
    }
    await ctx.close();
  }
  await browser.close(); server.close?.();
  console.log("done", fs.readdirSync(OUT).length);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
