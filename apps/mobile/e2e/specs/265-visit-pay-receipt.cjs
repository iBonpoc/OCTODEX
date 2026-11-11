/**
 * e2e 265 — the payment on a visit is a payment with its receipt (#1103; the live demo pass of the audit).
 * The bug: «Записать оплату» on the visit marked the invoice paid but wrote no payment and no receipt — the client card
 * showed «Оплатил $51» with «Выставлено $510», and «Получено» did not grow. Now the visit's money goes in as a payment
 * (with its RCT receipt in the demo), as «Принять оплату» on an invoice: what the invoices say paid = what the payments say.
 * Checked on the client card by its own three figures: «Выставлено» = «Должен» + «Оплатил всего».
 * The demo seed, set up from a page without the app (h.seed): a job of $500 (test prices) with no invoice yet, its visit
 * ready to pay.
 */
const cents = (s) => Math.round(Number(String(s).replace(/[^0-9.]/g, "")) * 100);
/** the card shows whole dollars: three rounded figures agree within $1 (the bug: $500 apart) */
const agree = (f) => Math.abs(f.invoiced - f.owes - f.paid) <= 100;

async function figures(h, customerId) {
  await h.go(`/client/${customerId}`);
  const p = h.page;
  const cell = (id) => p.getByTestId(id).first();
  await cell("client-invoiced").waitFor({ state: "visible", timeout: 15000 });
  const read = async (id) => cents((await cell(id).innerText()).split("\n").pop());
  return { owes: await read("client-owes"), paid: await read("client-paid"), invoiced: await read("client-invoiced") };
}

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  // the stored demo, read here, changed below and put back from a page without the app
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const db = raw.db;
  const visit = db.visits.find((v) => v.jobId && v.techId === db.me);
  h.expect(!!visit, "a job visit of mine in the seed");
  const job = db.jobs.find((j) => j.id === visit.jobId);
  const customerId = job.customerId ?? db.properties.find((x) => x.id === job.propertyId)?.customerId;
  job.amountCents = 50000;
  db.invoices = db.invoices.filter((i) => i.jobId !== job.id);
  db.payments = db.payments.filter((x) => db.invoices.some((i) => i.id === x.invoiceId));
  visit.step = "signed";
  visit.checklist = (visit.checklist ?? []).map((c) => ({ ...c, done: true }));
  await h.seed("octo.db.v5", raw);
  await h.seed("octo.role.v1", "director");

  const before = await figures(h, customerId);
  h.expect(agree(before), `before: «Выставлено» = «Должен» + «Оплатил» (${JSON.stringify(before)})`);

  await h.go(`/visit/${visit.id}`);
  await p.getByTestId("visit-amount-due").last().waitFor({ state: "visible", timeout: 15000 });
  await h.clickText("Наличные");
  await p.getByTestId("visit-record-payment").last().getByRole("button").click();
  // wait for what is checked: the visit is paid in the store (CHECKS §9 п.3)
  await p.waitForFunction((id) => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.visits?.find((x) => x.id === id)?.step === "paid", visit.id);

  const after = await h.db();
  const inv = after.invoices.filter((i) => i.jobId === job.id);
  const pays = after.payments.filter((x) => inv.some((i) => i.id === x.invoiceId));
  h.expect(pays.length === 1 && pays[0].amountCents === 50000, `one payment of $500 on the job (before: none): ${JSON.stringify(pays)}`);
  h.expect(/^RCT-/.test(pays[0].receiptNumber ?? ""), `its receipt (${pays[0].receiptNumber})`);
  h.expect(inv.reduce((s, i) => s + i.paidCents, 0) === 50000, `the invoice says $500 paid: ${JSON.stringify(inv)}`);

  const now = await figures(h, customerId);
  h.expect(agree(now), `after: «Выставлено» = «Должен» + «Оплатил» (${JSON.stringify(now)})`);
  h.expect(Math.abs(now.paid - before.paid - 50000) <= 100, `«Оплатил всего» grew by $500 (${before.paid} → ${now.paid})`);
  await h.shot("client-money");
};
