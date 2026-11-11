const { dayKey, todayKey } = require("../companyTime.cjs");
/**
 * #757 (audit B-02 / B-05 / A-17; director's review of #857 №1–2): what the visit screen shows is what the tech takes —
 * one rule (features/visitDue.ts → engine visitPayment, the server's record_visit_payment, supabase/tests T180).
 * Case 1: the job has its final invoice, part paid → the screen shows the balance, the payment goes into that invoice,
 *         no second final invoice.
 * Case 2: a deposit billed, not paid → the screen shows the contract less the deposit, a new final invoice for it.
 * Nothing about the amount is put into the visit by hand: the screen must count it.
 */
const pay = async (h, visitId) => {
  const p = h.page;
  await h.go(`/visit/${visitId}`);
  const due = p.getByTestId("visit-amount-due").last();
  await due.waitFor();
  const shown = (await due.innerText()).trim();
  await h.clickText("Наличные");
  await p.getByTestId("visit-record-payment").last().getByRole("button").click();
  await p.waitForTimeout(350);
  return shown;
};

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  let db = await h.db();
  const mine = db.visits.filter((v) => v.techId === db.me && v.jobId && dayKey(v.start) === todayKey() && v.step === "scheduled");
  const byJob = [...new Map(mine.map((v) => [v.jobId, v])).values()];
  h.expect(byJob.length >= 2, `the tech has two job visits today on two jobs: ${byJob.length}`);
  const [a, b] = byJob;
  // the jobs: $500 contract each (test prices); A — a final invoice of $500 with $200 paid; B — a $150 deposit, not paid
  await p.evaluate(([va, ja, vb, jb]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const cust = (jid) => raw.db.invoices.find((i) => i.jobId === jid)?.customerId ?? raw.db.invoices[0]?.customerId ?? "c1";
    for (const jid of [ja, jb]) raw.db.jobs.find((j) => j.id === jid).amountCents = 50000;
    for (const vid of [va, vb]) {
      const v = raw.db.visits.find((x) => x.id === vid);
      v.step = "signed";
      v.checklist = v.checklist.map((c) => ({ ...c, done: true }));
    }
    const iso = new Date().toISOString();
    raw.db.invoices = [
      ...raw.db.invoices.filter((i) => i.jobId !== ja && i.jobId !== jb),
      { id: "inv230a", customerId: cust(ja), jobId: ja, totalCents: 50000, paidCents: 20000, dueDate: iso, kind: "final" },
      { id: "inv230b", customerId: cust(jb), jobId: jb, totalCents: 15000, paidCents: 0, dueDate: iso, kind: "deposit" },
    ];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, [a.id, a.jobId, b.id, b.jobId]);

  // case 1: a final invoice part paid
  const shownA = await pay(h, a.id);
  h.expect(/^\$300(\.00)?$/.test(shownA), `case 1: the screen shows the balance $300: ${shownA}`);
  db = await h.db();
  const va = db.visits.find((x) => x.id === a.id);
  h.expect(va.step === "paid" && va.payment?.amountCents === 30000, `case 1: paid what was shown: ${JSON.stringify(va.payment)}`);
  const finA = db.invoices.filter((i) => i.jobId === a.jobId && i.kind === "final");
  h.expect(finA.length === 1 && finA[0].id === "inv230a" && finA[0].paidCents === 50000, `case 1: one final invoice, paid in full: ${JSON.stringify(finA)}`);
  await h.shot("final");

  // case 2: a deposit billed, not paid
  const shownB = await pay(h, b.id);
  h.expect(/^\$350(\.00)?$/.test(shownB), `case 2: the screen shows the contract less the deposit, $350: ${shownB}`);
  db = await h.db();
  const vb = db.visits.find((x) => x.id === b.id);
  h.expect(vb.step === "paid" && vb.payment?.amountCents === 35000, `case 2: paid what was shown: ${JSON.stringify(vb.payment)}`);
  const finB = db.invoices.filter((i) => i.jobId === b.jobId && i.kind === "final");
  h.expect(finB.length === 1 && finB[0].totalCents === 35000 && finB[0].paidCents === 35000, `case 2: a new final invoice of $350: ${JSON.stringify(finB)}`);
  h.expect(db.invoices.find((i) => i.id === "inv230b")?.paidCents === 0, "case 2: the deposit stays its own invoice");
  await h.shot("deposit");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
