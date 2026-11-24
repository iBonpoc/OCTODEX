/** Contract $3,420 (deposit $342 paid): bill balance, pay $1,000 + overpay attempt + rest; receipts; progress invoice. */
exports.run = async (h) => {
  await h.go("/estimate/e5");
  await h.expectText(/Договор \| \$3,420 \| Выставлено \| \$342 \| Оплачено \| \$342 \| Осталось получить \| \$3,078/, "statement before");
  await h.page.getByRole("button", { name: /Выставить остаток \$3,078/ }).click(); await h.page.waitForTimeout(500);
  await h.expectText(/Выставлено \| \$3,420/, "fully invoiced");
  await h.page.getByText(/Остаток по договору/).first().click(); await h.page.waitForTimeout(700);
  // v2 (#2350): the invoice's sum once — `invoice-balance` (what is owed, then the total and what came in; paid in full — what came in)
  const balance = async () => (await h.page.getByTestId("invoice-balance").locator("visible=true").first().innerText()).split("\n").join(" | ");
  const expectBalance = async (re, msg) => {
    let t = await balance();
    for (let i = 0; i < 15 && !re.test(t); i++) { await h.page.waitForTimeout(200); t = await balance(); }
    h.expect(re.test(t), `${msg}: ${t}`);
  };
  const pay = async (amount, method) => {
    // «Принять оплату · $N» — the main step under the header (MainStep, its testID on the button)
    await h.page.getByTestId("invoice-take-payment").locator("visible=true").first().click();
    await h.sheet().locator('input[inputmode="decimal"]').fill(amount);
    await h.sheet().getByRole("radio", { name: method }).click();
    await h.sheet().getByRole("button", { name: /Записать/ }).click();
    // #2212: the receipt at once, in the same sheet — «Готово» closes it
    await h.page.getByTestId("pay-receipt").last().waitFor({ timeout: 5000 });
    await h.page.getByTestId("pay-receipt-done").last().click(); await h.page.waitForTimeout(600);
  };
  await pay("1000", "Zelle");
  await expectBalance(/К оплате \| \$2,078 \|.*Сумма \$3,078 · Оплачено \$1,000/, "after $1,000: owed $2,078 of $3,078, $1,000 came in");
  await pay("99999", "Чек"); // more than the balance → capped at $2,078
  await expectBalance(/Оплачено полностью \| \$3,078/, "paid in full, overpayment capped");
  h.expect((await h.page.getByTestId("invoice-take-payment").count()) === 0, "nothing left to take");
  const db = await h.db();
  const inv = db.invoices.find((i) => i.title === "Final balance" && i.jobId === "j1");
  h.expect(inv.paidCents === inv.totalCents && inv.totalCents === 307800, "invoice exactly paid, no overpayment");
  const receipts = db.payments.filter((p) => p.invoiceId === inv.id);
  h.expect(receipts.length === 2 && receipts.every((p) => /^RCT-\d+$/.test(p.receiptNumber)), "two receipts with numbers");
  await h.page.getByText(/RCT-\d+/).first().click(); await h.page.waitForTimeout(500);
  await h.page.getByTestId("rcpt-more").last().waitFor({ timeout: 5000 });
  await h.expectText(/RCT-\d+/, "receipt screen");
  await h.shot("receipt");
};
