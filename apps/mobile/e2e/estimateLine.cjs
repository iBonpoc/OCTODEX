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
  // #2387 (С4): an empty estimate has «Каталог» in its card; with lines it is in the «˅» menu beside «＋ Позиция»
  const menu = h.page.getByTestId("est-add-layers").locator("visible=true");
  if (await menu.count()) {
    await menu.first().getByRole("button").click();
    await h.page.getByTestId("est-add-catalog").locator("visible=true").first().click();
  } else await h.page.getByTestId("est-add-catalog").locator("visible=true").first().getByRole("button").click();
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
 * «Отменить» of the NEWEST toast (by testID): v2 keeps a stack of toasts, the newest on top (first in the page, `toastStack.ts`) —
 * an older toast's «Отменить» would take back an older action. It works a moment after the toast shows (a double tap is not an
 * undo), so press until that toast is gone, then answer whether it went — no fixed pause, it waits for what it checks.
 */
exports.undo = async (h) => {
  const btn = h.page.getByTestId("toast-undo").locator("visible=true");
  const n = await btn.count();
  for (let i = 0; i < 10 && (await btn.count()) >= n && n > 0; i++) {
    await btn.first().click();
    if (await h.page.waitForFunction((k) => document.querySelectorAll('[data-testid="toast-undo"]').length < k, n, { timeout: 400 }).then(() => true, () => false)) return true;
  }
  return n > 0 && (await btn.count()) < n;
};

/**
 * A held row is carried by where IT is, not by where the pointer is (DS §14.6): when the list folds and the page cannot scroll,
 * the row stands on its own place in the list and the pointer is off it by the rest. `carry` moves the pointer so the held row's
 * middle comes to `y` (window coordinates); `pointerY` — where the pointer is now. Returns the pointer's new y.
 */
exports.carry = async (h, key, x, pointerY, y) => {
  const id = key.replace(/^l:/, "");
  const mid = () => h.page.evaluate((k) => {
    // (a row that is going away may still be in the page for a moment, with no size: the one that is seen)
    const b = [...document.querySelectorAll(`[data-testid="sort-row-l:${k}"]`)].map((e) => e.getBoundingClientRect()).find((x) => x.height > 0);
    return b ? b.top + b.height / 2 : null;
  }, id);
  let at = pointerY;
  // the row follows the pointer a frame later and may stand off it by what the page could not scroll: read where the row came
  // to and correct (up to three times) until its middle is at `y`
  for (let i = 0; i < 3; i++) {
    const r = await mid();
    if (r === null) {
      if (i === 0) {
        await h.page.mouse.move(x, y, { steps: 12 });
        return y;
      }
      break;
    }
    if (i > 0 && Math.abs(r - y) < 4) break;
    at += y - r;
    await h.page.mouse.move(x, at, { steps: i === 0 ? 12 : 4 });
    // two frames: the row is drawn where the pointer took it
    await h.page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
  }
  return at;
};

/**
 * A handle is taken where a person takes it — in the middle of the screen, not at its bottom edge: a pointer that starts in the
 * edge zone scrolls the page while it moves away (DS §14.6), and the row would not land where the spec aims. A longer editor
 * (the options card, #1307 «г») put the last rows at the edge at 390.
 */
exports.toMiddle = async (h, loc) => {
  await loc.evaluate((el) => el.scrollIntoView({ block: "center" }));
  // the scroll event reaches the screen a frame later: wait two frames so the page stands
  await h.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};

/**
 * visual v2 №5 (#2344): a folded line has no «≡» and no «⋯». `grip` — what a line is taken by: its «≡» when it has one (a section,
 * the open line), else its body (a mouse drags it after a move of `gesture.dragStart`). `menu` — the line's actions: the open
 * line's «⋯», else a long press of the folded row (a mouse; a finger's hold is the drag — e2e cannot show that, rule 27).
 */
exports.grip = async (h, key) => {
  const hd = vis(h, `[data-testid="sort-handle-${key}"]`).first();
  if (await hd.count()) return hd;
  return vis(h, `[data-testid="sort-row-${key}"]`).first();
};
exports.menu = async (h, id) => {
  const more = vis(h, `[data-testid="est-menu-${id}"]`).first();
  if (await more.count()) await more.getByRole("button").click();
  else await vis(h, `[data-testid="est-line-${id}"]`).first().click({ delay: 700 });
  await vis(h, '[data-testid="menu-items"]').first().waitFor({ timeout: 3000 });
};
/** «Добавить раздел» is an item of the estimate's «⋯» (#2403: «˅» beside «＋ Позиция» is the ways to add a line only) */
exports.addSection = async (h) => exports.editorMenu(h, "est-add-section");
/** «Добавить вариант» — the same «⋯» while the estimate has one option (#2403; with two the card's «Вариант — копия» adds) */
exports.addOption = async (h) => exports.editorMenu(h, "est-add-option");
/** a line's delete is its trash (#2403: not in its «⋯» — the bin is on the row): the open row's, else the folded row's */
exports.trash = async (h, id) => {
  const open = vis(h, `[data-testid="est-trash-${id}"]`).first();
  if (await open.count()) return open.getByRole("button").click();
  await vis(h, `[data-testid="est-row-trash-${id}"]`).first().getByRole("button").click();
};

/** «Сохранить и отправить» of the builder: the header's round ➤ (`est-send-top`) — the one place to send (#2403, not in «⋯») */
exports.saveSend = async (h) => {
  await h.page.getByTestId("est-send-top").locator("visible=true").first().getByRole("button").click();
};

/**
 * An item of the builder header's «⋯» (`est-menu`, v2 #2350) by its testID (#2403): «Подробно» (`est-row-view`, a check item: a press flips
 * «Кратко ↔ Подробно»), «Скрыть себестоимость» (`est-menu-client`) │ «Добавить раздел» (`est-add-section`), «Добавить вариант»
 * (`est-add-option`), «Разложить по видам» (`est-layers-layout`). Waits for the menu to be gone (the item runs after it, menuPick).
 */
exports.editorMenu = async (h, item) => {
  const p = h.page;
  await p.getByTestId("est-menu").locator("visible=true").first().getByRole("button").first().click();
  await p.getByTestId(item).locator("visible=true").first().click();
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ state: "hidden", timeout: 3000 });
};
/** whether the header's «⋯» has the item (opens the menu, looks, closes it — pressEscUntilClosed) */
exports.editorMenuHas = async (h, item) => {
  const p = h.page;
  await p.getByTestId("est-menu").locator("visible=true").first().getByRole("button").first().click();
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ timeout: 3000 });
  const has = (await p.getByTestId(item).locator("visible=true").count()) > 0;
  await require("./sheet.cjs").pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  return has;
};
