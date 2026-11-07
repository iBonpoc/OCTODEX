const { ZONE, dueKey, todayKey } = require("../companyTime.cjs");
/**
 * Invoices and expenses on the new list cards (step 10а, PR5), every view (3 widths × 2 themes). Invoices live on «Счета»
 * (/invoice), expenses on «Расходы» (/money) — sections of their own (spec 31 §7а).
 * - an overdue invoice: «Просрочен N дн» in words, under «Просрочено», «к оплате» amount, number, «Записать оплату» opens the invoice;
 * - a paid invoice is under «Оплачен», status «Оплачено», no «Записать оплату»;
 * - expenses grouped by month (US format), category tag, «Без чека» when there is no receipt;
 * - no «…», edges aligned; the technician has no «Money» in the menu (rights unchanged).
 */
const { checkCardAlignment } = require("../cardsAlignment.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/invoice?f=owed");
  const db = await h.db();
  const today = todayKey(); // overdue = due before the company's today (П4b)
  const cardOf = (text) => p.locator('[data-testid="list-card"]').filter({ hasText: text }).first();

  // overdue invoice: words, number, amount, group
  const overdue = db.invoices.find((i) => i.paidCents < i.totalCents && dueKey(i.dueDate) < today);
  h.expect(overdue, "demo has an overdue invoice");
  const name = db.customers.find((c) => c.id === overdue.customerId).name;
  const card = cardOf(overdue.number ?? name);
  await card.scrollIntoViewIfNeeded();
  const txt = await card.innerText();
  for (const s of [name, overdue.number, "Просрочен"]) h.expect(txt.includes(s), `overdue card shows «${s}»: ${txt.slice(0, 200)}`);
  h.expect(/\$[\d,]+/.test(txt), "amount to pay");
  const body = await p.locator("body").innerText();
  h.expect(body.indexOf("Просрочено ·") > -1 && body.indexOf("Просрочено ·") < body.indexOf(overdue.number ?? name), "overdue invoice is under «Просрочено»");
  h.expect(!/…|\.\.\./.test(body), "no «…» on the screen");
  await p.evaluate(() => window.scrollTo(0, 0));
  await checkCardAlignment(h, { reference: (pg) => pg.getByTestId("filter-bar").locator("visible=true").first(), min: 1 });
  await h.shot("list");

  // expenses: «Расходы» only — no invoice list there any more; month header (US), category, «no receipt»
  const x = db.expenses[0];
  if (x) {
    await h.go("/money");
    const body = await p.locator("body").innerText();
    if (overdue.number) h.expect(!body.includes(overdue.number), "no invoices on «Расходы»");
    const month = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, month: "long", year: "numeric" }).format(new Date(x.at)); // the company's month (П4b)
    h.expect(body.includes(month), `expenses grouped by month «${month}»`);
    const et = await cardOf(x.vendor).innerText();
    h.expect(et.includes(x.vendor), "expense card shows the vendor");
    if (!x.receiptUri) h.expect(et.includes("Без чека"), "«Без чека» tag when there is no receipt");
  }

  // «Записать оплату» opens the invoice (the card itself writes nothing)
  await h.go("/invoice?f=owed");
  await card.scrollIntoViewIfNeeded();
  await card.getByRole("button", { name: "Записать оплату" }).click();
  await p.waitForTimeout(600);
  h.expect(/\/invoice\//.test(p.url()), `record payment opens the invoice (${p.url()})`);

  // paid invoices: «Закрытые», status in words, no action
  const paid = db.invoices.find((i) => i.paidCents >= i.totalCents && i.number);
  if (paid) {
    await h.go("/invoice?f=paid");
    await p.waitForTimeout(300);
    const pt = await cardOf(paid.number).innerText();
    h.expect(pt.includes("Оплачено") && !pt.includes("Записать оплату"), `paid invoice: status word, no action: ${pt.slice(0, 160)}`);
  }

  // technician: no «Money» in the menu (rights are not changed by this PR)
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/more");
  h.expect(!(await p.locator("body").innerText()).includes("Деньги"), "tech has no Money in the menu");
};
