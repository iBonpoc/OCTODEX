/**
 * e2e 528 — «Скидка / Налог / Депозит» одной строкой (#2454; founder 23.11, audit MAP §12 п.8; DS §8.7а), every view, by testID:
 * - each row is the word · `[% · Выкл. · $]` · the field · the sum, set right in the row — no sheet opens;
 * - «Выкл.» is in the middle; a press on «%» starts the deposit at 10 %, on «$» at $0 (the person types it); «Выкл.» — «—»;
 * - a press on the position already chosen keeps the typed value;
 * - from 820 the switch, the field and the sum stand on the row's one line; on 390 the field and the sum may go under it, on the right.
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const totals = require("../estimateTotals.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const chosen = async (row, k) => (await tid(`${row}-mode-${k}`).getAttribute("aria-checked")) === "true";
  const sheets = async () => p.locator('[aria-modal="true"]').locator("visible=true").count();
  const sumIs = (row, v) => p.waitForFunction(([r, x]) => [...document.querySelectorAll(`[data-testid="${r}-sum"]`)].some((e) => e.offsetParent !== null && e.innerText.trim() === x), [row, v], { timeout: 3000 });

  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await line.addCustom(h, "Roof work", 200);
  await line.fold(h);

  // the order % · Выкл. · $, «Выкл.» in the middle; a new estimate: the discount is off («—»)
  const order = await p.evaluate(() => {
    const ks = ["pct", "off", "fixed"].map((k) => [...document.querySelectorAll(`[data-testid="est-discount-row-mode-${k}"]`)].find((e) => e.offsetParent !== null)?.getBoundingClientRect().x ?? -1);
    return ks;
  });
  h.expect(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], `% · Выкл. · $ from left to right (${order.join(", ")})`);
  h.expect(await chosen("est-discount-row", "off"), "a new estimate: the discount is off");
  h.expect((await totals.sumOf(h, "est-discount-row")) === "—", "off reads «—»");

  // the discount in $: the field is right in the row, no sheet
  await totals.mode(h, "est-discount-row", "fixed");
  h.expect((await sheets()) === 0, "no sheet opens: the value is set in the row");
  await totals.fill(h, "est-discount-fixed", "25");
  await sumIs("est-discount-row", "−$25.00");
  h.expect(true, "the discount in $: −$25.00");
  // a press on the chosen «$» keeps the typed sum
  await tid("est-discount-row-mode-fixed").click();
  await sumIs("est-discount-row", "−$25.00");
  h.expect((await tid("est-discount-fixed").locator("input").inputValue()) === "25", "a press on the chosen position keeps the value");

  // the deposit: «%» starts at 10 % of $175.00 = $17.50; «$» starts empty ($0.00), the person types it; «Выкл.» — «—»
  await totals.mode(h, "est-deposit-row", "pct");
  h.expect((await tid("est-deposit-pct").locator("input").inputValue()) === "10", "the deposit in % starts at 10");
  await sumIs("est-deposit-row", "$17.50");
  await totals.mode(h, "est-deposit-row", "fixed");
  await sumIs("est-deposit-row", "$0.00");
  await totals.fill(h, "est-deposit-fixed", "50");
  await sumIs("est-deposit-row", "$50.00");
  h.expect(true, "the deposit in $: $50.00");
  await h.shot("totals");

  // the row's shape: from 820 the switch, the field and the sum on one line; on any width the field and the sum stay in the row
  const box = async (id) => tid(id).boundingBox();
  const [row, seg, field, sum] = [await box("est-deposit-row"), await box("est-deposit-row-mode-pct"), await box("est-deposit-fixed"), await box("est-deposit-row-sum")];
  const inside = (b) => b.x >= row.x - 1 && b.x + b.width <= row.x + row.width + 1 && b.y >= row.y - 1 && b.y + b.height <= row.y + row.height + 1;
  h.expect(inside(seg) && inside(field) && inside(sum), "the switch, the field and the sum lie inside the row");
  h.expect(field.x + field.width <= sum.x + 1, "the field stands left of the sum");
  if (h.layout.width >= 820) {
    const mid = (b) => b.y + b.height / 2;
    h.expect(Math.abs(mid(seg) - mid(sum)) < 4 && Math.abs(mid(field) - mid(sum)) < 4, `one line from 820 (switch ${mid(seg)}, field ${mid(field)}, sum ${mid(sum)})`);
  }

  await totals.mode(h, "est-deposit-row", "off");
  await sumIs("est-deposit-row", "—");
  h.expect((await p.getByTestId("est-deposit-fixed").count()) === 0, "off: no field");
  h.expect((await sheets()) === 0, "still no sheet");
};
