/**
 * e2e 372 — «Итого ˅» (DS §8.9, #1362), every view, by testID:
 * - a line in the red ($1,000, cost $1,200) and an add-on «на выбор клиента» ($500, тестовые цены);
 * - phone (390): the panel's «Итого $1,000 ˅» opens what the total is made of above the buttons — subtotal, «если клиент
 *   включит всё на выбор — итог $1,500» (the engine's), «Только для вас» with the profit «в минус»; a second press folds it;
 * - 820 / 1280 (no panel): the totals card has the same «если включит» row and «Только для вас» (cost $1,200, «в минус $200»);
 * - the tech: no «Только для вас» at all.
 */
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const count = (id) => p.getByTestId(id).locator("visible=true").count();
  const vis = (sel) => p.locator(sel).locator("visible=true");

  await h.go("/today");
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  raw.db.estimateTemplates = [];
  await h.seed(DB_KEY, raw);
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });

  // a line in the red: $1,000, cost $1,200
  await tid("est-add-new").getByRole("button").click();
  const a = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");
  await vis(`[data-testid="est-name-${a}"] input`).first().fill("Install gutters (тестовые)");
  await vis(`[data-testid="est-price-${a}"] input`).first().fill("1000");
  await vis(`[data-testid="est-cost-${a}"] input`).first().fill("1200");
  await line.fold(h);
  // an add-on «на выбор клиента»: $500
  await tid("est-add-new").getByRole("button").click();
  const b = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");
  await vis(`[data-testid="est-name-${b}"] input`).first().fill("Gutter guards (тестовые)");
  await vis(`[data-testid="est-price-${b}"] input`).first().fill("500");
  await vis(`[data-testid="est-cost-${b}"] input`).first().fill("200");
  await tid(`est-more-${b}`).click();
  await tid(`est-optional-toggle-${b}`).getByRole("switch").click();
  await line.fold(h);

  const phone = h.layout.width < 820;
  if (phone) {
    // the panel: folded — only «Итого $1,000 ˅»
    await tid("est-bar-total").waitFor({ timeout: 3000 });
    h.expect(/\$1,000(?![.\d])/.test(await tid("est-bar-total").innerText()), "the panel: «Итого $1,000»");
    h.expect((await count("est-bar-breakdown")) === 0, "folded at first");
    await tid("est-bar-total").click();
    await tid("est-bar-breakdown").waitFor({ timeout: 3000 });
    const bd = tid("est-bar-breakdown");
    h.expect(/\$1,000(?![.\d])/.test(await bd.getByTestId("est-tot-subtotal").innerText()), "subtotal $1,000 (the add-on is not in it)");
    h.expect(/\$1,500(?![.\d])/.test(await bd.getByTestId("est-tot-ifAll").innerText()), "«если клиент включит всё на выбор» — $1,500");
    h.expect(/\$1,200(?![.\d])/.test(await bd.getByTestId("est-tot-cost").innerText()), "«Только для вас»: the cost $1,200");
    const profit = await bd.getByTestId("est-tot-profit").innerText();
    h.expect(/в минус \$200(?![.\d])/.test(profit) && !/-/.test(profit), `«Только для вас»: the profit in the red, one sign — the word (${profit})`);
    h.expect((await tid("est-bar-total").getAttribute("aria-expanded")) === "true", "read out as open");
    await h.shot("open");
    await tid("est-bar-total").click();
    await p.waitForFunction(() => !document.querySelector('[data-testid="est-bar-breakdown"]'), null, { timeout: 3000 });
  } else {
    h.expect((await count("est-bar-total")) === 0, "no panel from 820");
  }
  // the totals card (every width): the same «если включит» row and «Только для вас»
  const card = tid("est-card-breakdown");
  await card.scrollIntoViewIfNeeded();
  h.expect(/\$1,500(?![.\d])/.test(await card.getByTestId("est-tot-ifAll").innerText()), "the card: «если включит — итог $1,500»");
  h.expect((await card.getByTestId("est-tot-own").count()) === 1, "the card: «Только для вас»");
  h.expect(/\$1,200(?![.\d])/.test(await card.getByTestId("est-tot-cost").innerText()), "the card: the cost $1,200");
  h.expect(/в минус \$200(?![.\d])/.test(await card.getByTestId("est-tot-profit").innerText()), "the card: the profit in the red");
  await h.shot("card");

  // the tech: no «Только для вас» anywhere (cost and profit are not his), «если включит» stays (the draft opens again)
  await h.seed("octo.role.v1", "tech");
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-card-breakdown").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("est-tot-own").count()) === 0, "the tech: no «Только для вас»");
  h.expect((await count("est-tot-ifAll")) >= 1, "the tech: «если включит» is there");
};
