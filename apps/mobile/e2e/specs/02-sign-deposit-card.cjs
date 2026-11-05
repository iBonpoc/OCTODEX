/** Client signs on the client page → deposit invoice issued → pays by simulated card → contract statement paid. */
/** S8b (docs/specs/07 §2.2 А, founder 05.11): an employee signs the contract for the company on the estimate screen. */
async function countersign(h, estimateId) {
  await h.go(`/estimate/${estimateId}`);
  const pad = h.page.getByLabel(/расписывается|signs here/i).last();
  await pad.scrollIntoViewIfNeeded(); await h.page.waitForTimeout(250);
  const bb = await pad.boundingBox();
  await h.page.mouse.move(bb.x + 30, bb.y + 90); await h.page.mouse.down();
  for (let i = 0; i < 20; i++) await h.page.mouse.move(bb.x + 30 + i * 12, bb.y + 90 - Math.sin(i / 2) * 40);
  await h.page.mouse.up();
  await h.page.getByRole("button", { name: "Подписать договор" }).last().click(); await h.page.waitForTimeout(700);
}

exports.run = async (h) => {
  await h.go("/p/demo0handyman0estimate0000000001");
  await h.expectText(/Total \| \$772\.36/, "client sees total with 9.5% tax on materials (client page in the client's language, rule 7)");
  await h.sign("Linda Alvarez");
  await h.expectText(/Estimate approved/, "approved");
  let db0 = await h.db();
  h.expect(db0.estimates.find((e) => e.id === "e6").status === "awaiting_countersign" && !db0.jobs.some((j) => j.estimateId === "e6"), "S8: awaiting the company, no job yet");
  await countersign(h, "e6");
  await h.go("/p/demo0handyman0estimate0000000001");
  await h.expectText(/INV-\d+ · Deposit/, "deposit invoice on the client page");
  await h.page.getByRole("button", { name: "Pay by card" }).first().click(); await h.page.waitForTimeout(300);
  await h.expectText(/Test mode/, "test mode label");
  await h.sheet().getByRole("button", { name: /Pay \$77\.24/ }).click(); await h.page.waitForTimeout(800);
  await h.go("/estimate/e6");
  await h.expectText(/Выставлено \| \$77\.24 \| Оплачено \| \$77\.24/, "deposit paid in the statement");
  await h.expectText(/Осталось получить \| \$695\.12/, "remaining = 772.36 − 77.24");
  const db = await h.db();
  const pay = db.payments.find((p) => p.reference === "stripe-simulated");
  h.expect(pay && pay.amountCents === 7724 && /^RCT-\d+$/.test(pay.receiptNumber), "simulated payment with a receipt");
  h.expect(db.jobs.some((j) => j.estimateId === "e6" && j.status === "unscheduled"), "job waits for a date (not on the plan)");
};
