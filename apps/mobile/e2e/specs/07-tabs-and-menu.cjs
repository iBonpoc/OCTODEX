/** Every tab and menu screen opens for every role (no errors), Sales boards and Jobs filters work. */
exports.run = async (h) => {
  await h.go("/today");
  for (const role of ["director", "dispatcher", "tech"]) {
    await h.page.evaluate((r) => localStorage.setItem("octo.role.v1", JSON.stringify(r)), role);
    for (const p of ["/today", "/triage", "/inbox", "/visits", "/plan", "/clients", "/more", "/jobs", "/estimates", "/money", "/team", "/catalog", "/company", "/settings"]) {
      await h.go(p);
      await h.expectText(/OCTODEX v1\.0\.0 · \d+/, `${role} ${p} renders with the version line`);
    }
  }
  await h.page.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
  await h.go("/inbox");
  await h.clickText("Сметы");
  await h.expectText(/Открытые · \d+/, "estimate filters");
  await h.clickText("Счета");
  await h.expectText(/Просрочено · \$1,840/, "overdue invoices");
  await h.go("/jobs");
  await h.expectText(/Запланирован · \d+/, "job filters");
};
