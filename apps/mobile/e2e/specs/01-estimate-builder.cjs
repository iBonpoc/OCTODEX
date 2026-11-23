/** Custom line + catalog line + kit, tax 9.5% on the whole amount (a new estimate, РС-3) → totals match a hand calculation. */
exports.run = async (h) => {
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  const line = require("../estimateLine.cjs");
  await line.addCustom(h, "Вывезти мусор", "150");
  await line.addCatalog(h, "carpet", "Carpet removal", "120");
  await line.fold(h);
  // a kit comes as several folded rows
  await line.addCatalog(h, "railing kit", /Stair railing kit/);
  // DS §8.7а (#2454): the tax is set right in its row — «%» and the rate
  await require("../estimateTotals.cjs").setTax(h, "9.5");
  // 150 + 120×1.50 + 250 + 12×12.13 = 725.56; a new estimate taxes the whole amount (the founder 12.11, РС-3):
  // 9.5% of 725.56 = 68.93 → 794.49; deposit 10% = 79.45
  await h.expectText(/Сумма \| \$725\.56/, "subtotal");
  h.expect((await require("../estimateTotals.cjs").sumOf(h, "est-tax-row")) === "$68.93", "tax on the whole amount");
  h.expect(!/9\.5% · /.test(await h.text()), "no kinds listed after the rate (the tax is on the whole amount, Р6)");
  // optional: #2363 q72 — scrolled down, «Итого» is the capsule (the sum alone); a tap opens the bar with its word «Итого»
  if (await h.page.getByTestId("ue-save-capsule").locator("visible=true").count()) await h.page.getByTestId("ue-save-capsule").click();
  await h.expectText(/Итого \| \$794\.49/, "total");
  await h.expectText(/10% · \$79\.45/, "deposit");
  await h.shot("builder");
  await require("../estimateLine.cjs").saveSend(h); await h.page.waitForTimeout(800);
  await h.expectText(/Отправить клиенту/, "send sheet opens");
};
