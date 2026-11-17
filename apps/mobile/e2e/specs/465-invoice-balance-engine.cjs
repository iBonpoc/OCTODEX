/**
 * #1898 (rule 8): what an invoice still owes is the engine's `invoiceOwes`/`invoicesOwe` everywhere — the job's invoice card,
 * the receipt's «balance after», the client's debt. One partly paid invoice (10 000 of 34 200 paid) and one overpaid invoice
 * of the SAME client (an overpayment owes nothing and takes nothing off the other one): every place shows the same number.
 * Set from a page without the app.
 */
const { atMinute, todayKey } = require("../companyTime.cjs");
const whole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money = (c) => whole.format(c / 100);
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const owes = (i) => Math.max(0, i.totalCents - i.paidCents);

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const d = raw.db;
  const part = d.invoices.find((i) => i.id === "i5"); // client c1, job j1, 34 200 (the deposit)
  part.paidCents = 10000;
  d.payments.push({ id: "pay-e465", invoiceId: "i5", customerId: part.customerId, amountCents: 10000, method: "check", at: new Date().toISOString(), receiptNumber: "RCT-E465", receivedBy: d.me });
  const over = d.invoices.find((i) => i.id === "i3"); // the same client c1, job j8, 24 000 paid in full
  h.expect(over.customerId === part.customerId, "both invoices are of one client");
  over.paidCents = over.totalCents + 5000;
  // the technician sees the invoices of the jobs he has a visit on (13 §3.4): one visit on each job
  for (const jobId of [part.jobId, over.jobId]) {
    const job = d.jobs.find((j) => j.id === jobId);
    d.visits = [...d.visits.filter((x) => x.jobId !== jobId), { id: `e2e465-${jobId}`, jobId, propertyId: job.propertyId, kind: "install", techId: d.me, assigneeIds: [d.me], start: atMinute(todayKey(), 23 * 60), durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0 }];
  }
  await h.seed("octo.db.v5", raw);

  // the job's invoice card (the technician's view of «Деньги»): the balance, and an overpayment shows $0
  await setRole(h, "tech");
  const money_tab = () => p.getByRole("tab", { name: "Деньги", exact: true }).locator("visible=true").click();
  await h.go(`/job/${part.jobId}`);
  await money_tab();
  const cardA = p.getByTestId(`job-invoice-${part.id}`).locator("visible=true");
  h.expect((await cardA.innerText()).includes(money(24200)), `job: the partly paid invoice owes ${money(24200)}`);
  await h.go(`/job/${over.jobId}`);
  await money_tab();
  const cardB = p.getByTestId(`job-invoice-${over.id}`).locator("visible=true");
  const textB = await cardB.innerText();
  h.expect(textB.includes("$0") && !/-\$/.test(textB), "job: the overpaid invoice owes $0, never a negative sum");

  // the receipt: the same balance after the payment
  await h.go("/receipt/pay-e465");
  await h.expectText(new RegExp(money(24200).replace(/[$,]/g, "\\$&")), "receipt: balance after = the invoice's balance");

  // the client's debt (the clients list card) counts the balances, not the overpayment of another invoice
  await setRole(h, "director");
  const db = await h.db();
  const debt = db.invoices.filter((i) => i.customerId === part.customerId).reduce((s, i) => s + owes(i), 0);
  h.expect(debt === 24200, `the client's debt is the partly paid invoice only (${money(debt)}): the overpayment takes nothing off it`);
  await h.go(`/client/${part.customerId}`);
  await h.expectText(new RegExp(money(debt).replace(/[$,]/g, "\\$&")), `client: the debt is ${money(debt)}`);
};
