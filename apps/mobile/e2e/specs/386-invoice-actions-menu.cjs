/**
 * e2e 386 — the invoice's card: one main button and «⋯» instead of a row of five pills (#1474, as the estimate #1412; DS §7.3, §8.9,
 * Б4), an owed invoice of a client with a phone and an email, as the director, every view, by testID:
 * - no other action stands on the page: PDF, «Напомнить», SMS, email are in «⋯» only;
 * - «Принять оплату»: on a phone pinned at the bottom (ActionBar, no tab bar under it), from 820 at the top of the content;
 * - «⋯» in Б4's order: PDF · Напомнить · SMS · Email · «Аннулировать…» last;
 * - an item of «⋯» runs after the menu is gone: «Напомнить» opens its sheet.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const phone = h.layout.width < 820;

  await h.go("/invoice");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const inv = raw.db.invoices.find((i) => i.totalCents > i.paidCents && raw.db.customers.some((c) => c.id === i.customerId && c.phone));
  h.expect(inv, "demo has an owed invoice of a client with a phone");
  // the client gets an email too: every way to send is offered
  const cust = raw.db.customers.find((c) => c.id === inv.customerId);
  cust.email = cust.email || "e2e386@example.com";
  await h.seed("octo.db.v5", raw);

  await h.go(`/invoice/${inv.id}`);
  await tid("invoice-more").waitFor({ timeout: 8000 });
  for (const id of ["invoice-act-pdf", "invoice-act-remind", "invoice-act-sms", "invoice-act-email", "invoice-void-item"]) {
    h.expect((await p.getByTestId(id).locator("visible=true").count()) === 0, `«${id}» is not on the page (it lives in «⋯»)`);
  }

  // the main button: pinned on a phone, at the top of the content from 820
  await tid("invoice-take-payment").waitFor({ timeout: 3000 });
  h.expect((await p.getByTestId("invoice-actionbar").locator("visible=true").count() > 0) === phone, phone ? "«Принять оплату» is in the pinned bar" : "no pinned bar from 820");
  if (phone) {
    const bar = await tid("invoice-actionbar").boundingBox();
    const vp = p.viewportSize();
    h.expect(bar && Math.abs(bar.y + bar.height - vp.height) <= 2, `the bar stands on the bottom edge (${bar && bar.y + bar.height} / ${vp.height})`);
    h.expect((await p.getByTestId("tab-bar").locator("visible=true").count()) === 0, "no tab bar under the pinned bar");
  } else {
    const btn = await tid("invoice-take-payment").boundingBox();
    h.expect(btn && btn.width < 400, `from 820 the button is as wide as its words (${btn && btn.width})`);
  }
  await h.shot("card");

  // «⋯»: Б4's order, the dangerous one last
  await tid("invoice-more").getByRole("button").click();
  await tid("menu-items").waitFor({ timeout: 3000 });
  const order = await p.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="invoice-act-"], [data-testid="invoice-void-item"]')]
      .filter((e) => e.offsetParent !== null)
      .map((e) => ({ id: e.getAttribute("data-testid"), y: e.getBoundingClientRect().y }))
      .sort((a, b) => a.y - b.y)
      .map((x) => x.id),
  );
  h.expect(JSON.stringify(order) === JSON.stringify(["invoice-act-pdf", "invoice-act-remind", "invoice-act-sms", "invoice-act-email", "invoice-void-item"]), `the menu in Б4's order: ${order.join(", ")}`);
  await h.shot("menu");
  // an item runs once the menu is gone: «Напомнить» opens its sheet
  await tid("invoice-act-remind").click();
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ state: "hidden", timeout: 3000 });
  const remindSheet = p.locator('[aria-modal="true"]').filter({ hasText: "Напомнить клиенту" }).last();
  await remindSheet.waitFor({ timeout: 4000 });
};
