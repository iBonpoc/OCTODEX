/**
 * Step 20b (docs/specs/35-stripe.md, story map S12): «Компания → Онлайн-оплата» in the demo.
 * - «Компания» has the card «Онлайн-оплата» → /company/payments;
 * - in the demo (no cloud account) the screen says it works in a cloud account: no «Подключить Stripe», no fake state
 *   (the cloud side is db T126–T130 and unit stripeConnectFn / onlinePay).
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/company");
  const entry = p.getByTestId("company-payments").locator("visible=true").first();
  await entry.waitFor({ timeout: 5000 });
  await entry.click();
  await p.waitForURL(/\/company\/payments$/, { timeout: 5000 });
  await p.getByTestId("opay-cloud-only").locator("visible=true").first().waitFor({ timeout: 5000 });
  await h.expectText(/Онлайн-оплата работает в облачном аккаунте/, "the demo says where it works");
  h.expect((await p.getByTestId("opay-action").count()) === 0, "no «Подключить Stripe» in the demo");
  h.expect(!/acct_|sk_test_|connect\.stripe\.com/.test(await h.text()), "no account, key or Stripe link in the demo");
  await h.shot("cloud-only");
};
