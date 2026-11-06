const { todayKey } = require("../companyTime.cjs");
/**
 * Seam S12 ↔ S15 (wave 8): a payment recorded on an owed invoice shows up in «Оплаты» today, and when it pays the invoice in full
 * the invoice leaves «Не оплачен · Просрочен» and the debt total goes down by exactly that amount.
 */
const whole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const cents2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const money = (c) => (c % 100 === 0 ? whole.format(c / 100) : cents2.format(c / 100));

exports.run = async (h) => {
  const p = h.page;
  await h.go("/invoice");
  const db = await h.db();
  const owes = (i) => Math.max(0, i.totalCents - i.paidCents);
  const owed = db.invoices.filter((i) => owes(i) > 0);
  const total = owed.reduce((s, i) => s + owes(i), 0);
  const inv = owed[owed.length - 1];
  const before = db.payments.length;
  await h.go(`/invoice/${inv.id}`);
  await h.click("Принять оплату");
  await p.getByRole("button", { name: /^Записать / }).last().click();
  await p.waitForTimeout(500);

  // the invoice left the debts; the total went down by its balance
  await h.go("/invoice");
  const after = await h.db();
  h.expect(after.payments.length === before + 1, "one payment recorded");
  const cards = p.locator('[data-testid="list-card"]');
  h.expect((await cards.count()) === owed.length - 1, "paid invoice left «Не оплачен · Просрочен»");
  const left = total - owes(inv);
  h.expect(left === 0 ? (await h.text()).includes("Долгов нет") : (await h.text()).includes(`Должны ${money(left)}`), `debt total is ${money(left)}`);

  // it is in «Оплаты» for today
  await h.go("/payments?p=today");
  const pay = after.payments.find((x) => x.invoiceId === inv.id && !db.payments.some((y) => y.id === x.id));
  h.expect(pay && require("../companyTime.cjs").dayKey(pay.at) === todayKey(), "the payment is of the company's today");
  const name = after.customers.find((c) => c.id === inv.customerId).name;
  const card = cards.filter({ hasText: name }).first();
  h.expect((await card.count()) === 1, "the payment card is in «Оплаты» · Сегодня");
  h.expect((await card.innerText()).includes(`+${whole.format(Math.round(owes(inv) / 100))}`), "amount on the card, without cents");
};
