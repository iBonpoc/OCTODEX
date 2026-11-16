/**
 * e2e 453 — #1835 (the audit's variant Б, 16.11): a material whose cost was typed without a supplier ($108.00, 30 %:
 * $140.40 to the client — as «Сохранить в каталог» makes it) gets a supplier with an 8 % tax. Every view.
 * - «Поставщик ›» → the supplier → the question «Закупка $108.00 — это уже с налогом поставщика (8%)?», two rows, each with
 *   what happens to the client's price; no default;
 * - closed without an answer: no supplier attached;
 * - «Да, с налогом» → the cost $100.00, the client's price stays $140.40 (before: $151.63, the tax counted twice);
 * - another item: «Нет, без налога» → the cost stays $108.00, the client's price $151.63, as the question said;
 * - the same supplier picked again (it has one now): no question.
 * By testID and the store; waits on what it checks.
 */
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const tap = (id) => tid(id).locator('[role="button"]').first().click();
  const waitItem = async (id, ok, what) => {
    await p.waitForFunction(([k, id, src]) => {
      const it = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.catalog || []).find((x) => x.id === id);
      // eslint-disable-next-line no-new-func
      return !!it && new Function("it", `return (${src})(it)`)(it);
    }, [DB_KEY, id, ok.toString()], { timeout: 8000 }).catch(() => { throw new Error(what); });
    h.expect(true, what);
  };

  // the supplier and two items, put from a page without the app (h.seed, CHECKS §9 №12)
  await h.go("/today");
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  const sup = { id: "sup-e2e-453", name: "Tax Eight Supply (test)", active: true, taxBps: 800 };
  raw.db.suppliers = [...(raw.db.suppliers || []).filter((x) => x.id !== sup.id), sup];
  const mat = (id, name) => ({ id, kind: "material", name, unit: "ea", priceCents: 14040, costCents: 10800, vendorTaxBps: 0, markupBps: 3000 });
  raw.db.catalog = [...raw.db.catalog.filter((x) => !x.id.startsWith("cat-e2e-453")), mat("cat-e2e-453a", "Bracket A (test)"), mat("cat-e2e-453b", "Bracket B (test)")];
  await h.seed(DB_KEY, raw);

  const pickSup = async () => {
    await tap("catalog-supplier");
    await h.sheet().getByTestId("sup-pick-sup-e2e-453").locator('[role="button"]').first().click();
  };

  // A: the question; closed — nothing attached
  await h.go("/catalog/cat-e2e-453a");
  await tid("catalog-name").waitFor({ timeout: 8000 });
  await pickSup();
  await tid("sup-tax-ask").waitFor({ timeout: 5000 });
  const q = await tid("sup-tax-ask").innerText();
  h.expect(/\$108(\.00)?\b/.test(q) && /8%/.test(q), `the question names the cost and the tax: ${q.slice(0, 120)}`);
  h.expect(/\$100(\.00)?\b/.test(q) && /\$140\.40/.test(q) && /\$151\.63/.test(q), "each row says what happens to the client's price");
  await h.shot("ask");
  await tid("sheet-close").click();
  await require("../sheet.cjs").sheetGone(p);
  h.expect(!/Tax Eight Supply/.test(await tid("catalog-supplier").innerText()), "closed without an answer: no supplier attached");

  // A: «Да, с налогом» → $100.00, the client's price stays
  await pickSup();
  await tid("sup-tax-ask-with").waitFor({ timeout: 5000 });
  await tap("sup-tax-ask-with");
  await require("../sheet.cjs").sheetGone(p);
  await tid("catalog-supplier").getByText("Tax Eight Supply (test)").waitFor({ timeout: 5000 });
  await h.expectText(/Цена в смете: \$140\.40/, "the client's price stays $140.40 (not $151.63)");
  await tap("catalog-save");
  await waitItem("cat-e2e-453a", (it) => it.supplierId === "sup-e2e-453" && it.costCents === 10000 && it.vendorTaxBps === 800 && it.markupBps === 3000, "«Да»: the cost $100.00 without the tax, the supplier's 8 %, the markup kept");

  // the same supplier again: it has one now — no question
  await h.go("/catalog/cat-e2e-453a");
  await tid("catalog-name").waitFor({ timeout: 8000 });
  await pickSup();
  await require("../sheet.cjs").sheetGone(p);
  h.expect((await p.getByTestId("sup-tax-ask").locator("visible=true").count()) === 0, "picked again: no question");

  // B: «Нет, без налога» → the cost stays, the tax on top
  await h.go("/catalog/cat-e2e-453b");
  await tid("catalog-name").waitFor({ timeout: 8000 });
  await pickSup();
  await tid("sup-tax-ask-without").waitFor({ timeout: 5000 });
  await tap("sup-tax-ask-without");
  await require("../sheet.cjs").sheetGone(p);
  await h.expectText(/Цена в смете: \$151\.63/, "«Нет»: the client's price the question named, $151.63");
  await tap("catalog-save");
  await waitItem("cat-e2e-453b", (it) => it.supplierId === "sup-e2e-453" && it.costCents === 10800 && it.vendorTaxBps === 800, "«Нет»: the cost stays $108.00, the supplier's 8 % on top");
};
