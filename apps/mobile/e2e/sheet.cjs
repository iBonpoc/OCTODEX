// Sheets, menus and Esc in e2e (#617, docs/ai/CHECKS.md §10 п.5). 18 of 41 red runs (07–09.11) were a key or a tap that
// met a sheet still opening or still leaving: Esc in the first frames of a sheet does not reach it (react-native-web closes
// a Modal on keyup), a tap right after a sheet closed lands on the leaving sheet, and a swallowed wait (`.catch(() => {})`)
// let the spec run on as if it were gone. The guard test/e2eSheetGuard.test.ts lets specs press Esc only through these.
const MODAL = '[aria-modal="true"]';

// no sheet or menu layer is on the screen (a layer of height 0 is one already gone). Throws when one stays — never swallow.
async function sheetGone(p, timeout = 5000) {
  await p.waitForFunction((sel) => ![...document.querySelectorAll(sel)].some((e) => e.getBoundingClientRect().height > 0), MODAL, { timeout });
}

// the element itself (not a locator: a locator like `.last()` would move to the sheet below once the top one closes)
async function pin(p, target, what) {
  const loc = target ?? p.locator(MODAL).last();
  await loc.waitFor({ state: "visible", timeout: 5000 }).catch(() => {
    throw new Error(`${what}: nothing open to close`);
  });
  return loc.elementHandle();
}
const goneFn = (el) => !el.isConnected || el.getBoundingClientRect().height === 0;

/**
 * Esc until the sheet or menu is gone: the top sheet by default, or `target` (a locator of what must close — a menu).
 * Presses again only while it is still there (an Esc in its first frames is lost); throws when it stays.
 */
async function pressEscUntilClosed(p, target, { tries = 3, timeout = 3000 } = {}) {
  const el = await pin(p, target, "pressEscUntilClosed");
  for (let i = 0; i < tries; i++) {
    await p.keyboard.press("Escape");
    if (await waited(p.waitForFunction(goneFn, el, { timeout }))) return;
  }
  throw new Error(`pressEscUntilClosed: still open after ${tries} × Esc`);
}

// closes the top sheet by its own «Закрыть» when it has one, else by Esc; returns when it is gone
async function closeSheet(p, { timeout = 5000 } = {}) {
  const top = p.locator(MODAL).last();
  const el = await pin(p, top, "closeSheet");
  const close = top.getByRole("button", { name: "Закрыть", exact: true }).locator("visible=true");
  if ((await close.count()) === 0) return pressEscUntilClosed(p, top);
  await close.first().click();
  await p.waitForFunction(goneFn, el, { timeout });
}

// Esc meant for the page (close the side panel, step back): only once no sheet is open — else a sheet would eat it
async function escOnPage(p) {
  await sheetGone(p);
  await p.keyboard.press("Escape");
}

// a wait that a check reads: `h.expect(await waited(x.waitFor()), "…")` — the failure says what was missing
const waited = (promise) => promise.then(() => true, () => false);

// A sheet just closed may still lie over the canvas for a moment (slow machines, GitHub 09.11: a drag or a tap right
// after it landed on the leaving sheet). Waits until the point (page px) is the canvas itself — what the next tap needs.
async function canvasAt(p, x, y, timeout = 5000) {
  await p.waitForFunction(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py);
      return !!el && !!el.closest('[data-testid="draw-surface"]');
    },
    [x, y],
    { timeout },
  );
}

module.exports = { MODAL, sheetGone, pressEscUntilClosed, closeSheet, escOnPage, waited, canvasAt };
