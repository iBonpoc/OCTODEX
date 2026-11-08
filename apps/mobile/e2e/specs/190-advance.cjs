/**
 * Spec 35 §4г («Деньги и отчёты» №6): the client's advance — a payment without an invoice (online above the balance) —
 * in the demo (the director's role). The demo makes no advances itself: the test plants one in the saved data, as the
 * cloud load gives it (cloud/repo.ts paymentsFromRows, unit advance).
 * 1) «Оплаты»: its own section «Без счёта», not in the period's sum; the client card shows it;
 * 2) the receipt: «Без счёта», the hint, «Зачесть в счёт» → the sheet lists the client's invoices that take it whole →
 *    «Зачесть $50» → the toast; the advance became a payment of that invoice, the invoice owes $50 less;
 * 3) a second advance is refunded as any payment (no invoice owes it again);
 * 4) a tech: no «Зачесть». The server's side — db T135; the demo mutation never runs in the cloud (unit advance).
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/payments?p=all");
  const total0 = await p.getByTestId("payments-total").locator("visible=true").first().innerText();
  const db0 = await h.db();
  const inv = db0.invoices.find((i) => i.totalCents - i.paidCents >= 5000 && db0.customers.some((c) => c.id === i.customerId));
  h.expect(!!inv, "the demo has an invoice owing $50 or more");
  const cust = db0.customers.find((c) => c.id === inv.customerId);
  const advance = (id, cents) => ({ id, invoiceId: null, customerId: cust.id, amountCents: cents, method: "card", at: new Date().toISOString(), receiptNumber: `RCT-${id.slice(-3)}`, needsReview: true });
  await p.evaluate((list) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.advances = list;
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem("octo.role.v1", JSON.stringify("director"));
  }, [advance("e2e-adv-190", 5000), advance("e2e-adv-191", 2000)]);

  // 1) «Оплаты»: its own section, outside the sum
  await h.go("/payments?p=all");
  const section = p.getByTestId("advances-section").locator("visible=true").first();
  await section.waitFor({ timeout: 5000 });
  await section.getByTestId("advance-card-e2e-adv-190").first().waitFor({ timeout: 3000 });
  h.expect((await p.getByTestId("payments-total").locator("visible=true").first().innerText()) === total0, "«Собрано» is the same: an advance is not counted");
  await h.shot("payments");

  // the client card
  await h.go(`/client/${cust.id}`);
  await p.getByTestId("client-advance-e2e-adv-190").locator("visible=true").first().waitFor({ timeout: 5000 });

  // 2) the receipt → «Зачесть в счёт»
  await h.go("/receipt/e2e-adv-190");
  await p.getByTestId("rcpt-advance-hint").locator("visible=true").first().waitFor({ timeout: 5000 });
  await p.getByTestId("rcpt-advance").locator("visible=true").first().waitFor({ timeout: 3000 });
  await p.getByTestId("rcpt-apply").locator("visible=true").first().getByRole("button").click();
  const sheet = h.sheet();
  await sheet.getByTestId("advance-form").waitFor({ timeout: 5000 });
  const row = sheet.getByTestId(`advance-inv-${inv.id}`);
  await row.waitFor({ timeout: 3000 });
  const go = sheet.getByTestId("advance-do").getByRole("button");
  await row.click();
  await h.shot("apply");
  await go.click();
  await p.waitForFunction((id) => {
    const d = JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db;
    return d && !(d.advances || []).some((x) => x.id === id) && d.payments.some((x) => x.id === id);
  }, "e2e-adv-190", { timeout: 5000 });
  const after = await h.db();
  const paid = after.payments.find((x) => x.id === "e2e-adv-190");
  h.expect(paid.invoiceId === inv.id && !paid.needsReview, "the advance is a payment of that invoice now");
  h.expect(after.invoices.find((i) => i.id === inv.id).paidCents === inv.paidCents + 5000, "the invoice owes $50 less");

  // 3) the second advance: refunded as any payment
  await h.go("/receipt/e2e-adv-191");
  await p.getByTestId("rcpt-refund").locator("visible=true").first().getByRole("button").click();
  const rs = h.sheet();
  await rs.getByTestId("refund-form").waitFor({ timeout: 5000 });
  await rs.getByRole("textbox").first().fill("10");
  await rs.getByRole("button", { name: /^Дальше: вернуть \$10(\.00)?$/ }).click();
  await rs.getByTestId("refund-confirm").waitFor({ timeout: 3000 });
  h.expect(/деньги уйдут клиенту/.test(await rs.innerText()), "no invoice owes it again");
  await rs.getByRole("button", { name: /^Вернуть \$10(\.00)?$/ }).click();
  await p.waitForFunction(() => {
    const d = JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db;
    return (d?.advances || []).find((x) => x.id === "e2e-adv-191")?.refundedCents === 1000;
  }, null, { timeout: 5000 });
  h.expect((await h.db()).advances.find((x) => x.id === "e2e-adv-191").amountCents === 1000, "$20 − $10 = $10 left");

  // 4) a tech: no «Зачесть»
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/receipt/e2e-adv-191");
  await p.getByTestId("rcpt-advance-hint").locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("rcpt-apply").count()) === 0, "a tech has no «Зачесть»");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
