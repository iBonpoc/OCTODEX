/** Every tab and menu screen opens for every role that may open it, the rest send it home (no errors), Sales boards and Jobs filters work. */
exports.run = async (h) => {
  await h.go("/today");
  for (const role of ["director", "dispatcher", "tech"]) {
    await h.page.evaluate((r) => localStorage.setItem("octo.role.v1", JSON.stringify(r)), role);
    for (const p of ["/today", "/triage", "/leads", "/inbox", "/visits", "/plan", "/messages", "/calls", "/clients", "/more", "/jobs", "/estimates", "/money", "/team", "/catalog", "/company", "/settings"]) {
      await h.go(p);
      await h.expectText(/GoRix v1\.0\.0 · (\d+|dev)\b/, `${role} ${p} renders with the version line (a local build: «dev», #733)`);
      // a screen this role may not open sends it home (route-guard, e2e 51)
      const closed = role === "tech" ? ["/today", "/triage", "/inbox", "/money", "/team", "/company"] : role === "dispatcher" ? ["/team"] : []; // the office opens /company read-only (spec 26 §3)
      if (closed.includes(p)) h.expect(!new URL(h.page.url()).pathname.startsWith(p), `${role} ${p} is closed`);
    }
  }
  await h.page.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
  // Estimates and Invoices are sections of their own (spec 31 §7а): no switch on /leads
  await h.go("/estimates");
  await h.expectText(/Открытые · \d+/, "estimate filters");
  // the invoice cards with groups: «Счета» is the one invoices list (spec 31 §7а)
  await h.go("/invoice");
  await h.expectText(/Просрочено · \d+ · \$[\d,]+/, "overdue invoices group");
  await h.expectText(/Просрочен \d+ дн/, "overdue sign on the invoice card");
  await h.go("/jobs");
  // the job filters, by key (the words follow the status: a job is «Запланирована», #1417)
  await h.page.getByTestId("filter-lane-scheduled").locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect(/· \d+/.test(await h.page.getByTestId("filter-lane-scheduled").locator("visible=true").first().innerText()), "job filters: «scheduled» with its count");
};
