/**
 * The visual guard (docs/ai/CHECKS.md §11, docs/design/SCREEN-SPECS.md): the six screens of visual v2 («Макеты 390 × 844, демо»)
 * are photographed and compared with the approved references in e2e/visual/ref/.
 *   node e2e/visual/visual.cjs [--no-build] [--update] [name ...]      (npm run check:visual from the repo root)
 * - the same input every run: a fresh context 390 × 844, en-US, the demo company (lang ru, role director), the clock at VISUAL_NOW
 *   (Thursday 20.11.2026 12:00 in Los Angeles — the demo is seeded from «today», so a fixed moment = fixed data), reduced motion,
 *   no CSS animations / transitions / caret, the fonts loaded;
 * - each shot: the header unfolded; Главная and Клиент also scrolled (the header folded);
 * - compared in Chrome itself (a canvas, no new dependency — rule 17): a pixel differs when a channel moves by more than
 *   CHANNEL; a shot fails when more than RATIO of its pixels differ. Report: e2e/visual/out/report.html (reference · now · diff).
 * - `--update` writes the references. Only with the founder's approval in the PR, which then says «Эталоны обновлены: …».
 * Locally only (macOS fonts and rendering); for CI see docs/ai/CHECKS.md §11.
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { serveDist } = require("../serve.cjs");
const { settle, appReady } = require("../settle.cjs");

const APP = path.join(__dirname, "..", "..");
const DIST = path.join(APP, "dist");
const REF = path.join(__dirname, "ref");
const OUT = path.join(__dirname, "out");
const PORT = 8095;
/** the fixed moment of every shot: 12:00 PM in Los Angeles, Thursday 20 November 2026 */
const VISUAL_NOW = "2026-11-20T20:00:00Z";
/** a channel (0–255) may move by this much before the pixel counts as changed (antialiasing) */
const CHANNEL = 24;
/** the share of changed pixels a shot may have: 0.5 % */
const RATIO = 0.005;
const VIEWPORT = { width: 390, height: 844 };
/** how far the scrolled shots are scrolled: past the end of both folds (root 64, object 112) */
const SCROLL = 320;

/** the six screens (visual-v2.html ids m-home … m-money); `scrolled` — also a shot with the header folded */
const SCREENS = [
  { name: "home", path: "/today", scrolled: true },
  { name: "plan", path: "/plan" },
  { name: "client", path: "/client/c1", scrolled: true },
  { name: "visit", path: "/visit/v4" },
  { name: "estimate", path: "/estimate/new?id=e6" },
  { name: "money", path: "/finance" },
];
const THEMES = ["dark", "light"];

const args = process.argv.slice(2);
const update = args.includes("--update");
const only = args.filter((a) => !a.startsWith("--"));

const NO_MOTION_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";

async function shoot(browser, base, screen, theme, scrolled) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: "en-US", timezoneId: "America/Los_Angeles", reducedMotion: "reduce" });
  await ctx.clock.install({ time: Date.parse(VISUAL_NOW) });
  await ctx.addInitScript((o) => {
    if (localStorage.getItem("octo.lang.v1")) return;
    localStorage.setItem("octo.lang.v1", JSON.stringify("ru"));
    localStorage.setItem("octo.role.v1", JSON.stringify("director"));
    localStorage.setItem("octo.theme.v1", JSON.stringify(o.theme));
    localStorage.setItem("octo.planMode.v1", JSON.stringify("day"));
    localStorage.setItem("octo.hints.v1", JSON.stringify(["today", "company", "clients", "estimate-builder", "inbox", "triage", "money", "jobs", "team", "catalog", "plan", "visits"]));
  }, { theme });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + screen.path);
  await appReady(page);
  await page.addStyleTag({ content: NO_MOTION_CSS });
  await page.evaluate(() => document.fonts.ready);
  await settle(page, { quietMs: 300 });
  if (scrolled) {
    // a person's scroll (the wheel), so the header folds as it does under a finger; past the fold's end nothing settles back
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    await page.mouse.wheel(0, SCROLL);
    await settle(page, { quietMs: 400 });
  }
  const png = await page.screenshot({ animations: "disabled", caret: "hide" });
  await ctx.close();
  if (errors.length) throw new Error(`page errors on ${screen.path}: ${errors.join(" | ")}`);
  return png;
}

/** compares two PNGs in the browser (canvas): { w, h, changed, ratio, diff: PNG buffer | null, sizeDiffers } */
async function compare(page, ref, now) {
  const r = await page.evaluate(async ([a, b, channel]) => {
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { sizeDiffers: true, w: ib.width, h: ib.height };
    const w = ia.width, h = ia.height;
    const px = (img) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h); };
    const da = px(ia).data, db = px(ib).data;
    const out = document.createElement("canvas"); out.width = w; out.height = h;
    const ox = out.getContext("2d"); const od = ox.createImageData(w, h);
    let changed = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d > channel) { changed++; od.data[i] = 255; od.data[i + 1] = 0; od.data[i + 2] = 64; od.data[i + 3] = 255; }
      else { const g = (db[i] + db[i + 1] + db[i + 2]) / 3; od.data[i] = od.data[i + 1] = od.data[i + 2] = 128 + g / 4; od.data[i + 3] = 255; }
    }
    ox.putImageData(od, 0, 0);
    return { w, h, changed, diff: changed ? out.toDataURL("image/png") : null };
  }, [`data:image/png;base64,${ref.toString("base64")}`, `data:image/png;base64,${now.toString("base64")}`, CHANNEL]);
  if (r.sizeDiffers) return { ...r, ratio: 1, diff: null };
  return { ...r, ratio: r.changed / (r.w * r.h), diff: r.diff ? Buffer.from(r.diff.split(",")[1], "base64") : null };
}

