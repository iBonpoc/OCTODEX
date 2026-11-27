/**
 * Catalog — rows of the kinds' groups (lists B #2992; was the list cards of step 10а), every view (3 widths × 2 themes).
 * - row: name, «$X / unit» on the right, supplier in the line; a sample price carries no mark of its own (#1873, the founder
 *   16.11: «Нигде нет её. Надписи этой»);
 * - the office sees «Себестоимость $…» and «Маржа …%» in the line — only when known, never «—»; the technician sees the price
 *   but never cost or margin (spec 06 §7.6 exception for the catalog: the price is needed for an estimate on site);
 * - groups by kind under «All»;
 * - «В убытке» (catalogItemEconomics, #98): a service priced below its cost → the office sees the status under the price and a
 *   negative margin; the technician sees no sign;
 * - #1837: sales without our costs (db.costsVisible false) sees neither the tiles nor the sign (one rule, not the role).
 */
const rowOf = (p, name) => p.locator('[data-testid^="catalog-row-"]').locator("visible=true").filter({ hasText: name }).first();

exports.run = async (h) => {
  const p = h.page;
  await h.go("/catalog");
  const db = await h.db();
  const it = db.catalog.find((x) => x.vendor && x.kind !== "kit") ?? db.catalog[0];
  const card = rowOf(p, it.name);
  await card.scrollIntoViewIfNeeded();
  const txt = await card.innerText();
  h.expect(txt.includes(it.name) && new RegExp(`\\$[\\d,.]+ / ${it.unit}`).test(txt), `name and «$X / ${it.unit}»: ${txt.slice(0, 200)}`);
  if (it.vendor) h.expect(txt.includes(it.vendor), "supplier in the row");
  h.expect(!/тестовая цена/.test(txt), "no «test price» tag on a card (#1873)"); // i18n-old: ok — the old tag must be gone
  h.expect(!/—/.test(await p.getByTestId("catalog-list").locator("visible=true").first().innerText()), "no «—» for an unknown cost or margin");
  h.expect((await p.locator('[data-testid^="catalog-group-"]').locator("visible=true").count()) > 1, "groups by kind under «All»");
  await h.shot("list");

  // real economics, not the old stub: a material with a supplier has a cost and a margin
  h.expect(/Себестоимость \$[\d,.]+/.test(txt) && /Маржа -?\d+\.\d%/.test(txt), `cost and margin are computed: ${txt.slice(0, 240)}`);

  // «В убытке»: a service priced below its cost (test prices)
  const LOSS = "Loss test service";
  await p.evaluate((name) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.catalog.push({ id: "cat-loss-e2e", kind: "service", name, unit: "ea", priceCents: 9000, costCents: 10000, placeholder: true });
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, LOSS);
  await h.go("/catalog");
  const lossCard = rowOf(p, LOSS);
  await lossCard.scrollIntoViewIfNeeded();
  // #3033: the status is its icon, its words the icon's label
  const says = async (loc) => `${await loc.innerText()} ${(await loc.locator('[data-testid="row-status-icon"]').first().getAttribute("aria-label", { timeout: 1000 }).catch(() => null)) ?? ""}`;
  const lt = await says(lossCard);
  h.expect(lt.includes("В убытке") && lt.includes("-11.1%") && /\$100(\.00)?\b/.test(lt), `loss sign, cost $100.00 and margin -11.1%: ${lt.slice(0, 240)}`);
  h.expect(!(await says(card)).includes("В убытке"), "a row with a margin has no loss sign");
  await h.shot("loss");

  // technician: price yes, cost and margin no, no loss sign
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/catalog");
  const body = await p.locator("body").innerText();
  h.expect(/\$[\d,.]+ \//.test(body), "tech sees the selling price");
  h.expect(!body.includes("Себестоимость") && !body.includes("Маржа"), "tech never sees cost or margin");
  h.expect(body.includes(LOSS) && !body.includes("В убытке"), "tech never sees «В убытке»");

  // #1837: sales without our costs (the server's app.can_view_costs said no) edits the list but sees no cost, no margin,
  // no «В убытке» — the one rule (features/access.ts seeCosts), not the role
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  raw.db.costsVisible = false;
  await h.seed("octo.db.v5", raw);
  await h.seed("octo.role.v1", "sales");
  await h.go("/catalog");
  const salesCard = rowOf(p, LOSS);
  await salesCard.waitFor({ timeout: 8000 });
  const sb = await p.locator("body").innerText();
  h.expect(/\$[\d,.]+ \//.test(sb), "sales sees the selling price");
  h.expect(!sb.includes("Себестоимость") && !sb.includes("Маржа") && !sb.includes("В убытке"), "sales without costs: no cost, margin or loss sign");
  await h.shot("sales-no-costs");
};
