/**
 * e2e 461 — the toast over an open sheet (DS §15.2 «Место при открытой шторке», spec 56, #1869), every view, through the showcase
 * (Настройки → Дизайн-система → «Окна» → «Шторка с тостом»):
 * - «Удалить» in the sheet shows the toast «Отменить» over the sheet (the top thing at its point), above the sheet's «Сохранить»;
 * - «Отменить» brings the row back;
 * - the sheet closes while the toast is on: the same toast stays on the screen, without a new slide-in, and «Отменить» still works.
 * Motion is on (no reduce) for the hand-over: a toast that slid in again would move across frames. Finds things by testID.
 */
const { sheetGone } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const top = () => p.locator('[aria-modal="true"]').last();
  const frames = (n = 2) => p.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  await p.emulateMedia({ reducedMotion: "no-preference" });
  await h.go("/settings/design-system/windows");
  await vis("showcase-windows").waitFor({ timeout: 5000 });
  const open = async () => {
    await vis("showcase-sheet-toast").getByRole("button").first().click();
    await top().getByTestId("showcase-toast-row-1").waitFor({ timeout: 3000 });
  };
  // the toast's «Отменить»: the visible one, and is it the top element at its middle
  const undoAt = () => p.evaluate(() => {
    const u = [...document.querySelectorAll('[data-testid="toast-undo"]')].find((e) => e.offsetParent !== null);
    if (!u) return null;
    const f = [...document.querySelectorAll('[data-testid="sheet-footer"]')].find((e) => e.offsetParent !== null);
    const r = u.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { onTop: !!el && u.contains(el), y: Math.round(r.top), bottom: r.bottom, footerTop: f ? f.getBoundingClientRect().top : null };
  });
  // «Отменить» is armed only toastArmMs after the toast showed (ui/toastArm.ts): press until the row is back (no fixed sleep)
  const undoUntil = async (rowId) => {
    for (let i = 0; i < 40; i++) {
      await vis("toast-undo").click();
      const back = await p.getByTestId(rowId).locator("visible=true").count();
      if (back) return true;
      await frames(6);
    }
    return false;
  };

  // — in the sheet: the toast over it, above its footer; «Отменить» brings the row back
  await open();
  await top().getByTestId("showcase-toast-remove-2").click();
  await p.getByTestId("showcase-toast-row-2").waitFor({ state: "detached", timeout: 3000 });
  await vis("toast-undo").waitFor({ timeout: 3000 });
  await frames(16); // the slide-in (durBase) is over: what is measured is where it stands
  const over = await undoAt();
  h.expect(!!over && over.onTop, `«Отменить» is not covered by the sheet (${JSON.stringify(over)})`);
  h.expect(!!over && over.footerTop !== null && over.bottom <= over.footerTop, `the toast stands above the sheet's «Сохранить» (${JSON.stringify(over)})`);
  await h.shot("in-sheet");
  h.expect(await undoUntil("showcase-toast-row-2"), "«Отменить» brought the row back");
  await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="toast-undo"]')].some((e) => e.offsetParent !== null), null, { timeout: 7000 }); // the toast is gone (it closes on «Отменить»)

  // — the hand-over: remove, wait past the slide-in, close the sheet with «Сохранить» — the same toast on the screen, not sliding in again
  await top().getByTestId("showcase-toast-remove-3").click();
  await p.getByTestId("showcase-toast-row-3").waitFor({ state: "detached", timeout: 3000 });
  await vis("toast-undo").waitFor({ timeout: 3000 });
  await frames(20); // longer than durBase: the toast is no longer fresh
  // every frame from the tap on «Сохранить»: where «Отменить» stands (null — not drawn), until the screen's toast has stood 20 frames
  await p.evaluate(() => {
    window.__ys = [];
    const f = () => {
      const u = [...document.querySelectorAll('[data-testid="toast-undo"]')].find((e) => e.offsetParent !== null);
      window.__ys.push(u ? Math.round(u.getBoundingClientRect().top) : null);
      if (window.__ys.length < 90) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  await top().getByTestId("showcase-toast-save").click();
  await sheetGone(p);
  await p.waitForFunction(() => window.__ys.length >= 90, null, { timeout: 5000 });
  const all = await p.evaluate(() => window.__ys);
  // the last 20 frames are the toast on the screen; from the frame it is on the screen it does not move (a slide-in would)
  const last = all[all.length - 1];
  h.expect(last !== null, `the toast stays on the screen after the sheet closed (${all})`);
  let from = all.length - 1;
  while (from > 0 && all[from - 1] !== null && Math.abs(all[from - 1] - last) <= 1) from--;
  const moving = all.slice(0, from).filter((y) => y !== null);
  // before «from»: the toast in the sheet (one place, above the footer) and nothing in between; no frames sliding towards «last»
  const sliding = moving.filter((y, i) => i > 0 && y !== moving[i - 1]);
  h.expect(sliding.length === 0, `…and does not slide in again: one jump from the sheet's place to the screen's (${all.join(",")})`);
  const onScreen = await undoAt();
  h.expect(onScreen.onTop && onScreen.footerTop === null, `on the screen «Отменить» is on top, no sheet footer (${JSON.stringify(onScreen)})`);
  await h.shot("on-screen");
  // «Отменить» on the screen still takes the row back: open the sheet again — row 3 is there
  for (let i = 0; i < 40 && (await p.getByTestId("toast-undo").locator("visible=true").count()); i++) {
    await vis("toast-undo").click().catch(() => {});
    await frames(6);
  }
  await open();
  h.expect((await top().getByTestId("showcase-toast-row-3").count()) === 1, "«Отменить» from the screen brought the row back");
};
