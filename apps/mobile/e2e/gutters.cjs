// Gutters canvas: right after a gutter is drawn the «Длина желоба» sheet opens (feet focused, the drawn length in the
// fields). Tests that do not check the length press «Применить» — the drawn length stays («Отменить» takes the gutter away).
async function skipLength(p) {
  const skip = p.getByTestId("quick-length-apply").locator("visible=true").first();
  try {
    await skip.waitFor({ timeout: 2000 });
  } catch {
    return; // nothing was drawn (a stroke too short, a corner drag, read-only)
  }
  await skip.click();
  await p.getByTestId("quick-length").locator("visible=true").first().waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  await sheetGone(p);
}

// the sheet's own layer (the modal over the screen) is gone too — not only what was in it (GitHub 09.11: a stroke right
// after a sheet closed landed on the leaving sheet)
async function sheetGone(p) {
  await p.waitForFunction(() => ![...document.querySelectorAll('[aria-modal="true"]')].some((e) => e.getBoundingClientRect().height > 0), null, { timeout: 5000 }).catch(() => {});
}

// A downspout just put opens its menu by itself (founder 09.11): on the phone a sheet over the canvas — tests that go on
// drawing close it (the panel beside the canvas on 820/1280 does not cover it).
async function closeDsMenu(p) {
  const panel = p.getByTestId("attr-panel").locator("visible=true").first();
  try {
    await panel.waitFor({ timeout: 2000 });
  } catch {
    return;
  }
  if ((p.viewportSize()?.width ?? 0) > 390) return;
  await p.getByRole("button", { name: "Закрыть", exact: true }).first().click({ position: { x: 10, y: 10 } });
  await panel.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
}

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

module.exports = { skipLength, closeDsMenu, canvasAt, sheetGone };
