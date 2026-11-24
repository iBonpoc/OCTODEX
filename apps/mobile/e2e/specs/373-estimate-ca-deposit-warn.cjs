/**
 * e2e 373 — «депозит сверх лимита Калифорнии» (#1377, rule 2, DS §8.3), every view, by testID:
 * - a $20,000 line (тестовые цены) with the default deposit 10 % ($2,000) is above the CA limit ($1,000, the lesser of
 *   10 % and $1,000): under «Депозит» the warning has the `warn` icon before its words — not colour alone;
 * - 5 % ($1,000 = the limit), typed in the deposit row — the warning goes.
 */

exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const count = (id) => p.getByTestId(id).locator("visible=true").count();

  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await line.addCustom(h, "Roof replacement (тестовые)", 20000);

  // the card: the icon, then the words with the limit
  await tid("est-ca-warn").waitFor({ timeout: 3000 });
  h.expect((await count("est-ca-warn-icon")) === 1, "the warning has its icon on the card");
  h.expect(/\$1,000\b/.test(await tid("est-ca-warn").innerText()), "the warning names the $1,000 limit");
  await h.shot("card");

  // 5 % = $1,000, the limit itself: no warning any more — the deposit is set right in its row (DS §8.7а, #2454)
  await require("../estimateTotals.cjs").fill(h, "est-deposit-pct", "5");
  await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="est-ca-warn"]')].some((e) => e.offsetParent !== null), null, { timeout: 3000 });
  h.expect((await count("est-ca-warn")) === 0, "at the limit the card has no warning");
};
