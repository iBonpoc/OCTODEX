/**
 * 20в (docs/specs/35-stripe.md, «Деньги и отчёты» №4): paying an invoice online from the client page /p/.
 * No network: the browser puts in the server's answers (page.route) — portal_estimate, the edge function stripe-pay — and a
 * stand-in for Stripe.js (js.stripe.com), so the Payment Element is mounted the way the real one is.
 * 1) Stripe takes charges: «Pay online» opens the Payment Element; ACH first from $1,000, a card first below; the page sends
 *    only the /p/ token and the invoice (the server checks them); after confirming, «Payment is processing», no second button.
 * 2) ACH already on its way (pending): «ACH processing: $…», nothing to pay again.
 * 3) a demo company without Stripe keeps the simulation; a company without either shows no payment.
 * 4) the invoice screen of the office shows the ACH on its way (db.pendingPayments).
 * The page speaks the client's language (en here), the app is in Russian.
 */
const TOKEN = "tok_e2e183_pay_0123456789";
const SVG = "M0 0 L5 5";
const portal = (o) => ({
  status: "approved",
  number: "EST-183",
  title: "Gutter replacement",
  sent_at: "2026-11-01T18:00:00Z",
  doc_language: "en",
  company: { name: "Sunset Gutters" },
  customer: { name: "Ann Client" },
  property: { address: "1 Elm St", city: "Pasadena" },
  doc: {
    options: [{ id: "o1", name: "Standard", lines: [{ id: "l1", name: "Seamless gutters", group: "service", quantity: "1", unit: "job", unitPriceCents: 200000 }] }],
    settings: { discount: null, tax: { enabled: false, rateBps: 0, groups: { service: false, labor: false, material: true } }, deposit: { kind: "none" } },
  },
  approval: { option_id: "o1", selection: { addon_ids: [], total: 200000, deposit: 0 }, signer_name: "Ann Client", signed_at: "2026-11-02T18:00:00Z", signature_svg: SVG, channel: "portal" },
  countersign: { signer_name: "Sam Owner", signed_at: "2026-11-02T19:00:00Z", signature_svg: SVG },
  invoices: [
    { id: "a1830000-0000-4000-8000-000000000001", number: "INV-1", title: "Final", kind: "final", total: 150000, paid: 0 },
    { id: "a1830000-0000-4000-8000-000000000002", number: "INV-2", title: "Extra", kind: "progress", total: 50000, paid: 0 },
  ],
  simulated_pay: false,
  online_pay: true,
  pending: {},
  ...o,
});
// Stripe.js as the page sees it: Stripe(pk, {stripeAccount, locale}) → elements → create("payment") → mount; confirmPayment
const FAKE_STRIPE = `
window.Stripe = function (pk, opts) {
  window.__stripe = { pk: pk, opts: opts, confirmed: 0 };
  return {
    elements: function (o) {
      window.__stripe.secret = o.clientSecret;
      return { create: function (kind, eo) { return { mount: function (node) {
        var d = document.createElement("div"); d.setAttribute("data-fake-element", kind);
        d.textContent = "Fake Payment Element: " + eo.paymentMethodOrder.join(" > "); node.appendChild(d);
      } }; } };
    },
    confirmPayment: function () { window.__stripe.confirmed += 1; return Promise.resolve({ paymentIntent: { status: "processing" } }); },
  };
};
window.Stripe.version = "endive";`;

