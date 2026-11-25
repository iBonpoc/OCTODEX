// node shot2.cjs <jobs.json> — like shot.cjs plus: pre (JS body with `raw` = octo.db.v5 object; mutate it), role after pre (postRole),
// steps: click (testID | text=...), btn (testID → its role=button), menu (testID of a menu item, visible), eval (JS string),
// scrollTo (testID), fill {id,value}, wait; shot: {el: testID} element-only, or clipTop/clipH. Output shots/<name>-<theme>.png
const path = require("node:path");
const fs = require("node:fs");
const APP = "/home/user/OCTODEX/apps/mobile";
const { serveDist } = require(path.join(APP, "e2e/serve.cjs"));
const { chromium } = require(require.resolve("playwright", { paths: [APP] }));
const OUT = path.join(__dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });
const jobs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const only = process.argv[3];
(async () => {
  const server = await serveDist(path.resolve(APP, process.env.DIST || "dist"));
  const browser = await chromium.launch();
  for (const j of jobs) {
    if (only && !j.name.includes(only)) continue;
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
      const vis = (id) => page.getByTestId(id).locator("visible=true").first();
      const settle = async () => { await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 0, null, { timeout: 20000 }); await page.waitForTimeout(3000); };
      try {
        if (j.pre) {
          await page.goto(server.base + "/more", { waitUntil: "networkidle" });
          await settle();
          await page.evaluate(([body, role]) => {
            const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
            new Function("raw", body)(raw);
            localStorage.setItem("octo.db.v5", JSON.stringify(raw));
            if (role) localStorage.setItem("octo.role.v1", JSON.stringify(role));
          }, [j.pre, j.postRole]);
        }
        await page.goto(server.base + j.path, { waitUntil: "networkidle" });
        await settle();
        for (const s of j.steps || []) {
          if (s.click) {
            const loc = s.click.startsWith("text=") ? page.getByText(s.click.slice(5), { exact: false }).locator("visible=true").first() : vis(s.click);
            await loc.click({ timeout: 8000 });
          }
          if (s.sel) await page.locator(s.sel).locator("visible=true").first().click({ timeout: 8000 });
          if (s.role) await page.getByRole(s.role.role, { name: s.role.name }).locator("visible=true").last().click({ timeout: 8000 });
          if (s.btn) await vis(s.btn).getByRole("button").first().click({ timeout: 8000 });
          if (s.eval) await page.evaluate(s.eval);
          if (s.scrollTo) await vis(s.scrollTo).evaluate((e, b) => e.scrollIntoView({ block: b }), s.block || "start");
          if (s.fill) await vis(s.fill.id).locator("input").first().fill(s.fill.value);
          if (s.scroll) await page.mouse.wheel(0, s.scroll);
          if (s.scrollEnd || s.scrollBy) await page.evaluate((by) => { const els=[...document.querySelectorAll("*")].filter(e=>{const o=getComputedStyle(e).overflowY;return (o==="auto"||o==="scroll")&&e.scrollHeight>e.clientHeight+2&&e.clientWidth>300;}); els.sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight)); const e=els[0]; if(e) e.scrollTop = by==null ? e.scrollHeight : e.scrollTop+by; }, s.scrollBy ?? null);
          if (s.outline) await page.evaluate((id) => { const e=[...document.querySelectorAll(`[data-testid="${id}"]`)].find(x=>x.offsetParent); if(e){ e.style.outline="4px solid #E5484D"; e.style.outlineOffset="4px"; e.style.borderRadius=e.style.borderRadius||"16px"; } }, s.outline);
          if (s.key) await page.keyboard.press(s.key);
          await page.waitForTimeout(s.wait || 900);
        }
        if (j.tall) {
          const extra = await page.evaluate(() => { const els=[...document.querySelectorAll("*")].filter(e=>{const o=getComputedStyle(e).overflowY;return (o==="auto"||o==="scroll")&&e.scrollHeight>e.clientHeight+2&&e.clientWidth>300;}); return Math.max(0,...els.map(e=>e.scrollHeight-e.clientHeight)); });
          await page.setViewportSize({ width: 390, height: (j.height || 844) + extra });
          await page.waitForTimeout(1500);
        }
        const f = path.join(OUT, `${j.name}-${theme}.png`);
        if (j.el) await vis(j.el).screenshot({ path: f });
        else await page.screenshot({ path: f, fullPage: !!j.full });
        console.log("ok", f, page.url());
      } catch (e) {
        console.log("FAIL", j.name, theme, String(e).slice(0, 300));
        await page.screenshot({ path: path.join(OUT, `${j.name}-${theme}-FAIL.png`) }).catch(() => {});
      }
      await ctx.close();
    }
  }
  await browser.close();
  server.close?.();
  process.exit(0);
})();
