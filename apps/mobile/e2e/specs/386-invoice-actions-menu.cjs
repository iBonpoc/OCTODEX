/**
 * e2e 386 — the invoice's card as every object card (#3012, founder 27.11 «сделай как надо», вариант А; #2995), an owed invoice of a
 * client with a phone and an email, as the director, every view, by testID:
 * - the row under the header is the person's: Позвонить · SMS · Почта (the phone's apps to the client — nothing sends the invoice);
 * - one main button «Принять оплату · $X» right under the row, before the money;
 * - «⋯»: Отправить по SMS / Email, ссылка, PDF, «Напомнить» — and «Аннулировать…» red and last;
 * - «Напомнить» from «⋯» opens its sheet.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();

  await h.go("/invoice");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  // sent, owed and not due yet: its next step is «Принять оплату» (an overdue one's is «Напомнить» — InvoiceCard invoiceStep)
  const now = new Date().toISOString();
  const inv = raw.db.invoices.find((i) => i.totalCents > i.paidCents && i.sentAt && i.dueDate > now && raw.db.customers.some((c) => c.id === i.customerId && c.phone));
  h.expect(inv, "demo has a sent, owed, not yet due invoice of a client with a phone");
  // the client gets an email too: every way to send is offered
  const cust = raw.db.customers.find((c) => c.id === inv.customerId);
  cust.email = cust.email || "e2e386@example.com";
  await h.seed("octo.db.v5", raw);

  await h.go(`/invoice/${inv.id}`);
  await tid("invoice-screen-more").waitFor({ timeout: 8000 });
  // the icons: one row under the header (IconRow `invoice-screen-actions`), each a labelled button
  const icons = [];
  for (const id of ["invoice-call", "invoice-client-sms", "invoice-client-mail"]) {
    await tid(id).waitFor({ timeout: 3000 });
    h.expect((await p.getByTestId("invoice-screen-actions").locator("visible=true").first().getByTestId(id).count()) === 1, `«${id}» is in the row of icons`);
    const label = await tid(id).getAttribute("aria-label");
    h.expect(label && label.length > 2, `«${id}» is an icon with a VoiceOver label (${label})`);
    icons.push(await tid(id).boundingBox());
  }
  h.expect(icons.every((b) => Math.abs(b.y - icons[0].y) <= 2) && icons.every((b, i) => i === 0 || b.x > icons[i - 1].x), "the icons stand in one row: Позвонить · SMS · Почта");
  for (const id of ["invoice-act-pdf", "invoice-act-sms", "invoice-act-email", "invoice-remind"]) h.expect((await p.getByTestId("invoice-screen-actions").getByTestId(id).count()) === 0, `«${id}» is not in the row (it lives in «⋯»)`);

  // the main button: one, under the icons and before the money; it names the sum
  await tid("invoice-take-payment").waitFor({ timeout: 3000 });
  h.expect(/Принять оплату · \$/.test(await tid("invoice-take-payment").innerText()), "the main button names the sum");
  h.expect((await p.getByTestId("invoice-take-payment").locator("visible=true").count()) === 1, "one main button");
  const pay = await tid("invoice-take-payment").boundingBox();
  const bal = await tid("invoice-balance").boundingBox();
  h.expect(pay.y > icons[0].y && pay.y < bal.y, `the main step stands under the icons and before the money (${icons[0].y} < ${pay.y} < ${bal.y})`);
  await h.shot("card");

  // «⋯»: the document's actions; «Аннулировать…» red and the last
  await tid("invoice-screen-more").getByRole("button").first().click();
  await tid("menu-items").waitFor({ timeout: 3000 });
  const inMenu = await p.evaluate(() =>
    [...document.querySelectorAll('[data-testid="menu-items"] [data-testid]')].filter((e) => e.offsetParent !== null).map((e) => e.getAttribute("data-testid")).filter((x) => /^invoice-/.test(x)),
  );
  for (const id of ["invoice-act-pdf", "invoice-act-email", "invoice-act-sms"]) h.expect(inMenu.includes(id), `«⋯» has «${id}» (${inMenu.join(", ")})`);
  h.expect(inMenu.some((x) => /^invoice-remind/.test(x)), `«⋯» has «Напомнить» (${inMenu.join(", ")})`);
  h.expect(inMenu[inMenu.length - 1] === "invoice-void-item", `«Аннулировать…» is the last (${inMenu.join(", ")})`);
  await h.shot("menu");
  // «Напомнить» from «⋯» opens its sheet
  await tid(inMenu.find((x) => /^invoice-remind/.test(x))).click();
  const remindSheet = p.locator('[aria-modal="true"]').filter({ hasText: "Напомнить клиенту" }).last();
  await remindSheet.waitFor({ timeout: 4000 });
};
