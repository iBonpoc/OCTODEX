/**
 * e2e 395 — a receipt of an expense is kept (#1538, G-photo-path Ф-5). The receipt goes with the expense as its own file
 * (receiptFileId); after a reload the card still says «чек есть»; a phone that has only the cloud's copy (no local
 * file — another phone, or the company read again) shows it too, not «Без чека». Every view. Waits on what it checks.
 */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const AMOUNT = "47.31";
const { pickVendor } = require("../expenseForm.cjs");

exports.run = async (h) => {
  const p = h.page;
  const mine = async () => ((await h.db())?.expenses ?? []).find((x) => x.amountCents === 4731);
  const card = () => p.locator('[data-testid="list-card"]').locator("visible=true").filter({ hasText: `$${AMOUNT}` }).first();

  await h.go("/expense/new");
  const photo = p.getByTestId("expense-photo").locator("visible=true").first();
  await photo.waitFor({ timeout: 8000 });
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), photo.click()]);
  await chooser.setFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
  await p.locator('img[src^="blob:"]').first().waitFor({ timeout: 8000 }); // the receipt is shown on the form
  await p.getByTestId("field-amount").locator("input").locator("visible=true").first().fill(AMOUNT);
  await pickVendor(p);
  await p.getByTestId("expense-save").locator("visible=true").first().click();

  // the expense is saved with its receipt's file (it goes to the cloud)
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.expenses ?? []).some((y) => y.amountCents === 4731), null, { timeout: 8000 });
  const x = await mine();
  h.expect(!!x.receiptFileId, "the expense carries its receipt's file (it goes to the cloud)");
  h.expect(!!x.receiptUri, "… and the receipt's file on this phone");

  // after a reload
  await h.go("/money");
  await card().waitFor({ timeout: 8000 });
  h.expect(!/Без чека/.test(await card().innerText()), "after a reload: the card has its receipt");
  await h.shot("receipt-kept");

  // a phone with only the cloud's copy: the expense knows its receipt's file, not a local picture
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const e = raw.db.expenses.find((y) => y.id === x.id);
  delete e.receiptUri;
  await h.seed("octo.db.v5", raw);
  await h.go("/money");
  await card().waitFor({ timeout: 8000 });
  h.expect(!/Без чека/.test(await card().innerText()), "the cloud's copy (another phone): the card has its receipt, not «Без чека»");
  // the check is not empty: an expense without a receipt does say «Без чека»
  const bare = raw.db.expenses.find((y) => !y.receiptUri && !y.receiptFileId);
  h.expect(!!bare, "the demo has an expense without a receipt");
  const bareCard = p.locator('[data-testid="list-card"]').locator("visible=true").filter({ hasText: bare.vendor }).filter({ hasText: /Без чека/ });
  h.expect((await bareCard.count()) > 0, "an expense without a receipt says «Без чека»");
  await h.shot("receipt-cloud-copy");
};
