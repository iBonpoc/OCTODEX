/** Every tab and menu screen opens for every role that may open it, the rest send it home (no errors), Sales boards and Jobs filters work. */
const { dueKey, todayKey } = require("../companyTime.cjs");

exports.run = async (h) => {
  await h.go("/today");
  for (const role of ["director", "dispatcher", "tech"]) {
    await h.page.evaluate((r) => localStorage.setItem("octo.role.v1", JSON.stringify(r)), role);
    for (const p of ["/today", "/triage", "/leads", "/inbox", "/visits", "/plan", "/messages", "/calls", "/clients", "/more", "/jobs", "/estimates", "/money", "/team", "/catalog", "/company", "/settings"]) {
      await h.go(p);
      // the one header on every screen (visual-v2 «Единая шапка»); the version line left the headers for «Ещё» and «О приложении»
      await h.page.getByTestId("screen-head").first().waitFor({ timeout: 8000 });
      h.expect((await h.page.getByTestId("screen-head").count()) > 0, `${role} ${p} renders with the one header`);
      // a screen this role may not open sends it home (route-guard, e2e 51)
      const closed = role === "tech" ? ["/today", "/triage", "/inbox", "/money", "/team", "/company"] : role === "dispatcher" ? ["/team"] : []; // the office opens /company read-only (spec 26 §3)
      if (closed.includes(p)) h.expect(!new URL(h.page.url()).pathname.startsWith(p), `${role} ${p} is closed`);
    }
  }
  await h.page.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
  // the version line (rule 11; a local build: «dev», #733) — at the bottom of «Ещё» and in «Настройки → О приложении»
  await h.go("/more");
  await h.expectText(/GoRix v1\.0\.0 · (\d+|dev)\b/, "«Ещё» ends with the version line");
  await h.go("/settings");
  await h.expectText(/GoRix v1\.0\.0 · (\d+|dev)\b/, "«О приложении» has the version line");
  // Estimates and Invoices are sections of their own (spec 31 §7а): no switch on /leads
  await h.go("/estimates");
  // v2: the estimates list is grouped (ListGroup) — a group's title carries its count
  const estGroup = h.page.locator('[data-testid^="est-list-group-"]:visible').first();
  await estGroup.waitFor({ timeout: 5000 });
  h.expect(/· \d+/.test(await estGroup.innerText()), "estimate groups with their count");
  // the invoice rows with groups: «Счета» is the one invoices list (spec 31 §7а)
  await h.go("/invoice");
  const db = await h.db();
  const overdue = db.invoices.filter((i) => i.paidCents < i.totalCents && dueKey(i.dueDate) < todayKey());
  h.expect(overdue.length > 0, "the demo has an overdue invoice");
  const og = h.page.locator('[data-testid="invoice-list-group-overdue"]:visible');
  await og.waitFor({ timeout: 5000 });
  h.expect(/\$[\d,]+/.test(await og.innerText()), "overdue invoices group with its sum");
  const orow = og.locator(`[data-testid="invoice-row-${overdue[0].id}"]`);
  h.expect(/Просрочен \d+ дн/.test(await orow.innerText()), "overdue sign (Просрочен N дн) on the invoice row");
  await h.go("/jobs");
  // the job filters, by key (the words follow the status: a job is «Запланирована», #1417)
  await h.page.getByTestId("filter-lane-scheduled").locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect(/· \d+/.test(await h.page.getByTestId("filter-lane-scheduled").locator("visible=true").first().innerText()), "job filters: «scheduled» with its count");
};
