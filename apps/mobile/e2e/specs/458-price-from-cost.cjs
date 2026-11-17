/**
 * e2e 458 — #1807 (53-0б-2, spec 53 §5.3б п.4): a material whose price the server counts from its cost. Every view.
 * - Sales without our costs opens it: the price is shown, not changed (read-only field), the words tell why with no number;
 *   a save (a rename) keeps the price.
 * - The office: a price the server replaced is a reason in «Требует внимания» — who sent what, what stayed — and it opens
 *   the item.
 * By testID and the store; waits on what it checks. Seeded from a page without the app (h.seed, CHECKS §9 №12).
 */
const DB_KEY = "octo.db.v5";
const ID = "cat-e2e-458";
const NAME = "Counted Coil (test)";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();

  const seed = async (costsVisible) => {
    await h.go("/today");
    const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
    const now = await p.evaluate(() => Date.now());
    raw.db.catalog = [...raw.db.catalog.filter((x) => x.id !== ID), { id: ID, kind: "material", name: NAME, unit: "ft", priceCents: 6000, priceFromCost: true }];
    raw.db.costsVisible = costsVisible;
    raw.db.priceRecalc = costsVisible
      ? [{ id: "e2e-458-r", itemId: ID, sentCents: 6500, serverCents: 6000, at: new Date(now - 3600e3).toISOString() }]
      : [];
    await h.seed(DB_KEY, raw);
  };

  // sales without our costs: the price is read, not changed
  await seed(false);
  await h.go(`/catalog/${ID}`);
  await tid("catalog-name").waitFor({ timeout: 8000 });
  await tid("catalog-price-locked").waitFor({ timeout: 5000 });
  const why = await tid("catalog-price-locked").innerText();
  h.expect(/закупк/i.test(why) && !/\d|\$/.test(why), `the words tell why, with no number: ${why}`);
  const field = tid("catalog-price").locator("input").first();
  h.expect(await field.isEditable() === false, "the price field is read-only");
  h.expect(/60/.test(await field.inputValue()), "the price is shown ($60.00)");
  await h.shot("sales-locked");
  // a rename is saved; the price stays
  const nameInput = tid("catalog-name").locator("input").first();
  await nameInput.fill(`${NAME} 2`);
  await tid("catalog-save").locator('[role="button"]').first().click();
  await p.waitForFunction(([k, id]) => {
    const it = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.catalog || []).find((x) => x.id === id);
    return !!it && /2$/.test(it.name);
  }, [DB_KEY, ID], { timeout: 8000 });
  const it = (await h.db()).catalog.find((x) => x.id === ID);
  h.expect(it.priceCents === 6000, `the save keeps the price: ${it.priceCents}`);

  // the office: the replaced price is a reason, and it opens the item
  await seed(true);
  await h.go("/triage");
  await h.expectText(/цена \$65, оставлена \$60 по закупке|присланная цена \$65 — оставлена \$60 по закупке/, "the office sees the replaced price: sent $65, $60 kept");
  await h.shot("office-reason");
  await p.getByText(/оставлена \$60 по закупке/).locator("visible=true").first().click();
  await p.waitForURL((u) => u.pathname === `/catalog/${ID}`, { timeout: 8000 });
  h.expect(true, "the reason opens the item");
  await tid("catalog-name").waitFor({ timeout: 8000 });
  h.expect(await tid("catalog-price-locked").count() === 0, "the office (who sees costs) gets no lock words");
};
