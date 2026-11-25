const { todayKey, dayKey } = require("../companyTime.cjs");
/**
 * Seam S12 ↔ S15 (wave 8): a payment recorded on an owed invoice shows up in «Оплаты» today, and when it pays the invoice in full
 * the invoice leaves the debts and the debts go down by exactly that amount. Prototype v2 (#2350): by testID — the invoice's main
 * step `invoice-take-payment`, the rows `invoice-row-<id>` / `payment-row-<id>`, the tiles «Ждёт оплаты» + «Просрочено».
 */
const whole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const cents2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const money = (c) => (c % 100 === 0 ? whole.format(c / 100) : cents2.format(c / 100));
const cents = (s) => Math.round(Number(s.replace(/[$,]/g, "")) * 100);

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true");
  // a tile with nothing in it is not drawn — it holds $0
  const tile = async (k) => ((await vis(`money-tile-${k}`).count()) ? cents((await vis(`money-tile-${k}`).first().innerText()).match(/\$[\d,]+(?:\.\d\d)?/)[0]) : 0);
  await h.go("/invoice");
  const db = await h.db();
  const owes = (i) => Math.max(0, i.totalCents - i.paidCents);
  const owed = db.invoices.filter((i) => owes(i) > 0);
  const total = owed.reduce((s, i) => s + owes(i), 0);
  h.expect((await tile("waiting")) + (await tile("overdue")) === total, `before: the debts are ${money(total)}`);
  const inv = owed[owed.length - 1];
  const before = db.payments.length;
  await h.go(`/invoice/${inv.id}`);
  // «Принять оплату»: the main step, or the icon / the second step when «Напомнить» is the main one (an overdue invoice)
  await p.locator('[data-testid="invoice-take-payment"], [data-testid="invoice-act-pay"]').locator("visible=true").first().click();
  await h.sheet().getByRole("radio", { name: "Наличные" }).click();
  await vis("pay-record").last().getByRole("button").click();
  // #2212: the receipt at once, in the same sheet — «Готово» closes it
  await vis("pay-receipt").last().waitFor({ timeout: 5000 });
  await vis("pay-receipt-done").last().click();
  await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.payments ?? []).length === n, before + 1, { timeout: 5000 });

  // the invoice left the debts; the debts went down by its balance
  await h.go("/invoice");
  await vis("invoice-list-groups").first().waitFor({ timeout: 8000 });
  await vis("money-tiles").first().waitFor({ timeout: 8000 });
  const after = await h.db();
  h.expect(after.payments.length === before + 1, "one payment recorded");
  const owedRows = p.locator('[data-testid="invoice-list-group-overdue"] [data-testid^="invoice-row-"], [data-testid="invoice-list-group-waiting"] [data-testid^="invoice-row-"]').locator("visible=true");
  h.expect((await owedRows.count()) === owed.length - 1, `the paid invoice left the debts (${await owedRows.count()} / ${owed.length - 1})`);
  h.expect((await p.locator(`[data-testid="invoice-list-group-paid"] [data-testid="invoice-row-${inv.id}"]`).locator("visible=true").count()) === 1, "it is under «Оплачено за неделю»");
  const left = total - owes(inv);
  h.expect((await tile("waiting")) + (await tile("overdue")) === left, `the debts are ${money(left)}`);

  // it is in «Оплаты» for today
  await h.go("/payments");
  const pay = after.payments.find((x) => x.invoiceId === inv.id && !db.payments.some((y) => y.id === x.id));
  h.expect(pay && dayKey(pay.at) === todayKey(), "the payment is of the company's today");
  const row = p.locator(`[data-testid="payments-list-group-today"] [data-testid="payment-row-${pay.id}"]`).locator("visible=true");
  await row.first().waitFor({ timeout: 8000 });
  const name = after.customers.find((c) => c.id === inv.customerId).name;
  const rt = await row.first().innerText();
  h.expect(rt.includes(name) && rt.includes(money(owes(inv))), `the payment row in «Оплаты» · Сегодня: the client and ${money(owes(inv))} (${rt.replace(/\n/g, " | ")})`);
  // who took it (wave 8, PR-2): the person who recorded it in the app — on the client's receipts
  const me = after.members.find((m) => m.id === after.me);
  h.expect(pay.receivedBy === after.me, "the payment knows who took it");
  await h.go(`/client/${inv.customerId}?tab=money`);
  const rc = vis(`client-receipt-${pay.id}`).first();
  await rc.waitFor({ timeout: 8000 });
  h.expect((await rc.innerText()).includes(me.name), `«${me.name}» on the client's receipt`);
};
