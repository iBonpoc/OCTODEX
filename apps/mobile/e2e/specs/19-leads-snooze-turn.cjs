/**
 * Leads wave L1 on screen: a snoozed lead leaves "Open" and the attention queue and shows under "Snoozed";
 * an unanswered call keeps the lead waiting for a reply.
 */
const { listChip } = require("../listScreen.cjs");
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
  // v2 (#2350): the chips of the list «Все · … · Отложенные 1»; rows by testID
  await listChip(p, "leads", /^Все/).click();
  await p.getByTestId("lead-row-l2").locator("visible=true").first().waitFor();
  h.expect((await p.getByTestId("lead-row-l1").locator("visible=true").count()) === 0, "snoozed lead is not in the open list");
  await listChip(p, "leads", /^Отложенные 1$/).click();
  await p.getByTestId("lead-row-l1").locator("visible=true").first().waitFor({ timeout: 5000 });
  await listChip(p, "leads", /^Все/).click(); // the chip is kept on the device: back to «Все»
  const db = await h.db();
  h.expect(db.leads.find((l) => l.name === "Kevin Brooks").status === "new", "snooze is not a status");
  h.expect(db.leads.find((l) => l.name === "Angela Rossi").status === "new", "unanswered calls do not move the lead to 'in touch'");

  // «Главная» v2: the tile «Лиды без ответа» counts who waits — Angela (unanswered calls) yes, the snoozed Kevin no
  await h.go("/today");
  const tile = p.getByTestId("tile-leads").locator("visible=true").first();
  const said = await tile.getAttribute("aria-label");
  h.expect(/Лиды без ответа: 1\b/.test(said ?? ""), `one lead waits for a reply (${said})`);
  await tile.click();
  await p.getByTestId("lead-row-l2").locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("lead-row-l1").locator("visible=true").count()) === 0, "snoozed lead does not ask for attention");

  await h.go(`/lead/${db.leads.find((l) => l.name === "Angela Rossi").id}`);
  await h.expectText(/Angela Rossi/, "card opens");
};
