/**
 * e2e 373 — «задаток сверх лимита Калифорнии» (#1377, rule 2, DS §8.3), every view, by testID:
 * - a $20,000 line (тестовые цены) with the default deposit 10 % ($2,000) is above the CA limit ($1,000, the lesser of
 *   10 % and $1,000): under «Депозит» the warning has the `warn` icon before its words — not colour alone;
 * - the deposit sheet shows the same warning with its icon;
 * - 5 % ($1,000 = the limit) — the warning goes, in the sheet and on the card.
 */
const { sheetGone, pressEscUntilClosed } = require("../sheet.cjs");

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

  // the deposit sheet: the same warning, with its icon
  await tid("est-deposit-row").click();
  await tid("est-ca-warn-sheet").waitFor({ timeout: 3000 });
  h.expect((await count("est-ca-warn-sheet-icon")) === 1, "the warning has its icon in the sheet");
  await h.shot("sheet");

  // 5 % = $1,000, the limit itself: no warning any more
  await tid("est-deposit-pct").locator("input").fill("5");
  await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="est-ca-warn-sheet"]')].some((e) => e.offsetParent !== null), null, { timeout: 3000 });
  await pressEscUntilClosed(p);
  await sheetGone(p);
  h.expect((await count("est-ca-warn")) === 0, "at the limit the card has no warning");
};
