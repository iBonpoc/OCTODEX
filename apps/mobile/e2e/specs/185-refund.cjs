/**
 * 20д (docs/specs/35-stripe.md §4в, «Деньги и отчёты» №5): a refund from a receipt, in the demo (the director's role).
 * 1) «Вернуть деньги» → the sheet: up to what the payment brings, a reason, tax and revenue of it, «record» for cash;
 *    more than the payment — a warning and «Дальше» stays off;
 * 2) «Дальше» → «cannot be undone» — nothing changed yet; «Назад» comes back to the form;
 * 3) «Вернуть $…» → the toast, the receipt shows what was refunded, the invoice owes it again;
 * 4) a tech has no «Вернуть деньги» (owner/admin only; the server checks it again — T133).
 * The cloud side is db T133 and unit stripeRefundFn / refundApp; the demo mutation never runs in the cloud (refundApp).
 * Money reads as the app writes it: whole dollars without cents ($240), else with them.
 */
const TEN = /\$10(\.00)?(?!\d)/;
exports.run = async (h) => {
  const p = h.page;
  await h.go("/payments");
  const db = await h.db();
  const pay = db.payments.find((x) => x.invoiceId && x.amountCents >= 2000 && !x.refundedCents && x.method !== "card" && x.method !== "ach");
  h.expect(!!pay, "the demo has a payment with an invoice");
  const inv0 = db.invoices.find((i) => i.id === pay.invoiceId);
  const dollars = (pay.amountCents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

  await h.go(`/receipt/${pay.id}`);
  const open = p.getByTestId("rcpt-refund").locator("visible=true").first();
  await open.waitFor({ timeout: 5000 });
  await open.getByRole("button").click();
  const sheet = h.sheet();
  await sheet.getByTestId("refund-form").waitFor({ timeout: 5000 });
  const st = await sheet.innerText();
  h.expect(new RegExp(`Сумма возврата \\(до \\$${dollars.replace(/\./g, "\\.")}(\\.00)?\\)`).test(st), `the limit is what the payment brings: ${st.slice(0, 120)}`);
  h.expect(/Запишем возврат/.test(st), "cash is a record, not Stripe");

  // more than the payment: a warning, no next step
  const field = sheet.getByRole("textbox").first();
  await field.fill(String(pay.amountCents / 100 + 1));
  await sheet.getByTestId("refund-above").waitFor({ timeout: 3000 });
  h.expect(await sheet.getByRole("button", { name: /^Дальше/ }).last().isDisabled(), "«Дальше» is off above the limit");

  // $10 back: tax and revenue of it
  await field.fill("10");
  const next = sheet.getByRole("button", { name: /^Дальше: вернуть \$10(\.00)?$/ });
  await next.waitFor({ timeout: 3000 });
  const revenue = await sheet.getByTestId("refund-revenue").innerText();
  const tax = await sheet.getByTestId("refund-tax").innerText();
  h.expect(TEN.test(revenue) || /\$/.test(tax), `tax ${tax} and revenue ${revenue} are shown`);
  await next.click();
  await sheet.getByTestId("refund-confirm").waitFor({ timeout: 3000 });
  h.expect(/Это нельзя отменить/.test(await sheet.innerText()), "it says it cannot be undone");
  h.expect((await h.db()).payments.find((x) => x.id === pay.id).amountCents === pay.amountCents, "nothing changed before the confirmation");
  await h.shot("confirm");
  await sheet.getByRole("button", { name: "Назад" }).click();
  await sheet.getByTestId("refund-form").waitFor({ timeout: 3000 });
  await next.click();
  await sheet.getByRole("button", { name: /^Вернуть \$10(\.00)?$/ }).click();

  await p.getByText(/Возвращено \$10/).first().waitFor({ timeout: 5000 });
  // the demo keeps its data a moment later: wait for it, not for seconds
  await p.waitForFunction((id) => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.payments?.find((x) => x.id === id)?.refundedCents === 1000, pay.id, { timeout: 5000 });
  const after = await h.db();
  const p1 = after.payments.find((x) => x.id === pay.id);
  h.expect(p1.amountCents === pay.amountCents - 1000 && p1.refundedCents === 1000, "the payment is net of the refund");
  h.expect(after.invoices.find((i) => i.id === pay.invoiceId).paidCents === inv0.paidCents - 1000, "the invoice owes it again");
  const shown = p.getByTestId("rcpt-refunded").locator("visible=true").first();
  await shown.waitFor({ timeout: 3000 });
  h.expect(TEN.test(await shown.innerText()), "the receipt shows what was refunded");
  await h.shot("refunded");

  // a tech: no refund
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go(`/receipt/${pay.id}`);
  await p.getByTestId("rcpt-refunded").locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("rcpt-refund").count()) === 0, "a tech has no «Вернуть деньги»");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
