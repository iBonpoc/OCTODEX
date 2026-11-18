const { dayKey, todayKey } = require("../companyTime.cjs");
/**
 * e2e 477 — #2018 (audit #2004 D-22): the visit's «Подпись» step is never a dead end and never asks «Принять оплату» for $0.
 * С1 ДАНО выезд на шаге «Подпись», к оплате $0 (счёт работы оплачен); КОГДА мастер открывает выезд; ТОГДА видит «Закрыть
 *    выезд» без суммы и шага оплаты, и выезд закрывается — платёж не пишется.
 * С4 (деньги не меняются) ДАНО к оплате > 0 у мастера, ТОГДА «Принять оплату» пишет ту же сумму, что на экране (как было).
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
  h.expect(byJob.length >= 2, `the tech has two job visits today on two jobs: ${byJob.length}`);
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
    // A: the job's final invoice paid in full — nothing left to take on site
    { id: "inv477a", customerId: cust(a.jobId), jobId: a.jobId, totalCents: 50000, paidCents: 50000, dueDate: iso, kind: "final" },
    // B: a final invoice with $200 paid — $300 to take
    { id: "inv477b", customerId: cust(b.jobId), jobId: b.jobId, totalCents: 50000, paidCents: 20000, dueDate: iso, kind: "final" },
  ];
  await h.seed(KEY, raw);
  await h.seed("octo.role.v1", "tech");
  const payments0 = (raw.db.payments || []).length;

  // С1: $0 — «Закрыть выезд», no amount, no method, no «Принять оплату»
  await h.go(`/visit/${a.id}`);
  await p.getByTestId("visit-close").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("visit-amount-due").locator("visible=true").count()) === 0, "С1 no «К оплате $0.00»");
  h.expect((await p.getByTestId("visit-record-payment").locator("visible=true").count()) === 0, "С1 no «Принять оплату»");
  h.expect((await p.getByTestId("visit-method").locator("visible=true").count()) === 0, "С1 no payment method");
  await h.shot("close-zero");
  await p.getByTestId("visit-close").locator("visible=true").first().getByRole("button").click();
  await p.waitForFunction(([k, id]) => ["paid", "done"].includes(JSON.parse(localStorage.getItem(k) || "null")?.db?.visits?.find((x) => x.id === id)?.step), [KEY, a.id], { timeout: 8000 });
  let db = await h.db();
  h.expect((db.payments || []).length === payments0, `С1 no payment written (${(db.payments || []).length} / ${payments0})`);
  h.expect(db.invoices.filter((i) => i.jobId === a.jobId).length === 1, "С1 no new invoice");
  h.expect(!((db.visits.find((x) => x.id === a.id).payment || {}).amountCents > 0), "С1 the visit took no money");
  // the closed visit shows no «$0.00 · Карта» and does not say the payment was saved
  await p.getByText("Подпись сохранена.").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.getByText(/\$0(\.00)? · /).locator("visible=true").count()) === 0, "С1 no «$0.00 · Карта» line");

  // С4: > 0 — «Принять оплату» as before: the shown amount is what is written
  await h.go(`/visit/${b.id}`);
  const due = p.getByTestId("visit-amount-due").locator("visible=true").first();
  await due.waitFor({ timeout: 8000 });
  const shown = (await due.innerText()).trim();
  h.expect(/^\$300(\.00)?$/.test(shown), `С4 the screen shows $300: ${shown}`);
  h.expect((await p.getByTestId("visit-close").locator("visible=true").count()) === 0, "С4 no «Закрыть выезд» while there is money to take");
  await p.getByTestId("visit-method-button").locator("visible=true").first().click();
  await p.getByTestId("visit-method-cash").locator("visible=true").first().click();
  await p.getByTestId("visit-record-payment").locator("visible=true").first().getByRole("button").click();
  await p.waitForFunction(([k, id]) => JSON.parse(localStorage.getItem(k) || "null")?.db?.visits?.find((x) => x.id === id)?.step === "paid", [KEY, b.id], { timeout: 8000 });
  db = await h.db();
  const vb = db.visits.find((x) => x.id === b.id);
  h.expect(vb.payment?.amountCents === 30000 && vb.payment?.method === "cash", `С4 paid what was shown, by cash: ${JSON.stringify(vb.payment)}`);
};
