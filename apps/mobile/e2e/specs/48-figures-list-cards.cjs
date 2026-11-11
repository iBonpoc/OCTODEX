/**
 * Lists behind the «Сегодня» figures on the same cards as the main lists (step 10а, PR10b), every view (3 widths × 2 themes).
 * - «Ждёт оплаты»: every invoice card is exactly the card of that invoice in «Деньги» (same amount, status, facts);
 * - «Подписано»: every estimate card is exactly its card in «Сметы»;
 * - «Получено»: a payment card shows «+$…» and opens the receipt; «Новые лиды»: a lead card opens the lead;
 * - no «…»; edges aligned.
 */
const { checkCardAlignment } = require("../cardsAlignment.cjs");

exports.run = async (h) => {
  const p = h.page;
  const texts = async () => p.locator('[data-testid="list-card"]').allInnerTexts();
  const firstLine = (s) => s.split("\n")[0];

  // «Ждёт оплаты» (all time) = the open invoices of «Деньги», card by card
  await h.go("/figures/awaiting");
  const fig = await texts();
  h.expect(fig.length > 0, "«Ждёт оплаты» has invoices");
  h.expect(!/…|\.\.\./.test(await p.locator("body").innerText()), "no «…» on the screen");
  await checkCardAlignment(h, { reference: (pg) => pg.locator('[data-testid="list-card"]').first(), min: 1 });
  await h.shot("awaiting");
  // «Счета» is the one invoices list (spec 31 §7а): the open ones are «Не оплачен · Просрочен»
  await h.go("/invoice?f=owed");
  const money = await texts();
  for (const c of fig) h.expect(money.includes(c), `invoice card is the same as in «Счета»: ${c.slice(0, 160)}`);

  // «Подписано» (month) = the same estimate cards as in «Сметы» (filter «Все»)
  await h.go("/figures/signed?period=month");
  const signed = await texts();
  if (signed.length) {
    await h.go("/estimates");
    await p.getByText(/^Все · \d+$/).last().click();
    await p.waitForTimeout(300);
    const ests = await texts();
    for (const c of signed) h.expect(ests.includes(c), `estimate card is the same as in «Сметы»: ${c.slice(0, 160)}`);
  }

  // «Получено» (month): «+$…» in green-text words, opens the receipt
  await h.go("/figures/received?period=month");
  const pays = p.locator('[data-testid="list-card"]');
  if (await pays.count()) {
    const t = await pays.first().innerText();
    h.expect(/\+\$[\d,]+/.test(t), `payment card shows «+$…»: ${t.slice(0, 160)}`);
    await h.shot("received");
    await pays.first().click();
    await p.waitForTimeout(600);
    h.expect(p.url().includes("/receipt/"), `payment card opens the receipt (${p.url()})`);
  } else {
    h.expect(false, "«Получено» (month) has at least one payment card (the demo has payments this month)");
  }

  // «Новые лиды» (month): lead card opens the lead
  await h.go("/figures/leads?period=month");
  const leads = p.locator('[data-testid="list-card"]');
  h.expect((await leads.count()) > 0, "«Новые лиды» has leads");
  const name = firstLine(await leads.first().innerText());
  await leads.first().click();
  await p.waitForTimeout(600);
  h.expect(p.url().includes("/lead/"), `lead card «${name}» opens the lead (${p.url()})`);
};
