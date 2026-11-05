/** Every screen (all routes in src/app) at 390 / 820 / 1280 in dark and light: no horizontal overflow; screenshots in e2e/out. */
const SCREENS = [
  "/today", "/figures/leads?period=month", "/triage", "/inbox", "/visits", "/plan", "/clients", "/more",
  "/lead/l1", "/lead/new", "/client/c1", "/property/p1", "/client/edit?id=c1", "/client/edit",
  "/estimate/new?id=e6", "/estimate/e5", "/estimates", "/p/demo0handyman0estimate0000000001",
  "/jobs", "/job/j1", "/job/schedule?jobId=j1", "/visit/v1",
  "/money", "/invoice/i5", "/receipt/pay5", "/expense/new",
  "/catalog", "/catalog/cat-haul", "/company", "/company/profile", "/company/licenses", "/company/trades", "/team", "/settings",
];
/** loops over all requested layouts itself (one browser context per layout) */
exports.ownLayouts = true;
exports.run = async (h, { browser, BASE, layouts }) => {
  for (const { theme, width } of layouts) {
    {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      await ctx.addInitScript((th) => {
        localStorage.setItem("octo.lang.v1", JSON.stringify("ru")); localStorage.setItem("octo.role.v1", JSON.stringify("director"));
        localStorage.setItem("octo.theme.v1", JSON.stringify(th)); localStorage.setItem("octo.hints.v1", JSON.stringify(["today", "company", "clients", "estimate-builder", "inbox", "money", "jobs", "team", "catalog", "plan"]));
      }, theme);
      const p = await ctx.newPage();
      const errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      for (const s of SCREENS) {
        await p.goto(BASE + s); await p.waitForTimeout(700);
        const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (over) errs.push(`horizontal overflow ${s} ${width} ${theme}`);
        if (width === 390 || s === "/today") await p.screenshot({ path: require("node:path").join(__dirname, "..", "out", `layout-${theme}-${width}${s.replace(/[/?=&]/g, "_")}.png`) });
      }
      await ctx.close();
      if (errs.length) throw new Error(errs.join("\n"));
    }
  }
};
