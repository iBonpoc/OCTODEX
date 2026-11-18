const { dayKey, todayKey } = require("../companyTime.cjs");
/**
 * e2e 492 — #2055: the visit's badge on «Подпись» says what comes next.
 * С1 ДАНО выезд на «Подписи», к оплате $0 (счёт работы оплачен); ТОГДА на выезде и в списке «Выезды» бейдж «Подписан · закрыть»,
 *    а не «Ждёт оплаты».
 * С2 ДАНО к оплате > 0; ТОГДА «Ждёт оплаты», как было.
 * Every view; seeded from a page without the app (h.seed).
 */
const KEY = "octo.db.v5";
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.waitForFunction((k) => !!JSON.parse(localStorage.getItem(k) || "null")?.db?.visits?.length, KEY, { timeout: 8000 });
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const mine = raw.db.visits.filter((v) => v.techId === raw.db.me && v.jobId && dayKey(v.start) === todayKey() && v.step === "scheduled");
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
    { id: "inv492a", customerId: cust(a.jobId), jobId: a.jobId, totalCents: 50000, paidCents: 50000, dueDate: iso, kind: "final" },
    { id: "inv492b", customerId: cust(b.jobId), jobId: b.jobId, totalCents: 50000, paidCents: 20000, dueDate: iso, kind: "final" },
  ];
  await h.seed(KEY, raw);

  // С1 on the visit itself
  await h.go(`/visit/${a.id}`);
  await p.getByText("Подписан · закрыть").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.getByText("Ждёт оплаты", { exact: true }).locator("visible=true").count()) === 0, "С1 the visit with $0 due is not «Ждёт оплаты»");
  await h.shot("visit-zero");
  // С2 on the visit with money to take
  await h.go(`/visit/${b.id}`);
  await p.getByText("Ждёт оплаты", { exact: true }).locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect(true, "С2 money to take: «Ждёт оплаты»");
};
