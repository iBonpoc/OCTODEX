/**
 * e2e 512 — #2156 (founder 18.11: меню «⋯» — «Весь рисунок, Свойства, Где панель, Слои, Удалить замер»; «„Где панель“ нужно
 * убрать. Зачем она там?»). Every view.
 * - «⋯» on the canvas of a saved measurement: «Весь рисунок», «Слои…», «Удалить замер» are there, «Где панель» is not;
 * - the toolbar still moves — by its grip (e2e 171); its kept place still comes back (nothing about the place is lost).
 * Finds things by testID / role; waits on what it checks.
 */
const { skipLength, sheetGone, pressWhenStill, canvasAt } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  // a saved measurement: «Удалить замер» is in the menu then
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.4, x0 = b.x + b.width * 0.2, x1 = b.x + b.width * 0.6;
  await canvasAt(p, x0, y);
  await p.mouse.move(x0, y);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(x0 + ((x1 - x0) * i) / 8, y);
  await p.mouse.up();
  await skipLength(p);
  await sheetGone(p);
  await tid("draw-to-lead").waitFor({ timeout: 6000 });

  await pressWhenStill(tid("draw-who").getByRole("button"));
  const menu = p.getByRole("menu").locator("visible=true").first();
  await menu.waitFor({ timeout: 4000 });
  const names = await menu.getByRole("menuitem").allInnerTexts();
  const all = names.map((x) => x.trim()).join(" | ");
  h.expect(!/Где панель/.test(all), `no «Где панель» (${all})`);
  h.expect(/Весь рисунок/.test(all) && /Слои/.test(all) && /Удалить замер/.test(all), `the rest stays: «Весь рисунок», «Слои…», «Удалить замер» (${all})`);
  await h.shot("menu");
};
