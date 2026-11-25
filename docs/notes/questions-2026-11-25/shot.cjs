// node shot.cjs <jobs.json>  — jobs: [{name, path, theme?, steps?: [{click?:testID|text, text?:string, wait?:ms, scroll?:px}], full?:bool}]
// Serves apps/mobile/dist with SPA fallback, demo mode, ru, director. Output: scratchpad/shots/<name>-<theme>.png @390, dpr 2.
const path = require("node:path");
const fs = require("node:fs");
const APP = "/home/user/OCTODEX/apps/mobile";
const { serveDist } = require(path.join(APP, "e2e/serve.cjs"));
const { chromium } = require(require.resolve("playwright", { paths: [APP] }));
const OUT = path.join(__dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });
const jobs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
(async () => {
  const server = await serveDist(path.resolve(APP, process.env.DIST || "dist"));
  const browser = await chromium.launch();
  for (const j of jobs) {
    for (const theme of j.themes || ["light"]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: j.height || 844 }, deviceScaleFactor: 2, colorScheme: theme });
      await ctx.addInitScript((o) => {
        if (localStorage.getItem("octo.lang.v1")) return;
        localStorage.setItem("octo.lang.v1", JSON.stringify("ru"));
        localStorage.setItem("octo.role.v1", JSON.stringify(o.role));
        localStorage.setItem("octo.theme.v1", JSON.stringify(o.theme));
        localStorage.setItem("octo.hints.v1", JSON.stringify(["today", "company", "clients", "estimate-builder", "inbox", "triage", "money", "jobs", "team", "catalog", "plan", "visits"]));
      }, { theme, role: j.role || "director" });
      const page = await ctx.newPage();
      try {
        await page.goto(server.base + j.path, { waitUntil: "networkidle" });
        await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 0, null, { timeout: 20000 });
        await page.waitForTimeout(3500);
        for (const s of j.steps || []) {
          if (s.click) {
            const loc = s.click.startsWith("text=") ? page.getByText(s.click.slice(5), { exact: false }).first() : page.getByTestId(s.click).first();
            await loc.click({ timeout: 8000 });
          }
          if (s.scroll) await page.mouse.wheel(0, s.scroll);
          await page.waitForTimeout(s.wait || 900);
        }
        const f = path.join(OUT, `${j.name}-${theme}.png`);
        await page.screenshot({ path: f, fullPage: !!j.full });
        console.log("ok", f, page.url());
      } catch (e) {
        console.log("FAIL", j.name, theme, String(e).slice(0, 200));
        await page.screenshot({ path: path.join(OUT, `${j.name}-${theme}-FAIL.png`) }).catch(() => {});
      }
      await ctx.close();
    }
  }
  await browser.close();
  server.close?.();
  process.exit(0);
})();
