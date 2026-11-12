/** Custom line + catalog line + kit, tax 9.5% on the whole amount (a new estimate, РС-3) → totals match a hand calculation. */
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
  // 150 + 120×1.50 + 250 + 12×12.13 = 725.56; a new estimate taxes the whole amount (the founder 12.11, РС-3):
  // 9.5% of 725.56 = 68.93 → 794.49; deposit 10% = 79.45
  await h.expectText(/Сумма \| \$725\.56/, "subtotal");
  await h.expectText(/\$68\.93 · 9\.5% · услуги, работа, материалы/, "tax on the whole amount");
  await h.expectText(/Итого \| \$794\.49/, "total");
  await h.expectText(/10% · \$79\.45/, "deposit");
  await h.shot("builder");
  await h.page.getByRole("button", { name: "Сохранить и отправить" }).click(); await h.page.waitForTimeout(800);
  await h.expectText(/Отправить клиенту/, "send sheet opens");
};
