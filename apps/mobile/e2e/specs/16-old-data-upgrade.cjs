/** A phone that still holds data saved by an older build (no sources / tasks / history) opens Leads and a lead card without crashing. */
const { waited } = require("../sheet.cjs");
const { objSection } = require("../objectScreen.cjs");
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
  const row = p.getByTestId("lead-row-l1").locator("visible=true").first();
  await row.waitFor({ timeout: 8000 });
  h.expect(/Kevin Brooks/.test(await row.innerText()), "leads list renders with old data");
  // 1280: the row opens the panel beside the list, «Открыть» — the lead's screen; narrower — the screen at once
  await row.click();
  if (h.layout.width >= 1280) await p.getByTestId("list-panel-open").locator("visible=true").first().click();
  h.expect(await waited(p.getByTestId("lead-screen").locator("visible=true").first().waitFor({ timeout: 5000 })), "lead card opens");
  h.expect(await waited(p.getByRole("button", { name: "Назад: Лиды" }).first().waitFor({ timeout: 5000 })), "its back says «Лиды»");
  h.expect(/Thumbtack/.test(await p.getByTestId("lead-source-row").locator("visible=true").first().innerText()), "source name resolved from the old text value");
  await objSection(p, "lead-screen", "history");
  await h.expectText(/Лид пришёл: Thumbtack/, "history works");
};
