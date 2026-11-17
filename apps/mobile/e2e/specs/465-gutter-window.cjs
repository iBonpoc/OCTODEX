/**
 * e2e 465 — окно gutter v6 правит копию (#1858; спека 33-gutters-windows §3.17 е; DS §7.3 исключение Gutters). Every view.
 * - «Gutter № 1» on top, no «✕»: «Закрыть | Сохранить» at the bottom, 44 each;
 * - size · colour · storey in one row; the length ft · in, the fraction keys and the tape;
 * - a colour and a length typed change NOTHING on the drawing or in the store until «Сохранить»;
 * - 390: «Закрыть» over an unsaved copy asks «Сохранить изменения?» — «Не сохранять» drops it, nothing written;
 * - «Сохранить» writes colour and length at once; ONE «Назад» on the canvas takes both back;
 * - a length that is not a number is not saved: the line under the field, the window stays.
 * Finds things by testID; waits on what it checks.
 */
const { attrValue, chooseAttr, openProps, saveAttrs, skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const labels = () => svg().locator("text").evaluateAll((ts) => ts.map((t) => t.textContent || ""));
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const storedRun = () =>
    p.evaluate((k) => {
      const g = (JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters;
      return (g ? g.elements : []).find((e) => e.kind === "run") || null;
    }, KEY);
  const panel = () => tid("attr-panel");
  const open = async () => {
    if (!wide) await openProps(p);
    await panel().first().waitFor({ timeout: 5000 });
    await tid("attr-foot").waitFor({ timeout: 5000 });
  };

  // the trial on, one run drawn
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  const a0 = [b.x + b.width * 0.08, y], a1 = [b.x + b.width * 0.45, y];
  await p.mouse.move(a0[0], a0[1]);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(a0[0] + ((a1[0] - a0[0]) * i) / 12, y);
  await p.mouse.up();
  await skipLength(p);
  await waitFor(async () => (await svg().locator("line:not([id^=halo])").count()) === 1, "one run");
  await waitFor(async () => !!(await storedRun()), "the run is in the store");
  const before = await storedRun();
  const lenBefore = before.geom.lengthIn;

  // the window v6
  await open();
  h.expect((await tid("attr-title").innerText()).split("\n")[0].trim() === "Gutter № 1", "«Gutter № 1» on top");
  h.expect((await tid("sheet-close").count()) === 0 && (await tid("draw-panel-close").count()) === 0, "no «✕»: «Закрыть» is at the bottom (DS §7.3)");
  for (const id of ["attr-close", "attr-save"]) {
    const bb = await tid(id).getByRole("button").boundingBox();
    h.expect(bb && bb.height >= 43.5, `${id}: 44 visible (${bb && bb.height})`);
  }
  const s = await tid("attr-size").boundingBox(), c = await tid("attr-color").boundingBox(), st = await tid("attr-story").boundingBox();
  h.expect(Math.abs(s.y - c.y) < 2 && Math.abs(c.y - st.y) < 2 && s.x < c.x && c.x < st.x, "size · colour · storey in one row");
  h.expect((await tid("attr-length-fracs").count()) === 1 && (await tid("attr-length-tape").count()) === 1, "the length: fraction keys and the tape");
  h.expect((await tid("attr-length-apply").count()) === 0, "no «Применить»: the length is saved with the window");
  await h.shot("window");

  // a colour and a length into the copy: nothing written yet
  await chooseAttr(p, "attr-color", "brown");
  await waitFor(async () => /Коричневый/.test(await attrValue(p, "attr-color")), "the window shows brown");
  await tid("attr-length-ft").locator("input").fill("30");
  await tid("attr-length-in").locator("input").fill("0");
  await tid("attr-length-fracs-1-2").click();
  await p.waitForTimeout(1300); // the drawing's save runs a second after an edit: none must come
  const mid = await storedRun();
  h.expect(mid.attrs.color === before.attrs.color && mid.geom.lengthIn === lenBefore, "not saved yet: the store has the old colour and length");
  h.expect((await labels()).every((t) => !/30′/.test(t)), "not saved yet: the drawing has the old length");

  if (!wide) {
    // «Закрыть» over the unsaved copy: the question; «Не сохранять» — nothing written
    // TEMP (#1858): the scrim asks today; «Закрыть» at the bottom asks too once the core's Sheet lets its footer ask (Экраны №9)
    await p.getByRole("button", { name: "Закрыть", exact: true }).first().click({ position: { x: 10, y: 10 } });
    await p.getByText("Сохранить изменения?").first().waitFor({ timeout: 5000 });
    await h.shot("unsaved");
    await p.getByRole("button", { name: "Не сохранять", exact: true }).first().click();
    await panel().first().waitFor({ state: "detached", timeout: 5000 });
    const after = await storedRun();
    h.expect(after.attrs.color === before.attrs.color && after.geom.lengthIn === lenBefore, "«Не сохранять»: nothing written");
    await open();
    h.expect(!/Коричневый/.test(await attrValue(p, "attr-color")), "opened again: the window shows what is saved, not the dropped copy");
    await chooseAttr(p, "attr-color", "brown");
    await tid("attr-length-ft").locator("input").fill("30");
    await tid("attr-length-in").locator("input").fill("0");
    await tid("attr-length-fracs-1-2").click();
  }

  // «Сохранить»: colour and length at once
  await saveAttrs(p);
  await waitFor(async () => {
    const r = await storedRun();
    return r && r.attrs.color === "brown" && r.geom.lengthIn === 360.5;
  }, "«Сохранить»: the store has brown and 30′ 0½″");
  await waitFor(async () => (await labels()).some((t) => /30′/.test(t)), "the drawing shows the new length");
  await h.shot("saved");

  // ONE «Назад» takes both back
  if (wide) {
    await tid("attr-close").getByRole("button").click(); // saved: «Закрыть» asks nothing, the pick goes
    await tid("draw-panel-empty").waitFor({ timeout: 5000 });
  }
  await tid("draw-undo").getByRole("button").click();
  await waitFor(async () => {
    const r = await storedRun();
    return r && r.attrs.color === before.attrs.color && r.geom.lengthIn === lenBefore;
  }, "one «Назад»: the colour and the length are both back");

  // a length that is not a number: not saved, the line under the field, the window stays
  if (wide) await p.mouse.click((a0[0] + a1[0]) / 2, y); // the «Желоб» tool: a tap picks, the panel shows it
  await open();
  await tid("attr-length-in").locator("input").fill("14");
  await tid("attr-save").getByRole("button").click();
  await tid("attr-length-bad").waitFor({ timeout: 5000 });
  h.expect((await panel().count()) > 0, "the window stays open");
  const bad = await storedRun();
  h.expect(bad.geom.lengthIn === lenBefore, "a bad length: nothing written");
  await h.shot("bad-length");
};
