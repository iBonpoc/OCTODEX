const { dayKey, todayKey } = require("../companyTime.cjs");
/**
 * #757 (audit B-02 / B-05 / A-17): the tech records a payment on a visit whose job already has its final invoice,
 * part paid. The payment goes into that invoice for its balance — no second final invoice, not the whole contract.
 * The same rule as the server's record_visit_payment (supabase/tests T180) and the engine's visitPayment.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  let db = await h.db();
  const v0 = db.visits.find((v) => v.techId === db.me && v.jobId && dayKey(v.start) === todayKey() && v.step === "scheduled");
  h.expect(v0, "the tech has a job visit today");
  const jobId = v0.jobId;
  // the job: $500 contract (test price), a final invoice of $500 with $200 already paid; the visit is signed, ready to pay
  await p.evaluate(([vid, jid]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const job = raw.db.jobs.find((j) => j.id === jid);
    job.amountCents = 50000;
    const v = raw.db.visits.find((x) => x.id === vid);
    v.step = "signed";
    v.amountDueCents = 30000;
    v.checklist = v.checklist.map((c) => ({ ...c, done: true }));
    raw.db.invoices = [
      ...raw.db.invoices.filter((i) => i.jobId !== jid),
      { id: "inv230", customerId: raw.db.invoices[0]?.customerId ?? "c1", jobId: jid, totalCents: 50000, paidCents: 20000, dueDate: new Date().toISOString(), kind: "final" },
    ];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, [v0.id, jobId]);
  await h.go(`/visit/${v0.id}`);
  await h.expectText(/\$300(\.00)?\b/, "the visit shows the balance to take");
  const skip = p.getByTestId("chk-skip").last();
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await h.clickText("Наличные");
  await h.click("Записать оплату");
  db = await h.db();
  const v = db.visits.find((x) => x.id === v0.id);
  h.expect(v.step === "paid" && v.payment && v.payment.amountCents === 30000, `paid the balance $300, not the contract: ${JSON.stringify(v.payment)}`);
  const finals = db.invoices.filter((i) => i.jobId === jobId && i.kind === "final");
  h.expect(finals.length === 1 && finals[0].id === "inv230", `one final invoice — the one that was there: ${JSON.stringify(finals)}`);
  h.expect(finals[0].paidCents === 50000, `the final invoice is paid in full: ${finals[0].paidCents}`);
  await h.shot("paid");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
