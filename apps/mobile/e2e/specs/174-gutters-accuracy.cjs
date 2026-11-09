/**
 * e2e 174 — как мерили, один выбор на весь чертёж (просьба основателя 08.11; docs/specs/33-gutters-canvas.md П20.16).
 * Every view (the phone on its side hides the top row — the choice is in «Ещё» there too).
 * - a new drawing is «Примерно — не для резки» (warn); a corner's cut says to re-measure with a tape;
 * - «Ещё» → «Рулетка: точно, для монтажа» → «Рулетка — для монтажа» (ok), the cut has no warning; in the store; after
 *   a reload too; the attribute panel has no «рулетка / нарисовано» per line.
 * Finds things by testID; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");
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
  const closeSheet = async () => {
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
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

  // rough by default
  await waitFor(async () => /Примерно/.test(await tid("draw-accuracy").innerText()), "a new drawing: «Примерно — не для резки»");
  h.expect((await tid("attr-confidence").count()) === 0, "no «рулетка / нарисовано» per line");
  await openCorner();
  h.expect((await tid("corner-cut-rough").count()) === 1, "a rough measure: the cut says to re-measure with a tape");
  await closeSheet();

  // «Ещё» → tape
  await tid("draw-more").getByRole("button").click();
  await tid("draw-accuracy-pick").getByRole("radio", { name: /^Рулетка/ }).click();
  await waitFor(async () => /Рулетка — для монтажа/.test(await tid("draw-accuracy").innerText()), "the top says «Рулетка — для монтажа»");
  await closeSheet();
  await waitFor(async () => (await accuracy()) === "tape", "the store: tape");
  await openCorner();
  h.expect((await tid("corner-cut-rough").count()) === 0, "measured with a tape: no warning on the cut");
  await h.shot("tape");
  await closeSheet();

  await p.reload();
  await tid("draw-accuracy").waitFor({ timeout: 8000 });
  h.expect(/Рулетка/.test(await tid("draw-accuracy").innerText()), "after a reload: still a tape");
};
