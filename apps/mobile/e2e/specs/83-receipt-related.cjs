// e2e 83: «Связано» on the receipt and the invoice (wave 8, 13 §2.7; 15-flows §2 «квитанция → счёт → работа → клиент»), every view
/**
 * - office: receipt → «Счёт INV-…» → invoice → «Работа JOB-…» → job; the invoice also links «Клиент …» → client and its estimate;
 * - the technician on an invoice of a job: no estimate link (company money).
 */
const { objOpenHead } = require("../objectScreen.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/payments?p=all");
  const db = await h.db();
  const find = (id) => db.jobs.find((j) => j.id === id) ?? (db.cancelledJobs ?? []).find((j) => j.id === id);
  const pay = db.payments.find((x) => find(db.invoices.find((i) => i.id === x.invoiceId)?.jobId));
  h.expect(pay, "demo has a payment on an invoice of a job");
  const inv = db.invoices.find((i) => i.id === pay.invoiceId);
  const job = find(inv.jobId);
  const cust = db.customers.find((c) => c.id === inv.customerId);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rel = (re) => p.getByRole("button", { name: re }).locator("visible=true").first();

  // receipt → invoice
  await h.go(`/receipt/${pay.id}`);
  // #3065: on the receipt «Связано» is a group of rows under the sum — read by testID (the client's row is its name)
  const row = (kind) => p.getByTestId(`related-${kind}`).locator("visible=true");
  await row("invoice").first().waitFor({ timeout: 8000 });
  h.expect((await row("customer").count()) === 1 && (await row("customer").first().innerText()).includes(cust.name), "receipt: «Клиент …»");
  await h.shot("receipt");
  h.expect((await row("invoice").first().innerText()).includes(inv.number ?? ""), "receipt: «Счёт INV-…»");
  await row("invoice").first().click();
  await p.waitForTimeout(700);
  h.expect(p.url().endsWith(`/invoice/${inv.id}`), `receipt → its invoice (${p.url()})`);

  // invoice → job, client, estimate: v2 — «Связано» is in the header's panel, opened by «⌄»
  await objOpenHead(p, "invoice-head");
  if (job.estimateId) h.expect((await rel(/^Связано: Смета/).count()) === 1, "office: the invoice links its estimate");
  await rel(new RegExp(`^Связано: Работа ${esc(job.number ?? job.title)}$`)).click();
  await p.waitForTimeout(700);
  h.expect(p.url().endsWith(`/job/${job.id}`), `invoice → its job (${p.url()})`);
  await h.go(`/invoice/${inv.id}`);
  await objOpenHead(p, "invoice-head");
  await rel(new RegExp(`^Связано: Клиент ${esc(cust.name)}$`)).click();
  await p.waitForTimeout(700);
  h.expect(p.url().endsWith(`/client/${cust.id}`), `invoice → its client (${p.url()})`);

  // technician: no estimate (money)
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go(`/invoice/${inv.id}`);
  // the invoice of a job of his — its screen (open «⌄» to read «Связано»); not his — «нет доступа», no links at all
  await p.locator('[data-testid="invoice-screen"], [data-testid="no-access"]').locator("visible=true").first().waitFor({ timeout: 8000 });
  if (await p.getByTestId("invoice-screen").locator("visible=true").count()) await objOpenHead(p, "invoice-head");
  h.expect((await rel(/^Связано: Смета/).count()) === 0, "tech: no estimate link on the invoice");
};
