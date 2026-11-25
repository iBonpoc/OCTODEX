/**
 * Money in the estimate editor is a document's money: always with cents (#2451, #2457; DS §4.5 «в документах — с центами», the
 * approved v9 mockup «$772.36» / «$150.00»), every view. «Сумма $36» next to «$12.00 × 3» and «Итого $175.00» was one screen with two
 * ways of writing a sum. The page's money tokens are read: none is a whole-dollar one («$36», «−$25», «$0»).
 */
const line = require("../estimateLine.cjs");
const totals = require("../estimateTotals.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const whole = () => p.evaluate(() => (document.body.innerText.match(/[−-]?\$\d[\d,]*(?![\d,.])/g) || []));
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await line.addCustom(h, "Roof work", 12, 3);
  await line.addCustom(h, "Flashing", 164);
  // discount $25, tax 8.25 %, deposit 10 %: every row of the totals has a sum
  await totals.mode(h, "est-discount-row", "fixed");
  await totals.fill(h, "est-discount-fixed", "25");
  await totals.setTax(h, "8.25");
  await totals.mode(h, "est-deposit-row", "pct");
  await totals.fill(h, "est-deposit-pct", "10");
  await totals.sumIs(h, "est-discount-row", "−$25.00");
  h.expect((await totals.sumOf(h, "est-discount-row")) === "−$25.00", `the discount reads with cents («${await totals.sumOf(h, "est-discount-row")}»)`);
  const bad = await whole();
  h.expect(bad.length === 0, `no whole-dollar sum on the page: ${JSON.stringify(bad)}`);
  await h.shot("totals");
  // a discount of $0 (on) reads «$0.00», the off one «—»
  await totals.fill(h, "est-discount-fixed", "0");
  h.expect((await totals.sumIs(h, "est-discount-row", "$0.00")) === "$0.00", "a discount of $0 reads «$0.00»");
};
