/**
 * e2e 302 — «Скрыть от клиента» и «Сохранить в каталог» в строке сметы (РС-4b-2, спека Р1 и Р3), every view; by testID:
 * - «Ещё → Скрыть от клиента»: with a price the toggle says why not («Скрыть можно позицию с ценой $0»); at $0 it hides —
 *   the folded row carries «Скрыта»; a price typed into the hidden row shows it again, with a toast;
 * - «Сохранить в каталог»: a service goes to the catalog at the line's price, the row gets «Открыть в каталоге»; «Отменить» takes it back;
 *   a material with no cost is refused with the reason, nothing goes.
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const vis = (sel) => p.locator(sel).locator("visible=true");
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });

  // a row with a price cannot be hidden: the words say so
  await tid("est-add-new").getByRole("button").click();
  const name = vis('[data-testid^="est-name-"]').first().locator("input");
  await name.fill("Courtesy check (тестовые)");
  await vis('[data-testid^="est-price-"]').first().locator("input").fill("25");
  const id = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");
  await tid(`est-more-${id}`).click();
  await tid(`est-hide-${id}`).waitFor({ timeout: 3000 });
  h.expect(/ценой \$0/.test(await tid(`est-hide-${id}`).innerText()), "a priced row: «Скрыть можно позицию с ценой $0»");

  // at $0 it hides; folded, the row says «Скрыта»
  await vis(`[data-testid="est-price-${id}"] input`).first().fill("0");
  await tid(`est-hide-${id}`).getByRole("switch").click();
  await line.fold(h);
  await tid(`est-hidden-${id}`).waitFor({ timeout: 3000 });
  h.expect(/Скрыта/.test(await tid(`est-hidden-${id}`).innerText()), "the folded row carries «Скрыта»");

  // a price typed into the hidden row shows it again
  await tid(`est-line-${id}`).click();
  await vis(`[data-testid="est-price-${id}"] input`).first().fill("30");
  await p.getByText(/снова видна клиенту/i).first().waitFor({ timeout: 3000 });
  await line.fold(h);
  h.expect((await p.getByTestId(`est-hidden-${id}`).count()) === 0, "shown again: no «Скрыта»");

  // «Сохранить в каталог»: a service at the line's price
  const before = ((await h.db()).catalog ?? []).length;
  await tid(`est-line-${id}`).click();
  await tid(`est-save-catalog-${id}`).getByRole("switch").click();
  await line.fold(h);
  await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.catalog ?? []).length === n + 1, before, { timeout: 5000 });
  const item = (await h.db()).catalog.find((x) => x.name === "Courtesy check (тестовые)");
  h.expect(!!item && item.priceCents === 3000 && item.kind === "service", `the catalog item: ${JSON.stringify(item)}`);
  await tid(`est-line-${id}`).click();
  await tid(`est-open-catalog-${id}`).waitFor({ timeout: 3000 });

  // «Отменить» takes the item back (a toast press works a moment after the toast shows)
  await line.fold(h);
  const btn = p.getByRole("button", { name: /Отменить/ }).locator("visible=true");
  for (let i = 0; i < 10 && (await btn.count()) > 0; i++) {
    await btn.last().click();
    if (await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.catalog ?? []).length === n, before, { timeout: 400 }).then(() => true, () => false)) break;
  }
  h.expect(((await h.db()).catalog ?? []).length === before, "«Отменить»: the item is out of the catalog");

  // a material with no cost is refused, with the reason
  await tid("est-add-new").getByRole("button").click();
  const second = vis('[data-testid^="est-name-"]').first();
  await second.locator("input").fill("Fastener (тестовые)");
  await vis('[data-testid^="est-price-"]').first().locator("input").fill("9");
  const sid = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");
  await tid(`est-kind-${sid}-material`).click();
  await tid(`est-save-catalog-${sid}`).waitFor({ timeout: 3000 });
  h.expect(/себестоимост/.test(await tid(`est-save-catalog-${sid}`).innerText()), "a material with no cost: the reason under the toggle");
};
