/**
 * e2e 168 — длина желоба сразу после рисования (просьба основателя 08.11; docs/specs/33-gutters-canvas.md П20.10).
 * Every view.
 * - a gutter drawn → the sheet «Длина желоба» opens at once; the feet field has the focus (the number keyboard on a
 *   phone) and the drawn length as its hint;
 * - 25 ft 6 in → «Записать» → the run is 306″ by tape («рулетка»), the sheet is gone; in the store too;
 * - a bad length (inches 12) says so and keeps the sheet;
 * - the next gutter → the sheet again → «Пропустить» keeps the drawn length (no tape);
 * - nothing drawn (a tap) → no sheet.
 * Finds things by testID; waits on what it checks.
 */
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
  };
  const runs = () =>
    p.evaluate((k) => {
      const g = (JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters;
      return g ? g.elements.filter((e) => e.kind === "run" && !e.deletedAt) : [];
    }, KEY);
  const field = (id) => tid(id).locator("input");

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  const x0 = b.x + b.width * 0.08;
  const x1 = b.x + b.width * 0.4;

  // a tap draws nothing → no sheet
  await p.mouse.click(x0, y);
  await p.waitForTimeout(400);
  h.expect((await tid("quick-length").count()) === 0, "a tap: no length sheet");

  // the first gutter: the sheet at once, the feet focused, the drawn length as the hint
  await stroke([x0, y], [x1, y]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await waitFor(() => field("quick-length-ft").evaluate((el) => el === document.activeElement), "the feet field has the focus");
  h.expect((await field("quick-length-ft").getAttribute("inputmode")) === "numeric", "the number keyboard");
  const hint = await field("quick-length-ft").getAttribute("placeholder");
  h.expect(/^\d+$/.test(hint || ""), `the drawn feet as the hint (${hint})`);
  await h.shot("sheet");

  // a bad length: inches 12
  await p.keyboard.type("25");
  await field("quick-length-in").fill("12");
  await tid("quick-length-apply").getByRole("button").click();
  await tid("quick-length-bad").waitFor({ timeout: 3000 });
  h.expect((await tid("quick-length").count()) === 1, "a bad length keeps the sheet");

  // 25′ 6″ → «Записать»
  await field("quick-length-in").fill("6");
  await tid("quick-length-apply").getByRole("button").click();
  await waitFor(async () => (await tid("quick-length").count()) === 0, "the sheet is gone after «Записать»");
  await waitFor(async () => (await runs()).some((r) => r.geom?.lengthIn === 306), "the run is 306″ by tape in the store");
  await waitFor(async () => /25′ 6″/.test(await tid("draw-selected").innerText()), "the picked bar shows 25′ 6″");

  // the second gutter → «Пропустить»: the drawn length stays
  await stroke([x1, y + b.height * 0.2], [x0, y + b.height * 0.2]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await tid("quick-length-skip").getByRole("button").click();
  await waitFor(async () => (await tid("quick-length").count()) === 0, "the sheet is gone after «Пропустить»");
  await waitFor(async () => (await runs()).length === 2, "two runs");
  const rs = await runs();
  h.expect(rs.filter((r) => r.geom?.lengthIn === undefined).length === 1, `«Пропустить»: one run keeps the drawn length (${JSON.stringify(rs.map((r) => r.geom?.lengthIn))})`);
};
