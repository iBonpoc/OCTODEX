/**
 * e2e 300 — строка сметы на месте (DS §8.3, спека редактора сметы Р1–Р2, РС-4b-1), every view; finds by testID (rule 19):
 * - «Новая позиция»: the row opens in place, the cursor is in the name; the sum shows;
 * - one is open: a tap on another folds the first (what is typed stays) and opens the second;
 * - a wrong number («abc») keeps the row open, the error stands under the field, the other row does not open;
 * - a row with nothing typed in it folds without a trace;
 * - «⋯»: «Дублировать» (a copy right after), «Удалить» (gone, «Вернуть» brings it back);
 * - «Из каталога»: one thing — open, the cursor in the quantity.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const vis = (sel) => p.locator(sel).locator("visible=true");
  const rows = () => vis('[data-testid^="est-line-"]');
  const waitCount = (sel, n, what) => p.waitForFunction(([s, k]) => document.querySelectorAll(s).length === k, [sel, n], { timeout: 5000 }).catch(() => h.expect(false, what));
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  h.expect((await vis('[data-testid^="est-line-"]').count()) === 0, "a fresh estimate: no rows");

  // «Новая позиция»: open in place, the cursor in the name
  await tid("est-add-new").getByRole("button").click();
  const nameBox = vis('[data-testid^="est-name-"]').first().locator("input");
  await nameBox.waitFor({ timeout: 3000 });
  await p.waitForFunction(() => document.activeElement?.closest('[data-testid^="est-name-"]'), null, { timeout: 3000 });
  await nameBox.fill("Gutter");
  await vis('[data-testid^="est-price-"]').first().locator("input").fill("10");
  await vis('[data-testid^="est-qty-"]').first().locator("input").fill("3");
  const figures = vis('[data-testid^="est-figures-"]').first();
  await figures.waitFor({ timeout: 3000 });
  h.expect(/\$30/.test(await figures.innerText()), `the sum of the open row: 3 × $10 (${await figures.innerText()})`);

  // a second row; the first folds when the second opens, what is typed stays
  await tid("est-add-new").getByRole("button").click();
  await waitCount('[data-testid^="est-name-"]', 1, "one open row: one name field");
  const folded = await rows().first().innerText();
  h.expect(/Gutter/.test(folded) && /\$30/.test(folded), `the first row folded: «Кратко» — its name and sum (${folded.replace(/\n/g, " ")})`);

  // a wrong quantity keeps the row open: the error, the other row does not open
  await vis('[data-testid^="est-name-"]').first().locator("input").fill("Hanger");
  await vis('[data-testid^="est-qty-"]').first().locator("input").fill("abc");
  await vis('[data-testid^="field-est-qty-"][data-testid$="-error"], [data-testid^="est-qty-"][data-testid$="-error"]').first().waitFor({ timeout: 3000 });
  await rows().first().click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-name-"]').length === 1, null, { timeout: 3000 });
  h.expect((await vis('[data-testid^="est-name-"]').first().locator("input").inputValue()) === "Hanger", "still the second row that is open (the first did not open over an error)");
  await vis('[data-testid^="est-qty-"]').first().locator("input").fill("2");

  // the first row opens now; the second folds with what is typed
  await rows().first().click();
  await p.waitForFunction(() => document.querySelector('[data-testid^="est-name-"] input')?.value === "Gutter", null, { timeout: 3000 });

  // the line's menu (#2421: a long press of its head) → «Дублировать»
  const firstId = (await rows().first().getAttribute("data-testid")).replace("est-line-", "");
  await require("../estimateLine.cjs").menu(h, firstId);
  await tid(`est-act-duplicate-${firstId}`).click();
  await waitCount('[data-testid^="est-line-"]', 3, "a copy stands in the list (3 rows)");

  // the line's menu → «Удалить» → «Вернуть»
  await require("../estimateLine.cjs").menu(h, firstId);
  await tid(`est-act-delete-${firstId}`).click();
  await waitCount('[data-testid^="est-line-"]', 2, "deleted: 2 rows");
  // «Отменить» of the newest toast, by testID (the helper presses until it takes)
  await require("../estimateLine.cjs").undo(h);
  const back = await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-line-"]').length === 3, null, { timeout: 3000 }).then(() => true, () => false);
  h.expect(back, "«Вернуть» brought it back (3 rows)");

  // «Из каталога»: one thing — its row opens
  // wave 1 п.6: «Каталог» is one of the four add buttons over the lines (no «˅» menu any more)
  h.expect((await p.getByTestId("est-add-layers").count()) === 0, "no «˅» menu beside «＋ Позиция»");
  for (const b of ["est-add-new", "est-add-section", "est-add-catalog", "est-from-template"]) h.expect((await p.getByTestId(b).locator("visible=true").count()) === 1, `the add button ${b} is there`);
  await tid("est-add-catalog").getByRole("button").click();
  await h.sheet().locator("input").first().fill("carpet");
  await h.sheet().getByText("Carpet removal").first().click();
  // (the cursor in the quantity is the phone's: the browser gives the focus back to the button that opened the sheet)
  await vis('[data-testid^="est-qty-"]').first().locator("input").fill("7");
  const carpetId = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");

  // the menu → «Заменить»: another thing in the place, the quantity stays
  await require("../estimateLine.cjs").menu(h, carpetId);
  await tid(`est-act-replace-${carpetId}`).click();
  await h.sheet().locator("input").first().fill("railing bracket");
  await h.sheet().getByText("Railing bracket", { exact: true }).first().click();
  await p.waitForFunction((id) => !!document.querySelector(`[data-testid="est-line-${id}"]`), carpetId, { timeout: 3000 });
  await p.waitForFunction(() => document.querySelector('[data-testid^="est-name-"] input')?.value === "Railing bracket", null, { timeout: 3000 });
  h.expect((await vis('[data-testid^="est-qty-"]').first().locator("input").inputValue()) === "7", "replaced: the quantity stayed (7)");

};
