/**
 * Security before live (docs/specs/35-stripe.md §4г, «Деньги и отчёты» №7): the edge function stripe-pay refuses too many
 * tries (one /p/ link, one address, one invoice) with «rate_limited» and how long to wait. The client page says it in the
 * CLIENT's language, in whole minutes — never the server's text, never a raw error; after the wait the form opens again.
 * No network: page.route puts in portal_estimate and stripe-pay (a 4xx in page.route is a console error for the runner, so the
 * code comes in the body with 200, as in e2e 183; the 429 status itself is unit:stripePayFn).
 */
const TOKEN = "tok_e2e195_rate_0123456789";
const INV = "a1950000-0000-4000-8000-000000000001";
const SVG = "M0 0 L5 5";
const portal = (lang) => ({
  status: "approved",
  number: "EST-195",
  title: "Roof repair",
  sent_at: "2026-11-01T18:00:00Z",
  doc_language: lang,
  company: { name: "Sunset Roofing" },
  customer: { name: "Ann Client" },
  property: { address: "1 Elm St", city: "Pasadena" },
  doc: {
    options: [{ id: "o1", name: "Standard", lines: [{ id: "l1", name: "Repair", group: "service", quantity: "1", unit: "job", unitPriceCents: 60000 }] }],
    settings: { discount: null, tax: { enabled: false, rateBps: 0, groups: { service: false, labor: false, material: true } }, deposit: { kind: "none" } },
  },
  approval: { option_id: "o1", selection: { addon_ids: [], total: 60000, deposit: 0 }, signer_name: "Ann Client", signed_at: "2026-11-02T18:00:00Z", signature_svg: SVG, channel: "portal" },
  countersign: { signer_name: "Sam Owner", signed_at: "2026-11-02T19:00:00Z", signature_svg: SVG },
  invoices: [{ id: INV, number: "INV-1", title: "Final", kind: "final", total: 60000, paid: 0 }],
  simulated_pay: false,
  online_pay: true,
  pending: {},
});
const FAKE_STRIPE = `
window.Stripe = function () {
  return {
    elements: function () { return { create: function () { return { mount: function (node) {
      var d = document.createElement("div"); d.textContent = "Fake Payment Element"; node.appendChild(d);
    } }; } }; },
    confirmPayment: function () { return Promise.resolve({ paymentIntent: { status: "processing" } }); },
  };
};`;

exports.run = async (h) => {
  const p = h.page;
  let lang = "en";
  let limited = true;
  let asked = 0;
  await p.route("**/rest/v1/rpc/portal_estimate*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(portal(lang)) }));
  await p.route("**/functions/v1/stripe-pay*", (route) => {
    asked += 1;
    const body = limited
      ? { error: "rate_limited", retryAfter: 250 }
      : { state: "ready", clientSecret: "pi_E2E195_secret_x", account: "acct_E2E195", publishableKey: "pk_test_E2E195", amountCents: 60000, methods: ["card", "us_bank_account"] };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await p.route("https://js.stripe.com/**", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_STRIPE }));

  const open = async () => {
    const b = p.getByTestId(`portal-pay-online-${INV}`);
    await b.scrollIntoViewIfNeeded();
    await b.getByRole("button").click();
  };

  // too many tries: the client's words (en), the wait in whole minutes (250 s → 5 min), no form, no Stripe text
  await h.go(`/p/${TOKEN}`);
  await h.expectText(/INV-1 · Final/, "the invoice");
  await open();
  const err = p.getByTestId("stripe-error");
  await err.waitFor();
  const t1 = await err.innerText();
  h.expect(/Too many tries\. Please try again in 5 min\./.test(t1), `the limit in the client's words: ${t1}`);
  h.expect(!/rate_limited|429/.test(await h.text()), "no server code on the page");
  h.expect((await p.getByText("Fake Payment Element").count()) === 0, "no payment form while limited");
  h.expect(asked === 1, "one request for one tap");
  await h.shot("limited-en");
  await p.getByTestId("stripe-close").getByRole("button").click();
  await p.getByTestId("stripe-checkout").waitFor({ state: "hidden" });

  // after the wait the same button opens the form
  limited = false;
  await open();
  await p.getByText("Fake Payment Element").waitFor();
  h.expect((await p.getByTestId("stripe-error").count()) === 0, "after the wait: the form, no error");
  await p.getByTestId("stripe-close").getByRole("button").click();
  await p.getByTestId("stripe-checkout").waitFor({ state: "hidden" });

  // a Spanish-speaking client gets it in Spanish (rule 7: the client's language, not the app's)
  lang = "es";
  limited = true;
  await h.go(`/p/${TOKEN}`);
  await p.getByTestId(`portal-pay-online-${INV}`).waitFor();
  await open();
  await p.getByTestId("stripe-error").waitFor();
  const t2 = await p.getByTestId("stripe-error").innerText();
  h.expect(/Demasiados intentos\. Inténtelo de nuevo en 5 min\./.test(t2), `in Spanish: ${t2}`);
  await h.shot("limited-es");
};
