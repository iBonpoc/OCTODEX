/**
 * e2e 511 — #2155 (founder 18.11: «нажать на позицию — появляется меню „Монтаж gutters, создать позицию“. И всё, она
 * создалась и не спросила меня цену»). Every view.
 * - «Цены и прайс»: a work row with no item → its sheet → «Создать позицию» → the sheet leaves, the item is made AND its
 *   «Цена» sheet opens at once (the card behind it is found); «Сохранить» there sets the price;
 * - a part row the same way.
 * Finds things by testID and the store; waits on what it checks.
 */
const { sheetGone } = require("../sheet.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  // labor — «gpr-miss-labor.…»; a part — any other «gpr-miss-…»
  const firstMissing = (prefix) =>
    p.locator(prefix ? `[data-testid^="gpr-miss-${prefix}"]` : '[data-testid^="gpr-miss-"]:not([data-testid^="gpr-miss-labor."])').locator("visible=true").first().evaluate((e) => e.getAttribute("data-testid").slice("gpr-miss-".length));
  const made = (key) =>
    p.waitForFunction(([k, part]) => {
      const db = (JSON.parse(localStorage.getItem(k) || "null") || {}).db || {};
      return (db.catalog || []).length > 0 && !!document.querySelector(`[data-testid="gpr-found-${part}"], [data-testid="gpr-test-${part}"]`);
    }, [KEY, key], { timeout: 8000 });

  await h.seed("octo.role.v1", "director");
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Без срока/ }).waitFor({ timeout: 5000 });
  await h.go("/module/gutters/prices");
  await tid("gpr-screen").waitFor({ timeout: 5000 });

  for (const [prefix, what] of [["labor.", "a work row"], ["", "a part row"]]) {
    const key = await firstMissing(prefix);
    await p.locator(`[data-testid="gpr-miss-${key}"]`).locator("visible=true").first().click();
    await tid("gpr-bind").waitFor({ timeout: 5000 });
    if (!prefix) await h.shot("bind");
    await tid("gpr-bind-make").getByRole("button").click();
    // the item is made and its «Цена» opens by itself — no second tap on the card
    await tid("qp-sheet").waitFor({ timeout: 8000 }).catch(() => h.expect(false, `${what}: «Создать позицию» opens its «Цена» at once`));
    await made(key).catch(() => h.expect(false, `${what}: the item is made (${key})`));
    if (!prefix) await h.shot("price");
    await tid("qp-save").getByRole("button").click();
    await sheetGone(p);
    h.expect((await tid("qp-sheet").count()) === 0, `${what}: «Сохранить» closes the sheet`);
  }
};
