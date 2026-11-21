/**
 * e2e 386 — the invoice's card as LAYOUT-RULES §3 «Объект» (#2350; before — #1474, DS Б4), an owed invoice of a client with a phone
 * and an email, as the director, every view, by testID:
 * - the secondary actions are icons in ONE row on the page (SMS · email · PDF · «Напомнить»), each with its VoiceOver label;
 * - one main button «Принять оплату · $X» — v2 (#2350): the MainStep right under the header's row of icons, before the money
 *   (the pinned bottom bar of the old card is gone by design);
 * - «⋯» holds only the rare and dangerous «Аннулировать…»;
 * - «Напомнить» opens its sheet.
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
  for (const id of ["invoice-remind", "invoice-act-pdf", "invoice-act-email", "invoice-act-sms"]) {
    await tid(id).waitFor({ timeout: 3000 });
    h.expect((await p.getByTestId("invoice-screen-actions").locator("visible=true").first().getByTestId(id).count()) === 1, `«${id}» is in the row of icons`);
    const label = await tid(id).getAttribute("aria-label");
    h.expect(label && label.length > 2, `«${id}» is an icon with a VoiceOver label (${label})`);
    icons.push(await tid(id).boundingBox());
  }
  h.expect(icons.every((b) => Math.abs(b.y - icons[0].y) <= 2) && icons.every((b, i) => i === 0 || b.x > icons[i - 1].x), "the icons stand in one row");

  // the main button: one, under the icons and before the money; it names the sum
  await tid("invoice-take-payment").waitFor({ timeout: 3000 });
  h.expect(/Принять оплату · \$/.test(await tid("invoice-take-payment").innerText()), "the main button names the sum");
  h.expect((await p.getByTestId("invoice-take-payment").locator("visible=true").count()) === 1, "one main button");
  const pay = await tid("invoice-take-payment").boundingBox();
  const bal = await tid("invoice-balance").boundingBox();
  h.expect(pay.y > icons[0].y && pay.y < bal.y, `the main step stands under the icons and before the money (${icons[0].y} < ${pay.y} < ${bal.y})`);
  await h.shot("card");

  // «⋯»: only «Аннулировать…»
  await tid("invoice-screen-more").getByRole("button").first().click();
  await tid("menu-items").waitFor({ timeout: 3000 });
  const inMenu = await p.evaluate(() =>
    [...document.querySelectorAll('[data-testid="menu-items"] [data-testid]')].filter((e) => e.offsetParent !== null).map((e) => e.getAttribute("data-testid")).filter((x) => /^invoice-/.test(x)),
  );
  h.expect(JSON.stringify(inMenu) === JSON.stringify(["invoice-void-item"]), `«⋯» holds only «Аннулировать…»: ${inMenu.join(", ")}`);
  await h.shot("menu");
  await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  // «Напомнить» opens its sheet
  await tid("invoice-remind").click();
  const remindSheet = p.locator('[aria-modal="true"]').filter({ hasText: "Напомнить клиенту" }).last();
  await remindSheet.waitFor({ timeout: 4000 });
};
