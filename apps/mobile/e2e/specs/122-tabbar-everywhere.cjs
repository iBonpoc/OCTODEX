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
  for (const url of ["/lead/new", "/estimate/signature", "/estimate/e6", "/client/edit", ...(item ? [`/catalog/${item}`] : [])]) {
    await h.go(url);
    await p.waitForTimeout(400);
    h.expect((await bars()) === 0, `${url}: no bottom bar`);
  }
  if (!wide) {
    // the client signs on site: the bar stays until a signature is drawn, then it is away until cleared / left.
    // A visit at «Работа» signs with the same pad (the estimate's card has no bar since #1412: its main button is pinned instead)
    const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
    const v = raw.db.visits.find((x) => x.id === "v1");
    v.step = "working";
    v.checklist = [];
    await h.seed("octo.db.v5", raw);
    await h.go("/visit/v1");
    await p.waitForTimeout(600);
    const pad = p.getByTestId("signature-pad").locator("visible=true").first();
    h.expect((await pad.count()) === 1, "the visit v1 at «Работа» shows the signature pad");
    h.expect((await bars()) === 1, "the pad is there, nothing drawn yet: the bar stays (review #274)");
    await pad.scrollIntoViewIfNeeded();
    const b = await pad.boundingBox();
    const draw = async () => {
      await p.mouse.move(b.x + 20, b.y + b.height / 2);
      await p.mouse.down();
      for (let k = 1; k <= 8; k++) await p.mouse.move(b.x + 20 + k * 20, b.y + b.height / 2 + (k % 2 ? 10 : -10));
      await p.mouse.up();
      await p.waitForTimeout(300);
    };
    await draw();
    h.expect((await bars()) === 0, "a signature being drawn: no bottom bar");
    await p.getByTestId("signature-clear").locator("visible=true").first().getByRole("button").click();
    await p.waitForTimeout(300);
    h.expect((await bars()) === 1, "cleared: the bar is back");
    await draw();
    h.expect((await bars()) === 0, "drawn again: away");
    // leaving the visit inside the app (no reload): the bar is back on the next screen
    await p.getByRole("button", { name: /^Назад/ }).locator("visible=true").first().click();
    await p.waitForTimeout(700);
    h.expect(!/^\/visit\//.test(new URL(p.url()).pathname), `left the visit in the app (${p.url()})`);
    h.expect((await bars()) === 1, "the bar is back on the next screen");

    // a tab over an unsaved form (a new lead → «this number is already there» → its card): asked first, «Остаться» keeps the form
    await h.go("/lead/new");
    await p.getByPlaceholder("Имя", { exact: true }).last().fill("Typed Lead");
    await p.getByPlaceholder("(555) 555-0100").last().fill("8185550170");
    await h.expectText(/Этот номер уже есть/, "the duplicate warning");
    await p.locator('[data-testid^="new-lead-dup-"]').locator("visible=true").first().click();
    await p.waitForTimeout(700);
    h.expect(/^\/(client|lead)\/(?!new)/.test(new URL(p.url()).pathname), `the duplicate's card from the new lead (${p.url()})`);
    await p.getByRole("tab", { name: "Главная", exact: true }).click();
    await p.waitForTimeout(500);
    await h.expectText(/Выйти без сохранения\?/, "a tab over a form asks first (rule 5)");
    await h.sheet().getByRole("button", { name: "Остаться", exact: true }).click();
    await p.waitForTimeout(500);
    h.expect(/^\/(client|lead)\/(?!new)/.test(new URL(p.url()).pathname), `«Остаться»: still on the card (${p.url()})`);
    await p.goBack();
    await p.waitForTimeout(700);
    h.expect((await p.getByPlaceholder("Имя", { exact: true }).last().inputValue()) === "Typed Lead", "the form kept what was typed");
    await p.locator('[data-testid^="new-lead-dup-"]').locator("visible=true").first().click();
    await p.waitForTimeout(700);
    await p.getByRole("tab", { name: "Главная", exact: true }).click();
    await p.waitForTimeout(500);
    await h.sheet().getByRole("button", { name: "Выйти без сохранения", exact: true }).click();
    await p.waitForTimeout(700);
    h.expect(!/^\/(client|lead)\//.test(new URL(p.url()).pathname), `«Выйти без сохранения»: the tab (${p.url()})`);
    h.expect(!(await p.evaluate(() => document.body.innerText.includes("Typed Lead"))), "the form is gone");
  }
  // not signed in, on the sign-in screen: no bar there, nor on the Terms it links to (its tabs are behind the sign-in)
  await h.go("/auth/sign-in");
  await p.waitForTimeout(400);
  h.expect((await bars()) === 0, "/auth/sign-in: no bottom bar");
  await p.getByTestId("legal-agree-terms").locator("visible=true").first().click();
  await p.waitForTimeout(600);
  h.expect(new URL(p.url()).pathname === "/legal/terms", `the Terms from the sign-in screen (${p.url()})`);
  h.expect((await bars()) === 0, "the Terms opened from the sign-in screen: no bottom bar");
  // its header goes back to the sign-in, not to «Помощь» (review #274; e2e 96 uses goBack and would not see it)
  h.expect((await p.getByRole("button", { name: /Назад: Помощь/ }).locator("visible=true").count()) === 0, "no «‹ Помощь» before signing in");
  await p.getByRole("button", { name: /^Назад/ }).locator("visible=true").first().click();
  await p.waitForTimeout(600);
  h.expect(new URL(p.url()).pathname === "/auth/sign-in", `the header's back → the sign-in (${p.url()})`);
};