exports.run = async (h) => {
  const p = h.page;
  let answer = portal({});
  const asked = [];
  await p.route("**/rest/v1/rpc/portal_estimate*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) }));
  let payAnswer = null;   // null — a ready form; otherwise {status, body}
  await p.route("**/functions/v1/stripe-pay*", (route) => {
    const b = JSON.parse(route.request().postData() || "{}");
    asked.push(b);
    if (payAnswer) return route.fulfill({ status: payAnswer.status, contentType: "application/json", body: JSON.stringify(payAnswer.body) });
    const big = b.invoiceId === "a1830000-0000-4000-8000-000000000001";
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        state: "ready", clientSecret: `pi_E2E${big ? 1 : 2}_secret_x`, account: "acct_E2E183", publishableKey: "pk_test_E2E183",
        amountCents: big ? 150000 : 50000, methods: big ? ["us_bank_account", "card"] : ["card", "us_bank_account"],
      }),
    });
  });
  await p.route("https://js.stripe.com/**", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_STRIPE }));

  // 1) Stripe takes charges
  await h.go(`/p/${TOKEN}`);
  await h.expectText(/INV-1 · Final/, "the invoices of the job");
  let text = await h.text();
  h.expect(!/Pay by card/.test(text), "no simulation when Stripe is on");
  h.expect(!/Оплатить онлайн/.test(text), "the client's language, not the app's");
  const big = p.getByTestId("portal-pay-online-a1830000-0000-4000-8000-000000000001");
  await big.scrollIntoViewIfNeeded();
  await big.getByRole("button").click();
  await h.expectText(/Fake Payment Element: us_bank_account > card/, "from $1,000 ACH comes first");
  h.expect(asked.length === 1 && asked[0].token === TOKEN && asked[0].invoiceId === "a1830000-0000-4000-8000-000000000001" && Object.keys(asked[0]).length === 2,
    "the page sends only the link's token and the invoice — the amount is the server's");
  const st = await p.evaluate(() => window.__stripe);
  h.expect(st.pk === "pk_test_E2E183" && st.opts.stripeAccount === "acct_E2E183" && st.opts.locale === "en" && st.secret === "pi_E2E1_secret_x",
    "Stripe.js on the contractor's account, in the client's language");
  await h.expectText(/Test mode/, "test mode is said");
  await h.expectText(/We never see your card or bank details/, "who handles the card");
  await h.expectText(/Pay \$1,500(?!\d)/, "the button names this invoice's sum");
  await h.shot("element");
  await p.getByTestId("stripe-pay").getByRole("button").click();
  await h.expectText(/Payment is processing/, "after confirming: processing");
  await h.expectText(/You don't need to pay again/, "the client knows not to pay again");
  h.expect((await p.evaluate(() => window.__stripe.confirmed)) === 1, "confirmed once");
  h.expect((await p.getByTestId("portal-pay-online-a1830000-0000-4000-8000-000000000001").count()) === 0, "no second «Pay online» for that invoice");
  await h.shot("processing");

  // below $1,000 a card comes first
  const small = p.getByTestId("portal-pay-online-a1830000-0000-4000-8000-000000000002");
  await small.scrollIntoViewIfNeeded();
  await small.getByRole("button").click();
  await h.expectText(/Fake Payment Element: card > us_bank_account/, "below $1,000 a card comes first");
  await h.expectText(/Pay \$500(?!\d)/, "…and its own sum, not the last invoice's");
  await p.getByTestId("stripe-close").getByRole("button").click();
  h.expect((await p.getByTestId("stripe-checkout").count()) === 0, "the panel closes");

  // the server's refusal is said in the client's words; «on its way» from the server needs no form
  payAnswer = { status: 200, body: { error: "nothing_to_pay" } };   // the code is read from the body (a 409 would be a console error here)
  await small.getByRole("button").click();
  await h.expectText(/There is nothing to pay on this invoice/, "a refusal in the client's words");
  await p.getByTestId("stripe-close").getByRole("button").click();
  payAnswer = { status: 200, body: { state: "processing" } };
  await small.getByRole("button").click();
  await h.expectText(/We'll confirm the payment shortly/, "already on its way: no second form");
  payAnswer = null;

  // 2) ACH already on its way
  const fresh = () => h.go(`/p/${TOKEN}`);   // a full load: the page reads the server anew
  answer = portal({ pending: { "a1830000-0000-4000-8000-000000000001": 150000 } });
  await fresh();
  await h.expectText(/ACH processing: \$1,500(?!\d)/, "the ACH on its way is on the invoice");
  await h.expectText(/up to 4 business days/, "how long ACH takes");
  h.expect((await p.getByTestId("portal-pay-online-a1830000-0000-4000-8000-000000000001").count()) === 0, "nothing to pay again");
  h.expect((await p.getByTestId("portal-pay-online-a1830000-0000-4000-8000-000000000002").count()) === 1, "the other invoice can still be paid");
  await h.shot("pending");

  // part of the balance on its way: the line, and the rest can still be paid
  answer = portal({ pending: { "a1830000-0000-4000-8000-000000000001": 40000 } });
  await fresh();
  await h.expectText(/ACH processing: \$400(?!\d)/, "the part on its way");
  await h.expectText(/\$1,100(?!\d)/, "the rest to pay");
  h.expect((await p.getByTestId("portal-pay-online-a1830000-0000-4000-8000-000000000001").count()) === 1, "the rest can be paid");

  // back from the bank's / 3DS page: only that invoice is «processing», and the address is cleaned
  answer = portal({});
  await h.go(`/p/${TOKEN}?paid=a1830000-0000-4000-8000-000000000001&redirect_status=processing&payment_intent=pi_E2E1`);
  await h.expectText(/We'll confirm the payment shortly/, "the paid invoice: processing");
  h.expect((await p.getByTestId("portal-pay-online-a1830000-0000-4000-8000-000000000001").count()) === 0, "…no second button");
  h.expect((await p.getByTestId("portal-pay-online-a1830000-0000-4000-8000-000000000002").count()) === 1, "the other invoice is not touched");
  await h.go(`/p/${TOKEN}?paid=a1830000-0000-4000-8000-000000000001&redirect_status=failed`);
  await h.expectText(/INV-1 · Final/, "the page");
  h.expect((await p.getByTestId("portal-pay-online-a1830000-0000-4000-8000-000000000001").count()) === 1, "a failed return keeps the button");

  // 3) a demo company keeps the simulation; without Stripe and demo — no payment
  answer = portal({ online_pay: false, simulated_pay: true });
  await fresh();
  await h.expectText(/Pay by card/, "demo: the simulation stays");
  h.expect(!/Pay online/.test(await h.text()), "demo: no real payment");
  answer = portal({ online_pay: false, simulated_pay: false });
  await fresh();
  await h.expectText(/INV-1 · Final/, "the invoices are still shown");
  text = await h.text();
  h.expect(!/Pay online|Pay by card/.test(text), "no Stripe, no demo: no payment button");

  // 4) the office sees the ACH on its way on the invoice
  await h.go("/");
  const inv = await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5") || "null");
    const i = raw.db.invoices.find((x) => x.status === "sent") || raw.db.invoices[0];
    raw.db.pendingPayments = [{ id: "pp-183", invoiceId: i.id, amountCents: 12345, method: "ach", at: new Date().toISOString() }];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    return { id: i.id, paid: i.paidCents };
  });
  await h.go(`/invoice/${inv.id}`);
  await h.expectText(/ACH в обработке: \$123\.45/, "the invoice screen: ACH on its way");
  h.expect((await h.db()).invoices.find((x) => x.id === inv.id).paidCents === inv.paid, "…not counted as paid");
  await h.shot("office");
};
