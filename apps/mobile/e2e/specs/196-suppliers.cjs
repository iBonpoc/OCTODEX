/**
 * Spec 36 SUP1 (map S0c «позиция каталога ↔ поставщик»), in the demo (the server side is db T143–T146):
 * - «Ещё → Поставщики»: the demo suppliers as cards; a new one with phone, account and a 10.25% purchase tax;
 * - a material of the catalog: «Поставщик ›» → the sheet → the new supplier → its tax is in the item (both sides of the
 *   stake: the item's price with the tax, and a new estimate line from it counts the same price);
 * - a new cost → «История цен» on the item and on the supplier;
 * - the supplier's tax changes → «Применить к N позициям?» → the item counts with the new tax; «Отменить» puts it back;
 * - archive → «Отменить»;
 * - sales and the tech: no «Поставщики» (the account number), the address is closed to them.
 * Everything by testID (CHECKS §9 №2); waits for what it checks.
 */
const ITEM = "cat-bracket"; // «Railing bracket», a test material of the demo (Home Depot, $10 + 10.25% + 10%)

exports.run = async (h) => {
  const p = h.page;
  const dbWhen = async (ok) => {
    let db = await h.db();
    for (let i = 0; i < 40 && !ok(db); i++) { await p.waitForTimeout(150); db = await h.db(); }
    return db;
  };
  const field = (id) => p.getByTestId(id).locator("visible=true").first().locator("input, textarea").first();
  const tap = (id) => p.getByTestId(id).locator("visible=true").first().locator('[role="button"]').first().click();

  // the list
  await h.go("/suppliers");
  await p.getByTestId("sup-card-sup-hd").locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect(/Home Depot/.test(await p.getByTestId("sup-card-sup-hd").locator("visible=true").first().innerText()), "the demo supplier is a card");
  await h.shot("list");

  // a new supplier
  await h.go("/suppliers/new");
  await field("sup-name").fill("Zed Supply (test)");
  await field("sup-phone").fill("5550100199");
  await field("sup-account").fill("ACC-196");
  await field("sup-tax").fill("10.25");
  await tap("sup-save");
  let db = await dbWhen((d) => (d.suppliers ?? []).some((x) => x.name === "Zed Supply (test)"));
  const zed = db.suppliers.find((x) => x.name === "Zed Supply (test)");
  h.expect(zed && zed.taxBps === 1025 && zed.accountNumber === "ACC-196" && zed.active, "saved with its tax and account");

  // the item: pick the new supplier → its tax is in the item
  await h.go(`/catalog/${ITEM}`);
  await tap("catalog-supplier");
  await h.sheet().getByTestId(`sup-pick-${zed.id}`).locator('[role="button"]').first().click();
  await p.getByTestId("catalog-supplier").locator("visible=true").first().getByText("Zed Supply (test)").waitFor({ timeout: 5000 });
  await field("catalog-sku").fill("ZB-1");
  await h.expectText(/Цена в смете: \$12\.13/, "the item counts with the copied tax: $10 + 10.25% + 10%");
  // a new cost: $11 → $11 + 10.25% + 10% = $13.37
  await field("catalog-cost").fill("11");
  await h.expectText(/Цена в смете: \$13\.37/, "the new cost counts");
  await tap("catalog-save");
  db = await dbWhen((d) => d.catalog.find((x) => x.id === ITEM)?.supplierId === zed.id && d.catalog.find((x) => x.id === ITEM)?.costCents === 1100);
  const item = db.catalog.find((x) => x.id === ITEM);
  h.expect(item.vendor === "Zed Supply (test)" && item.vendorTaxBps === 1025 && item.supplierSku === "ZB-1", "the link, the name into vendor (old phones), the tax and the SKU");
  h.expect((db.costHistory ?? [])[0]?.itemId === ITEM && db.costHistory[0].costCents === 1100 && db.costHistory[0].supplierId === zed.id, "a history row of the new cost");

  // the other side of the stake: a new estimate line from the item takes the same price (the engine, as spec 01)
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await p.getByRole("button", { name: "Добавить позицию" }).first().click();
  await h.sheet().getByPlaceholder(/Начните писать/).fill("railing bracket");
  await h.sheet().getByText("Railing bracket", { exact: true }).click();
  await h.sheet().getByRole("button", { name: "Готово" }).click();
  await h.expectText(/Сумма \| \$13\.37/, "a new estimate line counts with the supplier's tax");
  await h.go(`/catalog/${ITEM}`);
  await p.getByTestId("catalog-history").locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect(/\$12\.13/.test(await p.getByTestId("sup-hist-0").locator("visible=true").first().innerText()), "«История цен» on the item: $11 + 10.25%");
  await h.shot("item");

  // the supplier's card: its item, the history; a new tax → «Применить к 1 поз.?» → applied, then «Отменить»
  await h.go(`/suppliers/${zed.id}`);
  await p.getByTestId("sup-history").locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect(/Railing bracket/.test(await p.getByTestId("sup-hist-0").locator("visible=true").first().innerText()), "the supplier's history names the item");
  await field("sup-tax").fill("9.5");
  await tap("sup-save");
  await h.sheet().getByTestId("sup-apply").waitFor({ timeout: 5000 });
  h.expect(/9\.5% — применить к 1 поз\./.test(await h.sheet().innerText()), "asks before changing the item's price");
  await h.shot("apply");
  await h.sheet().getByTestId("sup-apply").locator('[role="button"]').first().click();
  db = await dbWhen((d) => d.catalog.find((x) => x.id === ITEM)?.vendorTaxBps === 950);
  h.expect(db.catalog.find((x) => x.id === ITEM).vendorTaxBps === 950, "the item counts with the new tax");
  await p.waitForTimeout(400); // the toast arms «Отменить» after ~0.3 s (lesson of №5)
  await p.getByRole("button", { name: "Отменить" }).last().click();
  db = await dbWhen((d) => d.catalog.find((x) => x.id === ITEM)?.vendorTaxBps === 1025);
  h.expect(db.catalog.find((x) => x.id === ITEM).vendorTaxBps === 1025, "«Отменить»: the item's tax is back");

  // archive → «Отменить»
  await h.go(`/suppliers/${zed.id}`);
  await tap("sup-archive");
  db = await dbWhen((d) => d.suppliers.find((x) => x.id === zed.id)?.active === false);
  h.expect(db.suppliers.find((x) => x.id === zed.id).active === false, "archived");
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Отменить" }).last().click();
  db = await dbWhen((d) => d.suppliers.find((x) => x.id === zed.id)?.active === true);
  h.expect(db.suppliers.find((x) => x.id === zed.id).active === true, "«Отменить»: active again");

  // sales and the tech: no suppliers
  for (const role of ["sales", "tech"]) {
    await p.evaluate((r) => localStorage.setItem("octo.role.v1", JSON.stringify(r)), role);
    await h.go("/suppliers");
    h.expect((await p.getByTestId(`sup-card-${zed.id}`).count()) === 0, `${role}: «Поставщики» is closed`);
  }
};
