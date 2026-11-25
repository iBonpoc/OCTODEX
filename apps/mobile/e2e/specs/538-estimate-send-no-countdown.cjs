/**
 * e2e 538 — MAP §13 п.1 (#2504 §3): the send sheet has no countdown. «Отправить клиенту» → the main button sends AT ONCE
 * (the press is the confirmation): the estimate is «sent» in the store, no «Отменить · 5» button and no «Отправляется…» line; the
 * toast's «Вернуть» (rule 5) takes the draft's send back. Every view. By testID; waits on what it checks.
 */
const DB_KEY = "octo.db.v5";
const EID = "e-e2e-538";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const est = async () => ((await h.db())?.estimates ?? []).find((e) => e.id === EID);

  await h.go("/today");
  await p.evaluate(({ k, id }) => {
    const s = JSON.parse(localStorage.getItem(k));
    const base = s.db.estimates.find((e) => e.doc && e.customerId);
    const c = s.db.customers.find((x) => x.id === base.customerId);
    c.phone = "(555) 010-0538";
    const doc = JSON.parse(JSON.stringify(base.doc));
    doc.options = [{ ...doc.options[0], lines: [{ id: "l-own", group: "material", name: "Own line", quantity: "10", unit: "ft", unitPriceCents: 500 }] }];
    s.db.estimates.push({ ...base, id, doc, number: "EST-0538", status: "draft", token: undefined, sentAt: undefined, viewedAt: undefined, approval: undefined, countersign: undefined, linkRevokedAt: undefined, depositPaidAt: undefined });
    localStorage.setItem(k, JSON.stringify(s));
  }, { k: DB_KEY, id: EID });

  await h.go(`/estimate/${EID}`);
  await tid("est-send").first().click();
  await tid("send-sms").waitFor({ timeout: 8000 });
  h.expect((await est())?.status === "draft", "a draft before the press");
  await tid("send-sms").getByRole("button").click();
  await p.waitForFunction(([k, id]) => JSON.parse(localStorage.getItem(k) ?? "{}")?.db?.estimates?.find((e) => e.id === id)?.status === "sent", [DB_KEY, EID], { timeout: 5000 });
  h.expect((await est())?.status === "sent", "the press sends at once — no countdown to wait out");
  h.expect((await tid("send-undo").count()) === 0, "no countdown button (send-undo)");
  h.expect((await tid("send-going").count()) === 0, "no «Отправляется…» line");
    await tid("send-sms").waitFor({ state: "detached", timeout: 5000 });
  h.expect((await tid("send-sms").count()) === 0, "the sheet is gone after the send (no second press by mistake)");
  await h.shot("sent");
};
