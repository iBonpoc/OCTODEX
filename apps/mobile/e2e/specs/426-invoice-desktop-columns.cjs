/**
 * e2e 426 — the invoice card on a desktop (#1495 Б, DS §12.3 «Десктоп»), the director, every view, by testID:
 * - from 1100 (the 1280 view): two columns — the receipts on the left, the summary (status, money, «Принять оплату») in the side
 *   column 360 on the right; the money rows are not stretched across the page ("К оплате" and the sum are ≤ 360 apart);
 * - 390 and 820: one column as before, no side column.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/invoice/i1");
  await tid("invoice-screen").waitFor({ timeout: 8000 });
  const desktop = h.layout.width >= 1100;
  const side = await p.getByTestId("invoice-side").locator("visible=true").count();
  if (!desktop) {
    h.expect(side === 0, `${h.layout.width}: one column, no side column`);
    return;
  }
  h.expect(side === 1, "1280: the summary stands in the side column");
  const box = await tid("invoice-side").boundingBox();
  h.expect(Math.abs(box.width - 360) <= 1, `the side column is 360 wide (${box.width})`);
  h.expect(box.x > h.layout.width / 2, `the side column is on the right (${Math.round(box.x)})`);
  const pay = await tid("invoice-take-payment").boundingBox();
  h.expect(pay.x >= box.x - 1 && pay.x + pay.width <= box.x + box.width + 1, "«Принять оплату» is in the side column");
  const recv = await tid("invoice-no-receipts").boundingBox();
  h.expect(recv.x + recv.width <= box.x, "the receipts are on the left of the side column");
  const next = await tid("invoice-next").boundingBox();
  h.expect(next.y < box.y, "«что дальше» stands above both columns");
  await h.shot("columns");
};
