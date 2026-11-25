/**
 * e2e 306 — налог в смете (РС-7a, спека Р6, #1097 #1229), every view; by testID (rule 19):
 * - a new estimate: the tax is off, there are no switches «by kind»; on — one rate typed by hand (8.875 %, three decimals),
 *   the tax on the whole amount ($100.00 × 8.875 % = $8.88, once);
 * - «Как в прошлой смете: …» offers the rate of the last saved estimate and fills it in only when pressed;
 * - an old estimate with the tax only on some kinds says so; «Считать на всю сумму…» asks «Было … станет …»:
 *   «Не менять» keeps it, «Пересчитать» makes it the whole amount;
 * - a text that is not a rate («abc») changes nothing and says what to write; leaving the field shows the saved rate;
 * - with a 10 % discount the tax is on the amount after it ($90.00 × 8.875 % = $7.99, total $97.99);
 * - a signed estimate: the tax row is read only (the estimate does not change).
 * DS §8.7а (#2454): the tax is set right in its row — `[% · Выкл.]` and the rate field, no sheet; the one sheet left is the question.
 */
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const totals = require("../estimateTotals.cjs");
  const chosen = async (k) => (await tid(`est-tax-row-mode-${k}`).getAttribute("aria-checked")) === "true";
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await line.addCustom(h, "Taxed work", 100);

  // a new estimate: off, no «by kind» switches
  h.expect(await chosen("off"), "the tax is off in a new estimate");
  h.expect((await p.getByRole("switch", { name: /^Налог с продаж: / }).count()) === 0, "no switches by kind");
  h.expect((await p.getByTestId("est-tax-row-mode-fixed").count()) === 0, "no tax as a sum yet (#2404)");
  await totals.mode(h, "est-tax-row", "pct");
  const rate = tid("est-tax-rate").locator("input");
  await rate.waitFor({ timeout: 3000 });
  await rate.fill("8.875");
  h.expect((await rate.inputValue()) === "8.875", "the rate keeps three decimals (8.875)");
  // not a rate: nothing changes, the field says what to write; leaving it shows the rate that is saved
  await rate.fill("abc");
  await tid("est-tax-bad").getByText("Впишите ставку, например 10.25").waitFor({ timeout: 3000 }); // DS §8.7а: under the row
  await rate.blur();
  await p.waitForFunction(() => document.querySelector('[data-testid="est-tax-rate"] input')?.value === "8.875", null, { timeout: 3000 });
  h.expect((await p.locator('[aria-modal="true"]').locator("visible=true").count()) === 0, "no sheet: the tax is set in its row");
  h.expect((await totals.sumIs(h, "est-tax-row", "$8.88")) === "$8.88", "the tax on the whole amount: $100.00 × 8.875 % = $8.88");
  // a 10 % discount: the tax is on the amount after it
  await totals.mode(h, "est-discount-row", "pct");
  await totals.fill(h, "est-discount-pct", "10");
  h.expect((await totals.sumIs(h, "est-discount-row", "−$10.00")) === "−$10.00", "the discount: −$10.00");
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="est-tax-row-sum"]')].some((e) => e.offsetParent !== null && e.innerText.trim() === "$7.99"), null, { timeout: 3000 });
  h.expect((await totals.sumOf(h, "est-tax-row")) === "$7.99", "the tax after the discount: $90.00 × 8.875 % = $7.99");
  await h.expectText(/Итого \| \$97\.99/, "the total agrees");

  // saved: the next estimate offers «как в прошлой»
  await tid("ue-save").click();
  await p.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || "null")?.db?.estimates ?? []).some((e) => e.customerId === "c2" && e.doc?.settings?.tax?.ratePpm === 88750), DB_KEY, { timeout: 8000 });
  const saved = (await h.db()).estimates.filter((e) => e.customerId === "c2" && e.doc).at(-1);
  h.expect(saved?.doc.settings.tax.enabled === true && saved.doc.settings.tax.ratePpm === 88750, `saved with the rate in ppm (88750): ${JSON.stringify(saved?.doc.settings.tax)}`);
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await line.addCustom(h, "Second", 50);
  h.expect(await chosen("off"), "off again in the next estimate: the tax is not on by itself");
  await totals.mode(h, "est-tax-row", "pct");
  // #2456: «%» puts the rate of the last estimate at once (seen, editable); there is no «Как в прошлой» button any more
  await p.waitForFunction(() => document.querySelector('[data-testid="est-tax-rate"] input')?.value === "8.875", null, { timeout: 3000 });
  await h.shot("tax-prefilled");
  h.expect((await p.getByTestId("est-tax-last").count()) === 0, "no «Как в прошлой смете» button");

  // an old estimate: the tax only on materials (written by an older phone)
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  raw.db.estimates.find((x) => x.id === saved.id).doc.settings.tax = { enabled: true, rateBps: 1000, groups: { service: false, labor: false, material: true } };
  await h.seed(DB_KEY, raw);
  await h.go(`/estimate/new?id=${saved.id}`);
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await tid("est-tax-partial").waitFor({ timeout: 3000 });
  h.expect(/Налог только на часть позиций/.test(await tid("est-tax-partial").innerText()), "the old setting is named");
  await tid("est-tax-partial").getByRole("button").click();
  const ask = tid("est-tax-ask");
  await ask.waitFor({ timeout: 3000 });
  // the question is the one sheet of the totals (one window at a time: a second Modal does not show on iOS)
  h.expect((await p.locator('[aria-modal="true"]').locator("visible=true").count()) === 1, "one sheet open while the question stands");
  h.expect(/Было \$/.test(await ask.innerText()) && /станет \$/.test(await ask.innerText()), `the question has «было / станет» (${(await ask.innerText()).replace(/\n/g, " ")})`);
  await tid("est-tax-ask-no").getByRole("button").click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="est-tax-ask"]').length === 0, null, { timeout: 3000 });
  h.expect((await tid("est-tax-partial").count()) === 1, "«Не менять»: still the old setting");
  // a press on the chosen «%» changes nothing: no question again (code review of #2454)
  await tid("est-tax-row-mode-pct").click();
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); // a question that must NOT come: two frames
  h.expect((await p.getByTestId("est-tax-ask").locator("visible=true").count()) === 0, "a press on the chosen «%» asks nothing");
  await tid("est-tax-partial").getByRole("button").click();
  await tid("est-tax-ask-yes").getByRole("button").click();
  await tid("est-tax-rate").waitFor({ timeout: 3000 });
  h.expect((await tid("est-tax-partial").count()) === 0, "«Пересчитать»: the whole amount now");

  // the old setting with the tax OFF: «%» asks the same question (DS §8.7); leave the editor first — its own save must not land
  // over the seeded setting
  await h.go("/");
  const raw3 = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  raw3.db.estimates.find((x) => x.id === saved.id).doc.settings.tax = { enabled: false, rateBps: 1000, groups: { service: false, labor: false, material: true } };
  await h.seed(DB_KEY, raw3);
  // the editor kept «Пересчитать» as an unfinished edit (`edit|<id>`, k1): drop it — else it comes back over the seeded setting
  const DRAFTS = "octo.drafts.v1.demo";
  const kept = await p.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]"), DRAFTS);
  await h.seed(DRAFTS, kept.filter((d) => d.ctx !== `edit|${saved.id}`));
  await h.go(`/estimate/new?id=${saved.id}`);
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="est-tax-row-mode-off"]')].some((e) => e.offsetParent !== null && e.getAttribute("aria-checked") === "true"), null, { timeout: 3000 });
  h.expect(true, "the old setting is back: the tax is off");
  await tid("est-tax-row-mode-pct").click();
  await tid("est-tax-ask").waitFor({ timeout: 3000 });
  h.expect(true, "«%» on an old tax by kind asks «было / станет»");
  await tid("est-tax-ask-no").getByRole("button").click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="est-tax-ask"]').length === 0, null, { timeout: 3000 });

  // a signed estimate (awaiting the company's signature, and signed by both): the totals rows are read only, and say why
  for (const status of ["awaiting_countersign", "approved"]) {
    const raw2 = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
    raw2.db.estimates.find((x) => x.id === saved.id).status = status;
    await h.seed(DB_KEY, raw2);
    await h.go(`/estimate/new?id=${saved.id}`);
    await tid("ue-save").waitFor({ timeout: 8000 });
    for (const row of ["est-discount-row", "est-tax-row", "est-deposit-row"]) h.expect((await tid(`${row}-mode-off`).getAttribute("aria-disabled")) === "true", `a signed estimate (${status}): ${row} is read only`);
    const rateIn = p.getByTestId("est-tax-rate").locator("visible=true").locator("input");
    if (await rateIn.count()) h.expect(!(await rateIn.first().isEditable()), `a signed estimate (${status}): the rate does not take text`);
    await tid("est-totals-signed").waitFor({ timeout: 3000 });
    if (status === "approved") await h.shot("signed");
    h.expect(/не меняется/.test(await tid("est-totals-signed").innerText()), `a signed estimate (${status}): says why`);
  }
};
