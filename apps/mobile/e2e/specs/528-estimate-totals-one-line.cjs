/**
 * e2e 528 — «Скидка / Налог / Депозит» одной строкой (#2454; founder 23.11, audit MAP §12 п.8; DS §8.7а), every view, by testID:
 * - each row is the word · `[% · Выкл. · $]` · the field · the sum, set right in the row — no sheet opens;
 * - «Выкл.» is in the middle; a press on «%» starts the deposit at 10 %, the discount empty, «$» at $0; «Выкл.» — «—»;
 * - the picked row's field takes the focus (one tap to typing); a press on the chosen position keeps the value; «Выкл.» and back
 *   brings the typed value back;
 * - a row wide enough (480) holds the switch, the field and the sum on one line; a narrow one puts the field and the sum under it, on the right.
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const totals = require("../estimateTotals.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const chosen = async (row, k) => (await tid(`${row}-mode-${k}`).getAttribute("aria-checked")) === "true";
  const sheets = async () => p.locator('[aria-modal="true"]').locator("visible=true").count();
  const sumIs = (row, v) => p.waitForFunction(([r, x]) => [...document.querySelectorAll(`[data-testid="${r}-sum"]`)].some((e) => e.offsetParent !== null && e.innerText.trim() === x), [row, v], { timeout: 3000 }).catch(async () => { throw new Error(`${row} sum: wanted ${v}, is ${await totals.sumOf(h, row)}`); });

  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await line.addCustom(h, "Roof work", 200);

  // the order % · Выкл. · $, «Выкл.» in the middle; a new estimate: the discount is off («—»)
  const order = await p.evaluate(() => {
    const ks = ["pct", "off", "fixed"].map((k) => [...document.querySelectorAll(`[data-testid="est-discount-row-mode-${k}"]`)].find((e) => e.offsetParent !== null)?.getBoundingClientRect().x ?? -1);
    return ks;
  });
  h.expect(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], `% · Выкл. · $ from left to right (${order.join(", ")})`);
  h.expect(await chosen("est-discount-row", "off"), "a new estimate: the discount is off");
  h.expect((await totals.sumOf(h, "est-discount-row")) === "—", "off reads «—»");

  // the discount in $: the field is right in the row, no sheet, the focus in it; $0 reads «$0.00» (on), not «—» (off)
  await totals.mode(h, "est-discount-row", "fixed");
  h.expect((await sheets()) === 0, "no sheet opens: the value is set in the row");
  await p.waitForFunction(() => !!document.activeElement?.closest('[data-testid="est-discount-fixed"]'), null, { timeout: 3000 }).catch(async () => { throw new Error(`focus is not in the field: ${await p.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))}`); });
  h.expect(true, "the picked row's field has the focus");
  await sumIs("est-discount-row", "$0.00");
  await totals.fill(h, "est-discount-fixed", "25");
  await sumIs("est-discount-row", "−$25.00");
  h.expect((await totals.sumOf(h, "est-discount-row")) === "−$25.00", "the discount in $: −$25.00");
  // a press on the chosen «$» keeps the typed sum
  await tid("est-discount-row-mode-fixed").click();
  await sumIs("est-discount-row", "−$25.00");
  h.expect((await tid("est-discount-fixed").locator("input").inputValue()) === "25", "a press on the chosen position keeps the value");
  // «%» starts empty (no number of ours changes the client's sum), «Выкл.» and back to «$» brings the $25 back
  await totals.mode(h, "est-discount-row", "pct");
  h.expect(["", "0"].includes(await tid("est-discount-pct").locator("input").inputValue()), "the discount in % starts empty");
  await sumIs("est-discount-row", "$0.00");
  await totals.mode(h, "est-discount-row", "off");
  await totals.mode(h, "est-discount-row", "fixed");
  await sumIs("est-discount-row", "−$25.00");
  h.expect((await totals.sumOf(h, "est-discount-row")) === "−$25.00", "«Выкл.» and back: the typed $25 comes back");

  // the deposit: «%» starts at 10 % of $175.00 = $17.50; «$» starts empty ($0.00), the person types it; «Выкл.» — «—»
  await totals.mode(h, "est-deposit-row", "pct");
  h.expect((await tid("est-deposit-pct").locator("input").inputValue()) === "10", "the deposit in % starts at 10");
  await h.shot("pct");
  await sumIs("est-deposit-row", "$17.50");
  await totals.mode(h, "est-deposit-row", "fixed");
  await sumIs("est-deposit-row", "$0.00");
  await totals.fill(h, "est-deposit-fixed", "50");
  await sumIs("est-deposit-row", "$50.00");
  h.expect((await totals.sumOf(h, "est-deposit-row")) === "$50.00", "the deposit in $: $50.00");
  await h.shot("totals");

  // the row's shape: the field and the sum stay in the row on any width
  const box = async (id) => tid(id).boundingBox();
  const [row, seg, field, sum] = [await box("est-deposit-row"), await box("est-deposit-row-mode-pct"), await box("est-deposit-fixed"), await box("est-deposit-row-sum")];
  const inside = (b) => b.x >= row.x - 1 && b.x + b.width <= row.x + row.width + 1 && b.y >= row.y - 1 && b.y + b.height <= row.y + row.height + 1;
  h.expect(inside(seg) && inside(field) && inside(sum), "the switch, the field and the sum lie inside the row");
  h.expect(field.x + field.width <= sum.x + 1, "the field stands left of the sum");
  // (from 820 the totals card is a column of its own: one line wherever the row is wide enough for it)
  if (row.width >= 480) {
    const mid = (b) => b.y + b.height / 2;
    h.expect(Math.abs(mid(seg) - mid(sum)) < 4 && Math.abs(mid(field) - mid(sum)) < 4, `one line in a wide row (switch ${mid(seg)}, field ${mid(field)}, sum ${mid(sum)})`);
  }

  await totals.mode(h, "est-deposit-row", "off");
  await sumIs("est-deposit-row", "—");
  {
    const [r, sg, sm] = [await box("est-deposit-row"), await box("est-deposit-row-mode-off"), await box("est-deposit-row-sum")];
    h.expect(Math.abs(sg.y + sg.height / 2 - (sm.y + sm.height / 2)) < 4 && sm.y + sm.height <= r.y + r.height + 1, "off: «—» stays on the switch's line");
  }
  h.expect((await p.getByTestId("est-deposit-fixed").count()) === 0, "off: no field");
  h.expect((await sheets()) === 0, "still no sheet");
};
