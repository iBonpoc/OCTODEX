/** Every tab and menu screen opens for every role that may open it, the rest send it home (no errors), Sales boards and Jobs filters work. */
exports.run = async (h) => {
  await h.go("/today");
  for (const role of ["director", "dispatcher", "tech"]) {
    await h.page.evaluate((r) => localStorage.setItem("octo.role.v1", JSON.stringify(r)), role);
    for (const p of ["/today", "/triage", "/leads", "/inbox", "/visits", "/plan", "/messages", "/calls", "/clients", "/more", "/jobs", "/estimates", "/money", "/team", "/catalog", "/company", "/settings"]) {
      await h.go(p);
      await h.expectText(/OCTODEX v1\.0\.0 · \d+/, `${role} ${p} renders with the version line`);
      // a screen this role may not open sends it home (route-guard, e2e 51)
      const closed = role === "tech" ? ["/today", "/triage", "/leads", "/inbox", "/money", "/team", "/company"] : role === "dispatcher" ? ["/team"] : []; // the office opens /company read-only (spec 26 §3)
      if (closed.includes(p)) h.expect(!new URL(h.page.url()).pathname.startsWith(p), `${role} ${p} is closed`);
    }
  }
  await h.page.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
  await h.go("/leads");
  await h.clickText("Сметы");
  await h.expectText(/Открытые · \d+/, "estimate filters");
  await h.clickText("Счета");
  await h.expectText(/Нужно действие · \d+ · \$1,840/, "overdue invoices group (list cards PR5)");
  await h.expectText(/Просрочен \d+ дн/, "overdue sign on the invoice card");
  await h.go("/jobs");
  await h.expectText(/Запланирован · \d+/, "job filters");
};
