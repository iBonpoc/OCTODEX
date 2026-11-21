/**
 * e2e 426 — the invoice on a desktop (#1495 Б, DS §12.3 «Десктоп»; v2 #2350), the director, every view, by testID.
 * v2: the invoice is the Object template — ONE column on every width (no side column of its own: the template has none); what the
 * side column was for stays true: on 1280 the summary («К оплате» and the sum) and the way to take the money are in the first screen,
 * not under the receipts; a paid invoice has no payment button.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const any = async (ids) => (await Promise.all(ids.map((id) => p.getByTestId(id).locator("visible=true").count()))).some((n) => n > 0);
  await h.go("/invoice/i1");
  await tid("invoice-screen").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("invoice-side").count()) === 0, `${h.layout.width}: one column, no side column`);
  if (h.layout.width < 1280) return;
  const vh = p.viewportSize().height;
  const bal = await tid("invoice-balance").boundingBox();
  h.expect(bal.y >= 0 && bal.y + bal.height <= vh, `1280: the summary is in the first screen (${Math.round(bal.y)}–${Math.round(bal.y + bal.height)} of ${vh})`);
  h.expect(await any(["invoice-take-payment", "invoice-act-pay", "invoice-take-payment-second"]), "1280: «Принять оплату» is on the first screen");
  await h.shot("columns");
  // a paid invoice: the summary stays, without the payment buttons
  await h.go("/invoice/i3");
  await tid("invoice-screen").waitFor({ timeout: 8000 });
  await tid("invoice-balance").waitFor({ timeout: 5000 });
  h.expect(!(await any(["invoice-take-payment", "invoice-act-pay", "invoice-take-payment-second"])), "i3 (paid): no «Принять оплату»");
};
