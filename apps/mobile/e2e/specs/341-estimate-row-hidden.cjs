/**
 * e2e 341 — a hidden line and «Нет цены» on the folded row (DS §8.3, spec §11.2.2–11.2.3, #1307 part «а»), every view,
 * by testID:
 * - a visible line at $0 carries «Нет цены» (a soft warning; «Сохранить» still works);
 * - hidden at $0 with a cost: «Скрыта от клиента», the hatch, the name pale; on the right — «расход $X» for the owner
 *   (who sees costs), $0 for the tech; the open row says «Сумма $0 · ваш расход $X»;
 * - a price typed in shows the line again: no «Скрыта», no «расход», no «Нет цены»;
 * - «На выбор клиента»: the mark on the folded row, «на выбор клиента, в итог не входит» in the open one.
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const vis = (sel) => p.locator(sel).locator("visible=true");
  const count = (sel) => p.locator(sel).count();

  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await tid("est-add-new").getByRole("button").click();
  const id = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");
  await vis(`[data-testid="est-name-${id}"] input`).first().fill("Haul-away (тестовые)");
  await vis(`[data-testid="est-qty-${id}"] input`).first().fill("2");
  await vis(`[data-testid="est-price-${id}"] input`).first().fill("0");
  await vis(`[data-testid="est-cost-${id}"] input`).first().fill("140");
  await line.fold(h);

  // visible at $0: «Нет цены»
  await tid(`est-noprice-${id}`).waitFor({ timeout: 3000 });
  h.expect(/Нет цены/.test(await tid(`est-noprice-${id}`).innerText()), "«Нет цены» on a visible $0 line");

  // hide it: «Скрыта от клиента», «расход $280» on the right, no «Нет цены»
  await tid(`est-line-${id}`).click();
  await tid(`est-more-${id}`).click();
  await tid(`est-hide-${id}`).getByRole("switch").click();
  h.expect(/ваш расход \$280/.test(await tid(`est-figures-${id}`).innerText()), "the open hidden row: «Сумма $0 · ваш расход $280»");
  await line.fold(h);
  await tid(`est-hidden-${id}`).waitFor({ timeout: 3000 });
  h.expect(/Скрыта от клиента/.test(await tid(`est-hidden-${id}`).innerText()), "«Скрыта от клиента»");
  h.expect(/расход \$280/.test(await tid(`est-sum-${id}`).innerText()), "the owner sees «расход $280»");
  h.expect((await count(`[data-testid="est-noprice-${id}"]`)) === 0, "a hidden line has no «Нет цены»");
  await h.shot("hidden");

  // the tech does not see costs: $0 on the right, no «расход»
  // (the draft of this new estimate is on the phone: it opens again for the tech, then for the owner)
  await h.seed("octo.role.v1", "tech");
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid(`est-line-${id}`).waitFor({ timeout: 8000 });
  const right = await tid(`est-sum-${id}`).innerText();
  h.expect(!/расход/.test(right) && /\$0\b/.test(right), `the tech: $0, no «расход» (${right})`);
  // open for the tech: «Сумма $0», no «ваш расход»
  await tid(`est-line-${id}`).click();
  const techFig = await tid(`est-figures-${id}`).innerText();
  h.expect(/\$0\b/.test(techFig) && !/расход/.test(techFig), `the tech's open hidden row: no «ваш расход» (${techFig})`);
  await line.fold(h);
  await h.seed("octo.role.v1", "director");
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid(`est-line-${id}`).waitFor({ timeout: 8000 });

  // a price typed in: shown again
  await tid(`est-line-${id}`).click();
  await vis(`[data-testid="est-price-${id}"] input`).first().fill("30");
  await p.getByText(/снова видна клиенту/i).first().waitFor({ timeout: 3000 });
  await line.fold(h);
  h.expect((await count(`[data-testid="est-hidden-${id}"]`)) === 0, "shown again: no «Скрыта от клиента»");
  h.expect(!/расход/.test(await tid(`est-sum-${id}`).innerText()), "shown again: no «расход»");
  h.expect((await count(`[data-testid="est-noprice-${id}"]`)) === 0, "a line with a price: no «Нет цены»");

  // «На выбор клиента»: the mark on the folded row, «в итог не входит» in the open one
  await tid(`est-line-${id}`).click();
  await tid(`est-more-${id}`).click();
  await p.getByRole("switch", { name: "На выбор клиента" }).first().click();
  h.expect(/на выбор клиента, в итог не входит/.test(await tid(`est-figures-${id}`).innerText()), "the open row: «на выбор клиента, в итог не входит»");
  await line.fold(h);
  h.expect(/На выбор клиента/.test(await tid(`est-optional-${id}`).innerText()), "the folded row: «На выбор клиента»");
};
