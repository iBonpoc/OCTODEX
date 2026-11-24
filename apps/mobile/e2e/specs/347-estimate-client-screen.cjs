/**
 * e2e 347 — «Экран для клиента» (DS §8.3, spec 2026-11-12 §11.2.8, #1307 part «г»), every view, by testID:
 * - «⋯» in the header → «Экран для клиента»: the «расход» of a hidden line, the profit of the open row and the margin under
 *   the totals are gone; under the title — «Экран для клиента · выйти»;
 * - the options card keeps no owner's button («Копировать вариант», its «⋯»; v2: the card comes with a second option);
 * - «выйти» brings them back.
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const { sheetGone } = require("../sheet.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const vis = (sel) => p.locator(sel).locator("visible=true");
  const count = (sel) => vis(sel).count();
  // the page's words without the toast (the toast of the mode itself names «себестоимость»)
  // «Только для вас» counted: a phone has it in the sheet of the bar's «Итого ˅» (opened for the count, then closed), from 820 in the card
  // #2387 (founder 21.11, С5: «шторку убрать, разбор суммы только в карточке внизу»): «Только для вас» is the totals card's, every width
  const ownCount = async () => count('[data-testid="est-tot-own"]');
  const page = () => p.evaluate(() => {
    const toasts = [...document.querySelectorAll('[data-testid="toast-text"]')].map((e) => e.innerText);
    return toasts.reduce((all, x) => all.split(x).join(""), document.body.innerText);
  });

  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  // a priced line with a cost, and a hidden $0 line with a cost
  await tid("est-add-new").getByRole("button").click();
  const a = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");
  await vis(`[data-testid="est-name-${a}"] input`).first().fill("Gutter clean (тестовые)");
  await vis(`[data-testid="est-price-${a}"] input`).first().fill("100");
  await vis(`[data-testid="est-cost-${a}"] input`).first().fill("40");
  await line.fold(h);
  await tid("est-add-new").getByRole("button").click();
  const b = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");
  await vis(`[data-testid="est-name-${b}"] input`).first().fill("Haul-away (тестовые)");
  await vis(`[data-testid="est-price-${b}"] input`).first().fill("0");
  await vis(`[data-testid="est-cost-${b}"] input`).first().fill("30");
  await tid(`est-more-${b}`).click();
  await tid(`est-hide-${b}`).getByRole("switch").click();
  await line.fold(h);
  await tid(`est-spend-${b}`).waitFor({ timeout: 3000 });
  // «Только для вас» (cost, profit) under the totals (#1362, DS §8.9)
  h.expect((await ownCount()) >= 1, "the owner sees «Только для вас» under the totals");
  h.expect((await count('[data-testid="est-client-off"]')) === 0, "no «выйти» before the mode");

  // «⋯ → Экран для клиента»
  await tid("est-menu").getByRole("button").click();
  await tid("est-menu-client").click();
  await sheetGone(p);
  await tid("est-client-off").waitFor({ timeout: 3000 });
  h.expect((await count(`[data-testid="est-spend-${b}"]`)) === 0, "client screen: no «расход» of the hidden line");
  h.expect((await ownCount()) === 0 && !/Себестоимость|Прибыль/.test(await page()), "client screen: no cost, no profit under the totals");
  await tid(`est-line-${a}`).click();
  const fig = await tid(`est-figures-${a}`).innerText();
  h.expect(!/прибыль/i.test(fig), `client screen: the open row shows no profit (${fig})`);
  h.expect((await count(`[data-testid="est-cost-${a}"]`)) === 0, "client screen: no cost field in the open row");
  await line.fold(h);
  await h.shot("client");

  // «Экран для клиента · выйти»: everything is back
  await tid("est-client-off").getByRole("button").click();
  await tid(`est-spend-${b}`).waitFor({ timeout: 3000 });
  h.expect((await count('[data-testid="est-client-off"]')) === 0, "«выйти» is gone");
  h.expect((await ownCount()) >= 1, "«Только для вас» is back");

  // the options card keeps no owner's button (v2 #2350: with one option there is no card — «Вариант» is in «слои»; a second
  // option brings the card with «Копировать вариант» and «⋯ варианта»)
  await require("../estimateLine.cjs").addOption(h);
  await tid("est-var-copy").waitFor({ timeout: 5000 });
  await tid("est-menu").getByRole("button").click();
  await tid("est-menu-client").click();
  await tid("est-client-off").waitFor({ timeout: 3000 });
  h.expect((await count('[data-testid^="est-var-total-"]')) === 2, "client screen: the options are still there to pick");
  h.expect((await count('[data-testid="est-var-copy"]')) + (await count('[data-testid="est-var-more"]')) === 0, "client screen: no «Копировать вариант» / «⋯» of the option (the owner's buttons)");
  await tid("est-client-off").getByRole("button").click();
  await tid("est-var-copy").waitFor({ timeout: 3000 });
  h.expect((await count('[data-testid="est-var-more"]')) === 1, "the option's owner's buttons are back");
};
