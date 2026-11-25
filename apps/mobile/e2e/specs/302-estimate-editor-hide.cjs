/**
 * e2e 302 — «Скрыть от клиента» и «Сохранить в каталог» в строке сметы (РС-4b-2, спека Р1 и Р3, ревью #1231), every view; by testID:
 * - «Ещё → Скрыть от клиента»: with a price the switch is pale and a press says why («Скрыть можно позицию с ценой $0»); at $0 it
 *   hides (#2424: by «⋯ → Скрыть от клиента», no switch) — the folded row carries «Скрыто от клиента» in its dashed frame; a price typed into the hidden row shows it again, with a toast;
 * - «⋯ → Добавить в каталог» (E19, no switch): a service goes to the catalog at once at the line's price, the row gets «Открыть в
 *   каталоге», the item is gone from the menu; «Вернуть» takes it out (and the link goes) — nothing else; a material with no cost is
 *   refused with the reason in a toast, nothing goes;
 * - «Сохранить»: the saved estimate carries the link to the item;
 * - the tech has no «Добавить в каталог» in the menu.
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const vis = (sel) => p.locator(sel).locator("visible=true");
  const count = (sel) => p.locator(sel).count();
  // the open line's menu: its head in the middle of the window first (at 390 the page may have put it under the pinned header,
  // where a held mouse lands on the header's buttons)
  const openMenu = async (id) => {
    await vis(`[data-testid="est-collapse-${id}"]`).first().evaluate((el) => el.scrollIntoView({ block: "center" }));
    await line.menu(h, id);
  };
  const catalogLen = async () => ((await h.db()).catalog ?? []).length;
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });

  // a row with a price cannot be hidden: the pale «Скрыть от клиента» in «⋯» says why when pressed (#2424: no switch in «Ещё»)
  await tid("est-add-new").getByRole("button").click();
  await vis('[data-testid^="est-name-"]').first().locator("input").fill("Courtesy check (тестовые)");
  await vis('[data-testid^="est-price-"]').first().locator("input").fill("25");
  const id = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");
  await tid(`est-more-${id}`).click();
  h.expect((await count(`[data-testid="est-hide-${id}"]`)) === 0, "«Ещё» has no switch «Скрыть от клиента» (#2424)");
  await openMenu(id);
  await tid(`est-act-hide-${id}`).click();
  await p.getByText(/ценой \$0/).first().waitFor({ timeout: 3000 });

  // at $0 it hides; folded, the row says «Скрыто от клиента» in a dashed frame
  await vis(`[data-testid="est-price-${id}"] input`).first().fill("0");
  await openMenu(id);
  await tid(`est-act-hide-${id}`).click();
  await line.fold(h);
  await tid(`est-hidden-${id}`).waitFor({ timeout: 3000 });
  h.expect(/Скрыто от клиента/.test(await tid(`est-hidden-${id}`).innerText()), "the folded row carries «Скрыто от клиента»");
  h.expect((await tid(`sort-frame-l:${id}`).evaluate((e) => getComputedStyle(e).borderTopStyle)) === "dashed", "the hidden row is framed by dashes (no hatch)");
  {
    // around the WHOLE line — its «≡» inside the frame (design review)
    const [fr, hd] = [await tid(`sort-frame-l:${id}`).boundingBox(), await tid(`sort-handle-l:${id}`).boundingBox()];
    const mid = hd.x + hd.width / 2; // the «≡» glyph stands in the middle of its 44 zone
    h.expect(mid > fr.x && mid < fr.x + fr.width, "the frame goes around the line's «≡» too");
  }

  // a price typed into the hidden row shows it again
  await tid(`est-line-${id}`).click();
  await vis(`[data-testid="est-price-${id}"] input`).first().fill("30");
  await p.getByText(/снова видна клиенту/i).first().waitFor({ timeout: 3000 });
  await line.fold(h);
  h.expect((await count(`[data-testid="est-hidden-${id}"]`)) === 0, "shown again: no «Скрыто от клиента»");

  // «Сохранить в каталог»: a service at the line's price; «Отменить» takes out that item and the link, nothing else
  const before = await catalogLen();
  await tid(`est-line-${id}`).click();
  await openMenu(id);
  await tid(`est-act-catalog-${id}`).click();
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

  // «Сохранить»: the item is made (the menu), the saved estimate carries the link to it
  await tid(`est-line-${id}`).click();
  await openMenu(id);
  await tid(`est-act-catalog-${id}`).click();
  const estBefore = ((await h.db()).estimates ?? []).length;
  await tid("est-add-new").scrollIntoViewIfNeeded();
  await tid("ue-save").click();
  await p.waitForURL((u) => !/\/estimate\/new/.test(u.pathname), { timeout: 8000 });
  await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.estimates ?? []).length === n + 1, estBefore, { timeout: 5000 });
  const db1 = await h.db();
  const made = db1.catalog.find((x) => x.name === "Courtesy check (тестовые)");
  const est = db1.estimates.find((e) => e.doc?.options?.[0]?.lines?.some((l) => l.name === "Courtesy check (тестовые)"));
  h.expect(!!made && !!est && est.doc.options[0].lines.find((l) => l.name === "Courtesy check (тестовые)").catalogItemId === made.id, "the saved estimate carries the link to the made item");

  // a material with no cost is refused, with the reason; the tech sees no switch
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await tid("est-add-new").getByRole("button").click();
  await vis('[data-testid^="est-name-"]').first().locator("input").fill("Fastener (тестовые)");
  await vis('[data-testid^="est-price-"]').first().locator("input").fill("9");
  const sid = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");
  // «Вид» is a list now (DS §8.3, #1307): open it, then pick «Материал»
  await tid(`est-kind-${sid}-button`).click();
  await tid(`est-kind-${sid}-material`).click();
  const cat1 = await catalogLen();
  await openMenu(sid);
  await tid(`est-act-catalog-${sid}`).click();
  await p.getByText(/себестоимост/).first().waitFor({ timeout: 3000 });
  h.expect((await catalogLen()) === cat1, "a material with no cost: the reason in a toast, nothing goes to the catalog");
  await h.seed("octo.role.v1", "tech");
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await tid("est-add-new").getByRole("button").click();
  await vis('[data-testid^="est-price-"]').first().waitFor({ timeout: 3000 });
  const tid2 = (await vis('[data-testid^="est-collapse-"]').first().getAttribute("data-testid")).replace("est-collapse-", "");
  await openMenu(tid2);
  h.expect((await count('[data-testid^="est-act-catalog-"]')) === 0, "the tech: no «Добавить в каталог» in the menu");
  await h.seed("octo.role.v1", "director");
};
