/**
 * The picture run (#2312 п.1): one test per screen of e2e/screens.cjs in the project's width and theme; the picture is
 * compared with the base (playwright.visual.config.cjs). Same demo, same seed and same moment as the layout run.
 * С1 ДАНО база картинок КОГДА экран открыт ТОГДА он не отличается от базы ни на пиксель (threshold — цвет).
 */
const { test, expect } = require("@playwright/test");
const { SCREENS } = require("../screens.cjs");
const MOMENT = new Date("2026-11-20T20:00:00Z");
const name = (s) => `layout${s.replace(/[/?=&]/g, "_")}.png`;

test.beforeEach(async ({ page }, info) => {
  const theme = info.project.metadata.theme;
  // the public pages (/f/, /p/) ask the hosted server: with no network the answer is the same every time
  await page.route(/supabase\.co/, (r) => r.abort());
  await page.clock.install({ time: MOMENT });
  await page.addInitScript((th) => {
    localStorage.setItem("octo.lang.v1", JSON.stringify("ru"));
    localStorage.setItem("octo.role.v1", JSON.stringify("director"));
    localStorage.setItem("octo.theme.v1", JSON.stringify(th));
    localStorage.setItem("octo.hints.v1", JSON.stringify(["today", "company", "clients", "estimate-builder", "inbox", "triage", "money", "jobs", "team", "catalog", "plan"]));
  }, theme);
});

for (const s of SCREENS) {
  test(s, async ({ page }) => {
    await page.goto(s);
    // waits for what is checked, not for seconds: the launch layer is gone, the fonts are in; toHaveScreenshot itself
    // retries until two pictures in a row are the same
    await expect(page.locator('[data-testid="boot-layer"], [data-testid="boot-leaving"]')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await expect(page).toHaveScreenshot(name(s));
  });
}
