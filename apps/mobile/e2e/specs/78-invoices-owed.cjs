const { dueKey, todayKey } = require("../companyTime.cjs");
/**
 * «Ещё» → Счета, the one path to debts (wave 8, docs/specs/18-money-reports.md §7; 13 §3.15), every view (3 widths × 2 themes).
 * - «Не оплачен · Просрочен» is the default chip; its count and «Должны $N» = every invoice with a balance (= «Ждёт оплаты» on Today);
 * - overdue first (bad, «Просрочен N дн»), then «Ждёт оплаты»; «Оплачен» shows paid invoices with the word;
 * - `?customer=` = one client's debts («Должен» on the client), «Все клиенты» clears it;
 * - the technician has no «Счета» list (he opens the invoice of his own job only).
 */
const { checkCardAlignment } = require("../cardsAlignment.cjs");
const whole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const cents2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const money = (c) => (c % 100 === 0 ? whole.format(c / 100) : cents2.format(c / 100));

exports.run = async (h) => {
  const p = h.page;
  await h.go("/invoice");
  const db = await h.db();
  const today = todayKey();
  const owes = (i) => Math.max(0, i.totalCents - i.paidCents);
  const owed = db.invoices.filter((i) => owes(i) > 0);
  const paid = db.invoices.filter((i) => owes(i) === 0);
  h.expect(owed.length > 0 && paid.length > 0, "demo has owed and paid invoices");
  const sum = owed.reduce((s, i) => s + owes(i), 0);

  const body = await p.locator("body").innerText();
  h.expect(body.includes(`Не оплачен · Просрочен · ${owed.length}`), `default chip with the count ${owed.length}`);
  h.expect(body.includes(`Должны ${money(sum)}`), `«Должны ${money(sum)}» in the header`);
  const cards = p.locator('[data-testid="list-card"]');
  h.expect((await cards.count()) === owed.length, `one card per owed invoice (${owed.length})`);
  // overdue (by the company's day, П4b) before «Ждёт оплаты»
  const late = owed.filter((i) => dueKey(i.dueDate) < today);
  if (late.length) {
    h.expect(body.includes(`Просрочено · ${late.length}`), `«Просрочено · ${late.length}» group`);
    const name = db.customers.find((c) => c.id === late[0].customerId).name;
    h.expect(body.indexOf("Просрочено ·") < body.indexOf(name), "overdue group comes first");
    h.expect(/Просрочен \d+ дн/.test(body), "overdue sign in words");
  }
  await checkCardAlignment(h, { reference: (pg) => pg.getByTestId("filter-bar").locator("visible=true").first(), min: 1 });
  await h.shot("owed");

  // the default comes back from the address: Today «Ждёт оплаты» will open /invoice?f=owed
  await h.go("/invoice?f=owed");
  h.expect((await cards.count()) === owed.length, "?f=owed = the same list");

  // paid
  await p.getByText(new RegExp(`^Оплачен · ${paid.length}$`)).last().click();
  await p.waitForTimeout(400);
  h.expect((await cards.count()) === paid.length, `«Оплачен» lists ${paid.length} paid invoices`);
  h.expect((await cards.first().innerText()).includes("Оплачено"), "paid card says «Оплачено»");

  // one client's debts
  const c = db.customers.find((x) => owed.some((i) => i.customerId === x.id));
  const mine = owed.filter((i) => i.customerId === c.id);
  await h.go(`/invoice?f=owed&customer=${c.id}`);
  h.expect((await cards.count()) === mine.length, `client ${c.name}: ${mine.length} owed invoices`);
  await h.expectText(new RegExp(`${c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · Должны ${money(mine.reduce((s, i) => s + owes(i), 0)).replace("$", "\\$")}`), "client and their debt in the header");
  await h.click("Все клиенты");
  h.expect((await cards.count()) === owed.length, "«Все клиенты» shows every owed invoice again");

  // a card opens the invoice
  await cards.first().click();
  await p.waitForTimeout(600);
  h.expect(/\/invoice\/[^/?]+/.test(p.url()), `card opens the invoice (${p.url()})`);

  // technician: the list is closed (the route guard will close it too — «Каркас»)
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/invoice");
  await h.expectText(/Этот раздел для вашей роли закрыт/, "tech: no invoice list");
  h.expect((await cards.count()) === 0, "tech sees no invoice cards");
};
