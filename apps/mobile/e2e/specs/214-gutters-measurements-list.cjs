/**
 * e2e 214 — «Замеры»: где мои замеры (основатель 09.11, версия 475: «из замера вышел — замеры никуда не сохраняются,
 * черновиков нет»; docs/specs/33-gutters-canvas.md П20.22). Every view.
 * - «＋» → «Замер желобов» (было «Замерить здесь») → two gutters → back home; «＋» → «Замеры» → a card «Без клиента», «Желобов: 2»,
 *   «Черновик»; it opens the measurement's card (spec 33 П25.3 А; 1280 — beside the list), «Править чертёж» — the same
 *   drawing (two lines);
 * - «Новый замер» opens an empty canvas; a second drawing makes a second card, the newest first.
 * Finds things by testID; waits on what it checks.
 */
const { skipLength, pressWhenStill, editDrawing } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  // v2 (#2350): the home «＋» is the header's CreateButton (`today-create`, every width), its items `fab-<id>` in the menu
  const plus = () => tid("today-create").getByRole("button");
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
  await tid("module-gutters-status").filter({ hasText: /^Без срока/ }).waitFor({ timeout: 5000 });

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
  // #3028: a draft for nobody — «Черновик», «Без адреса», what is measured in feet and downspouts (no «Gutter: N»)
  h.expect(/Черновик/.test(text) && /Без адреса/.test(text) && /\d+ ft · \d+ downspout/.test(text), `the draft's card (${text.replace(/\n/g, " | ")})`);
  h.expect((await tid("measurements-drafts").count()) === 1, "it stands in «Черновики»");
  await h.shot("list");
  await cards().first().click();
  await tid("view-screen").waitFor({ timeout: 8000 });
  await editDrawing(p); // #2995: in «⋯» on the card's own screen
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
  // the newest first: the one with a single gutter has fewer feet than the one with two
  const ft = async (i) => Number(((await cards().nth(i).innerText()).match(/(\d+) ft/) || [])[1]);
  h.expect((await ft(0)) < (await ft(1)), `the newest first (${await ft(0)} ft before ${await ft(1)} ft)`);
};
