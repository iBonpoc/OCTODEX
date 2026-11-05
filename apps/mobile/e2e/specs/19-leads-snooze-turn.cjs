/**
 * Leads wave L1 on screen: a snoozed lead leaves "Open" and the attention queue and shows under "Snoozed";
 * an unanswered call keeps the lead waiting for a reply; the lead number is on the card.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/inbox?tab=leads");
  await h.expectText(/Kevin Brooks/, "Kevin is an open lead");
  // snooze Kevin for 90 days and log an unanswered call on Angela (what the L2 sheets will do)
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const k = raw.db.leads.find((l) => l.name === "Kevin Brooks");
    k.snoozedUntil = new Date(Date.now() + 90 * 86400000).toISOString();
    k.snoozeReason = "call in spring";
    const a = raw.db.leads.find((l) => l.name === "Angela Rossi");
    a.callAttempts = 2;
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  });
  await h.go("/inbox?tab=leads");
  await p.getByText(/^В работе · \d+$/).last().click(); await p.waitForTimeout(300);
  h.expect((await p.getByText("Kevin Brooks", { exact: true }).count()) === 0, "snoozed lead is not in the open list");
  await p.getByText(/^Отложенные · 1$/).last().click(); await p.waitForTimeout(300);
  await h.expectText(/Kevin Brooks/, "snoozed lead is under 'Snoozed'");
  const db = await h.db();
  h.expect(db.leads.find((l) => l.name === "Kevin Brooks").status === "new", "snooze is not a status");
  h.expect(db.leads.find((l) => l.name === "Angela Rossi").status === "new", "unanswered calls do not move the lead to 'in touch'");

  await h.go("/today");
  const t = await h.text();
  h.expect(!/Kevin Brooks/.test(t), "snoozed lead does not ask for attention");
  h.expect(/Angela Rossi/.test(t), "lead with unanswered calls still waits for a reply");

  await h.go(`/lead/${db.leads.find((l) => l.name === "Angela Rossi").id}`);
  await h.expectText(/Angela Rossi/, "card opens");
};
