const { dayKey, todayKey } = require("../companyTime.cjs");
/**
 * e2e 509 — #2018 С2: who may not take the payment (sales) is never stuck on «Подпись».
 * С2а ДАНО продажник, выезд на «Подписи», к оплате $500, счёта по работе нет; ТОГДА «Оплату примет офис: $500» и «Закрыть
 *     выезд»; КОГДА закрывает; ТОГДА выезд закрыт, платежей и счетов не добавилось.
 * С2б ДАНО у работы финальный счёт с остатком $300; ТОГДА «Оплату примет офис по счёту работы: $300».
 * Every view; seeded from a page without the app (h.seed).
 */
const KEY = "octo.db.v5";
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.waitForFunction((k) => !!JSON.parse(localStorage.getItem(k) || "null")?.db?.visits?.length, KEY, { timeout: 8000 });
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const mine = raw.db.visits.filter((v) => v.jobId && dayKey(v.start) === todayKey() && v.step === "scheduled");
  const byJob = [...new Map(mine.map((v) => [v.jobId, v])).values()];
  h.expect(byJob.length >= 2, `two job visits today: ${byJob.length}`);
  const [a, b] = byJob;
  const cust = (jid) => raw.db.invoices.find((i) => i.jobId === jid)?.customerId ?? raw.db.invoices[0]?.customerId ?? "c1";
  for (const jid of [a.jobId, b.jobId]) raw.db.jobs.find((j) => j.id === jid).amountCents = 50000;
  for (const vid of [a.id, b.id]) {
    const v = raw.db.visits.find((x) => x.id === vid);
    v.step = "signed";
    v.checklist = v.checklist.map((c) => ({ ...c, done: true }));
  }
  const iso = new Date().toISOString();
  raw.db.invoices = [
    ...raw.db.invoices.filter((i) => i.jobId !== a.jobId && i.jobId !== b.jobId),
    { id: "inv509b", customerId: cust(b.jobId), jobId: b.jobId, totalCents: 50000, paidCents: 20000, dueDate: iso, sentAt: iso, kind: "final" },
  ];
  await h.seed(KEY, raw);
  await h.seed("octo.role.v1", "sales");
  const pays0 = (raw.db.payments || []).length;
  const invs0 = raw.db.invoices.length;
  const text = async () => (await p.getByTestId("visit-close-office").locator("visible=true").first().innerText()).replace(/\s+/g, " ");

  // С2б: by the job's invoice
  await h.go(`/visit/${b.id}`);
  await p.getByTestId("visit-close-office").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect(/Оплату примет офис по счёту работы: \$300(\.00)?/.test(await text()), `С2б by the job's invoice: ${await text()}`);
  h.expect((await p.getByTestId("visit-record-payment").locator("visible=true").count()) === 0, "С2б no «Принять оплату» for sales");

  // С2а: no invoice yet
  await h.go(`/visit/${a.id}`);
  await p.getByTestId("visit-close-office").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect(/Оплату примет офис: \$500(\.00)?/.test(await text()), `С2а the office takes it: ${await text()}`);
  await h.shot("close-office");
  await p.getByTestId("visit-close-office-button").locator("visible=true").first().click();
  await p.waitForFunction(([k, id]) => JSON.parse(localStorage.getItem(k) || "null")?.db?.visits?.find((x) => x.id === id)?.step === "paid", [KEY, a.id], { timeout: 8000 });
  const db = await h.db();
  h.expect((db.payments || []).length === pays0, `С2а no payment written (${(db.payments || []).length} / ${pays0})`);
  h.expect(db.invoices.length === invs0, `С2а no invoice made (${db.invoices.length} / ${invs0})`);
  h.expect(!db.visits.find((x) => x.id === a.id).payment, "С2а the visit took no money");
  // review: no «Оплачено» on a visit where the money is still owed
  await p.getByText("Готово", { exact: true }).locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.getByText("Оплачено", { exact: true }).locator("visible=true").count()) === 0, "С2а the closed visit is «Готово», not «Оплачено»");
  // review: the closed card says who takes the money still owed
  const closed = (await p.getByTestId("visit-closed-office").locator("visible=true").first().innerText()).replace(/\s+/g, " ");
  h.expect(/Оплату примет офис: \$500(\.00)?/.test(closed), `С2а the closed visit says the office takes $500: ${closed}`);
};
