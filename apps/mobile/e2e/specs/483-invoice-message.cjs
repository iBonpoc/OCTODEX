/**
 * e2e 483 (#2017) — the message to the client about an invoice (story map S9 «Счёт»). Six views (h.layout).
 * С1 ДАНО the demo company has no payment method, КОГДА the office opens an unpaid invoice and «Напомнить», ТОГДА the card
 *    and the sheet say the methods are missing (with «Заполнить способы оплаты»), and the text has no «Как оплатить: —».
 * С2 ДАНО the invoice's job comes from a signed estimate with a client link, ТОГДА the text carries the link /p/<token>.
 * С3 ДАНО the client speaks es, ТОГДА the text and its link line are in Spanish.
 * The demo's own data, changed in the local base from a page without the app (h.seed).
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/more");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const db = raw.db;
  const inv = db.invoices.find((i) => i.totalCents - i.paidCents > 0 && i.jobId);
  const est = db.estimates.find((e) => e.token && !e.linkRevokedAt);
  h.expect(!!inv && !!est, `the demo has an unpaid invoice (${inv && inv.id}) and an estimate with a link (${est && est.token})`);
  const job = db.jobs.find((j) => j.id === inv.jobId);
  job.estimateId = est.id;
  db.company.payment = {};
  // the client speaks Spanish and can be reached
  db.customers = db.customers.map((c) => {
    if (c.id !== inv.customerId) return c;
    const people = c.people && c.people.length ? c.people.map((x, i) => (i === 0 ? { ...x, language: "es" } : x)) : [{ id: "m483", name: c.name, role: "main", phones: [], emails: [], language: "es" }];
    return { ...c, phone: c.phone || "(818) 555-0483", people };
  });
  await h.seed("octo.db.v5", raw);

  await h.go(`/invoice/${inv.id}`);
  await p.getByTestId("invoice-no-how").locator("visible=true").first().waitFor({ timeout: 8000 });
  await h.expectText(/Способы оплаты не заполнены/, `С1 ${JSON.stringify(h.layout)}: the card says the payment methods are missing`);
  await p.getByTestId("invoice-remind").locator("visible=true").first().getByRole("button").click();
  const sheet = h.sheet();
  await sheet.getByText(new RegExp(`/p/${est.token}`)).first().waitFor({ timeout: 8000 });
  const text = await sheet.innerText();
  h.expect(!/Cómo pagar|Как оплатить|How to pay/.test(text) && !/:\s*—/.test(text), `С1 ${JSON.stringify(h.layout)}: no «How to pay: —» (${text.slice(0, 160)})`);
  h.expect(/Ver y pagar: \S+\/p\//.test(text), `С2/С3 ${JSON.stringify(h.layout)}: the client page link, in Spanish`);
  h.expect(/factura/.test(text), `С3 ${JSON.stringify(h.layout)}: the text is in Spanish`);
  h.expect(/Заполнить способы оплаты/.test(text), `С1 ${JSON.stringify(h.layout)}: the sheet offers to fill in the methods`);
  await h.shot("remind-no-how");
};
