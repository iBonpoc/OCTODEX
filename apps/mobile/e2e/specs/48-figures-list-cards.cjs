/**
 * Lists behind the «Сегодня» figures on the same cards as the main lists (step 10а, PR10b), every view (3 widths × 2 themes).
 * - «Ждёт оплаты»: every invoice is the one in «Деньги» (same client, number, amount; as many) — v2 (#2350) «Деньги» has rows;
 * - «Подписано»: every estimate is in «Сметы» (same client and amount);
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
  // «Счета» is the one invoices list (spec 31 §7а). v2 (#2350): «Деньги» lists rows (GroupRow `invoice-row-*`), the figure screens
  // keep their cards (LISTCARD_LEFT) — the same invoice is there with the same client, number and amount, and nothing more or less
  const key = (c) => ({ name: firstLine(c), amount: (c.match(/\$[\d,.]+/) || [""])[0], number: (c.match(/INV-\d+/) || [""])[0] });
  await h.go("/invoice?f=owed");
  await p.locator('[data-testid="invoice-list-groups"]').locator("visible=true").first().waitFor({ timeout: 8000 });
  const owedRows = (await p.locator('[data-testid="invoice-list-group-overdue"] [data-testid^="invoice-row-"], [data-testid="invoice-list-group-waiting"] [data-testid^="invoice-row-"]').locator("visible=true").allInnerTexts()).map((x) => x.replace(/\n/g, " "));
  h.expect(owedRows.length === fig.length, `as many open invoices in «Счета» as in «Ждёт оплаты» (${owedRows.length} / ${fig.length})`);
  for (const c of fig) {
    const k = key(c);
    h.expect(owedRows.some((r) => r.includes(k.name) && r.includes(k.number) && r.includes(k.amount)), `invoice ${k.number} is the same in «Счета»: ${JSON.stringify(k)}`);
  }

  // «Подписано» (month) = the same estimates as in «Сметы» (all of its groups)
  await h.go("/figures/signed?period=month");
  const signed = await texts();
  if (signed.length) {
    await h.go("/estimates");
    await p.locator('[data-testid="est-list-groups"]').locator("visible=true").first().waitFor({ timeout: 8000 });
    const ests = (await p.locator('[data-testid^="est-row-"]').locator("visible=true").allInnerTexts()).map((x) => x.replace(/\n/g, " "));
    for (const c of signed) {
      const k = key(c);
      h.expect(ests.some((r) => r.includes(k.name) && r.includes(k.amount)), `estimate of ${k.name} ${k.amount} is in «Сметы»: ${c.slice(0, 120)}`);
    }
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
