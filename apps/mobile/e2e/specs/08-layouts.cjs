/** Every screen (all routes in src/app) at 390 / 820 / 1280 in dark and light: no horizontal overflow; screenshots in e2e/out. */
const SCREENS = [
  "/today", "/figures/leads?period=month", "/triage", "/leads", "/visits", "/plan", "/messages", "/messages/c-c1", "/calls", "/tasks", "/clients", "/more", "/notifications", "/search?q=mitchell",
  "/lead/l1", "/lead/new", "/client/c1", "/property/p1", "/client/edit?id=c1", "/client/edit", "/client/import", "/client/imports",
  "/module/gutters/bench", "/module/gutters/draw", "/module/gutters/list", "/module/gutters/start?customer=c1", "/module/gutters/view", "/module/gutters/settings", "/module/gutters/prices", "/estimate/new?id=e6", "/estimate/e5", "/estimate/signature", "/estimates", "/p/demo0handyman0estimate0000000001", "/f/f00000000000000000000000000000000",
  "/jobs", "/job/j1", "/job/new", "/job/schedule?jobId=j1", "/visit/v1",
  "/money", "/invoice", "/invoice?f=paid", "/payments", "/reports", "/reports/owed", "/reports/collected?p=all", "/reports/sales", "/reports/sources?p=all", "/reports/categories?p=all", "/invoice/i5", "/receipt/pay5", "/expense/new",
  "/catalog", "/catalog/cat-haul", "/suppliers", "/suppliers/sup-hd", "/purchase-orders", "/purchase-order/po-demo-1", "/company", "/settings/design-system", "/settings/design-system/base", "/settings/design-system/buttons", "/settings/design-system/selectors", "/settings/design-system/windows", "/settings/design-system/notices", "/settings/design-system/motion", "/settings/design-system/haptics", "/settings/design-system/rows", "/settings/design-system/spacing", "/company/profile", "/company/schedule", "/company/leads", "/company/intake", "/company/payments", "/company/modules", "/company/checklists", "/company/checklist/tpl-job", "/estimate/templates", "/company/licenses", "/company/trades", "/team", "/settings", "/settings/profile", "/settings/delete-account", "/auth/trade", "/auth/terms", "/legal/terms", "/legal/privacy", "/help", "/auth/invite?token=a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
];
/** screens that redirect by design: screen → the path it ends on (empty: nothing yet — filled from the first run, #800) */
const REDIRECTS = {};
/** a screen's words for a record or page that is missing (the app shows them instead of a crash) */
const NOT_THERE = /не найден[аоы]?|не существует|Такого документа нет|not found|doesn't exist|404/i;
/** screens where such words are by design (an empty search, an empty list) */
const NOT_THERE_OK = [
  "/module/gutters/view", // no measurement id: this IS the «не найден» state of the review, and its layout is what is checked
];
/** screens without the app header (public pages) */
const NO_HEADER = [
  "/module/gutters/draw", // the drawing canvas fills the whole screen
  "/p/demo0handyman0estimate0000000001", // public client pages have their own page, not the app's header
  "/f/f00000000000000000000000000000000",
];
/**
 * Screens already on the new list cards (step 10а, docs/specs/06-list-cards.md): also checked for straight edges and equal
 * rows (e2e/cardsAlignment.cjs). Every PR that moves a list to ListCard adds its screen here.
 */
const CARD_SCREENS = [{ path: "/clients", reference: (p) => p.getByTestId("filter-bar").locator("visible=true").first() }, { path: "/leads", reference: (p) => p.getByTestId("filter-bar").locator("visible=true").first() }, { path: "/estimates", reference: (p) => p.getByTestId("filter-bar").locator("visible=true").first(), min: 1 }, { path: "/invoice", reference: (p) => p.getByTestId("filter-bar").locator("visible=true").first(), min: 1 }, { path: "/money", reference: (p) => p.locator('[data-testid="list-card"]').first(), min: 1 }, { path: "/catalog", reference: (p) => p.getByTestId("filter-bar").locator("visible=true").first() }, { path: "/jobs", reference: (p) => p.getByTestId("filter-bar").locator("visible=true").first(), min: 1 }, { path: "/figures/leads?period=month", reference: (p) => p.locator('[data-testid="list-card"]').first(), min: 1 }];
const { checkCardAlignment } = require("../cardsAlignment.cjs");
/** loops over all requested layouts itself (one browser context per layout) */
exports.ownLayouts = true;
exports.run = async (h, { browser, BASE, layouts, installClock }) => {
  for (const { theme, width } of layouts) {
    {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: "reduce" });
      await installClock(ctx);
      await ctx.addInitScript((th) => {
        localStorage.setItem("octo.lang.v1", JSON.stringify("ru")); localStorage.setItem("octo.role.v1", JSON.stringify("director"));
        localStorage.setItem("octo.theme.v1", JSON.stringify(th)); localStorage.setItem("octo.hints.v1", JSON.stringify(["today", "company", "clients", "estimate-builder", "inbox", "money", "jobs", "team", "catalog", "plan"]));
      }, theme);
      const p = await ctx.newPage();
      const errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      let cur = "";
      // the public intake page /f/ asks the hosted server for its form (a real network call; from 127.0.0.1 the browser blocks
      // the answer by CORS, and the message arrives after the page is left): those errors are the test environment's, not
      // the page's — an error about any other address counts
      p.on("console", (m) => {
        if (m.type() !== "error") return;
        if (/supabase\.co/.test(m.text() + (m.location().url || ""))) return;
        errs.push(`console error on ${cur}: ${m.text().slice(0, 200)}`);
      });
      for (const s of SCREENS) {
        cur = s;
        await p.goto(BASE + s); await p.waitForTimeout(700);
        // #800 (D-03): a screen that is not there must not pass for "no overflow" — a wrong route redirects to the role's home,
        // a missing record says so in words, and every app screen has the header with the version label
        const here = new URL(p.url());
        const want = s.split("?")[0];
        if (here.pathname !== want && !REDIRECTS[s]) errs.push(`${s} ${width} ${theme}: opened ${here.pathname}${here.search} instead (a wrong route? add it to REDIRECTS only if the redirect is by design)`);
        const body = await p.locator("body").innerText();
        const missing = body.match(NOT_THERE);
        if (missing && !NOT_THERE_OK.includes(s)) errs.push(`${s} ${width} ${theme}: the screen says «${missing[0]}»`);
        if (!/OCTODEX v\d/.test(body) && !NO_HEADER.includes(s)) errs.push(`${s} ${width} ${theme}: no header with the version label`);
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
