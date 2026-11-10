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

// «Готово» (#698): the drawing saved → «Просмотр замера»; waits until the review is up
async function openView(p) {
  await p.getByTestId("draw-done").locator("visible=true").first().getByRole("button").click();
  await p.getByTestId("view-screen").locator("visible=true").first().waitFor({ timeout: 8000 });
}

// a button where it stays: a screen that has just come in can still be sliding, and a press on a button that moves under
// the finger is cancelled (no press at all — 152 / 222 on GitHub and under load, about 1 run in 40). Wait for two equal
// boxes in a row, then press.
async function pressWhenStill(btn) {
  let box = null;
  for (let i = 0; i < 40; i++) {
    const now = await btn.boundingBox();
    if (now && box && now.x === box.x && now.y === box.y && now.width === box.width) break;
    box = now;
    await btn.page().waitForTimeout(100);
  }
  await btn.click();
}

// «Править чертёж» on the review → back on the canvas
async function backToCanvas(p) {
  await pressWhenStill(p.getByTestId("view-edit").locator("visible=true").first().getByRole("button"));
  await p.getByTestId("draw-surface").locator("visible=true").first().waitFor({ timeout: 8000 });
  await p.getByTestId("view-screen").locator("visible=true").first().waitFor({ state: "detached", timeout: 8000 });
}

// the total is on the review now, not under the drawing (#700): «Готово», read it, «Править чертёж» — the canvas again
async function viewTotal(p) {
  await openView(p);
  const tot = p.getByTestId("view-total").locator("visible=true");
  const total = (await tot.count()) ? Number((await tot.first().innerText()).replace(/[^\d.]/g, "")) : 0;
  const test = (await p.getByTestId("view-test-prices").locator("visible=true").count()) > 0;
  await backToCanvas(p);
  return { total, test };
}

module.exports = { skipLength, closeDsMenu, canvasAt, sheetGone, openView, backToCanvas, viewTotal, pressWhenStill };
