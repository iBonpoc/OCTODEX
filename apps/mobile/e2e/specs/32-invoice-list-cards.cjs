const { ZONE, dueKey, todayKey } = require("../companyTime.cjs");
/**
 * Invoices and expenses on the list rows, every view (3 widths × 2 themes). Invoices live on «Счета» (/invoice — prototype v2 #2350,
 * the List template: GroupRow `invoice-row-<id>` in groups), expenses on «Расходы» (/money) — sections of their own (spec 31 §7а).
 * - an overdue invoice: the client, the number, «−N дн» in its column, the amount to pay, in «Должны»; its long press (the swipe on
 *   a phone) holds «Принять оплату», which opens the invoice with the payment sheet;
 * - a paid invoice is under «Оплачено», «Оплачен» in its column, no «Принять оплату»;
 * - expenses grouped by month (its name in the app's language), category tag, «Без чека» when there is no receipt;
 * - no «…»; the technician has no «Money» in the menu (rights unchanged).
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/invoice?f=owed");
  const db = await h.db();
  const today = todayKey(); // overdue = due before the company's today (П4b)
  const cardOf = (text) => p.locator('[data-testid="list-card"]').filter({ hasText: text }).first();
  const rowOf = (id) => p.getByTestId(`invoice-row-${id}`).locator("visible=true").first();
  const owes = (i) => Math.max(0, i.totalCents - i.paidCents);
  const usd = (c) => `$${(c / 100).toLocaleString("en-US", c % 100 ? { minimumFractionDigits: 2 } : {})}`;

  // overdue invoice: words, number, amount, group
  const overdue = db.invoices.find((i) => i.paidCents < i.totalCents && dueKey(i.dueDate) < today);
  h.expect(overdue, "demo has an overdue invoice");
  const name = db.customers.find((c) => c.id === overdue.customerId).name;
  const card = rowOf(overdue.id);
  await card.scrollIntoViewIfNeeded();
  const txt = await card.innerText();
  for (const s of [name, overdue.number]) h.expect(txt.includes(s), `overdue row shows «${s}»: ${txt.slice(0, 200)}`);
  h.expect(/−\d+ дн/.test(txt), `overdue in words: ${txt.replace(/\n/g, " | ")}`);
  h.expect(txt.includes(usd(owes(overdue))), `the amount to pay ${usd(owes(overdue))}`);
  h.expect((await p.getByTestId("invoice-list-group-overdue").locator("visible=true").first().getByTestId(`invoice-row-${overdue.id}`).count()) === 1, "overdue invoice is under «Должны»");
  h.expect(!/…|\.\.\./.test(await p.getByTestId("invoice-list-groups").locator("visible=true").first().innerText()), "no «…» in the list");
  await h.shot("list");

  // expenses: «Расходы» only — no invoice list there any more; month header (the app's language), category, «no receipt»
  const x = db.expenses[0];
  if (x) {
    await h.go("/money");
    const body = await p.locator("body").innerText();
    if (overdue.number) h.expect(!body.includes(overdue.number), "no invoices on «Расходы»");
    // the company's month (П4b), its name in the app's language as the other dates (#1427 041: «Ноябрь 2026 г.», not «November 2026»)
    const m = new Intl.DateTimeFormat("ru-RU", { timeZone: ZONE, month: "long", year: "numeric" }).format(new Date(x.at));
    const month = m.charAt(0).toUpperCase() + m.slice(1);
    h.expect(body.includes(month), `expenses grouped by month «${month}»`);
    const et = await cardOf(x.vendor).innerText();
    h.expect(et.includes(x.vendor), "expense card shows the vendor");
    if (!x.receiptUri) h.expect(et.includes("Без чека"), "«Без чека» tag when there is no receipt");
  }

  // «Принять оплату» (the long press / the swipe of the row) opens the invoice with the payment sheet (the row itself writes nothing)
  await h.go("/invoice?f=owed");
  await card.scrollIntoViewIfNeeded();
  await card.click({ delay: 900 });
  await p.getByTestId(`invoice-swipe-pay-${overdue.id}-menu`).locator("visible=true").first().click();
  await p.waitForURL(new RegExp(`/invoice/${overdue.id}`), { timeout: 5000 });
  await h.sheet().locator('input[inputmode="decimal"]').first().waitFor({ timeout: 5000 });
  h.expect((await h.db()).invoices.find((i) => i.id === overdue.id).paidCents === overdue.paidCents, "nothing is written by the row");

  // paid invoices: «Оплачено», the column «Оплачен», no action
  const paid = db.invoices.find((i) => i.paidCents >= i.totalCents && i.number);
  if (paid) {
    await h.go("/invoice?f=paid");
    const pt = await rowOf(paid.id).innerText();
    h.expect(/Оплачен(?!о)/.test(pt), `paid invoice: status word: ${pt.slice(0, 160)}`);
    h.expect((await p.getByTestId(`invoice-swipe-pay-${paid.id}`).count()) + (await p.getByTestId(`invoice-swipe-pay-${paid.id}-menu`).count()) === 0, "paid invoice: no «Принять оплату»");
  }

  // technician: no «Money» in the menu (rights are not changed by this PR)
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/more");
  h.expect(!(await p.locator("body").innerText()).includes("Деньги"), "tech has no Money in the menu");
};