(async () => {
  if (!args.includes("--no-build")) execSync(`npx expo export --platform web${process.env.CI ? "" : " --clear"}`, { cwd: APP, stdio: "inherit" });
  fs.mkdirSync(REF, { recursive: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serveDist(DIST, PORT);
  // Playwright's own Chromium; when it is not downloaded (`npx playwright install chromium`), the installed Google Chrome
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
  // the references hold the browser they were made with: another one draws text a little differently
  const made = `${browser.browserType().name()} ${browser.version()}`;
  const madeFile = path.join(REF, "BROWSER.txt");
  if (update) fs.writeFileSync(madeFile, `${made}\n`);
  else if (fs.existsSync(madeFile) && fs.readFileSync(madeFile, "utf8").trim() !== made) console.log(`⚠ the references were made with ${fs.readFileSync(madeFile, "utf8").trim()}, this run uses ${made}`);
  const cmp = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  const shots = SCREENS.filter((s) => !only.length || only.some((o) => s.name.includes(o)))
    .flatMap((s) => THEMES.flatMap((theme) => [{ s, theme, scrolled: false }, ...(s.scrolled ? [{ s, theme, scrolled: true }] : [])]));
  if (!shots.length) { console.error("no screen matches"); process.exit(2); }
  const rows = [];
  let failed = 0;
  for (const { s, theme, scrolled } of shots) {
    const id = `${s.name}-${theme}${scrolled ? "-scrolled" : ""}`;
    const refFile = path.join(REF, `${id}.png`);
    let png;
    try { png = await shoot(browser, server.base, s, theme, scrolled); } catch (e) { failed++; console.log(`✗ ${id}: ${e.message}`); rows.push({ id, verdict: `ошибка: ${e.message}` }); continue; }
    fs.writeFileSync(path.join(OUT, `${id}.now.png`), png);
    if (update || !fs.existsSync(refFile)) {
      if (!update) { failed++; console.log(`✗ ${id}: no reference (e2e/visual/ref/${id}.png) — run with --update after the founder approves`); rows.push({ id, verdict: "нет эталона" }); continue; }
      fs.writeFileSync(refFile, png);
      console.log(`↻ ${id}: reference written`);
      rows.push({ id, verdict: "эталон записан", ref: true });
      continue;
    }
    const r = await compare(cmp, fs.readFileSync(refFile), png);
    fs.copyFileSync(refFile, path.join(OUT, `${id}.ref.png`));
    if (r.diff) fs.writeFileSync(path.join(OUT, `${id}.diff.png`), r.diff);
    const pct = (r.ratio * 100).toFixed(3);
    const ok = !r.sizeDiffers && r.ratio <= RATIO;
    if (!ok) failed++;
    console.log(`${ok ? "✓" : "✗"} ${id}: ${r.sizeDiffers ? "size differs" : `${r.changed} px changed (${pct} %, limit ${RATIO * 100} %)`}`);
    rows.push({ id, verdict: r.sizeDiffers ? "размер другой" : `${pct} % (${r.changed} px)`, ok, ref: true, diff: !!r.diff });
  }
  await browser.close();
  server.close();
  const cell = (f) => (fs.existsSync(path.join(OUT, f)) ? `<img src="${f}" width="260">` : "—");
  const html = `<!doctype html><meta charset="utf-8"><title>Visual guard</title><style>body{font:14px system-ui;background:#222;color:#eee;padding:16px}td{vertical-align:top;padding:6px}.bad{color:#ff6b6b}.ok{color:#7bd88f}</style>
<h1>Визуальный сторож · ${new Date().toISOString()}</h1><p>Порог: канал &gt; ${CHANNEL}, доля &gt; ${RATIO * 100} % — красный. Время снимков ${VISUAL_NOW}.</p><table>
<tr><th>снимок</th><th>итог</th><th>эталон</th><th>сейчас</th><th>разница</th></tr>
${rows.map((r) => `<tr><td>${r.id}</td><td class="${r.ok === false ? "bad" : "ok"}">${r.verdict}</td><td>${cell(`${r.id}.ref.png`)}</td><td>${cell(`${r.id}.now.png`)}</td><td>${cell(`${r.id}.diff.png`)}</td></tr>`).join("\n")}
</table>`;
  fs.writeFileSync(path.join(OUT, "report.html"), html);
  console.log(`\nreport: ${path.relative(process.cwd(), path.join(OUT, "report.html"))}`);
  console.log(failed ? `\n${failed} of ${shots.length} visual shots FAILED` : `\nALL ${shots.length} VISUAL SHOTS ${update ? "WRITTEN" : "MATCH"}`);
  process.exit(failed ? 1 : 0);
})();
