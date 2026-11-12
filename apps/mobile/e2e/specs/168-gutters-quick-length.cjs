/**
 * e2e 168 — длина желоба сразу после рисования (просьба основателя 08.11; docs/specs/33-gutters-canvas.md П20.10).
 * Every view.
 * - a gutter drawn → the sheet «Длина желоба» opens at once; the feet field has the focus (the number keyboard on a
 *   phone), holds the drawn feet and they are selected — a digit typed replaces them (founder 09.11);
 * - the tape pulled: three marks → ⅜, eight → an inch more; 25 ft 6⅜ in → «Применить» → 306⅜″ by tape, the sheet
 *   is gone; in the store too;
 * - a bad length (inches 12) says so and keeps the sheet;
 * - the next gutter → «Применить» untouched keeps the drawn length (no tape);
 * - only the inches changed → the feet stay (version 475: they were reset); the inches field is selected when reached;
 * - inches alone: 260 → 21′ 8″; mm: 1000 → 39⅜″; m: 3 → 118⅛″; the unit is picked at the end of the number (founder
 *   09.11, #675): no unit row above the fields, a tap on «дюйм» → a menu of the units;
 * - the number under the tape's mark on a pill of the main button's colours (`tape.*`, founder 09.11, #674);
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
  /** the unit at the end of the number (#675): a tap → the menu at it → a unit; the menu goes, the field is there */
  const pickUnit = async (name) => {
    await tid("quick-length-unit").click();
    const item = p.getByRole("menuitem", { name, exact: true });
    await item.waitFor({ timeout: 3000 });
    await item.click();
    await item.waitFor({ state: "hidden", timeout: 3000 });
  };

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
  // #675: the unit is at the end of the number — no row of units above the fields; «дюйм» right of the inches
  h.expect((await tid("quick-length").getByRole("radio").count()) === 0, "no unit chips above the fields");
  const ub = await tid("quick-length-unit").boundingBox();
  const ib = await tid("quick-length-in").boundingBox();
  h.expect(ub.x >= ib.x + ib.width - 1 && /дюйм/.test(await tid("quick-length-unit").innerText()), "«дюйм» at the end of the number");
  h.expect(ub.height >= 44, `the unit is a 44 tap (${Math.round(ub.height)})`);
  // #674: the number under the tape's mark on a pill of the main button's colours (founder: «как у нас кнопки»)
  const at = p.locator('[id="quick-length-tape-at"]').first();
  await at.waitFor({ timeout: 3000 });
  const look = await at.evaluate((el) => {
    const pill = el.previousElementSibling;
    const r = el.getBoundingClientRect(), q = pill && pill.getBoundingClientRect();
    return { text: getComputedStyle(el).fill, pill: pill && pill.tagName.toLowerCase() === "rect" ? getComputedStyle(pill).fill : "", under: !!q && q.left <= r.left && q.right >= r.right };
  });
  h.expect(look.text === "rgb(11, 12, 15)" && look.pill === "rgb(251, 255, 0)", `the number under the mark: dark on the button's yellow (${JSON.stringify(look)})`);
  h.expect(look.under, "the pill is under the whole number");

  // a bad length: inches 12
  await p.keyboard.type("25");
  await field("quick-length-in").fill("12");
  await tid("quick-length-apply").getByRole("button").click();
  await tid("quick-length-bad").waitFor({ timeout: 3000 });
  h.expect((await tid("quick-length").count()) === 1, "a bad length keeps the sheet");

  // a tape to pull (founder 09.11: «как рулетка»): dragged left six marks (1/16″ each) → ⅜ more; the fields follow
  const pull = async (marks) => {
    const tb = await tid("quick-length-tape").boundingBox();
    const cx = tb.x + tb.width / 2, cy = tb.y + tb.height / 2;
    await p.mouse.move(cx, cy);
    await p.mouse.down();
    // one mark (1/16″) is 8 px: an eighth — 16 px, room for its fraction
    for (let i = 1; i <= 6; i++) await p.mouse.move(cx - (marks * 8 * i) / 6, cy);
    // the finger stops, then lifts: no flick (a flick runs on — the founder's sample; that is the arrows' and the unit's job)
    await p.mouse.move(cx - marks * 8, cy);
    await p.waitForTimeout(200);
    await p.mouse.up();
  };
  await field("quick-length-in").fill("6"); // a good length again (25′ 6″) after the bad one
  const ft0 = await field("quick-length-ft").inputValue();
  const in0 = await field("quick-length-in").inputValue();
  await pull(6);
  await waitFor(async () => (await tid("quick-length-frac").count()) === 1 && (await tid("quick-length-frac").innerText()).trim() === "⅜", "the tape pulled six marks (three eighths): ⅜");
  h.expect((await field("quick-length-ft").inputValue()) === ft0 && (await field("quick-length-in").inputValue()) === in0, "the feet and inches stay");
  await h.shot("tape");
  // the arrows step one mark (1/16″): ⅜ → 7/16 → ⅜; the big value above follows
  await tid("quick-length-tape-more").getByRole("button").click();
  await waitFor(async () => (await tid("quick-length-frac").innerText()).trim() === "7/16", "→ one mark longer: 7/16");
  h.expect(/6 7\/16″/.test(await tid("quick-length-tape-value").innerText()), "the big value says 6 7/16″");
  await tid("quick-length-tape-less").getByRole("button").click();
  await waitFor(async () => (await tid("quick-length-frac").innerText()).trim() === "⅜", "← one mark shorter: ⅜");
  // the tape says the whole length at every inch: «25′ 6″», «25′ 7″» … (founder 09.11)
  const marks = await tid("quick-length-tape").locator("text").evaluateAll((ts) => ts.map((t) => (t.textContent || "").trim()));
  h.expect(["25′ 5″", "25′ 6″", "25′ 7″"].every((m) => marks.includes(m)), `the whole length at each inch (${marks.join(" | ")})`);
  // a tap on a number: the tape comes to it — the whole inch, no eighths (the sample's click on a page)
  const seven = await tid("quick-length-tape").locator("text").filter({ hasText: /^25′ 7″$/ }).first().boundingBox();
  await p.mouse.click(seven.x + seven.width / 2, seven.y + seven.height / 2);
  await waitFor(async () => (await field("quick-length-in").inputValue()) === "7" && (await tid("quick-length-frac").count()) === 0, "a tap on «25′ 7″»: 7″, no eighths");
  // the keyboard on a computer: → three times → 3/16
  await tid("quick-length-tape").focus();
  for (let i = 0; i < 3; i++) await p.keyboard.press("ArrowRight");
  await waitFor(async () => (await tid("quick-length-frac").count()) === 1 && (await tid("quick-length-frac").innerText()).trim() === "3/16", "→ → →: 7 3/16″");
  // a whole inch more: sixteen marks
  const in1 = Number(await field("quick-length-in").inputValue());
  await pull(16);
  await waitFor(async () => (await field("quick-length-in").inputValue()) === String((in1 + 1) % 12), "sixteen marks more: an inch more");

  // 25′ 6 3/16″ → «Применить»
  await field("quick-length-in").fill("6");
  await tid("quick-length-apply").getByRole("button").click();
  await waitFor(async () => (await tid("quick-length").count()) === 0, "the sheet is gone after «Применить»");
  await waitFor(async () => (await runs()).some((r) => r.geom?.lengthIn === 306.1875), "the run is 306 3/16″ by tape in the store: " + JSON.stringify((await runs()).map((r) => r.geom?.lengthIn)));
  await waitFor(async () => /25′ 6 3\/16″/.test(await tid("draw-selected").innerText()), "the picked bar shows 25′ 6 3/16″");

  // the second gutter → «Применить» untouched: the drawn length stays
  await stroke([x1, y + b.height * 0.2], [x0, y + b.height * 0.2]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await tid("quick-length-apply").getByRole("button").click();
  await waitFor(async () => (await tid("quick-length").count()) === 0, "the sheet is gone after «Применить»");
  await waitFor(async () => (await runs()).length === 2, "two runs");
  const rs = await runs();
  h.expect(rs.filter((r) => r.geom?.lengthIn === undefined).length === 1, `untouched: one run keeps the drawn length (${JSON.stringify(rs.map((r) => r.geom?.lengthIn))})`);

  // only the inches changed (founder 09.11, version 475: the feet were a grey hint, not a value — typed inches alone made
  // the gutter 9″): the feet and the eighths stay; the inches field is selected when it is reached
  const y5 = y + b.height * 0.3;
  await stroke([x0, y5], [x1, y5]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  const feet = Number(await field("quick-length-ft").inputValue());
  h.expect(feet > 0, `the feet field holds the drawn feet as a value (${feet})`);
  // inside the field's frame: the web input is wider than it, its middle lies under the unit at the end (#675)
  await field("quick-length-in").click({ position: { x: 12, y: 12 } });
  await waitFor(() => field("quick-length-in").evaluate((el) => el === document.activeElement && el.selectionStart === 0 && el.selectionEnd === el.value.length), "the inches field: its value selected");
  await p.keyboard.type("9");
  await tid("quick-length-apply").getByRole("button").click();
  await waitFor(async () => (await runs()).some((r) => r.geom?.lengthIn === feet * 12 + 9), `only the inches changed: ${feet}′ 9″ — the feet kept`);

  // inches alone, then mm
  const y3 = y - b.height * 0.17;
  await stroke([x0, y3], [x1, y3]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await pickUnit("дюймы");
  await field("quick-length-one").fill("260");
  await tid("quick-length-apply").getByRole("button").click();
  await waitFor(async () => (await runs()).some((r) => r.geom?.lengthIn === 260), "260″ in inches");
  await waitFor(async () => /21′ 8″/.test(await tid("draw-selected").innerText()), "shown as 21′ 8″");
  await tid("draw-svg").first().waitFor();
  const lab = await p.getByTestId("draw-svg").first().locator('[id^="lbl-len:"]').filter({ hasText: "21′ 8″" }).first().boundingBox();
  // a length label tapped → its length sheet; mm: 1000 → 39⅜″
  await p.mouse.click(lab.x + lab.width / 2, lab.y + lab.height / 2);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await pickUnit("мм");
  await field("quick-length-one").fill("1000");
  // the metric tape: millimetre marks — two marks longer, 1002 mm in the field; back
  await tid("quick-length-tape-more").getByRole("button").click();
  await tid("quick-length-tape-more").getByRole("button").click();
  await waitFor(async () => (await field("quick-length-one").inputValue()) === "1002", "the mm tape: two marks → 1002 mm");
  h.expect(/1002 mm/.test(await tid("quick-length-tape-value").innerText()), "the big value says 1002 mm");
  await field("quick-length-one").fill("1000");
  await tid("quick-length-apply").getByRole("button").click();
  await waitFor(async () => (await runs()).some((r) => r.geom?.lengthIn === 39.375), "1000 mm → 39⅜″");
  // metres too (founder 09.11): 3 m → 118⅛″
  const lab3 = await p.getByTestId("draw-svg").first().locator('[id^="lbl-len:"]').filter({ hasText: "3′ 3⅜″" }).first().boundingBox();
  await p.mouse.click(lab3.x + lab3.width / 2, lab3.y + lab3.height / 2);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await pickUnit("м");
  await field("quick-length-one").fill("3");
  await tid("quick-length-apply").getByRole("button").click();
  await waitFor(async () => (await runs()).some((r) => r.geom?.lengthIn === 118.125), "3 m → 118⅛″");
  // the label again, «Отменить» there changes nothing
  const lab2 = await p.getByTestId("draw-svg").first().locator('[id^="lbl-len:"]').filter({ hasText: "9′ 10⅛″" }).first().boundingBox();
  await p.mouse.click(lab2.x + lab2.width / 2, lab2.y + lab2.height / 2);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await tid("quick-length-cancel").getByRole("button").click();
  await waitFor(async () => (await tid("quick-length").count()) === 0, "closed");
  h.expect((await runs()).length === 4 && (await runs()).some((r) => r.geom?.lengthIn === 118.125), "«Отменить» on a label's sheet keeps the gutter");

  // a stray line: «Отменить» → gone; a tap outside → gone
  const y4 = y - b.height * 0.27;
  await stroke([x0, y4], [x1, y4]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await tid("quick-length-cancel").getByRole("button").click();
  await waitFor(async () => (await runs()).length === 4, "«Отменить»: the new gutter is gone");
  await stroke([x0, y4], [x1, y4]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await p.getByRole("button", { name: "Закрыть", exact: true }).last().click({ position: { x: 10, y: 10 } });
  await waitFor(async () => (await runs()).length === 4, "a tap outside: the new gutter is gone too");
  await waitFor(async () => (await p.getByTestId("draw-svg").first().locator("line:not([id^=halo])").count()) === 4, "four lines on the canvas");
};
