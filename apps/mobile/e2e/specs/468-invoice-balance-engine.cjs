/**
 * #1898 (rule 8): what an invoice still owes is the engine's `invoiceOwes`/`invoicesOwe` everywhere — the job's invoice card,
 * the receipt's «balance after», the client's debt. One partly paid invoice (10 000 of 34 200 paid) and one overpaid invoice
 * of the SAME client (an overpayment owes nothing and takes nothing off the other one): every place shows the same number.
 * Set from a page without the app.
 */
const { atMinute, todayKey } = require("../companyTime.cjs");
const whole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money = (c) => whole.format(c / 100);
const setRole = (h, r) => h.seed("octo.role.v1", r); // from a page without the app (CHECKS §9 №12)
const { settle } = require("../settle.cjs");
const owes = (i) => Math.max(0, i.totalCents - i.paidCents);

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const d = raw.db;
  const part = d.invoices.find((i) => i.id === "i5"); // client c1, job j1, 34 200 (the deposit)
  part.paidCents = 10000;
  d.payments.push({ id: "pay-e468", invoiceId: "i5", customerId: part.customerId, amountCents: 10000, method: "check", at: new Date().toISOString(), receiptNumber: "RCT-E468", receivedBy: d.me });
  const over = d.invoices.find((i) => i.id === "i3"); // the same client c1, job j8, 24 000 paid in full
  h.expect(over.customerId === part.customerId, "both invoices are of one client");
  over.paidCents = over.totalCents + 5000;
  // the client page /p/: an approved estimate (e6) whose job has a partly paid and an overpaid invoice
  const e6 = d.estimates.find((e) => e.id === "e6");
  Object.assign(e6, { status: "approved", approval: { optionId: e6.doc.options[0].id, addonIds: [], signerName: "Linda Alvarez", signature: "", at: new Date().toISOString(), channel: "portal", totalCents: 77236, depositCents: 7724 } });
  d.jobs.push({ id: "j-e468", number: "JOB-E468", customerId: e6.customerId, jobTypeId: d.jobs[0].jobTypeId, propertyId: e6.propertyId, title: "E468 client page", status: "scheduled", amountCents: 77236, estimateId: "e6" });
  d.invoices.push(
    { id: "i-e468-a", number: "INV-E468A", title: "Deposit", kind: "deposit", customerId: e6.customerId, jobId: "j-e468", totalCents: 34200, paidCents: 10000, dueDate: "2026-12-01", sentAt: new Date().toISOString() },
    { id: "i-e468-b", number: "INV-E468B", title: "Final balance", kind: "final", customerId: e6.customerId, jobId: "j-e468", totalCents: 24000, paidCents: 29000, dueDate: "2026-12-01", sentAt: new Date().toISOString() },
  );
  // the technician sees the invoices of the jobs he has a visit on (13 §3.4): one visit on each job
  for (const jobId of [part.jobId, over.jobId]) {
    const job = d.jobs.find((j) => j.id === jobId);
    d.visits = [...d.visits.filter((x) => x.jobId !== jobId), { id: `e2e468-${jobId}`, jobId, propertyId: job.propertyId, kind: "install", techId: d.me, assigneeIds: [d.me], start: atMinute(todayKey(), 23 * 60), durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0 }];
  }
  await h.seed("octo.db.v5", raw);

  // the job's invoice card (the technician's view of «Деньги»): the balance, and an overpayment shows $0
  await setRole(h, "tech");
  const money_tab = () => p.getByTestId("job-screen-sections-invoices").locator("visible=true").click();
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
  await h.go("/receipt/pay-e468");
  await h.expectText(new RegExp(money(24200).replace(/[$,]/g, "\\$&")), "receipt: balance after = the invoice's balance");

  // the client's debt (the clients list card) counts the balances, not the overpayment of another invoice
  await setRole(h, "director");
  const db = await h.db();
  const debt = db.invoices.filter((i) => i.customerId === part.customerId).reduce((s, i) => s + owes(i), 0);
  h.expect(debt === 24200, `the client's debt is the partly paid invoice only (${money(debt)}): the overpayment takes nothing off it`);
  await h.go(`/client/${part.customerId}`);
  await h.expectText(new RegExp(money(debt).replace(/[$,]/g, "\\$&")), `client: the debt is ${money(debt)}`);

  // the client page: the partly paid invoice shows what is left and the button pays exactly that; the overpaid one owes
  // nothing — «paid», its total, no button, never a negative sum
  await h.go("/p/demo0handyman0estimate0000000001");
  await h.expectText(/INV-E468A/, "client page: the partly paid invoice");
  const page = await h.text();
  h.expect(!/-\$|\$-/.test(page), "client page: no negative sum");
  h.expect(new RegExp("INV-E468A[\\s\\S]*\\$242[\\s\\S]*INV-E468B").test(page), "client page: the partly paid invoice shows what is left, $242");
  h.expect((await p.getByRole("button", { name: "Pay by card" }).count()) === 1, "client page: one pay button — the overpaid invoice has none");
  await p.getByRole("button", { name: "Pay by card" }).first().click();
  const payNow = h.sheet().getByRole("button", { name: /Pay \$242/ });
  await payNow.waitFor();
  await payNow.click();
  await payNow.waitFor({ state: "hidden" }); // the sheet left: the payment is booked
  await settle(p, { quietMs: 120, maxMs: 2000 }); // the store writes it (pagehide)
  const after = await h.db();
  h.expect(after.invoices.find((i) => i.id === "i-e468-a").paidCents === 34200, "client page: the payment is exactly what was left, the invoice is paid in full");
  h.expect(after.invoices.find((i) => i.id === "i-e468-b").paidCents === 29000, "client page: the overpaid invoice was not touched");
};
