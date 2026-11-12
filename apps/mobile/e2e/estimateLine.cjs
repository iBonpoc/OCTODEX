/**
 * Adding a line to the estimate builder (РС-4b-1): the row opens in place (DS §8.3), no sheet. Every spec that builds an
 * estimate by hand goes through these two — they find by testID, not by words (rule 19).
 */
const vis = (h, sel) => h.page.locator(sel).locator("visible=true");

/** «Новая позиция»: a name and a price (the quantity stays 1), the row folded */
exports.addCustom = async (h, name, price, qty) => {
  await h.page.getByTestId("est-add-new").locator("visible=true").first().getByRole("button").click();
  await vis(h, '[data-testid^="est-name-"]').first().locator("input").fill(name);
  if (qty !== undefined) await vis(h, '[data-testid^="est-qty-"]').first().locator("input").fill(String(qty));
  await vis(h, '[data-testid^="est-price-"]').first().locator("input").fill(String(price));
  await exports.fold(h);
};

/** «Из каталога»: search, pick the thing (one thing opens its row, the cursor in the quantity), the quantity, the row folded */
exports.addCatalog = async (h, search, item, qty) => {
  await h.page.getByTestId("est-add-catalog").locator("visible=true").first().getByRole("button").click();
  await h.sheet().locator("input").first().fill(search);
  await h.sheet().getByText(item).first().click();
  if (qty !== undefined) {
    await vis(h, '[data-testid^="est-qty-"]').first().locator("input").fill(String(qty));
  }
};

/** the open row folds (what is typed stays) */
exports.fold = async (h) => {
  await vis(h, '[data-testid^="est-collapse-"]').first().getByRole("button").click();
  await h.page.waitForFunction(() => document.querySelectorAll('[data-testid^="est-collapse-"]').length === 0, null, { timeout: 3000 });
};
