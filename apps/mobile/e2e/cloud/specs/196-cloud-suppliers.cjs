/**
 * e2e 196 cloud — spec 36 SUP1 against a real Supabase: a supplier made on the phone reaches the server; a new material
 * with that supplier and a cost → catalog_items.supplier_id, the name in `vendor` (old phones), the supplier's tax in
 * the side table, one history row with the supplier (db T145 on the server's side); after a reload the phone reads it
 * all back from the server (the supplier, the link, «История цен»).
 */
const { signIn, waitRows } = require("../signIn.cjs");

exports.run = async (h, { seed, admin }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  await signIn(h, a1);
  const tag = `S196 ${Date.now().toString(36)}`;
  const field = (id) => p.getByTestId(id).locator("visible=true").first().locator("input, textarea").first();
  const tap = (id) => p.getByTestId(id).locator("visible=true").first().locator('[role="button"]').first().click();

  // a supplier
  await h.go("/suppliers/new");
  await field("sup-name").fill(`${tag} Supply`);
  await field("sup-account").fill("ACC-196");
  await field("sup-tax").fill("10.25");
  await tap("sup-save");
  const [sup] = await waitRows(admin, `suppliers?select=id,name,account_number,purchase_tax_bps,is_active&company_id=eq.${a1.companyId}&name=eq.${encodeURIComponent(`${tag} Supply`)}`,
    (r) => r.length === 1, "the supplier");
  h.expect(sup.account_number === "ACC-196" && sup.purchase_tax_bps === 1025 && sup.is_active, `the supplier as typed (${JSON.stringify(sup)})`);

  // a material with that supplier and a cost (test price)
  await h.go("/catalog/new?kind=material");
  await field("catalog-name").fill(`${tag} bracket (test)`);
  await tap("catalog-supplier");
  await h.sheet().getByTestId(`sup-pick-${sup.id}`).locator('[role="button"]').first().click();
  await field("catalog-cost").fill("10");
  await tap("catalog-save");
  const [item] = await waitRows(admin, `catalog_items?select=id,supplier_id,vendor&company_id=eq.${a1.companyId}&name=eq.${encodeURIComponent(`${tag} bracket (test)`)}`,
    (r) => r.length === 1 && r[0].supplier_id === sup.id, "the item with its supplier");
  h.expect(item.vendor === `${tag} Supply`, "the supplier's name in vendor (old phones read it)");
  const [cost] = await waitRows(admin, `catalog_item_costs?select=unit_cost_cents,vendor_tax_bps&item_id=eq.${item.id}`, (r) => r.length === 1, "the cost");
  h.expect(cost.unit_cost_cents === 1000 && cost.vendor_tax_bps === 1025, `the cost and the supplier's tax (${JSON.stringify(cost)})`);
  const hist = await waitRows(admin, `catalog_cost_history?select=supplier_id,unit_cost_cents,source&item_id=eq.${item.id}`, (r) => r.length >= 1, "the history");
  h.expect(hist.every((x) => x.supplier_id === sup.id && x.source === "manual") && hist.some((x) => x.unit_cost_cents === 1000), `the history row has the supplier (${JSON.stringify(hist)})`);

  // a reload: everything comes back from the server
  await p.evaluate(() => localStorage.removeItem("octo.db.v5"));
  await h.go(`/catalog/${item.id}`);
  await p.getByTestId("catalog-supplier").locator("visible=true").first().getByText(`${tag} Supply`).waitFor({ timeout: 20000 });
  await p.getByTestId("sup-hist-0").locator("visible=true").first().waitFor({ timeout: 20000 });
  h.expect(/\$11\.03/.test(await p.getByTestId("sup-hist-0").locator("visible=true").first().innerText()), "«История цен» from the server: $10 + 10.25%");
  await h.shot("reloaded");
};
