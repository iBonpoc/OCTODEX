/** A phone that still holds data saved by an older build (no sources / tasks / history) opens Leads and a lead card without crashing. */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const db = raw.db;
    delete db.sources;
    delete db.tasks;
    delete db.activities;
    const name = (id) => (id || "").replace("src-", "").replace(/^./, (c) => c.toUpperCase());
    db.leads = db.leads.map(({ sourceId, ...l }) => ({ ...l, source: name(sourceId) }));
    db.customers = db.customers.map(({ sourceId, ...c }) => ({ ...c, source: name(sourceId) }));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem("octo.role.v1", JSON.stringify("director"));
  });
  await h.go("/inbox?tab=leads");
  await h.expectText(/Kevin Brooks/, "leads list renders with old data");
  await h.expectText(/Thumbtack/, "source name resolved from the old text value");
  await p.getByText("Kevin Brooks", { exact: true }).first().click();
  await p.waitForTimeout(600);
  h.expect((await p.getByRole("button", { name: "Назад: Лиды" }).count()) > 0, "lead card opens (trail ⌂ › Лиды › Лид)");
  await h.clickText("Переписка");
  await h.expectText(/Лид пришёл: Thumbtack/, "history works");
};
