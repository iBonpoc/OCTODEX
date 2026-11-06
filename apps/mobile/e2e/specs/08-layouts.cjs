/** Every screen (all routes in src/app) at 390 / 820 / 1280 in dark and light: no horizontal overflow; screenshots in e2e/out. */
const SCREENS = [
  "/today", "/figures/leads?period=month", "/triage", "/leads", "/visits", "/plan", "/messages", "/calls", "/clients", "/notifications",
  "/lead/l1", "/lead/new", "/client/c1", "/property/p1", "/client/edit?id=c1", "/client/edit",
  "/estimate/new?id=e6", "/estimate/e5", "/estimate/signature", "/estimates", "/p/demo0handyman0estimate0000000001",
  "/jobs", "/job/j1", "/job/new", "/job/schedule?jobId=j1", "/visit/v1",
  "/money", "/invoice/i5", "/receipt/pay5", "/expense/new",
  "/catalog", "/catalog/cat-haul", "/company", "/company/profile", "/company/schedule", "/company/licenses", "/company/trades", "/team", "/settings",
];
/**
 * Screens already on the new list cards (step 10а, docs/specs/06-list-cards.md): also checked for straight edges and equal
 * rows (e2e/cardsAlignment.cjs). Every PR that moves a list to ListCard adds its screen here.
 */
const CARD_SCREENS = [{ path: "/clients", search: "Имя, телефон или адрес" }, { path: "/leads", search: "Имя, телефон, адрес, услуга" }, { path: "/estimates", reference: (p) => p.getByRole("radiogroup").first(), min: 1 }, { path: "/money", reference: (p) => p.getByRole("radiogroup").first(), min: 1 }, { path: "/catalog", search: "Поиск в каталоге" }, { path: "/jobs", reference: (p) => p.getByRole("radiogroup").first(), min: 1 }, { path: "/figures/leads?period=month", reference: (p) => p.locator('[data-testid="list-card"]').first(), min: 1 }];
const { checkCardAlignment } = require("../cardsAlignment.cjs");
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
        const cards = CARD_SCREENS.find((x) => x.path === s);
        if (cards) {
          const fake = { page: p, layout: { width }, expect: (ok, msg) => { if (!ok) errs.push(`alignment ${s} ${width} ${theme}: ${msg}`); } };
          await checkCardAlignment(fake, { searchPlaceholder: cards.search, reference: cards.reference, min: cards.min });
        }
        if (width === 390 || s === "/today") await p.screenshot({ path: require("node:path").join(__dirname, "..", "out", `layout-${theme}-${width}${s.replace(/[/?=&]/g, "_")}.png`) });
      }
      await ctx.close();
      if (errs.length) throw new Error(errs.join("\n"));
    }
  }
};
