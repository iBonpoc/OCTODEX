/**
 * e2e 168 — длина желоба сразу после рисования (просьба основателя 08.11; docs/specs/33-gutters-canvas.md П20.10).
 * Every view.
 * - a gutter drawn → the sheet «Длина желоба» opens at once; the feet field has the focus (the number keyboard on a
 *   phone), holds the drawn feet and they are selected — a digit typed replaces them (founder 09.11);
 * - the tape pulled: three marks → ⅜, eight → an inch more; 25 ft 6⅜ in → «Применить» → 306⅜″ by tape, the sheet
 *   is gone; in the store too;
 * - a bad length (inches 12) says so and keeps the sheet;
 * - the next gutter → «Применить» untouched keeps the drawn length (no tape);
 * - inches alone: 260 → 21′ 8″; mm: 1000 → 39⅜″;
 * - a gutter, then «Отменить» → it is gone; another, then a tap outside the sheet → gone too (a stray line);
 * - a length label tapped → the length sheet of that gutter («Отменить» there changes nothing);
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
  const hint = await field("quick-length-ft").inputValue();
  h.expect(/^\d+$/.test(hint || ""), `the drawn feet in the field (${hint})`);
  h.expect(await field("quick-length-ft").evaluate((el) => el.selectionStart === 0 && el.selectionEnd === el.value.length), "…selected: a digit replaces them");
  await h.shot("sheet");

  // a bad length: inches 12
  await p.keyboard.type("25");
  await field("quick-length-in").fill("12");
  await tid("quick-length-apply").getByRole("button").click();
  await tid("quick-length-bad").waitFor({ timeout: 3000 });
  h.expect((await tid("quick-length").count()) === 1, "a bad length keeps the sheet");

  // a tape to pull (founder 09.11: «как рулетка»): dragged left three marks → ⅜ more; the fields follow
  const pull = async (marks) => {
    const tb = await tid("quick-length-tape").boundingBox();
    const cx = tb.x + tb.width / 2, cy = tb.y + tb.height / 2;
    await p.mouse.move(cx, cy);
    await p.mouse.down();
    for (let i = 1; i <= 6; i++) await p.mouse.move(cx - (marks * 8 * i) / 6, cy);
    await p.mouse.up();
  };
  await field("quick-length-in").fill("6"); // a good length again (25′ 6″) after the bad one
  const ft0 = await field("quick-length-ft").inputValue();
  const in0 = await field("quick-length-in").inputValue();
  await pull(3);
  await waitFor(async () => (await tid("quick-length-frac").count()) === 1 && (await tid("quick-length-frac").innerText()).trim() === "⅜", "the tape pulled three marks: ⅜");
  h.expect((await field("quick-length-ft").inputValue()) === ft0 && (await field("quick-length-in").inputValue()) === in0, "the feet and inches stay");
  await h.shot("tape");
  // a whole inch more: eight marks
  await pull(8);
  await waitFor(async () => (await field("quick-length-in").inputValue()) === String((Number(in0) + 1) % 12), "eight marks more: an inch more");

  // 25′ 6⅜″ → «Применить»
  await field("quick-length-in").fill("6");
  await tid("quick-length-apply").getByRole("button").click();
  await waitFor(async () => (await tid("quick-length").count()) === 0, "the sheet is gone after «Применить»");
  await waitFor(async () => (await runs()).some((r) => r.geom?.lengthIn === 306.375), "the run is 306⅜″ by tape in the store");
  await waitFor(async () => /25′ 6⅜″/.test(await tid("draw-selected").innerText()), "the picked bar shows 25′ 6⅜″");

  // the second gutter → «Применить» untouched: the drawn length stays
  await stroke([x1, y + b.height * 0.2], [x0, y + b.height * 0.2]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await tid("quick-length-apply").getByRole("button").click();
  await waitFor(async () => (await tid("quick-length").count()) === 0, "the sheet is gone after «Применить»");
  await waitFor(async () => (await runs()).length === 2, "two runs");
  const rs = await runs();
  h.expect(rs.filter((r) => r.geom?.lengthIn === undefined).length === 1, `untouched: one run keeps the drawn length (${JSON.stringify(rs.map((r) => r.geom?.lengthIn))})`);

  // inches alone, then mm
  const y3 = y - b.height * 0.17;
  await stroke([x0, y3], [x1, y3]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await tid("quick-length-unit").getByRole("radio", { name: "дюймы", exact: true }).click();
  await field("quick-length-one").fill("260");
  await tid("quick-length-apply").getByRole("button").click();
  await waitFor(async () => (await runs()).some((r) => r.geom?.lengthIn === 260), "260″ in inches");
  await waitFor(async () => /21′ 8″/.test(await tid("draw-selected").innerText()), "shown as 21′ 8″");
  await tid("draw-svg").first().waitFor();
  const lab = await p.getByTestId("draw-svg").first().locator('[id^="lbl-len:"]').filter({ hasText: "21′ 8″" }).first().boundingBox();
  // a length label tapped → its length sheet; mm: 1000 → 39⅜″
  await p.mouse.click(lab.x + lab.width / 2, lab.y + lab.height / 2);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await tid("quick-length-unit").getByRole("radio", { name: "мм", exact: true }).click();
  await field("quick-length-one").fill("1000");
  await tid("quick-length-apply").getByRole("button").click();
  await waitFor(async () => (await runs()).some((r) => r.geom?.lengthIn === 39.375), "1000 mm → 39⅜″");
  // the label again, «Отменить» there changes nothing
  const lab2 = await p.getByTestId("draw-svg").first().locator('[id^="lbl-len:"]').filter({ hasText: "3′ 3⅜″" }).first().boundingBox();
  await p.mouse.click(lab2.x + lab2.width / 2, lab2.y + lab2.height / 2);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await tid("quick-length-cancel").getByRole("button").click();
  await waitFor(async () => (await tid("quick-length").count()) === 0, "closed");
  h.expect((await runs()).length === 3 && (await runs()).some((r) => r.geom?.lengthIn === 39.375), "«Отменить» on a label's sheet keeps the gutter");

  // a stray line: «Отменить» → gone; a tap outside → gone
  const y4 = y - b.height * 0.27;
  await stroke([x0, y4], [x1, y4]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await tid("quick-length-cancel").getByRole("button").click();
  await waitFor(async () => (await runs()).length === 3, "«Отменить»: the new gutter is gone");
  await stroke([x0, y4], [x1, y4]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await p.getByRole("button", { name: "Закрыть", exact: true }).last().click({ position: { x: 10, y: 10 } });
  await waitFor(async () => (await runs()).length === 3, "a tap outside: the new gutter is gone too");
  await waitFor(async () => (await p.getByTestId("draw-svg").first().locator("line:not([id^=halo])").count()) === 3, "three lines on the canvas");
};
