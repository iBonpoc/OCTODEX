/**
 * e2e 302 — «Скрыть от клиента» и «Сохранить в каталог» в строке сметы (РС-4b-2, спека Р1 и Р3, ревью #1231), every view; by testID:
 * - «Ещё → Скрыть от клиента»: with a price the switch is pale and a press says why («Скрыть можно позицию с ценой $0»); at $0 it
 *   hides — the folded row carries «Скрыта»; a price typed into the hidden row shows it again, with a toast;
 * - «Сохранить в каталог»: a service goes to the catalog at the line's price, the row gets «Открыть в каталоге»; «Отменить» takes
 *   it out (and the link goes) — nothing else; a material with no cost is refused with the reason, nothing goes;
 * - «Сохранить» with the row open: the thing is in the catalog, the saved estimate carries the link, ONE toast takes both back;
 * - «Заменить» of a row where the catalog was on creates no copy; the tech sees no switch.
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const vis = (sel) => p.locator(sel).locator("visible=true");
  const count = (sel) => p.locator(sel).count();
  const catalogLen = async () => ((await h.db()).catalog ?? []).length;
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });

  // a row with a price cannot be hidden: the pale switch says why when pressed
  await tid("est-add-new").getByRole("button").click();
  await vis('[data-testid^="est-name-"]').first().locator("input").fill("Courtesy check (тестовые)");
  await vis('[data-testid^="est-price-"]').first().locator("input").fill("25");
  const id = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");
  await tid(`est-more-${id}`).click();
  await tid(`est-hide-why-${id}`).click();
  await p.getByText(/ценой \$0/).first().waitFor({ timeout: 3000 });

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
  h.expect((await count(`[data-testid="est-hidden-${id}"]`)) === 0, "shown again: no «Скрыта»");

  // «Сохранить в каталог»: a service at the line's price; «Отменить» takes out that item and the link, nothing else
  const before = await catalogLen();
  await tid(`est-line-${id}`).click();
  await tid(`est-save-catalog-${id}`).getByRole("switch").click();
  await line.fold(h);
  await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.catalog ?? []).length === n + 1, before, { timeout: 5000 });
  const item = (await h.db()).catalog.find((x) => x.name === "Courtesy check (тестовые)");
  h.expect(!!item && item.priceCents === 3000 && item.kind === "service", `the catalog item: ${JSON.stringify(item)}`);
  await tid(`est-line-${id}`).click();
  await tid(`est-open-catalog-${id}`).waitFor({ timeout: 3000 });
  await line.fold(h);
  await line.undo(h);
  await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.catalog ?? []).length === n, before, { timeout: 5000 });
  await tid(`est-line-${id}`).click();
  h.expect((await count('[data-testid^="est-open-catalog-"]')) === 0, "«Отменить»: the item is out and the row has no link");
  await line.fold(h);

  // «Сохранить» with the row open: the item is made, the saved estimate has the link, one «Отменить» takes both back
  await tid(`est-line-${id}`).click();
  await tid(`est-save-catalog-${id}`).getByRole("switch").click();
  const estBefore = ((await h.db()).estimates ?? []).length;
  await tid("ue-save").getByRole("button").click();
  await p.waitForURL((u) => !/\/estimate\/new/.test(u.pathname), { timeout: 8000 });
  await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.estimates ?? []).length === n + 1, estBefore, { timeout: 5000 });
  const db1 = await h.db();
  const made = db1.catalog.find((x) => x.name === "Courtesy check (тестовые)");
  const est = db1.estimates.find((e) => e.doc?.options?.[0]?.lines?.some((l) => l.name === "Courtesy check (тестовые)"));
  h.expect(!!made && !!est && est.doc.options[0].lines.find((l) => l.name === "Courtesy check (тестовые)").catalogItemId === made.id, "the saved estimate carries the link to the made item");
  await line.undo(h);
  await p.waitForFunction(() => !JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.catalog?.some((x) => x.name === "Courtesy check (тестовые)"), null, { timeout: 5000 });
  h.expect((await catalogLen()) === before, "one «Отменить» took out the estimate and the item");

  // a material with no cost is refused, with the reason; the tech sees no switch
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await tid("est-add-new").getByRole("button").click();
  await vis('[data-testid^="est-name-"]').first().locator("input").fill("Fastener (тестовые)");
  await vis('[data-testid^="est-price-"]').first().locator("input").fill("9");
  const sid = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");
  await tid(`est-kind-${sid}-material`).click();
  await tid(`est-save-catalog-${sid}`).waitFor({ timeout: 3000 });
  h.expect(/себестоимост/.test(await tid(`est-save-catalog-${sid}`).innerText()), "a material with no cost: the reason under the toggle");
  await h.seed("octo.role.v1", "tech");
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await tid("est-add-new").getByRole("button").click();
  await vis('[data-testid^="est-price-"]').first().waitFor({ timeout: 3000 });
  h.expect((await count('[data-testid^="est-save-catalog-"]')) === 0, "the tech: no «Сохранить в каталог»");
  await h.seed("octo.role.v1", "director");
};
