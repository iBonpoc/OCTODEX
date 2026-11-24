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
  // «Каталог» is one of the four add buttons over the lines (2×2, wave 1 п.6) — and in the empty estimate's card the same four
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
 * the open line), else its body (a mouse drags it after a move of `gesture.dragStart`). `menu` — the line's actions: a long press of the line's
 * face — the open line's head or the folded row (a mouse; a finger's hold is the drag — e2e cannot show that, rule 27).
 */
exports.grip = async (h, key) => {
  const hd = vis(h, `[data-testid="sort-handle-${key}"]`).first();
  if (await hd.count()) return hd;
  return vis(h, `[data-testid="sort-row-${key}"]`).first();
};
exports.menu = async (h, id) => {
  {
    // a long press (a mouse): the row must stand still under the pointer (a row that moves while held cancels the press), the
    // mouse stays down until the row's own menu shows (the hold time is the app's, `motion.longPressMs`, not a number here),
    // then lets go (no retry: a hold that does not open the menu is a failure)
    // an open line (#2421) is held by its head — its folded face, `est-collapse-<id>`; a folded line by its row
    const head = vis(h, `[data-testid="est-collapse-${id}"]`).first();
    const row = (await head.count()) ? head : vis(h, `[data-testid="est-line-${id}"]`).first();
    const mine = vis(h, `[data-testid^="est-act-"][data-testid$="-${id}"]`).first();
    {
      await row.scrollIntoViewIfNeeded();
      await row.evaluate(
        (el) =>
          new Promise((done) => {
            let last = "";
            let same = 0;
            const tick = () => {
              const r = el.getBoundingClientRect();
              const now = [r.x, r.y, r.width, r.height].join();
              same = now === last ? same + 1 : 0;
              last = now;
              same >= 3 ? done(null) : requestAnimationFrame(tick);
            };
            tick();
          }),
      );
      const b = await row.boundingBox();
      await h.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await h.page.mouse.down();
      await mine.waitFor({ timeout: 3000 }).finally(() => h.page.mouse.up());
    }
  }
  await vis(h, '[data-testid="menu-items"]').first().waitFor({ timeout: 3000 });
};
/** «＋ Раздел» — one of the four add buttons over the lines (2×2, wave 1 п.6) */
exports.addSection = async (h) => {
  await vis(h, '[data-testid="est-add-section"]').first().getByRole("button").click();
};
/** «Добавить вариант» is in the editor's «⋯» (a rare way to add; v2: one option shows no options card — the card comes with the second) */
exports.addOption = async (h) => exports.editorMenu(h, "est-add-option");

/**
 * «Сохранить и отправить» of the builder (v2 #2350): the bar's one step is «Готово»; sending is an item of the header's «⋯»
 * (`est-menu` → `ue-save-send`), by testID (rule 19). Waits for the menu to be gone (the item runs after it, menuPick).
 */
exports.saveSend = async (h) => exports.editorMenu(h, "ue-save-send");

/**
 * An item of the builder header's «⋯» (`est-menu`, v2 #2350) by its testID: «Сохранить и отправить» (`ue-save-send`), «Расставить»
 * (`est-group-by-kind`), «Подробно» (`est-row-view`, a check item: a press flips «Кратко ↔ Подробно»), «Экран клиента»
 * (`est-menu-client`). Waits for the menu to be gone (the item runs after it, menuPick).
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

/**
 * The bar «Итого · Готово» whole, not the capsule (#2363 q72 folds it on a scroll down): the page to its top — at the top the bar is
 * always whole (`foldStep`: y ≤ 0) — and «Готово» on the screen. Not a click on the capsule: the capsule is animated (it comes in, it
 * goes out with the scroll) and a click waits for it to stand still — CI 24.11 (main 0b60f0a, 01 @390 light) waited 30 s.
 */
exports.wholeBar = async (h) => {
  await h.page.evaluate(() => {
    // the page's scroller: the first parent that scrolls (the bar is fixed — start from the list)
    let e = document.querySelector('[data-testid^="est-line-"]') ?? document.body;
    while (e && !(e.scrollHeight > e.clientHeight + 50)) e = e.parentElement;
    if (e) e.scrollTop = 0;
  });
  await vis(h, '[data-testid="ue-save"]').first().waitFor({ timeout: 5000 });
};
