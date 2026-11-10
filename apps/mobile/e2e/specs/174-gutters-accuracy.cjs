/**
 * e2e 174 — как мерили, один выбор на весь чертёж (просьба основателя 08.11; docs/specs/33-gutters-canvas.md П20.16).
 * Every view.
 * - a new drawing is «Примерно» (the choice in «⋯ → Как мерили, панель»; no words at the top, #681); a corner's cut
 *   says to re-measure with a tape;
 * - «⋯» → «Как мерили, панель» → «Рулетка» → in the store, the cut has no warning; after a reload too; the attribute
 *   panel has no «рулетка / нарисовано» per line.
 * Finds things by testID; waits on what it checks.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
const { skipLength, sheetGone } = require("../gutters.cjs");
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
    await p.mouse.click(k.x + k.width / 2, k.y + k.height / 2);
    await tid("corner-cut").waitFor({ timeout: 5000 });
  };
  // Esc until the sheet is gone (CHECKS §9 №8: not once blindly), then its layer gone too
  const closeSheet = async () => {
    await pressEscUntilClosed(p);
    await sheetGone(p);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const x0 = b.x + b.width * 0.15, x1 = b.x + b.width * 0.4;
  const y0 = b.y + b.height * 0.25, y1 = b.y + b.height * 0.45;
  await stroke([x0, y0], [x1, y0]);
  await stroke([x1, y0], [x1, y1]);

  // «⋯» → «Как мерили, панель»: the sheet with the choice (#681: no «Примерно — не для резки» at the top)
  const openMore = async () => {
    await tid("draw-who").getByRole("button").click();
    const item = p.getByRole("menuitem", { name: "Как мерили, панель", exact: true });
    await item.waitFor({ timeout: 3000 });
    await item.click();
    await tid("draw-accuracy-pick").waitFor({ timeout: 5000 });
  };
  const picked = async () => (await tid("draw-accuracy-pick").getByRole("radio", { checked: true }).first().innerText()).trim();
  h.expect((await tid("draw-accuracy").count()) === 0, "no accuracy words at the top (#681)");

  // rough by default
  await openMore();
  h.expect(/^Примерно/.test(await picked()), "a new drawing: «Примерно»");
  await closeSheet();
  h.expect((await tid("attr-confidence").count()) === 0, "no «рулетка / нарисовано» per line");
  await openCorner();
  h.expect((await tid("corner-cut-rough").count()) === 1, "a rough measure: the cut says to re-measure with a tape");
  await closeSheet();

  // «⋯» → «Как мерили, панель» → tape
  await openMore();
  await tid("draw-accuracy-pick").getByRole("radio", { name: /^Рулетка/ }).click();
  await waitFor(async () => /^Рулетка/.test(await picked()), "«Рулетка» picked");
  await closeSheet();
  await waitFor(async () => (await accuracy()) === "tape", "the store: tape");
  await openCorner();
  h.expect((await tid("corner-cut-rough").count()) === 0, "measured with a tape: no warning on the cut");
  await h.shot("tape");
  await closeSheet();

  await p.reload();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await openMore();
  h.expect(/^Рулетка/.test(await picked()), "after a reload: still a tape");
  await closeSheet();
};
