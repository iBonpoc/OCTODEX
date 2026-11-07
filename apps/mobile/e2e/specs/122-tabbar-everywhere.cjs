/**
 * The phone's bottom bar on every screen but forms (docs/specs/28, founder 07.11): before, it was the tab navigator's
 * own and vanished on Jobs, Tasks, Calls, Invoices, Catalog, Team, Settings and on every card.
 * 820/1280: no bottom bar anywhere (the side menu).
 */
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width >= 820;
  const bars = () => p.getByTestId("tab-bar").locator("visible=true").count();
  const db = await (async () => { await h.go("/today"); return h.db(); })();
  const client = db.customers[0].id;
  const job = db.jobs[0].id;

  for (const url of ["/jobs", "/tasks", "/calls", "/invoice", "/catalog", "/team", "/company", "/settings", `/client/${client}`, `/job/${job}`, "/clients"]) {
    await h.go(url);
    await p.waitForTimeout(400);
    const n = await bars();
    h.expect(wide ? n === 0 : n === 1, `${url}: ${wide ? "no bottom bar at " + h.layout.width : "the bottom bar"} (${n})`);
  }
  if (!wide) {
    // a card lights its section's tab (a client → «Клиенты»), a section of «Ещё» lights «Ещё»
    await h.go(`/client/${client}`);
    h.expect((await p.getByRole("tab", { name: "Клиенты", selected: true }).count()) === 1, "a client card lights «Клиенты»");
    await h.go("/jobs");
    h.expect((await p.getByRole("tab", { name: "Ещё", selected: true }).count()) === 1, "Jobs lights «Ещё»");
    await h.shot("jobs");
    // a tab pressed on a card: the card closes, the tab opens
    await p.getByRole("tab", { name: "План", exact: true }).click();
    await p.waitForTimeout(700);
    h.expect(new URL(p.url()).pathname === "/plan", `a tab from a section → /plan (${p.url()})`);
    h.expect((await bars()) === 1, "one bar on the tab (not two)");
  }
  // forms and the signature: none
  for (const url of ["/lead/new", "/estimate/signature", "/client/edit"]) {
    await h.go(url);
    await p.waitForTimeout(400);
    h.expect((await bars()) === 0, `${url}: no bottom bar`);
  }
};
