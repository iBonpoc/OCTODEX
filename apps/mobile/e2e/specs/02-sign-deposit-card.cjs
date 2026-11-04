/** Client signs on the client page → deposit invoice issued → pays by simulated card → contract statement paid. */
exports.run = async (h) => {
  await h.go("/p/demo0handyman0estimate0000000001");
  await h.expectText(/Итого \| \$772\.36/, "client sees total with 9.5% tax on materials");
  await h.sign("Linda Alvarez");
  await h.expectText(/Смета одобрена/, "approved");
  await h.expectText(/INV-\d+ · Deposit/, "deposit invoice on the client page");
  await h.page.getByRole("button", { name: "Оплатить картой" }).first().click(); await h.page.waitForTimeout(300);
  await h.expectText(/Тестовый режим/, "test mode label");
  await h.sheet().getByRole("button", { name: /Оплатить \$77\.24/ }).click(); await h.page.waitForTimeout(800);
  await h.go("/estimate/e6");
  await h.expectText(/Выставлено \| \$77\.24 \| Оплачено \| \$77\.24/, "deposit paid in the statement");
  await h.expectText(/Осталось получить \| \$695\.12/, "remaining = 772.36 − 77.24");
  const db = await h.db();
  const pay = db.payments.find((p) => p.reference === "stripe-simulated");
  h.expect(pay && pay.amountCents === 7724 && /^RCT-\d+$/.test(pay.receiptNumber), "simulated payment with a receipt");
  h.expect(db.jobs.some((j) => j.estimateId === "e6" && j.status === "unscheduled"), "job waits for a date (not on the plan)");
};
