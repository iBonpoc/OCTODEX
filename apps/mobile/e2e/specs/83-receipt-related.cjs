// e2e 83: «Связано» on the receipt and the invoice (wave 8, 13 §2.7; 15-flows §2 «квитанция → счёт → работа → клиент»), every view
/**
 * - office: receipt → «Счёт INV-…» → invoice → «Работа JOB-…» → job; the invoice also links «Клиент …» → client and its estimate;
 * - the technician on an invoice of a job: no estimate link (company money).
 */
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
  h.expect((await rel(new RegExp(`^Связано: Клиент ${esc(cust.name)}$`)).count()) === 1, "receipt: «Клиент …»");
  await h.shot("receipt");
  await rel(new RegExp(`^Связано: Счёт ${esc(inv.number ?? "")}`)).click();
  await p.waitForTimeout(700);
  h.expect(p.url().endsWith(`/invoice/${inv.id}`), `receipt → its invoice (${p.url()})`);

  // invoice → job, client, estimate
  if (job.estimateId) h.expect((await rel(/^Связано: Смета/).count()) === 1, "office: the invoice links its estimate");
  await rel(new RegExp(`^Связано: Работа ${esc(job.number ?? job.title)}$`)).click();
  await p.waitForTimeout(700);
  h.expect(p.url().endsWith(`/job/${job.id}`), `invoice → its job (${p.url()})`);
  await h.go(`/invoice/${inv.id}`);
  await rel(new RegExp(`^Связано: Клиент ${esc(cust.name)}$`)).click();
  await p.waitForTimeout(700);
  h.expect(p.url().endsWith(`/client/${cust.id}`), `invoice → its client (${p.url()})`);

  // technician: no estimate (money)
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go(`/invoice/${inv.id}`);
  h.expect((await rel(/^Связано: Смета/).count()) === 0, "tech: no estimate link on the invoice");
};
