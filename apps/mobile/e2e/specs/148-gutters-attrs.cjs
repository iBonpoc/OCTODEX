/**
 * e2e 148 — панель атрибутов холста Gutters (docs/specs/33-gutters-screens.md П21.8 M5c; спека 33 §7). Every view.
 * - 390: «Свойства» in the picked bar opens the sheet; 820/1280: the panel is a column right of the canvas (not over
 *   it: drawing goes on beside it), says how to pick when nothing is picked, no «Свойства» button, «Закрыть» unpicks;
 * - a run: drawn → profile «Полукруглый» (size 5″, hanger Shank #10 follow), colour «Коричневый», the tape
 *   25′ 6″ → «По рисунку» offered, the label follows; a bad tape (12 in) says so and changes nothing;
 *   «Назад» on the canvas takes the tape back;
 * - a downspout: «Круглый» → size 3″; wall «Кирпич» → its default wall kit;
 * - every value is a field (SelectField, #2412 G1): the field shows the value, a menu or a list picks it; «Ещё» on every width;
 * - everything is in the store (DB.moduleData.gutters) and comes back after a reload.
 * Finds things by testID; waits on what it checks.
 */
const { openProps, skipLength, pickAttr, attrShown, attrChosen, openAttrMore, winSave } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  // what is changed seldom sits under «Ещё» (spec 33 П20.9, #2412 G1: on every width) — open it
  const more = () => openAttrMore(p);
  const svg = () => p.getByTestId("draw-svg").first();
  const labels = () => svg().locator("text").evaluateAll((ts) => ts.map((t) => t.textContent || ""));
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
  const stored = () =>
    p.evaluate((k) => {
      const g = (JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters;
      return g ? g.elements : [];
    }, KEY);
  const panel = () => tid("attr-panel");
  /** what a field shows (#2412 G1: a field, its value in it); `choose` picks a stored key in its menu or list */
  const chosen = (field) => attrShown(p, field);
  const choose = (field, key) => pickAttr(p, field, key);
  /** open the attributes of what is picked: the sheet on 390; the panel is already there on 820/1280 */
  const openAttrs = async () => {
    if (!wide) {
      // a downspout just put opens its menu by itself (founder 09.11)
      if (!(await panel().count())) await openProps(p);
    }
    h.expect((await tid("draw-props").count()) === 0, "no «Свойства» button on the toolbar — a double tap opens them (#1273), the panel is on the side on 820/1280");
    await panel().waitFor({ timeout: 5000 });
  };
  const closeAttrs = async () => {
    await winSave(p); // the window's own «Сохранить» (DS §7.3, #2412 PR3): its edits kept
    await waitFor(async () => (await panel().count()) === 0, "the attributes are closed");
  };

  // the trial on, a run and a downspout on it
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Без срока/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  if (wide) await tid("draw-panel-empty").waitFor({ timeout: 5000 }); // nothing picked: how to pick
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  const x0 = b.x + b.width * 0.08;
  const x1 = b.x + b.width * 0.45;
  await stroke([x0, y], [x1, y]);
  await waitFor(async () => (await svg().locator("line:not([id^=halo])").count()) === 1, "one run");
  if (wide) {
    const pb = await tid("draw-panel").boundingBox();
    h.expect(pb.x >= b.x + b.width - 1, `820/1280: the panel stands right of the canvas, not over it (${pb.x} vs ${b.x + b.width})`);
  } else h.expect((await tid("draw-panel").count()) === 0, "390: no side panel");

  // the run
  await openAttrs();
  // #2412 G1 (every width): the tape, Размер · Цвет · Этаж, the profile on top; the hanger, material, gauge, roof edge under «Ещё»
  for (const id of ["attr-story", "attr-size", "attr-color", "attr-length", "attr-profile"]) h.expect((await tid(id).count()) === 1, `${id} on top`);
  for (const id of ["attr-size", "attr-color", "attr-story", "attr-profile"]) h.expect((await tid(`${id}-button`).count()) === 1, `${id} is a field (no chips)`);
  h.expect((await tid("attr-finish").count()) === 0, "no separate painted / bare: «Без покраски» is a colour (founder 09.11)");
  h.expect((await tid("attr-hanger").count()) === 0 && (await tid("attr-mount").count()) === 0, "hangers and the roof edge under «Ещё»");
  h.expect((await tid("attr-more").count()) === 1, "one «Ещё», closed");
  if (!wide) await h.shot("props");
  await more();
  for (const id of ["attr-hanger", "attr-material", "attr-mount"]) h.expect((await tid(id).count()) === 1, `«Ещё»: ${id}`);
  h.expect((await tid("attr-length-reset").count()) === 0, "a drawn length: no «По рисунку» (П20.16: the accuracy is the drawing's, not a line's)");
  h.expect((await chosen("attr-profile")) === "K", "K-style by default");
  await choose("attr-profile", "half_round");
  await waitFor(async () => (await chosen("attr-profile")) === "Полукруглый", "half round picked");
  h.expect((await chosen("attr-size")) === "5″", "the size follows: 5″");
  h.expect((await chosen("attr-hanger")) === "Shank #10 (доска)", "the hanger follows the profile: shank #10 on fascia");
  await choose("attr-color", "brown");
  await waitFor(async () => (await chosen("attr-color")) === "Коричневый", "brown picked");
  await h.shot("run");

  h.expect(/^Gutter № \d+$/.test((await tid("attr-title").innerText()).trim()), "v43: the window's title is «Gutter № N»");
  // a bad tape changes nothing
  await tid("attr-length-in").locator("input").fill("12"); // inches first: a valid foot typed first is a length already (v43: read at once)
  await tid("attr-length-ft").locator("input").fill("25");
  await tid("attr-length-bad").waitFor({ timeout: 3000 });
  h.expect((await tid("attr-length-reset").count()) === 0, "a bad tape keeps the drawn length");
  // the tape
  await tid("attr-length-in").locator("input").fill("6");
  h.expect((await tid("attr-length-apply").count()) === 0, "v43: no «Применить» at the length — the field is read at once");
  await waitFor(async () => (await tid("attr-length-reset").count()) === 1, "taped: «По рисунку» puts the drawn one back"); // i18n-old: ok — «taped» is the data value, not a label
  h.expect((await tid("attr-length-bad").count()) === 0, "the warning is gone");
  await waitFor(async () => (await labels()).some((t) => /^25′ 6″/.test(t)), "the label shows the taped length"); // i18n-old: ok — «taped» is the data value, not a label
  await waitFor(async () => {
    const r = (await stored()).find((e) => e.kind === "run");
    return r && r.confidence === "taped" && r.geom.lengthIn === 306 && r.attrs.profile === "half_round" && r.attrs.color === "brown" && r.attrs.hanger === "hr_shank_fascia"; // i18n-old: ok — «taped» is the data value, not a label
  }, "the store: the run's attributes and the tape");
  await h.shot("taped"); // i18n-old: ok — «taped» is the data value, not a label
  // v43 PR B: «фут + дюйм | мм» — the same length in millimetres, read at once; the strip is inches only
  await tid("attr-length-unit-mm").click();
  h.expect((await tid("attr-length-tape").count()) === 0, "in mm there is no tape strip");
  await tid("attr-length-mm").locator("input").fill("9144"); // 360″ = 30′
  await waitFor(async () => (await labels()).some((t) => /^30′/.test(t)), "9144 mm: the label shows 30′");
  await tid("attr-length-unit-ftin").click();
  await waitFor(async () => (await tid("attr-length-ft").locator("input").inputValue()) === "30", "back in feet: the field shows 30");
  await tid("attr-length-unit-mm").click();
  await tid("attr-length-mm").locator("input").fill("7772"); // 25′ 6″ again (306″) — the steps below go on from it
  await waitFor(async () => (await labels()).some((t) => /^25′ 6″/.test(t)), "7772 mm: 25′ 6″ again");
  await tid("attr-length-mm").locator("input").fill("0");
  await tid("attr-length-bad").waitFor({ timeout: 3000 });
  await tid("attr-length-mm").locator("input").fill("7772");
  await tid("attr-length-unit-ftin").click();

  // «Назад» on the canvas takes the tape back
  await closeAttrs();
  await tid("draw-undo").getByRole("button").click();
  await waitFor(async () => (await labels()).every((t) => !/^25′ 6″/.test(t)), "«Назад»: the drawn length again");
  await tid("draw-redo").getByRole("button").click(); // «Вперёд» on the toolbar (founder 09.11)
  await waitFor(async () => (await labels()).some((t) => /^25′ 6″/.test(t)), "«Ещё» → «Вернуть»: the tape again");

  // a downspout on the run
  await tid("draw-tool-ds").getByRole("button").click();
  await p.mouse.click(b.x + b.width * 0.25, y + 3);
  await waitFor(async () => (await svg().locator("circle").count()) === 1, "a downspout");
  await openAttrs();
  // #2412 G1 (every width): Вид · Размер, elbows, offsets, Низ, Верх on top; one «Ещё» (colour, material, wall…) — closed for this new element
  for (const id of ["attr-ds-kind", "attr-ds-size", "attr-elbow-qty", "attr-bottom", "attr-head"]) h.expect((await tid(id).count()) === 1, `${id} on top`);
  for (const id of ["attr-color", "attr-wall", "attr-wall-kit"]) h.expect((await tid(id).count()) === 0, `${id} under «Ещё»`);
  h.expect((await tid("attr-more").count()) === 1, "one «Ещё», closed for the new element");
  // the kind is a field (no tiles): its menu marks the chosen one (a check, read as selected)
  h.expect((await attrChosen(p, "attr-ds-kind")) === "rectPlain", "rectangular, smooth by default");
  await choose("attr-ds-kind", "roundPlain"); // the kind: round
  h.expect((await attrChosen(p, "attr-ds-kind")) === "roundPlain", "the menu marks the round kind now");
  await waitFor(async () => (await chosen("attr-ds-size")) === "3″", "round: the size follows (3″)");
  await more();
  await choose("attr-wall", "brick");
  await waitFor(async () => (await chosen("attr-wall-kit")) === "Conductor band + анкеры", "brick: its default wall kit");
  await h.shot("downspout");
  await waitFor(async () => {
    const d = (await stored()).find((e) => e.kind === "downspout");
    return d && d.attrs.shape === "round" && d.attrs.size === "3" && d.attrs.wall === "brick";
  }, "the store: the downspout's attributes");

  // a reload: all of it is back
  await p.waitForTimeout(1300); // the 1 s save after the last edit
  await p.reload();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await waitFor(async () => (await labels()).some((t) => /^25′ 6″/.test(t)), "after a reload: the taped length"); // i18n-old: ok — «taped» is the data value, not a label
  // the reload fits the drawing anew: tap the run where it is drawn now («Желоб» tool: a tap picks)
  const at = await svg().locator("line:not([id^=halo])").first().evaluate((l) => {
    const r = l.ownerSVGElement.getBoundingClientRect();
    const n = (k) => Number(l.getAttribute(k));
    // three quarters along: the downspout sits near the start (the tape redraws the line, П20.13)
    return [r.x + (n("x1") + n("x2") * 3) / 4, r.y + (n("y1") + n("y2") * 3) / 4];
  });
  await p.mouse.click(at[0], at[1]);
  await waitFor(async () => /Gutter/.test((await tid("draw-selected").count()) ? await tid("draw-selected").innerText() : ""), "the run picked");
  await openAttrs();
  await more();
  h.expect((await tid("attr-length-reset").count()) === 1, "after a reload: still taped"); // i18n-old: ok — «taped» is the data value, not a label
  h.expect((await chosen("attr-profile")) === "Полукруглый" && (await chosen("attr-color")) === "Коричневый", "after a reload: profile and colour");
};
