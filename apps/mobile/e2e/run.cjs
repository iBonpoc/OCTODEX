/**
 * End-to-end runs in a real browser (demo mode): node e2e/run.cjs [--no-build] [spec ...]
 * Builds the web app (expo export), serves dist/ with SPA fallback, runs every spec in a fresh context,
 * fails on any page error / console error, writes screenshots to e2e/out/.
 * Width and theme (CLAUDE.md rule 4): --width=390|820|1280 --theme=dark|light, or E2E_WIDTH / E2E_THEME.
 * --all-layouts runs every spec at all 3 widths × 2 themes (CI runs them as 6 parallel jobs instead).
 * E2E_NOW=<ISO moment> starts the clock there (the specs' Date and every browser context's; it runs on from it), to check
 * a spec at a risky hour, e.g. E2E_NOW=2026-11-06T08:10:00Z = 12:10 AM in Los Angeles (docs/ai/CHECKS.md §5).
 */
const { execSync } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

// E2E_NOW: the specs' clock is moved; installClock puts a browser context on the same clock
let installClock = async () => {};
if (process.env.E2E_NOW) {
  const at = Date.parse(process.env.E2E_NOW);
  if (Number.isNaN(at)) throw new Error(`E2E_NOW is not a date: ${process.env.E2E_NOW}`);
  const Real = Date;
  const shift = at - Real.now();
  const Moved = class extends Real {
    constructor(...a) { super(...(a.length ? a : [Real.now() + shift])); }
    static now() { return Real.now() + shift; }
  };
  global.Date = Moved;
  // Playwright stamps the install with its own Date.now() and the page counts on from that stamp by the real clock,
  // so the install runs with the real Date (the runner does nothing else meanwhile)
  installClock = async (ctx) => {
    global.Date = Real;
    try { await ctx.clock.install({ time: Real.now() + shift }); } finally { global.Date = Moved; }
  };
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

const types = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".ttf": "font/ttf" };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, "index.html");
  res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const specs = fs.readdirSync(path.join(__dirname, "specs")).filter((f) => f.endsWith(".cjs") && (!only.length || only.some((o) => f.includes(o)))).sort();
  let failed = 0;
  let runs = 0;
  for (const layout of layouts)
  for (const file of specs) {
    // a spec that loops over widths/themes itself (08-layouts) runs once
    if (require(path.join(__dirname, "specs", file)).ownLayouts && layout !== layouts[0]) continue;
    runs++;
    await waitPastCompanyMidnight();
    const tag = `${file} @${layout.width} ${layout.theme}`;
    const spec = require(path.join(__dirname, "specs", file));
    const t0 = Date.now();
    const errors = [];
    const ctx = await browser.newContext({ viewport: { width: layout.width, height: layout.width === 390 ? 844 : 900 }, locale: "en-US" });
    await installClock(ctx);
    await ctx.addInitScript((o) => {
      if (localStorage.getItem("octo.lang.v1")) return;
      localStorage.setItem("octo.lang.v1", JSON.stringify(o.lang));
      localStorage.setItem("octo.role.v1", JSON.stringify(o.role));
      localStorage.setItem("octo.theme.v1", JSON.stringify(o.theme));
      localStorage.setItem("octo.hints.v1", JSON.stringify(["today", "company", "clients", "estimate-builder", "inbox", "triage", "money", "jobs", "team", "catalog", "plan", "visits"]));
    }, { lang: "ru", role: "director", theme: layout.theme, ...(spec.init || {}) });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
    const h = helpers(page, BASE, `${file.replace(/\.cjs$/, "")}-${layout.width}-${layout.theme}`);
    h.layout = layout;
    try {
      await spec.run(h, { browser, BASE, layout, layouts });
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
  console.log(failed ? `\n${failed} of ${runs} spec runs FAILED` : `\nALL ${runs} E2E SPEC RUNS PASSED (${layouts.map((l) => `${l.width} ${l.theme}`).join(", ")})`);
  process.exit(failed ? 1 : 0);
})();

function helpers(page, BASE, name) {
  const h = {
    page,
    go: async (p) => { await page.goto(BASE + p); await page.waitForTimeout(1000); },
    text: async () => (await page.locator("body").innerText()).split("\n").join(" | "),
    expect: (cond, msg) => { if (!cond) throw new Error(`expect failed: ${msg}`); },
    // Polls up to 3 s: a sheet or toast may still be opening after a fixed wait (02 failed once at 1280 dark on CI, 05.11).
    expectText: async (re, msg) => {
      let t = await h.text();
      for (let i = 0; i < 15 && !re.test(t); i++) { await page.waitForTimeout(200); t = await h.text(); }
      if (!re.test(t)) throw new Error(`expected ${re} (${msg || ""})\n${t.slice(0, 400)}`);
      return t.match(re);
    },
    click: async (name, opts = {}) => { await page.getByRole("button", { name, exact: true, ...opts }).last().click(); await page.waitForTimeout(350); },
    clickText: async (txt) => { await page.getByText(txt, { exact: true }).last().click(); await page.waitForTimeout(350); },
    sheet: () => page.locator('[aria-modal="true"]').last(),
    shot: (n) => page.screenshot({ path: path.join(OUT, `${name}-${n}.png`) }),
    db: () => page.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db),
    sign: async (signer) => {
      await page.getByPlaceholder(/Ваше имя|Your name/).last().fill(signer);
      await page.getByRole("switch", { name: /E-SIGN/ }).last().click();
      const pad = page.getByLabel(/расписывается|signs here/i).last();
      await pad.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
      const bb = await pad.boundingBox();
      await page.mouse.move(bb.x + 30, bb.y + 90); await page.mouse.down();
      for (let i = 0; i < 20; i++) await page.mouse.move(bb.x + 30 + i * 12, bb.y + 90 - Math.sin(i / 2) * 40);
      await page.mouse.up();
      await page.getByRole("button", { name: /Одобрить и подписать|Approve and sign/ }).last().click();
      await page.waitForTimeout(800);
    },
  };
  return h;
}
