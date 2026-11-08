/**
 * Spec 35 §4г («Деньги и отчёты» №6): Stripe's exact fee and refunds on their way, in the demo (the director's role).
 * The test plants what the cloud load gives (cloud/repo.ts paymentsFromRows, unit advance): a Stripe card payment with
 * feeCents and refundPendingCents.
 * 1) the receipt shows «Комиссия Stripe $1.75» and «Возврат в пути $30» (the screen only — never the client's PDF);
 * 2) the refund sheet: the limit is what the payment brings minus what is on its way; «Комиссия Stripe $1.75 не вернётся»;
 * 3) a tech sees no fee.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/payments");
  const db0 = await h.db();
  const base = db0.payments.find((x) => x.invoiceId && x.amountCents >= 10000);
  h.expect(!!base, "the demo has a payment of $100 or more");
  const id = "e2e-fee-191";
  await p.evaluate(([b, id]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    // a Stripe payment of $100 on the same invoice: $30 of a refund on its way, Stripe's fee $1.75
    raw.db.payments = [{ ...b, id, amountCents: 10000, method: "card", reference: "pi_E2E191", receiptNumber: "RCT-191", feeCents: 175, refundPendingCents: 3000, refundedCents: undefined }, ...raw.db.payments];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem("octo.role.v1", JSON.stringify("director"));
  }, [base, id]);

  await h.go(`/receipt/${id}`);
  const fee = p.getByTestId("rcpt-fee").locator("visible=true").first();
  await fee.waitFor({ timeout: 5000 });
  h.expect(/\$1\.75/.test(await fee.innerText()), "the receipt shows Stripe's fee");
  const onWay = p.getByTestId("rcpt-refund-pending").locator("visible=true").first();
  await onWay.waitFor({ timeout: 3000 });
  h.expect(/\$30(\.00)?(?!\d)/.test(await onWay.innerText()), "the receipt shows the refund on its way");
  await h.shot("receipt");

  await p.getByTestId("rcpt-refund").locator("visible=true").first().getByRole("button").click();
  const sheet = h.sheet();
  await sheet.getByTestId("refund-form").waitFor({ timeout: 5000 });
  const st = await sheet.innerText();
  h.expect(/Сумма возврата \(до \$70(\.00)?\)/.test(st), `the limit is $100 − $30 on its way: ${st.slice(0, 120)}`);
  h.expect(/Комиссия Stripe \$1\.75 не вернётся/.test(await sheet.getByTestId("refund-fee").innerText()), "the exact fee in the sheet");
  await sheet.getByRole("textbox").first().fill("71");
  await sheet.getByTestId("refund-above").waitFor({ timeout: 3000 });
  await h.shot("sheet");

  // a tech: no fee (the company's cost)
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go(`/receipt/${id}`);
  await p.getByTestId("rcpt-refund-pending").locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("rcpt-fee").count()) === 0, "a tech does not see Stripe's fee");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
