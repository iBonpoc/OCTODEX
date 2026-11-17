/**
 * e2e 466 — «Сохранить изменения?» with the words of the Gutters property windows (DS §7.3 exception, #1858). Every view,
 * motion on (not reduced), in the showcase «Окна»:
 * - the sheet «Закрыть | Сохранить» (`Sheet askBack` + `dirty`): a change, then «Закрыть» in the footer (`useSheetClose`) →
 *   the question with «Сохранить», «Не сохранять», «Назад»; «Назад» keeps the sheet and the change; «Не сохранять» closes
 *   and the change is gone; nothing changed — «Закрыть» closes at once;
 * - the scrim (and on 390 the swipe) with a change → the same question; «Сохранить» keeps the change;
 * - `UnsavedDialog` (the window beside a canvas from 820): the same three; Esc is «Назад»; «Сохранить» is called once.
 * By testID; waits on what it checks.
 */
const { sheetGone, pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const field = () => vis("showcase-unsaved-field").locator("input").first();
  const open = async () => {
    await vis("showcase-sheet-unsaved").getByRole("button").click();
    await vis("showcase-unsaved-field").waitFor({ timeout: 5000 });
  };
  const words = async () => [await vis("unsaved-save").innerText(), await vis("unsaved-discard").innerText(), await vis("unsaved-back").innerText()];

  await p.emulateMedia({ reducedMotion: "no-preference" }); // motion on: the question over a sheet that moves
  await h.go("/settings/design-system/windows");
  await vis("showcase-windows").waitFor({ timeout: 8000 });

  // nothing changed: «Закрыть» closes at once
  await open();
  await vis("showcase-unsaved-close").click();
  await sheetGone(p);
  h.expect(true, "no change: «Закрыть» closes without a question");

  // a change, «Закрыть» → the question with the three words of the exception
  await open();
  await field().fill("Seamless 6");
  await vis("showcase-unsaved-close").click();
  await vis("unsaved-ask").waitFor({ timeout: 4000 });
  const w = await words();
  h.expect(w[0] === "Сохранить" && w[1] === "Не сохранять" && w[2] === "Назад", `the words of DS §7.3: ${w.join(" · ")}`);
  const hs = await Promise.all(["unsaved-save", "unsaved-discard", "unsaved-back"].map(async (id) => (await vis(id).boundingBox()).height));
  h.expect(hs.every((x) => x >= 43.5), `each answer is 44 high (${hs.join(", ")})`);
  const ys = await Promise.all(["unsaved-save", "unsaved-discard", "unsaved-back"].map(async (id) => (await vis(id).boundingBox()).y));
  h.expect(ys[0] < ys[1] && ys[1] < ys[2], "a column, «Сохранить» on top");
  h.expect(/у всех 3 одинаковых частей/.test(await vis("unsaved-ask").innerText()), "«askText»: what changed, under the heading");
  // the question stays where the sheet is, over its scrim (DS Б1/Б3): the scrim is up and the sheet's title is still there
  const layer = await p.evaluate(() => {
    const sc = [...document.querySelectorAll('[data-testid="sheet-scrim"]')].pop();
    const ask = [...document.querySelectorAll('[data-testid="unsaved-ask"]')].pop();
    const panel = [...document.querySelectorAll('[data-testid="sheet-panel"]')].pop();
    return { scrim: sc ? Number(getComputedStyle(sc).opacity) : 0, inPanel: !!panel && panel.contains(ask), bottom: panel ? Math.round(panel.getBoundingClientRect().bottom) : -1 };
  });
  h.expect(layer.scrim > 0.5 && layer.inPanel, `the question is in the sheet, over its scrim (${JSON.stringify(layer)})`);
  h.expect(wide || Math.abs(layer.bottom - p.viewportSize().height) <= 2, `the sheet stays at the bottom (${layer.bottom})`);
  h.expect((await vis("sheet-panel").innerText()).includes("Окно свойств"), "the sheet's title stays over the question");
  await h.shot("ask");
  // «Назад»: the sheet and the change stay
  await vis("unsaved-back").click();
  await vis("showcase-unsaved-field").waitFor({ timeout: 4000 });
  h.expect((await field().inputValue()) === "Seamless 6", "«Назад» keeps the change");
  // «Не сохранять»: closes, the change is gone
  await vis("showcase-unsaved-close").click();
  await vis("unsaved-discard").click();
  await sheetGone(p);
  await open();
  h.expect((await field().inputValue()) === "", "«Не сохранять» threw the change away");

  // the scrim with a change → the same question; «Сохранить» keeps it
  await field().fill("K-style 5");
  await p.getByTestId("sheet-scrim").getByRole("button").last().click({ position: { x: 5, y: 5 } });
  await vis("unsaved-ask").waitFor({ timeout: 4000 });
  h.expect((await vis("unsaved-back").innerText()) === "Назад", "the scrim asks the same question");
  await vis("unsaved-save").click();
  await sheetGone(p);
  await open();
  h.expect((await field().inputValue()) === "K-style 5", "«Сохранить» kept the change");
  await vis("showcase-unsaved-close").click();
  await sheetGone(p);

  // UnsavedDialog: the same three; Esc is «Назад»; «Сохранить» is called once
  await vis("showcase-unsaved-dialog").getByRole("button").first().click();
  await vis("unsaved-dialog").waitFor({ timeout: 4000 });
  const dw = await words();
  h.expect(dw.join(" · ") === "Сохранить · Не сохранять · Назад", `the dialog's words: ${dw.join(" · ")}`);
  h.expect(/3 одинаковых частей/.test(await vis("unsaved-dialog").innerText()), "the owner's line under the heading");
  await p.waitForFunction(() => { const e = [...document.querySelectorAll('[data-testid="unsaved-dialog"]')].pop(); return !!e && Number(getComputedStyle(e).opacity) === 1; }, null, { timeout: 3000 }); // faded in
  await h.shot(wide ? "dialog-wide" : "dialog");
  await pressEscUntilClosed(p, p.getByTestId("unsaved-dialog").locator("visible=true").first());
  h.expect(/: 0$/.test((await vis("showcase-unsaved-saved").innerText()).trim()), "Esc is «Назад»: nothing saved");
  await vis("showcase-unsaved-dialog").getByRole("button").first().click();
  await vis("unsaved-save").click();
  await p.waitForFunction(() => /: 1$/.test(([...document.querySelectorAll('[data-testid="showcase-unsaved-saved"]')].find((e) => e.offsetParent !== null)?.textContent || "").trim()), null, { timeout: 4000 });
  h.expect((await p.getByTestId("unsaved-dialog").count()) === 0, "«Сохранить» saves once and closes the dialog");
};
