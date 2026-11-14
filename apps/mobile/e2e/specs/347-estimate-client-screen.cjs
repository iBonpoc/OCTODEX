/**
 * e2e 347 — «Экран для клиента» (DS §8.3, spec 2026-11-12 §11.2.8, #1307 part «г»), every view, by testID:
 * - «⋯» in the header → «Экран для клиента»: the «расход» of a hidden line, the profit of the open row and the margin under
 *   the totals are gone; under the title — «Экран для клиента · выйти»;
 * - the options card keeps no owner's button («Добавить вариант»);
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
  // «Только для вас» counted: a phone has it in the panel's «Итого ˅» (opened for the count, then folded), from 820 in the card
  const ownCount = async () => {
    const phone = h.layout.width < 820;
    if (phone) {
      await tid("est-bar-total").click();
      await tid("est-bar-breakdown").waitFor({ timeout: 3000 });
    }
    const n = await count('[data-testid="est-tot-own"]');
    if (phone) {
      await tid("est-bar-total").click();
      await p.waitForFunction(() => !document.querySelector('[data-testid="est-bar-breakdown"]'), null, { timeout: 3000 });
    }
    return n;
  };
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
  h.expect((await count('[data-testid="est-var-add"]')) === 0, "client screen: no «Добавить вариант» (the owner's button)");
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
  h.expect((await count('[data-testid="est-var-add"]')) === 1, "«Добавить вариант» is back");
  h.expect((await ownCount()) >= 1, "«Только для вас» is back");
};
