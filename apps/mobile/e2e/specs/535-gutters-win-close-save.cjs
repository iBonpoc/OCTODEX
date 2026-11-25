/**
 * e2e 535 — окно gutter: «Закрыть | Сохранить» и вопрос о несохранённом (DS §7.3, Б1; #2412 PR3). Every view.
 * - the window has «Закрыть» and «Сохранить» at the bottom, no ✕ (390: the sheet's footer; 820/1280: the side column);
 * - no edit: «Закрыть» closes at once, no question;
 * - an edit (Этаж 1 → 2) shows on the canvas at once; «Закрыть» asks «Сохранить изменения?»; «Не сохранять» puts it back (canvas and store);
 * - an edit and «Сохранить»: kept in the store; ONE «Назад» on the toolbar takes the whole window's edit back.
 * Finds things by testID; waits on what it checks; waits until the sheet has left (CHECKS §9).
 */
const { openProps, skipLength, pickAttr, sheetGone, winSave, winClose } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries * 9 && !v; i++) { await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))); v = await ok(); }
    h.expect(!!v, what);
  };
  const storyStored = () =>
    p.evaluate((k) => {
      const g = (JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters;
      const run = (g?.elements || []).find((e) => e.kind === "run" && !e.deletedAt);
      return run ? Number(run.attrs?.story ?? 1) : null;
    }, KEY);
  const panelShown = async () => (await tid("attr-panel").count()) > 0;
  const openWin = async () => {
    if (!wide) await openProps(p);
    else if (!(await panelShown())) {
      // 820/1280: the column shows what is picked — a tap on the gutter picks it
      const b = await p.getByTestId("draw-surface").boundingBox();
      await p.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.42);
    }
    await tid("attr-panel").first().waitFor({ timeout: 5000 });
  };
  const asked = async () => (wide ? (await tid("attr-win-ask").count()) > 0 : (await p.getByText("Сохранить изменения?").locator("visible=true").count()) > 0);
  const discard = async () => {
    if (wide) await tid("attr-win-ask-discard").getByRole("button").click();
    else await p.getByRole("button", { name: "Не сохранять" }).locator("visible=true").click();
  };
  const closed = async () => {
    await waitFor(async () => !(await panelShown()), "the window is closed");
    await sheetGone(p);
  };

  // the trial on, one gutter
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Без срока/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  const a = [b.x + b.width * 0.08, y];
  const z = [b.x + b.width * 0.45, y];
  await p.mouse.move(a[0], a[1]);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((z[0] - a[0]) * i) / 12, y);
  await p.mouse.up();
  await skipLength(p);
  await waitFor(async () => (await storyStored()) === 1, "the gutter is in the store, story 1");

  // the buttons: «Закрыть | Сохранить» in one row at the bottom, no ✕
  await openWin();
  h.expect((await tid("attr-win-close").count()) === 1 && (await tid("attr-win-save").count()) === 1, "«Закрыть» and «Сохранить» in the window");
  const cb = await tid("attr-win-close").boundingBox();
  const sb = await tid("attr-win-save").boundingBox();
  h.expect(Math.abs(cb.y - sb.y) < 2 && cb.x < sb.x, `one row, «Закрыть» left of «Сохранить» (${cb.x},${cb.y} / ${sb.x},${sb.y})`);
  h.expect(Math.abs(cb.width - sb.width) < 2, `half the width each (${cb.width} / ${sb.width})`);
  h.expect(cb.height >= 44 && sb.height >= 44, `44 visible (${cb.height} / ${sb.height})`);
  h.expect((await tid("draw-panel-close").count()) === 0, "no ✕ in the window");
  await h.shot("window");

  // no edit: «Закрыть» closes at once
  await winClose(p);
  await closed();
  h.expect(!(await asked()), "no edit — no question");

  // an edit, «Закрыть» → the question → «Не сохранять»: as before
  await openWin();
  await pickAttr(p, "attr-story", "2");
  await waitFor(async () => (await storyStored()) === 2, "the edit shows at once (written to the phone)");
  await winClose(p);
  await waitFor(asked, "an edit — «Закрыть» asks «Сохранить изменения?»");
  await h.shot("ask");
  // 820/1280: the column stays under the question; 390: the question is in the sheet itself (DS Б1), the sheet stays
  h.expect(wide ? await panelShown() : (await tid("sheet-panel").count()) > 0, "the window stays while it asks");
  await discard();
  await closed();
  await waitFor(async () => (await storyStored()) === 1, "«Не сохранять» puts the story back");

  // an edit and «Сохранить»: kept; one «Назад» takes the window's edit back
  await openWin();
  await pickAttr(p, "attr-story", "3");
  await pickAttr(p, "attr-story", "2");
  await winSave(p);
  h.expect(!(await asked()), "«Сохранить» asks nothing");
  await waitFor(async () => (await storyStored()) === 2, "«Сохранить» keeps the edit");
  await tid("draw-undo").getByRole("button").click();
  await waitFor(async () => (await storyStored()) === 1, "one «Назад» takes back the whole window's edit (two choices — one step)");
};
