/**
 * Catalog on the new list cards (step 10а, PR6), every view (3 widths × 2 themes).
 * - card: name, «$X / unit», kind and «тестовая цена» as grey tags, supplier, description; no «…»; edges aligned;
 * - the office sees «Себестоимость» and «Маржа» tiles (always both); the technician sees the price but never cost or margin
 *   (spec 06 §7.6 exception for the catalog: the price is needed for an estimate on site);
 * - groups by kind under «All».
 */
const { checkCardAlignment } = require("../cardsAlignment.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/catalog");
  const db = await h.db();
  const it = db.catalog.find((x) => x.vendor && x.kind !== "kit") ?? db.catalog[0];
  const card = p.locator('[data-testid="list-card"]').filter({ hasText: it.name }).first();
  await card.scrollIntoViewIfNeeded();
  const txt = await card.innerText();
  h.expect(txt.includes(it.name) && new RegExp(`\\$[\\d,.]+ / ${it.unit}`).test(txt), `name and «$X / ${it.unit}»: ${txt.slice(0, 200)}`);
  if (it.vendor) h.expect(txt.includes(it.vendor), "supplier on the card");
  if (it.placeholder) h.expect(txt.includes("тестовая цена"), "«тестовая цена» tag");
  h.expect(txt.includes("Себестоимость") && txt.includes("Маржа"), "office: cost and margin tiles");
  h.expect(!/…|\.\.\./.test(await p.locator("body").innerText()), "no «…»");
  await h.expectText(/Материал · \d+|Услуга · \d+/, "groups by kind under «All»");
  await p.evaluate(() => window.scrollTo(0, 0));
  await checkCardAlignment(h, { searchPlaceholder: "Поиск в каталоге" });
  await h.shot("list");

  // technician: price yes, cost and margin no
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/catalog");
  const body = await p.locator("body").innerText();
  h.expect(/\$[\d,.]+ \//.test(body), "tech sees the selling price");
  h.expect(!body.includes("Себестоимость") && !body.includes("Маржа"), "tech never sees cost or margin");
};
