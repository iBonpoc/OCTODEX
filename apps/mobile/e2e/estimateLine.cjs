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

/**
 * «Отменить» of the toast (by testID): it works a moment after the toast shows (a double tap is not an undo), so press until
 * the toast is gone, then answer whether the thing is back — no fixed pause, it waits for what it checks.
 */
exports.undo = async (h) => {
  const btn = h.page.getByTestId("toast-undo").locator("visible=true");
  for (let i = 0; i < 10 && (await btn.count()) > 0; i++) {
    await btn.last().click();
    if (await h.page.waitForFunction(() => document.querySelectorAll('[data-testid="toast-undo"]').length === 0, null, { timeout: 400 }).then(() => true, () => false)) return true;
  }
  return (await btn.count()) === 0;
};

/**
 * A held row is carried by where IT is, not by where the pointer is (DS §14.6): when the list folds and the page cannot scroll,
 * the row stands on its own place in the list and the pointer is off it by the rest. `carry` moves the pointer so the held row's
 * middle comes to `y` (window coordinates); `pointerY` — where the pointer is now. Returns the pointer's new y.
 */
exports.carry = async (h, key, x, pointerY, y) => {
  const id = key.replace(/^l:/, "");
  const r = await h.page.evaluate((k) => {
    // (a row that is going away may still be in the page for a moment, with no size: the one that is seen)
    const b = [...document.querySelectorAll(`[data-testid="sort-row-l:${k}"]`)].map((e) => e.getBoundingClientRect()).find((x) => x.height > 0);
    return b ? b.top + b.height / 2 : null;
  }, id);
  const to = r === null ? y : pointerY + (y - r);
  await h.page.mouse.move(x, to, { steps: 12 });
  return to;
};
