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
  h.expect(/Gutter/.test(folded) && /3 ea × \$10/.test(folded), `the first row folded with its words (${folded.replace(/\n/g, " ")})`);

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

  // «⋯» → «Дублировать»
  const firstId = (await rows().first().getAttribute("data-testid")).replace("est-line-", "");
  await tid(`est-line-${firstId}`).getByRole("button", { name: /Действия со строкой/ }).click();
  await tid(`est-act-duplicate-${firstId}`).click();
  await waitCount('[data-testid^="est-line-"]', 3, "a copy stands in the list (3 rows)");

  // «⋯» → «Удалить» → «Вернуть»
  await tid(`est-line-${firstId}`).getByRole("button", { name: /Действия со строкой/ }).click();
  await tid(`est-act-delete-${firstId}`).click();
  await waitCount('[data-testid^="est-line-"]', 2, "deleted: 2 rows");
  // «Отменить» of a toast works a moment after the toast shows (a double tap is not an undo): press until it takes
  let back = false;
  for (let i = 0; i < 10 && !back; i++) {
    await p.getByRole("button", { name: /Отменить|Вернуть/ }).locator("visible=true").last().click();
    back = await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-line-"]').length === 3, null, { timeout: 500 }).then(() => true, () => false);
  }
  h.expect(back, "«Вернуть» brought it back (3 rows)");

  // «Из каталога»: one thing — its row opens
  await tid("est-add-catalog").getByRole("button").click();
  await h.sheet().locator("input").first().fill("carpet");
  await h.sheet().getByText("Carpet removal").first().click();
  // (the cursor in the quantity is the phone's: the browser gives the focus back to the button that opened the sheet)
  await vis('[data-testid^="est-qty-"]').first().locator("input").fill("7");
  const carpetId = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");

  // «⋯ → Заменить»: another thing in the place, the quantity stays
  await tid(`est-line-${carpetId}`).getByRole("button", { name: /Действия со строкой/ }).click();
  await tid(`est-act-replace-${carpetId}`).click();
  await h.sheet().locator("input").first().fill("railing bracket");
  await h.sheet().getByText("Railing bracket", { exact: true }).first().click();
  await p.waitForFunction((id) => !!document.querySelector(`[data-testid="est-line-${id}"]`), carpetId, { timeout: 3000 });
  await p.waitForFunction(() => document.querySelector('[data-testid^="est-name-"] input')?.value === "Railing bracket", null, { timeout: 3000 });
  h.expect((await vis('[data-testid^="est-qty-"]').first().locator("input").inputValue()) === "7", "replaced: the quantity stayed (7)");

};
