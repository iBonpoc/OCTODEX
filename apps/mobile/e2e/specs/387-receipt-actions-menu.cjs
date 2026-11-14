/**
 * e2e 387 — the receipt: one next step and «⋯» instead of a row of five pills (#1474, as the estimate #1412; DS §7.3, §8.9, Б4),
 * a receipt of a paid invoice, a client with a phone and an email, as the director, every view, by testID:
 * - no other action stands on the page: PDF, SMS, email, «Вернуть деньги…» are in «⋯» only;
 * - «Отправить квитанцию»: on a phone pinned at the bottom (ActionBar, no tab bar under it), from 820 right after the receipt;
 * - «⋯» in Б4's order: PDF · SMS · Email · a line · «Вернуть деньги…» last; it opens the refund sheet, which still asks first
 *   (the confirmation itself — e2e 185).
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const phone = h.layout.width < 820;

  await h.go("/payments");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const pay = raw.db.payments.find((x) => x.invoiceId && raw.db.customers.some((c) => c.id === x.customerId && c.phone) && !x.refundedCents);
  h.expect(pay, "demo has a receipt of a client with a phone");
  const cust = raw.db.customers.find((c) => c.id === pay.customerId);
  cust.email = cust.email || "e2e387@example.com";
  await h.seed("octo.db.v5", raw);

  await h.go(`/receipt/${pay.id}`);
  await tid("rcpt-more").waitFor({ timeout: 8000 });
  for (const id of ["rcpt-act-pdf", "rcpt-act-sms", "rcpt-act-email", "rcpt-refund"]) {
    h.expect((await p.getByTestId(id).locator("visible=true").count()) === 0, `«${id}» is not on the page (it lives in «⋯»)`);
  }
  await tid("rcpt-send").waitFor({ timeout: 3000 });
  h.expect((await p.getByTestId("rcpt-actionbar").locator("visible=true").count() > 0) === phone, phone ? "the next step is in the pinned bar" : "no pinned bar from 820");
  if (phone) h.expect((await p.getByTestId("tab-bar").locator("visible=true").count()) === 0, "no tab bar under the pinned bar");
  else {
    const b = await tid("rcpt-send").boundingBox();
    h.expect(b && b.width < 400, `from 820 the button is as wide as its words (${b && b.width})`);
  }
  await h.shot("card");

  await tid("rcpt-more").getByRole("button").click();
  await tid("menu-items").waitFor({ timeout: 3000 });
  const order = await p.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="rcpt-act-"], [data-testid="rcpt-refund"]')]
      .filter((e) => e.offsetParent !== null)
      .map((e) => ({ id: e.getAttribute("data-testid"), y: e.getBoundingClientRect().y }))
      .sort((a, b) => a.y - b.y)
      .map((x) => x.id),
  );
  h.expect(JSON.stringify(order) === JSON.stringify(["rcpt-act-pdf", "rcpt-act-sms", "rcpt-act-email", "rcpt-refund"]), `the menu in Б4's order: ${order.join(", ")}`);
  h.expect((await p.getByTestId("menu-divider").locator("visible=true").count()) === 1, "a line before «Вернуть деньги…»");
  await h.shot("menu");
  // «Вернуть деньги…»: the refund sheet opens on its form — nothing is refunded yet
  await tid("rcpt-refund").click();
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ state: "hidden", timeout: 3000 });
  await h.sheet().getByTestId("refund-form").waitFor({ timeout: 5000 });
  h.expect(!(await h.db()).payments.find((x) => x.id === pay.id).refundedCents, "nothing refunded by opening it");
};
