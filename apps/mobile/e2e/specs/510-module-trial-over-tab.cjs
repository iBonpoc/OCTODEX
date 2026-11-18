/**
 * e2e 510 — the module's tab never goes silently (founder 18.11.2026: «Почему у нас исчез модуль… вместо Gutters появилась
 * вкладка „План“»; the 7-day trial ran out). Every view.
 * - a company whose Gutters trial ran out a week ago, never paid (the stored row as the founder's phone had it): the tab is
 *   there — on the phone in the place of «План», at 820/1280 in the side menu; «План» does not take its place;
 * - the tab opens the list with «Пробный период закончился» and why (drafts open, nothing is saved), the director's
 *   «Подключить» leads to «Компания → Модули»; «Модули» says «Пробный период закончился» as before (the trial and the price stay);
 * - switched off → the tab goes, «План» is back, «Модули» says «Отключён» (the only way the tab leaves).
 * Finds things by testID; waits on what it checks.
 */
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const item = () => tid(wide ? "side-module-gutters-list" : "tab-module-gutters-list");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const tabIds = () => tid("tab-bar").locator('[data-testid^="tab-"]').evaluateAll((xs) => xs.map((x) => x.getAttribute("data-testid")));
  const status = async () => (await tid("module-gutters-status").innerText()).trim();

  // switched on once, then the stored row is made the founder's: the trial ran out a week ago, no payment
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.trialEndsAt, KEY, { timeout: 8000 });
  await h.go("/today");
  await p.waitForTimeout(600); // the phone's copy is written with a pause: let it land before editing it
  await p.evaluate((k) => {
    const raw = JSON.parse(localStorage.getItem(k));
    const g = raw.db.company.modules.gutters;
    g.trialEndsAt = new Date(Date.now() - 7 * 86_400_000).toISOString();
    delete g.paidUntil;
    localStorage.setItem(k, JSON.stringify(raw));
  }, KEY);
  await h.go("/today");
  await tid(wide ? "side-nav" : "tab-bar").waitFor({ timeout: 8000 });

  // the tab is there; «План» does not take its place
  await waitFor(async () => (await item().count()) === 1, "the trial ran out a week ago: the module's tab is still there");
  if (!wide) {
    const ids = await tabIds();
    h.expect(ids.includes("tab-module-gutters-list") && !ids.includes("tab-plan"), `the module's tab, not «План» (${ids.join(", ")})`);
  }
  await h.shot("tab");

  // the tab opens the list that says why
  await item().click();
  await p.waitForURL((u) => u.pathname.endsWith("/module/gutters/list"), { timeout: 8000 });
  await tid("measurements-expired").waitFor({ timeout: 5000 });
  const said = await tid("measurements-expired").innerText();
  h.expect(/Пробный период закончился/.test(said) && /ничего не сохраняется/.test(said), `the screen says the trial is over and why (${said})`);
  await h.shot("expired");
  await tid("measurements-expired").getByRole("button").click();
  await p.waitForURL((u) => u.pathname.endsWith("/company/modules"), { timeout: 8000 });
  await waitFor(async () => /^Пробный период закончился$/.test(await status()), "«Модули»: «Пробный период закончился», as before");

  // switched off: the tab goes, «План» is back; «Модули» says «Отключён»
  await tid("module-gutters-disable").getByRole("button").click();
  await waitFor(async () => /^Отключён$/.test(await status()), "switched off: «Отключён»");
  await h.go("/today");
  await tid(wide ? "side-nav" : "tab-bar").waitFor({ timeout: 8000 });
  await waitFor(async () => (await item().count()) === 0, "switched off: the module's tab goes");
  if (!wide) {
    const ids = await tabIds();
    h.expect(ids.includes("tab-plan"), `switched off: «План» is back (${ids.join(", ")})`);
  }
};
