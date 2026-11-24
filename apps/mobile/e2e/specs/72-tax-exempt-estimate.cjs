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
  // DS §8.7а (#2454): the tax is set right in its row (setTax waits for the rate in the field)
  await require("../estimateTotals.cjs").setTax(h, "9.5");
  h.expect((await require("../estimateTotals.cjs").sumOf(h, "est-tax-row")) !== "—", "tax on the draft");
  await p.getByTestId("ue-save").locator("visible=true").first().click(); await p.waitForTimeout(800); // v2: the bar's «Готово»
  let db = await h.db();
  const est = db.estimates.filter((e) => e.customerId === "c2" && e.doc).at(-1);
  h.expect(est && est.doc.settings.tax.enabled === true, "draft saved with tax");

  // David becomes tax exempt in the client form
  await h.go("/client/edit?id=c2");
  await p.getByRole("switch", { name: "Без налога" }).click();
  await p.getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(600);

  // the draft again: no tax, the row explains, saving keeps it off
  await h.go(`/estimate/new?id=${est.id}`);
  await p.getByTestId("est-tax-exempt").locator("visible=true").first().waitFor({ timeout: 4000 });
  h.expect((await require("../estimateTotals.cjs").sumOf(h, "est-tax-row")) === "—", "no tax on the exempt client's estimate");
  await h.expectText(/Клиент без налога/, "the row says the client is exempt");
  const on = p.getByTestId("est-tax-row-mode-pct").locator("visible=true").first();
  const off = p.getByTestId("est-tax-row-mode-off").locator("visible=true").first();
  h.expect((await on.getAttribute("aria-disabled")) === "true" && (await off.getAttribute("aria-checked")) === "true", "the tax switch of an exempt client is really disabled (read as such, off)");
  await h.shot("exempt");
  await p.getByTestId("ue-save").locator("visible=true").first().click(); await p.waitForTimeout(800); // v2: the bar's «Готово»
  db = await h.db();
  const saved = db.estimates.find((e) => e.id === est.id);
  h.expect(saved.doc.settings.tax.enabled === false, "saved without tax");
  h.expect(saved.doc.settings.tax.rateBps === 950, "the rate stays for later");
};
