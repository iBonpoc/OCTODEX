/**
 * «Без налога» (wave П-2a, 13 §3.3; 4a): an estimate of a tax-exempt client carries no sales tax. The server refuses an
 * open version with tax for such a client (22023), so the phone turns the tax off itself: a draft made with tax before
 * the client became exempt is saved again without it, and the tax sheet says why instead of a switch.
 */
exports.run = async (h) => {
  const p = h.page;
  // a draft with 9.5% tax on materials for David Kim (not exempt yet)
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await require("../estimateLine.cjs").addCatalog(h, "carpet", "Carpet removal", "100"); await require("../estimateLine.cjs").fold(h);
  await p.getByRole("button", { name: "Налог с продаж" }).click(); await p.waitForTimeout(250);
  await h.sheet().getByRole("switch", { name: "Налог с продаж" }).click();
  await h.sheet().locator('input[inputmode="decimal"]').first().fill("9.5");
  await h.sheet().getByRole("button", { name: "Понятно" }).click(); await p.waitForTimeout(300);
  await h.expectText(/9\.5%/, "tax on the draft");
  await p.getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(800);
  let db = await h.db();
  const est = db.estimates.filter((e) => e.customerId === "c2" && e.doc).at(-1);
  h.expect(est && est.doc.settings.tax.enabled === true, "draft saved with tax");

  // David becomes tax exempt in the client form
  await h.go("/client/edit?id=c2");
  await p.getByRole("switch", { name: "Без налога" }).click();
  await p.getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(600);

  // the draft again: no tax, the sheet explains, saving keeps it off
  await h.go(`/estimate/new?id=${est.id}`);
  h.expect(!/9\.5% ·/.test(await h.text()), "no tax on the exempt client's estimate");
  await p.getByRole("button", { name: "Налог с продаж" }).click(); await p.waitForTimeout(250);
  await h.expectText(/Клиент без налога/, "the sheet says the client is exempt");
  const tg = h.sheet().getByTestId("est-tax-toggle").getByRole("switch");
  h.expect((await tg.getAttribute("aria-disabled")) === "true" && (await tg.getAttribute("aria-checked")) === "false", "the tax switch of an exempt client is really disabled (read as such, off)");
  await h.sheet().getByRole("button", { name: "Понятно" }).click(); await p.waitForTimeout(300);
  await h.shot("exempt");
  await p.getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(800);
  db = await h.db();
  const saved = db.estimates.find((e) => e.id === est.id);
  h.expect(saved.doc.settings.tax.enabled === false, "saved without tax");
  h.expect(saved.doc.settings.tax.rateBps === 950, "the rate stays for later");
};
