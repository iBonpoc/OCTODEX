/**
 * e2e 528 — «Скидка / Налог / Депозит» одной строкой (#2454; founder 23.11, audit MAP §12 п.8; DS §8.7а), every view, by testID:
 * - each row is the word · `[% · Выкл. · $]` · the field · the sum, set right in the row — no sheet opens;
 * - «Выкл.» is in the middle; a press on «%» starts the deposit at 10 %, the discount empty, «$» at $0; «Выкл.» — «—»;
 * - the picked row's field takes the focus (one tap to typing); a press on the chosen position keeps the value; «Выкл.» and back
 *   brings the typed value back;
 * - a row wide enough holds the word, the switch, the field and the sum on one line; a narrow one (390, the 820/1280 totals column) is two
 *   lines that read as one (#2954): «word · sum» on top, the switch and its field under it — the field and the sum never hang alone.
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
  h.expect((await totals.sumOf(h, "est-discount-row")) === "−$25.00", "«Выкл.» and back: the typed $25.00 comes back");

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
  const mid = (b) => b.y + b.height / 2;
  const oneLine = Math.abs(mid(seg) - mid(sum)) < 4;
  if (oneLine) {
    h.expect(Math.abs(mid(field) - mid(sum)) < 4 && field.x + field.width <= sum.x + 1, `one line: the switch, the field, then the sum (switch ${mid(seg)}, field ${mid(field)}, sum ${mid(sum)})`);
  } else {
    // #2954: two lines — the word with its sum on top, the switch with its field under it (never the field and the sum alone)
    const word = await box("est-deposit-row-head");
    h.expect(Math.abs(mid(word) - mid(sum)) < 4 && sum.y + sum.height <= seg.y + 1, `two lines: the sum on the word's line, above the switch (sum ${mid(sum)}, switch ${seg.y})`);
    h.expect(Math.abs(mid(field) - mid(seg)) < 4 && field.x > seg.x, `two lines: the field beside the switch (field ${mid(field)}, switch ${mid(seg)})`);
  }

  await totals.mode(h, "est-deposit-row", "off");
  await sumIs("est-deposit-row", "—");
  {
    const [r, sg, sm] = [await box("est-deposit-row"), await box("est-deposit-row-mode-off"), await box("est-deposit-row-sum")];
    // off: «—» on the switch's line where the row is one line; on the word's line where it is two (#2954)
    const onSwitch = Math.abs(sg.y + sg.height / 2 - (sm.y + sm.height / 2)) < 4;
    const onWord = !onSwitch && sm.y + sm.height <= sg.y + 1;
    h.expect((onSwitch || onWord) && sm.y + sm.height <= r.y + r.height + 1, "off: «—» stays in the row's first line");
  }
  h.expect((await p.getByTestId("est-deposit-fixed").count()) === 0, "off: no field");
  h.expect((await sheets()) === 0, "still no sheet");
};
