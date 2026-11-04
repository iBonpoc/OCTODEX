/** Contract $3,420 (deposit $342 paid): bill balance, pay $1,000 + overpay attempt + rest; receipts; progress invoice. */
exports.run = async (h) => {
  await h.go("/estimate/e5");
  await h.expectText(/Договор \| \$3,420 \| Выставлено \| \$342 \| Оплачено \| \$342 \| Осталось получить \| \$3,078/, "statement before");
  await h.page.getByRole("button", { name: /Выставить остаток \$3,078/ }).click(); await h.page.waitForTimeout(500);
  await h.expectText(/Выставлено \| \$3,420/, "fully invoiced");
  await h.page.getByText(/Final balance/).first().click(); await h.page.waitForTimeout(700);
  const pay = async (amount, method) => {
    await h.page.getByRole("button", { name: "Принять оплату" }).click(); await h.page.waitForTimeout(300);
    await h.sheet().locator('input[inputmode="decimal"]').fill(amount);
    await h.sheet().getByRole("radio", { name: method }).click();
    await h.sheet().getByRole("button", { name: /Записать/ }).click(); await h.page.waitForTimeout(600);
  };
  await pay("1000", "Zelle");
  await h.expectText(/Оплачено \| \$1,000 \| К оплате \| \$2,078/, "after $1,000");
  await pay("99999", "Чек"); // more than the balance → capped at $2,078
  await h.expectText(/К оплате \| \$0/, "paid in full, overpayment capped");
  const db = await h.db();
  const inv = db.invoices.find((i) => i.title === "Final balance" && i.jobId === "j1");
  h.expect(inv.paidCents === inv.totalCents && inv.totalCents === 307800, "invoice exactly paid, no overpayment");
  const receipts = db.payments.filter((p) => p.invoiceId === inv.id);
  h.expect(receipts.length === 2 && receipts.every((p) => /^RCT-\d+$/.test(p.receiptNumber)), "two receipts with numbers");
  await h.page.getByText(/RCT-\d+/).first().click(); await h.page.waitForTimeout(500);
  await h.expectText(/Квитанция RCT-\d+/, "receipt screen");
  await h.shot("receipt");
};
