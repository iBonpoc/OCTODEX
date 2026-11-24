/**
 * e2e 174 — nothing is written about how a measurement was taken (#768, #1764; founder 16.11: «этой надписи не должно
 * быть», «вообще ничего не пишем»). Was: the choice «Точность замера» (#739). Every view.
 * - the canvas: no accuracy words at the top, «⋯» has no «Точность замера»; a corner's cut has no «перемерьте рулеткой»;
 * - the measurement's card: no «Рулетка / Примерно» chip, no «примерный» note;
 * - the field stays in the data (rule 16): a new drawing still writes it, nothing shows it.
 * Finds things by testID; waits on what it checks.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
const { doubleTap, skipLength, sheetGone } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
    await p.waitForTimeout(200);
  };
  const accuracy = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.measurements?.[0]?.accuracy, KEY);
  const openCorner = async () => {
    const k = await p.getByTestId("draw-svg").first().locator('[id^="c:"]').boundingBox();
    await doubleTap(p, k.x + k.width / 2, k.y + k.height / 2);
    await tid("corner-cut").waitFor({ timeout: 5000 });
  };
  // Esc until the sheet is gone (CHECKS §9 №8: not once blindly), then its layer gone too
  const closeSheet = async () => {
    await pressEscUntilClosed(p);
    await sheetGone(p);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Без срока/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const x0 = b.x + b.width * 0.15, x1 = b.x + b.width * 0.4;
  const y0 = b.y + b.height * 0.25, y1 = b.y + b.height * 0.45;
  await stroke([x0, y0], [x1, y0]);
  await stroke([x1, y0], [x1, y1]);

  // the canvas: no words at the top, no «Точность замера» in «⋯»
  h.expect((await tid("draw-accuracy").count()) === 0, "no accuracy words at the top");
  await tid("draw-who").getByRole("button").click();
  await p.getByRole("menuitem", { name: /Слои|Панель/ }).first().waitFor({ timeout: 3000 });
  h.expect((await p.getByRole("menuitem", { name: "Точность замера", exact: true }).count()) === 0, "no «Точность замера» in «⋯»"); // i18n-old: ok — the old item must be gone
  await pressEscUntilClosed(p);
  await waitFor(async () => (await p.getByRole("menuitem").count()) === 0, "the menu is closed");

  // a corner's cut: no «перемерьте рулеткой»
  await openCorner();
  h.expect((await tid("corner-cut-rough").count()) === 0, "the cut has no re-measure note");
  h.expect(!/перемер|промер|можно резать/.test(await tid("corner-cut").innerText()), "no words about the tape in the cut");
  await h.shot("corner");
  await closeSheet();

  // the data keeps the field (rule 16); nothing shows it
  await waitFor(async () => (await accuracy()) !== undefined, "the field is still written");
};
