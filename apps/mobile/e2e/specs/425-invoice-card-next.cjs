/**
 * e2e 425 — the invoice card (#1495, DS §12.3 п.1–2, §3 one word of status), the director, every view, by testID:
 * - under the title one line «what now and what next»: overdue by N days and no reminder yet / waiting until the due day / paid in full;
 * - an overdue invoice carries the same words on the card as in the list of invoices («Просрочен 9 дн»), not «Просрочено»;
 * - with no payment yet the receipts' empty text says where a payment will appear.
 * Seed: i1 — $1,840 owed, due 9 days ago, sent, never reminded; i2 — owed, due in 3 days, sent; i3 — paid in full.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const nextOf = async (path) => {
    await h.go(path);
    await tid("invoice-screen").waitFor({ timeout: 8000 });
    return (await tid("invoice-next").innerText()).replace(/\s+/g, " ");
  };

  h.expect(/Просрочен 9 дн · напоминание не отправлялось/.test(await nextOf("/invoice/i1")), "i1: overdue by 9 days, no reminder sent");
  await h.expectText(/Просрочен 9 дн/, "i1: the card's chip says «Просрочен 9 дн», as the list does");
  await h.shot("overdue");
  h.expect(/Ждёт оплаты до /.test(await nextOf("/invoice/i2")), "i2: waiting until the due day");
  const empty = (await tid("invoice-no-receipts").innerText()).replace(/\s+/g, " ");
  h.expect(/Оплат пока нет/.test(empty), `i2: no receipts yet (${empty})`);
  // v2: where a payment comes from is the main step right under the header, not a hint in the empty text
  h.expect(/Принять оплату/.test(await tid("invoice-take-payment").innerText()), "i2: «Принять оплату» is the main step");
  h.expect(/Оплачен полностью/.test(await nextOf("/invoice/i3")), "i3: paid in full");

  // the same word in the list of invoices
  // lists B (#2992): the row says it under its sum — «Просрочен 9 дн» (status, icon + word), never a bare «Просрочено»
  await h.go("/invoice");
  const row = (await tid("invoice-row-i1").innerText()).replace(/\s+/g, " ");
  h.expect(/Просрочен 9 дн/.test(row) && !/Просрочено/.test(row), `the list of invoices: i1 is 9 days late (${row})`);
};
