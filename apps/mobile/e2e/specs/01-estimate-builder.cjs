/** Custom line + catalog line + kit, tax only on materials 9.5% → totals match a hand calculation. */
exports.run = async (h) => {
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  const add = async () => { await h.page.getByRole("button", { name: "Добавить позицию" }).first().click(); await h.page.waitForTimeout(300); };
  await add();
  await h.sheet().getByPlaceholder(/Начните писать/).fill("Вывезти мусор");
  await h.sheet().getByText(/Своя позиция:/).click(); await h.page.waitForTimeout(250);
  await h.sheet().locator('input[inputmode="decimal"]').nth(1).fill("150");
  await h.sheet().getByRole("button", { name: "Готово" }).click(); await h.page.waitForTimeout(250);
  await add();
  await h.sheet().getByPlaceholder(/Начните писать/).fill("carpet");
  await h.sheet().getByText("Carpet removal").click(); await h.page.waitForTimeout(250);
  await h.sheet().locator('input[inputmode="decimal"]').nth(0).fill("120");
  await h.sheet().getByRole("button", { name: "Готово" }).click(); await h.page.waitForTimeout(250);
  await add();
  await h.sheet().getByPlaceholder(/Начните писать/).fill("railing kit");
  await h.sheet().getByText(/Stair railing kit/).click(); await h.page.waitForTimeout(400);
  await h.page.getByRole("button", { name: "Налог с продаж" }).click(); await h.page.waitForTimeout(250);
  await h.sheet().getByRole("switch", { name: "Налог с продаж" }).click();
  await h.sheet().locator('input[inputmode="decimal"]').first().fill("9.5");
  await h.sheet().getByRole("button", { name: "Понятно" }).click(); await h.page.waitForTimeout(300);
  // 150 + 120×1.50 + 250 + 12×12.13 = 725.56; tax 9.5% of 145.56 = 13.83 → 739.39; deposit 10% = 73.94
  await h.expectText(/Сумма \| \$725\.56/, "subtotal");
  await h.expectText(/\$13\.83 · 9\.5% · материалы/, "tax only on materials");
  await h.expectText(/Итого \| \$739\.39/, "total");
  await h.expectText(/10% · \$73\.94/, "deposit");
  await h.shot("builder");
  await h.page.getByRole("button", { name: "Сохранить и отправить" }).click(); await h.page.waitForTimeout(800);
  await h.expectText(/Отправить клиенту/, "send sheet opens");
};
