/**
 * e2e 483 (#2017) — the message to the client about an invoice (story map S9 «Счёт», S20 «Напоминание»). Six views (h.layout).
 * С1 ДАНО the demo company has no payment method, КОГДА the director opens an unpaid invoice and «Напомнить», ТОГДА the card
 *    and the sheet say the methods are missing, the text has no «Как оплатить: —», and «Заполнить способы оплаты» closes the
 *    sheet and opens the company's payment settings; a dispatcher (read-only settings) sees the note without the button.
 * С2 ДАНО the invoice's job comes from the client's signed estimate with a link, ТОГДА the text carries the link /p/<token>.
 * С3 ДАНО the client speaks es, ТОГДА the text and its link line are in Spanish.
 * The demo's own data, changed in the local base from a page without the app (h.seed).
 */
const { sheetGone } = require("../sheet.cjs");
const { invRemind } = require("../invoiceMenu.cjs");

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
  // the client's own signed estimate (another client's or an unsigned one gives no link — unit test invoiceMessage)
  est.customerId = inv.customerId;
  est.status = "approved";
  db.company.payment = {};
  // the client speaks Spanish and can be reached
  db.customers = db.customers.map((c) => {
    if (c.id !== inv.customerId) return c;
    const people = c.people && c.people.length ? c.people.map((x, i) => (i === 0 ? { ...x, language: "es" } : x)) : [{ id: "m483", name: c.name, role: "main", phones: [], emails: [], language: "es" }];
    return { ...c, phone: c.phone || "(818) 555-0483", people };
  });
  await h.seed("octo.db.v5", raw);

  const at = () => new URL(p.url()).pathname;
  await h.go(`/invoice/${inv.id}`);
  await p.getByTestId("invoice-no-how").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("invoice-fill-how").locator("visible=true").count()) > 0, `С1 ${JSON.stringify(h.layout)}: the director has «Заполнить способы оплаты»`);
  await invRemind(p);
  const sheet = h.sheet();
  const msg = sheet.getByTestId("remind-text");
  await msg.getByText(new RegExp(`/p/${est.token}`)).first().waitFor({ timeout: 8000 });
  const text = await msg.innerText();
  h.expect(!/cómo pagar|как оплатить|how to pay/i.test(text) && !/:\s*—/.test(text), `С1 ${JSON.stringify(h.layout)}: no «How to pay: —» (${text.slice(0, 160)})`);
  h.expect(/Ver y pagar: \S+\/p\//.test(text), `С2/С3 ${JSON.stringify(h.layout)}: the client page link, in Spanish`);
  h.expect(/factura/.test(text), `С3 ${JSON.stringify(h.layout)}: the text is in Spanish`);
  await sheet.getByTestId("remind-no-how").waitFor({ timeout: 5000 });
  await h.shot("remind-no-how");
  await sheet.getByTestId("remind-fill-how").getByRole("button").click();
  await sheetGone(p);
  await p.waitForFunction(() => location.pathname.startsWith("/company/documents"), null, { timeout: 8000 });
  h.expect(at().startsWith("/company/documents"), `С1 ${JSON.stringify(h.layout)}: the company's payment settings (${at()})`);

  // a dispatcher: the note, no button (the settings are read-only to it)
  await h.seed("octo.role.v1", "dispatcher");
  await h.go(`/invoice/${inv.id}`);
  await p.getByTestId("invoice-no-how").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("invoice-fill-how").count()) === 0, `С1 dispatcher ${JSON.stringify(h.layout)}: no «Заполнить способы оплаты»`);
};
