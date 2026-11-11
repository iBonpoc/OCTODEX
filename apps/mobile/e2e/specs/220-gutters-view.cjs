/**
 * e2e 220 — «Просмотр замера» (основатель 09.11, #698 #699 #700 #707; docs/specs/33-gutters-canvas.md П20.25). Every view.
 * - the canvas has no total and no estimate button under the drawing (#700); «Готово» at the top → the review;
 * - the review: the drawing whole; under «Подробно» (П25.3 Б7) the gutters by number (along the wall / along the face, storey, size), the corner
 *   with its cut, the downspout, the parts; the total marked «тестовые цены»; «Замер примерный — перед резкой
 *   промерьте» (the drawing is rough);
 * - nobody linked → the one main action is «Привязать к клиенту или лиду» (#699);
 * - the drawing on the review is only to look at: a tap on it changes nothing in the store;
 * - «Править чертёж» → the canvas again, the drawing as it was;
 * - a technician opens the same review: the drawing and the list, no money — no total, no estimate action.
 * Finds things by testID; waits on what it checks.
 */
const { skipLength, closeDsMenu, openView, backToCanvas, pressWhenStill } = require("../gutters.cjs");
const DB_KEY = "octo.db.v5";

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
  };
  const g = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters ?? { measurements: [], elements: [] }, DB_KEY);
  const runsCount = () => p.getByTestId("draw-svg").first().locator("line:not([id^=halo])").count();

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  h.expect((await tid("draw-done").count()) === 0, "nothing drawn: no «Готово»");

  // an L (a corner) and a downspout
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.35;
  const x0 = b.x + b.width * 0.2, x1 = b.x + b.width * 0.6;
  await stroke([x0, y], [x1, y]);
  await waitFor(async () => (await runsCount()) === 1, "one run");
  await stroke([x1 + 4, y + 3], [x1 + 4, y + b.height * 0.2]);
  await waitFor(async () => (await runsCount()) === 2, "two runs — a corner");
  await tid("draw-tool-ds").getByRole("button").click();
  await p.mouse.click((x0 + x1) / 2, y + 3);
  await closeDsMenu(p);
  await waitFor(async () => (await p.getByTestId("draw-svg").first().locator("circle").count()) >= 1, "a downspout");
  h.expect((await tid("draw-money").count()) === 0 && (await tid("draw-total").count()) === 0 && (await p.locator('[data-testid^="draw-estimate-"]').locator("visible=true").count()) === 0, "no total and no estimate button under the drawing (#700)");
  await tid("draw-done").waitFor({ timeout: 8000 });
  const mid = () => new URL(p.url()).searchParams.get("m");

  // «Готово» → the review
  await openView(p);
  const m = mid();
  h.expect(!!m, "the review names the measurement");
  await tid("view-svg").waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("view-svg").locator("visible=true").first().locator("line").count()) >= 2, "the drawing whole");
  // what it is made of is folded under «Подробно» (spec 33 П25.3 Б7)
  h.expect((await tid("view-parts").count()) === 0, "the parts are folded");
  await pressWhenStill(tid("view-details").getByRole("button"));
  await tid("view-parts").waitFor({ timeout: 5000 });
  for (const id of ["view-run-1", "view-run-2", "view-ds-1", "view-parts", "view-rough"]) h.expect((await tid(id).count()) === 1, `the review has ${id}`);
  h.expect(/по стене .* по лицевой/.test(await tid("view-run-1").innerText()), "a gutter: along the wall and along the face");
  h.expect(/эт 1/.test(await tid("view-run-1").innerText()), "a gutter: its storey");
  h.expect((await p.locator('[data-testid^="view-corner-"]').locator("visible=true").count()) === 1, "the corner with its cut");
  h.expect(/Угол .*°/.test(await p.locator('[data-testid^="view-corner-"]').locator("visible=true").first().innerText()), "the corner: kind and angle");
  const total = Number((await tid("view-total").innerText()).replace(/[^\d.]/g, ""));
  h.expect(total > 0, `the total (${total})`);
  h.expect((await tid("view-test-prices").count()) === 1, "marked «тестовые цены»");
  h.expect(/перед резкой промерьте/.test(await tid("view-rough").innerText()), "the rough drawing says to measure before cutting");
  // nobody linked: one main action — link it
  h.expect((await tid("view-action-link").count()) === 1, "nobody linked → «Привязать к клиенту или лиду»");
  h.expect((await p.locator('[data-testid^="view-action-"]').locator("visible=true").count()) === 1, "one main action");
  h.expect((await tid("view-estimates").count()) === 0, "no estimates yet");
  await h.shot("view");

  // only to look at: a tap on the drawing changes nothing
  const before = JSON.stringify((await g()).elements.filter((e) => e.measurementId === m));
  const sv = await tid("view-svg").boundingBox();
  await p.mouse.click(sv.x + sv.width / 2, sv.y + sv.height / 2);
  await p.mouse.move(sv.x + sv.width * 0.3, sv.y + sv.height * 0.3);
  await p.mouse.down();
  await p.mouse.move(sv.x + sv.width * 0.6, sv.y + sv.height * 0.6, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(500);
  h.expect(JSON.stringify((await g()).elements.filter((e) => e.measurementId === m)) === before, "the review's drawing changes nothing");

  // «Править чертёж» → the canvas, the drawing as it was
  await backToCanvas(p);
  await waitFor(async () => (await runsCount()) === 2, "back on the canvas: the two runs");

  // a technician: the same review, no money
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go(`/module/gutters/view?m=${encodeURIComponent(m)}`);
  await tid("view-screen").waitFor({ timeout: 8000 });
  await pressWhenStill(tid("view-details").getByRole("button"));
  await tid("view-run-1").waitFor({ timeout: 5000 });
  h.expect((await tid("view-total").count()) === 0 && (await tid("view-test-prices").count()) === 0, "a technician sees no total");
  h.expect((await p.locator('[data-testid^="view-action-"]').locator("visible=true").count()) === 0, "a technician: no estimate action");
  h.expect((await tid("view-edit").count()) === 1, "a technician can go back to the drawing");
  await h.shot("view-tech");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
