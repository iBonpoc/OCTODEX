/**
 * e2e 214 — «Замеры»: где мои замеры (основатель 09.11, версия 475: «из замера вышел — замеры никуда не сохраняются,
 * черновиков нет»; docs/specs/33-gutters-canvas.md П20.22). Every view.
 * - «＋» → «Замер желобов» (было «Замерить здесь») → two gutters → back home; «＋» → «Замеры» → a card «Без клиента», «Желобов: 2»,
 *   «Черновик»; it opens the measurement's card (spec 33 П25.3 А; 1280 — beside the list), «Править чертёж» — the same
 *   drawing (two lines);
 * - «Новый замер» opens an empty canvas; a second drawing makes a second card, the newest first.
 * Finds things by testID; waits on what it checks.
 */
const { skipLength, pressWhenStill } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const plus = () => p.locator('[data-testid="fab"]:visible, [data-testid="fab-header"]:visible');
  const lines = () => p.getByTestId("draw-svg").first().locator("line:not([id^=halo])").count();
  const cards = () => p.locator('[data-testid^="measurement-"]:visible');
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const stroke = async (f) => {
    const b = await p.getByTestId("draw-surface").boundingBox();
    const y = b.y + b.height * f;
    await p.mouse.move(b.x + b.width * 0.2, y);
    await p.mouse.down();
    for (let i = 1; i <= 8; i++) await p.mouse.move(b.x + b.width * (0.2 + (0.4 * i) / 8), y);
    await p.mouse.up();
    await skipLength(p);
  };
  const fab = async (id) => {
    await h.go("/today");
    await plus().first().click();
    await tid(`fab-module.gutters.${id}`).waitFor({ timeout: 5000 });
    await tid(`fab-module.gutters.${id}`).click();
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });

  // nothing yet: the list says so
  await fab("list");
  await p.waitForURL(/\/module\/gutters\/list/, { timeout: 5000 });
  await waitFor(async () => (await cards().count()) === 0 && /Замеров пока нет/.test(await p.locator("body").innerText()), "an empty list says so");

  // a draft without a client
  await fab("here");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await stroke(0.3);
  await stroke(0.5);
  await waitFor(async () => (await lines()) === 2, "two gutters");

  await fab("list");
  await waitFor(async () => (await cards().count()) === 1, "one card in «Замеры»");
  const text = await cards().first().innerText();
  h.expect(/Без клиента/.test(text) && /Желобов: 2/.test(text) && /Черновик/.test(text), `the draft's card (${text.replace(/\n/g, " | ")})`);
  await h.shot("list");
  await cards().first().click();
  await tid("view-screen").waitFor({ timeout: 8000 });
  await pressWhenStill(tid("view-edit").getByRole("button"));
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await waitFor(async () => (await lines()) === 2, "it opens the same drawing");

  // «Новый замер»: empty; drawn → a second card, the newest first
  await fab("list");
  await tid("draw-surface").or(cards().first()).first().waitFor({ timeout: 5000 });
  await p.getByRole("button", { name: "Новый замер", exact: true }).click();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  h.expect((await lines()) === 0, "a new measurement is empty");
  await stroke(0.4);
  await waitFor(async () => (await lines()) === 1, "one gutter in the new one");
  await fab("list");
  await waitFor(async () => (await cards().count()) === 2, "two cards");
  h.expect(/Желобов: 1/.test(await cards().first().innerText()), "the newest first");
};
