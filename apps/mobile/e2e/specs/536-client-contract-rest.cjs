/**
 * e2e 536 — #2486 (after #2175, rule А #2061): «остаток по договору» is ONE number on the client card, in the job's
 * «Договор» block and on the invoice it issues — only the contract's own invoices (deposit / progress / final) count;
 * a standalone invoice is extra work and never lowers it.
 * С1 ДАНО клиент с принятой сметой и работой $500; по работе оплачены депозит $100 и отдельный (standalone) счёт $200;
 *    КОГДА директор открывает карточку клиента, раздел «Счета»; ТОГДА «Ещё выставить» — $400 (было $200: отдельный
 *    счёт съедал договор), главный шаг карточки — «Выставить счёт».
 * С2 КОГДА он идёт по главному шагу в работу, раздел «Счета»; ТОГДА в блоке «Договор» «Выставлено» — $100 (без
 *    отдельного счёта), кнопка — «Выставить остаток $400», и нажатие выставляет final ровно на $400.
 * Every view; seeded from a page without the app (h.seed); found by testID.
 */
const KEY = "octo.db.v5";
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.waitForFunction((k) => !!JSON.parse(localStorage.getItem(k) || "null")?.db?.jobs?.length, KEY, { timeout: 8000 });
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const db = raw.db;
  const baseJob = db.jobs[0];
  const baseProp = db.properties.find((x) => x.id === baseJob.propertyId) ?? db.properties[0];
  const baseCust = db.customers.find((c) => c.id === (baseJob.customerId ?? baseProp.customerId)) ?? db.customers[0];
  const baseEst = db.estimates[0];
  const iso = new Date().toISOString();
  const not = (ids, key = "id") => (x) => !ids.includes(x[key]);
  db.customers = [...db.customers.filter(not(["c536"])), { ...baseCust, id: "c536", name: "Client 536", status: "active" }];
  db.properties = [...db.properties.filter(not(["p536"])), { ...baseProp, id: "p536", customerId: "c536" }];
  db.estimates = [...db.estimates.filter(not(["e536"])), { ...baseEst, id: "e536", customerId: "c536", propertyId: "p536", leadId: undefined, status: "approved", title: "Estimate 536", savedAt: iso, sentAt: iso }];
  db.jobs = [...db.jobs.filter(not(["j536"])), { ...baseJob, id: "j536", title: "Job 536", customerId: "c536", propertyId: "p536", estimateId: "e536", status: "done", amountCents: 50000, cancelledAt: undefined }];
  db.visits = db.visits.filter(not(["j536"], "jobId"));
  db.invoices = [
    ...db.invoices.filter(not(["j536"], "jobId")),
    { id: "i536d", customerId: "c536", jobId: "j536", totalCents: 10000, paidCents: 10000, dueDate: iso, sentAt: iso, kind: "deposit" },
    { id: "i536s", customerId: "c536", jobId: "j536", totalCents: 20000, paidCents: 20000, dueDate: iso, sentAt: iso, kind: "standalone", title: "Extra 536" },
  ];
  await h.seed(KEY, raw);
  await h.seed("octo.role.v1", "director");

  const seen = (id) => p.getByTestId(id).locator("visible=true").first();

  // С1: the client card — «Ещё выставить» is the contract's rest, the standalone $200 is not taken off it
  await h.go("/client/c536?tab=money");
  await seen("client-money-figures").waitFor({ timeout: 8000 });
  const figures = (await seen("client-money-figures").innerText()).replace(/\s+/g, " ");
  h.expect(figures.includes("$400.00") && !figures.includes("$200.00"), `С1 «Ещё выставить» $400.00 — the standalone $200.00 does not lower the contract's rest: ${figures}`);
  await seen("client-next-bill").waitFor({ timeout: 8000 });
  await h.shot("client-to-bill-400");

  // С2: the same number in the job's «Договор» block and on the invoice its button issues
  await seen("client-next-bill").click();
  await p.waitForURL(/\/job\/j536/, { timeout: 8000 });
  await seen("job-screen-sections-invoices").click();
  await seen("statement-bill-balance").waitFor({ timeout: 8000 });
  const invoiced = (await seen("statement-invoiced").innerText()).replace(/\s+/g, " ");
  h.expect(/\$100(\.00)?(?!\d)/.test(invoiced) && !invoiced.includes("$300.00"), `С2 «Выставлено» — the contract's deposit $100.00 only: ${invoiced}`);
  const button = (await seen("statement-bill-balance").innerText()).replace(/\s+/g, " ");
  h.expect(/\$400(\.00)?(?!\d)/.test(button), `С2 «Выставить остаток» carries the client card's $400.00: ${button}`);
  // the standalone invoice is still in the job's list — extra work is shown, only not counted
  h.expect((await p.getByTestId("statement-invoice-i536s").count()) > 0, "С2 the standalone invoice stays in the job's list");
  await h.shot("statement-400");
  await seen("statement-bill-balance").click();
  await p.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || "null")?.db?.invoices ?? []).filter((i) => i.jobId === "j536").length === 3, KEY, { timeout: 8000 });
  const after = (await h.db()).invoices.filter((i) => i.jobId === "j536" && !["i536d", "i536s"].includes(i.id));
  h.expect(after.length === 1 && after[0].kind === "final" && after[0].totalCents === 40000, `С2 one final for $400.00: ${JSON.stringify(after.map((i) => [i.kind, i.totalCents]))}`);
};
