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
    // a card opened FROM a tab, then another tab: the card is closed (dismissTo), back never walks into it, the history
    // does not grow with every round (before: navigate pushed a new copy of the tabs, review #274)
    const len = () => p.evaluate(() => history.length);
    await h.go("/clients");
    await p.locator('[data-testid="list-card"]:visible').first().click();
    await p.waitForTimeout(700);
    h.expect(/^\/client\//.test(new URL(p.url()).pathname), `a client card from the tab (${p.url()})`);
    h.expect((await bars()) === 1, "the card opened from the tab has the bar");
    await p.getByRole("tab", { name: "План", exact: true }).click();
    await p.waitForTimeout(700);
    h.expect(new URL(p.url()).pathname === "/plan", `the tab from the card → /plan (${p.url()})`);
    const after1 = await len();
    for (let i = 0; i < 2; i++) {
      await p.getByRole("tab", { name: "Клиенты", exact: true }).click();
      await p.waitForTimeout(500);
      await p.locator('[data-testid="list-card"]:visible').first().click();
      await p.waitForTimeout(600);
      await p.getByRole("tab", { name: "План", exact: true }).click();
      await p.waitForTimeout(600);
    }
    h.expect((await len()) <= after1 + 4, `the history does not grow without limit (${after1} → ${await len()})`);
    await p.goBack();
    await p.waitForTimeout(700);
    h.expect(!/^\/client\//.test(new URL(p.url()).pathname), `back from the tab does not return into the closed card (${p.url()})`);
  }
  // forms and the signature: none
  const item = db.catalog?.[0]?.id ?? db.catalogItems?.[0]?.id;
  for (const url of ["/lead/new", "/estimate/signature", "/client/edit", ...(item ? [`/catalog/${item}`] : [])]) {
    await h.go(url);
    await p.waitForTimeout(400);
    h.expect((await bars()) === 0, `${url}: no bottom bar`);
  }
  // the client signs on site on the estimate: no bar while the signature pad is there (rule А)
  if (!wide) {
    await h.go("/estimate/e6");
    await p.waitForTimeout(600);
    const pad = await p.getByText(/расписывается здесь/).locator("visible=true").count();
    h.expect(pad > 0, "the estimate e6 shows the signature pad on site");
    h.expect((await bars()) === 0, "no bottom bar while the client can sign");
    // leaving the estimate: the bar is back
    await h.go("/jobs");
    await p.waitForTimeout(500);
    h.expect((await bars()) === 1, "the bar is back on the next screen");
  }
};
