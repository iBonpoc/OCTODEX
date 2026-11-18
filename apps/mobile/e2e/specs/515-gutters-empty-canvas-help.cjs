/**
 * e2e 515 — #2186 (founder 18.11: «когда я открываю чертеж, то обязательно на пустом экране должна быть инструкция, как
 * пользоваться чертежом»). Every view.
 * - an empty canvas: «Как рисовать» — four steps (a gutter, a downspout, the length, two fingers); the first stroke draws
 *   THROUGH it (the card takes no touch);
 * - after the first line the card is gone;
 * - «?» in the header shows the same steps any time.
 * Finds things by testID; waits on what it checks.
 */
const { skipLength, sheetGone, canvasAt } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });

  // the empty canvas says how
  await tid("draw-empty-help").waitFor({ timeout: 5000 });
  for (const s of ["line", "ds", "len", "zoom"]) h.expect((await tid(`draw-help-${s}`).count()) === 1, `the step «${s}» is there`);
  const card = await tid("draw-empty-help").innerText();
  h.expect(/Как рисовать/.test(card) && /Downspout/.test(card) && /Двумя пальцами/.test(card), `the steps in words (${card.slice(0, 120)})`);
  await h.shot("empty");

  // the first stroke right through the card's middle: it draws, the card goes
  const box = await tid("draw-empty-help").boundingBox();
  const y = box.y + box.height / 2, x0 = box.x + box.width * 0.15, x1 = box.x + box.width * 0.85;
  await canvasAt(p, x0, y);
  await p.mouse.move(x0, y);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(x0 + ((x1 - x0) * i) / 10, y);
  await p.mouse.up();
  await skipLength(p);
  await sheetGone(p);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] line:not([id^="halo"])').length >= 1, null, { timeout: 8000 })
    .catch(() => h.expect(false, "the stroke through the card drew a gutter"));
  await p.waitForFunction(() => !document.querySelector('[data-testid="draw-empty-help"]'), null, { timeout: 5000 })
    .catch(() => h.expect(false, "after the first line the card is gone"));

  // «?» shows the same steps
  await tid("draw-help").click();
  const sheet = p.locator('[aria-modal="true"]').last();
  await sheet.waitFor({ timeout: 5000 });
  const said = await sheet.innerText();
  h.expect(/Как рисовать/.test(said) && /Downspout/.test(said) && /Двумя пальцами/.test(said), `«?»: the same steps (${said.slice(0, 160)})`);
  await h.shot("help");
};
