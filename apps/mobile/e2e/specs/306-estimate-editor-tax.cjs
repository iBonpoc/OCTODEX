/**
 * e2e 306 — налог в смете (РС-7a, спека Р6, #1097 #1229), every view; by testID (rule 19):
 * - a new estimate: the tax is off, there are no switches «by kind»; on — one rate typed by hand (8.875 %, three decimals),
 *   the tax on the whole amount ($100.00 × 8.875 % = $8.88, once);
 * - «Как в прошлой смете: …» offers the rate of the last saved estimate and fills it in only when pressed;
 * - an old estimate with the tax only on some kinds says so; «Считать на всю сумму…» asks «Было … станет …»:
 *   «Не менять» keeps it, «Пересчитать» makes it the whole amount.
 */
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const openTax = async () => {
    await p.getByRole("button", { name: "Налог с продаж" }).click();
    await tid("est-tax-toggle").waitFor({ timeout: 4000 });
  };
  const closeSheet = async () => {
    await h.sheet().getByRole("button", { name: "Понятно" }).click();
    await p.waitForFunction(() => document.querySelectorAll('[data-testid="est-tax-toggle"]').length === 0, null, { timeout: 4000 });
  };
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await line.addCustom(h, "Taxed work", 100);

  // a new estimate: off, no «by kind» switches
  await openTax();
  h.expect((await tid("est-tax-toggle").getByRole("switch").getAttribute("aria-checked")) === "false", "the tax is off in a new estimate");
  h.expect((await h.sheet().getByRole("switch", { name: /^Налог с продаж: / }).count()) === 0, "no switches by kind");
  await tid("est-tax-toggle").getByRole("switch").click();
  const rate = tid("est-tax-rate").locator("input");
  await rate.waitFor({ timeout: 3000 });
  await rate.fill("8.875");
  h.expect((await rate.inputValue()) === "8.875", "the rate keeps three decimals (8.875)");
  await closeSheet();
  await h.expectText(/\$8\.88 · 8\.875%/, "the tax on the whole amount: $100.00 × 8.875 % = $8.88");

  // saved: the next estimate offers «как в прошлой»
  await p.getByRole("button", { name: "Сохранить", exact: true }).last().click();
  await p.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || "null")?.db?.estimates ?? []).some((e) => e.customerId === "c2" && e.doc?.settings?.tax?.ratePpm === 88750), DB_KEY, { timeout: 8000 });
  const saved = (await h.db()).estimates.filter((e) => e.customerId === "c2" && e.doc).at(-1);
  h.expect(saved?.doc.settings.tax.enabled === true && saved.doc.settings.tax.ratePpm === 88750, `saved with the rate in ppm (88750): ${JSON.stringify(saved?.doc.settings.tax)}`);
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await line.addCustom(h, "Second", 50);
  await openTax();
  h.expect((await tid("est-tax-toggle").getByRole("switch").getAttribute("aria-checked")) === "false", "off again in the next estimate: not filled in by itself");
  await tid("est-tax-toggle").getByRole("switch").click();
  await tid("est-tax-last").waitFor({ timeout: 3000 });
  h.expect(/8\.875/.test(await tid("est-tax-last").innerText()), "«Как в прошлой смете: 8.875 %»");
  h.expect((await tid("est-tax-rate").locator("input").inputValue()) !== "8.875", "the rate is not filled in until it is pressed");
  await tid("est-tax-last").getByRole("button").click();
  await p.waitForFunction(() => document.querySelector('[data-testid="est-tax-rate"] input')?.value === "8.875", null, { timeout: 3000 });
  await closeSheet();

  // an old estimate: the tax only on materials (written by an older phone)
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  raw.db.estimates.find((x) => x.id === saved.id).doc.settings.tax = { enabled: true, rateBps: 1000, groups: { service: false, labor: false, material: true } };
  await h.seed(DB_KEY, raw);
  await h.go(`/estimate/new?id=${saved.id}`);
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await openTax();
  await tid("est-tax-partial").waitFor({ timeout: 3000 });
  h.expect(/Налог только на часть позиций/.test(await tid("est-tax-partial").innerText()), "the old setting is named");
  await tid("est-tax-partial").getByRole("button").click();
  const ask = tid("est-tax-ask");
  await ask.waitFor({ timeout: 3000 });
  h.expect(/Было \$/.test(await ask.innerText()) && /станет \$/.test(await ask.innerText()), `the question has «было / станет» (${(await ask.innerText()).replace(/\n/g, " ")})`);
  await tid("est-tax-ask-no").getByRole("button").click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="est-tax-ask"]').length === 0, null, { timeout: 3000 });
  h.expect((await tid("est-tax-partial").count()) === 1, "«Не менять»: still the old setting");
  await tid("est-tax-partial").getByRole("button").click();
  await tid("est-tax-ask-yes").getByRole("button").click();
  await tid("est-tax-rate").waitFor({ timeout: 3000 });
  h.expect((await tid("est-tax-partial").count()) === 0, "«Пересчитать»: the whole amount now");
};
